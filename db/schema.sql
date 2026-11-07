-- =====================================================================
-- Rural India Blood Registry: V1 database
-- Run this once in Supabase: Dashboard → SQL Editor → paste → Run.
-- Safe to re-run: functions are replaced; tables are created if missing.
--
-- Design:
--   * Tables are locked (RLS on, no policies, no grants to anon/authenticated).
--     The browser NEVER talks to the database directly.
--   * All logic lives in the functions below. Only the `service_role`
--     (used by the Vercel API functions) may execute them.
--   * Phone numbers leave the database in exactly one place:
--     request_contact(), which is rate-limited and logged.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- India Post pincode directory (import from data.gov.in, see README).
create table if not exists pincodes (
  pincode  char(6) primary key,
  district text not null,
  state    text not null,
  lat      double precision,
  lon      double precision
);
create index if not exists pincodes_district_idx on pincodes (lower(district));

create table if not exists donors (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 60),
  phone             text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  blood_group       text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  sex               char(1) not null check (sex in ('M','F','O')),
  birth_year        int  not null,
  weight_kg         int  not null check (weight_kg between 45 and 250),
  pincode           char(6) not null check (pincode ~ '^[1-9][0-9]{5}$'),
  district          text,
  state             text,
  locality          text check (locality is null or char_length(locality) <= 80),
  lang              text not null default 'en' check (lang in ('en','hi','bn')),
  last_donated_on   date,
  paused            boolean not null default false,
  confirmed_at      timestamptz not null default now(),  -- donor last said "I'm still available"
  consent_at        timestamptz not null,
  manage_token_hash text not null unique,
  created_at        timestamptz not null default now()
);
create index if not exists donors_pincode_idx  on donors (pincode);
create index if not exists donors_district_idx on donors (lower(district));
create index if not exists donors_group_idx    on donors (blood_group);

-- Log used for rate limiting + audit. Purged after 30 days.
create table if not exists events (
  id       bigint generated always as identity primary key,
  kind     text not null check (kind in ('register','contact')),
  ip_hash  text not null,
  donor_id uuid references donors(id) on delete set null,
  at       timestamptz not null default now(),
  detail   jsonb
);
create index if not exists events_kind_ip_at_idx    on events (kind, ip_hash, at);
create index if not exists events_kind_donor_at_idx on events (kind, donor_id, at);

-- Lock everything down.
alter table pincodes enable row level security;
alter table donors   enable row level security;
alter table events   enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on pincodes, donors, events from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on pincodes, donors, events from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Settings (edit here if your blood bank follows different rules)
-- ---------------------------------------------------------------------
create or replace function cfg(key text) returns int
language sql immutable as $$
  select case key
    when 'gap_days_male'        then 90    -- NBTC 2017: whole blood, men
    when 'gap_days_female'      then 120   -- NBTC 2017: whole blood, women
    when 'min_age'              then 18
    when 'max_age'              then 65
    when 'min_weight'           then 45
    when 'stale_days'           then 180   -- shown lower + labelled after this
    when 'hide_days'            then 365   -- hidden after this without confirmation
    when 'contacts_per_ip_day'  then 8     -- a family can open 8 donor chats / 24h
    when 'contacts_per_donor_day' then 3   -- a donor gets at most 3 requests / 24h
    when 'registers_per_ip_day' then 25    -- ASHA worker registering a whole village
    when 'max_km'               then 60    -- same-state results beyond district
  end;
$$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function gap_days(p_sex char) returns int
language sql immutable as $$
  select case when p_sex = 'M' then cfg('gap_days_male') else cfg('gap_days_female') end;
$$;

create or replace function next_eligible_on(d donors) returns date
language sql stable as $$
  select case when d.last_donated_on is null then null
              else d.last_donated_on + gap_days(d.sex) end;
$$;

-- Is this donor showable/contactable right now?
create or replace function is_available(d donors) returns boolean
language sql stable as $$
  select not d.paused
     and (d.last_donated_on is null or d.last_donated_on + gap_days(d.sex) <= current_date)
     and extract(year from current_date)::int - d.birth_year between cfg('min_age') and cfg('max_age')
     and d.confirmed_at > now() - make_interval(days => cfg('hide_days'));
$$;

-- Which donor groups can give red cells / whole blood to a patient group.
create or replace function compatible_donors(patient text) returns text[]
language sql immutable as $$
  select case patient
    when 'O-'  then array['O-']
    when 'O+'  then array['O+','O-']
    when 'A-'  then array['A-','O-']
    when 'A+'  then array['A+','A-','O+','O-']
    when 'B-'  then array['B-','O-']
    when 'B+'  then array['B+','B-','O+','O-']
    when 'AB-' then array['AB-','A-','B-','O-']
    when 'AB+' then array['AB+','AB-','A+','A-','B+','B-','O+','O-']
  end;
$$;

create or replace function km(lat1 float8, lon1 float8, lat2 float8, lon2 float8) returns float8
language sql immutable as $$
  select case when lat1 is null or lat2 is null or lon1 is null or lon2 is null then null
    else 6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
  end;
$$;

create or replace function fail(code text) returns void
language plpgsql as $$ begin raise exception '%', code using errcode = 'P0001'; end $$;

-- ---------------------------------------------------------------------
-- API: look up a pincode (used by the registration form)
-- ---------------------------------------------------------------------
create or replace function lookup_pincode(p_pincode text)
returns table (pincode text, district text, state text)
language sql stable as $$
  select p.pincode::text, p.district, p.state from pincodes p where p.pincode = p_pincode;
$$;

-- ---------------------------------------------------------------------
-- API: register a donor. Returns the one-time manage token.
-- ---------------------------------------------------------------------
create or replace function register_donor(p jsonb, p_ip_hash text)
returns table (manage_token text, next_eligible date)
language plpgsql as $$
#variable_conflict use_column
declare
  v_token text := encode(gen_random_bytes(16), 'hex');
  v_age   int;
  v_pin   pincodes;
  v_last  date;
  v_sex   char(1) := upper(coalesce(p->>'sex',''));
  v_phone text := regexp_replace(coalesce(p->>'phone',''), '\D', '', 'g');
  v_new   donors;
begin
  if (select count(*) from events e where e.kind = 'register' and e.ip_hash = p_ip_hash
        and e.at > now() - interval '1 day') >= cfg('registers_per_ip_day') then
    perform fail('RATE_LIMIT');
  end if;

  if length(v_phone) = 12 and left(v_phone, 2) = '91' then v_phone := right(v_phone, 10); end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then perform fail('BAD_PHONE'); end if;
  if coalesce((p->>'consent')::boolean, false) is not true then perform fail('NO_CONSENT'); end if;
  if coalesce((p->>'healthy')::boolean, false) is not true then perform fail('NOT_ELIGIBLE'); end if;
  if v_sex not in ('M','F','O') then perform fail('BAD_INPUT'); end if;
  if (p->>'blood_group') is null or compatible_donors(p->>'blood_group') is null then perform fail('BAD_INPUT'); end if;
  if char_length(trim(coalesce(p->>'name',''))) < 2 then perform fail('BAD_INPUT'); end if;
  if coalesce(p->>'pincode','') !~ '^[1-9][0-9]{5}$' then perform fail('BAD_PINCODE'); end if;

  v_age := extract(year from current_date)::int - (p->>'birth_year')::int;
  if v_age is null or v_age < cfg('min_age') or v_age > cfg('max_age') then perform fail('AGE'); end if;
  if (p->>'weight_kg')::int < cfg('min_weight') then perform fail('WEIGHT'); end if;

  v_last := nullif(p->>'last_donated_on','')::date;
  if v_last > current_date then perform fail('BAD_DATE'); end if;

  if exists (select 1 from donors d where d.phone = v_phone) then perform fail('ALREADY_REGISTERED'); end if;

  select * into v_pin from pincodes where pincodes.pincode = p->>'pincode';

  insert into donors (name, phone, blood_group, sex, birth_year, weight_kg, pincode,
                      district, state, locality, lang, last_donated_on, consent_at, manage_token_hash)
  values (left(trim(p->>'name'), 60), v_phone, p->>'blood_group', v_sex, (p->>'birth_year')::int,
          (p->>'weight_kg')::int, p->>'pincode',
          coalesce(v_pin.district, nullif(left(trim(p->>'district'), 60), '')),
          v_pin.state,
          nullif(left(trim(coalesce(p->>'locality','')), 80), ''),
          coalesce(nullif(p->>'lang',''), 'en'), v_last, now(),
          encode(digest(v_token, 'sha256'), 'hex'))
  returning * into v_new;

  insert into events (kind, ip_hash, donor_id) values ('register', p_ip_hash, v_new.id);

  return query select v_token, next_eligible_on(v_new);
end $$;

-- ---------------------------------------------------------------------
-- API: search. Phone numbers are NOT returned.
--   p_place: a 6-digit pincode, or a district name.
-- ---------------------------------------------------------------------
create or replace function search_donors(p_place text, p_group text, p_limit int default 30)
returns table (id uuid, first_name text, blood_group text, exact boolean,
               area text, distance_km int, tier int, stale boolean)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_place text := trim(coalesce(p_place,''));
  v_pin   pincodes;
  v_groups text[] := compatible_donors(p_group);
begin
  if v_groups is null then perform fail('BAD_INPUT'); end if;
  if v_place ~ '^[1-9][0-9]{5}$' then
    select * into v_pin from pincodes where pincode = v_place;
  elsif char_length(v_place) >= 3 then
    v_pin.district := v_place;  -- district-name search
  else
    perform fail('BAD_PINCODE');
  end if;

  return query
  with c as (
    select d.*,
      coalesce(p.district, d.district) as dd,   -- prefer the official pincode table's district name
      case
        when d.pincode = v_place then 0
        when v_pin.district is not null and (
               lower(coalesce(p.district, d.district)) = lower(v_pin.district)
            or (v_pin.pincode is null and coalesce(p.district, d.district) ilike '%' || v_pin.district || '%')
        ) then 1
        else 2
      end as t,
      km(v_pin.lat, v_pin.lon, p.lat, p.lon) as dist
    from donors d
    left join pincodes p on p.pincode = d.pincode
    where d.blood_group = any (v_groups)
      and is_available(d)
      -- donors who already got their daily max of requests rest for a day
      and (select count(*) from events e where e.kind = 'contact' and e.donor_id = d.id
             and e.at > now() - interval '1 day') < cfg('contacts_per_donor_day')
  )
  select c.id,
         split_part(trim(c.name), ' ', 1),
         c.blood_group,
         c.blood_group = p_group,
         coalesce(nullif(c.locality,''), c.dd, c.pincode::text) ||
           case when c.locality is not null and c.dd is not null then ', ' || c.dd else '' end,
         round(c.dist)::int,
         c.t,
         c.confirmed_at < now() - make_interval(days => cfg('stale_days'))
  from c
  where c.t < 2
     or (c.dist is not null and c.dist <= cfg('max_km'))
  order by c.t,
           (c.confirmed_at < now() - make_interval(days => cfg('stale_days'))),  -- fresh first
           (c.blood_group = p_group) desc,                                       -- exact match first
           c.dist nulls last,
           md5(c.id::text || current_date::text)   -- rotate daily so the same donors aren't always on top
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end $$;

-- ---------------------------------------------------------------------
-- API: a family asks to contact a donor. The ONLY place a phone leaves the DB.
-- ---------------------------------------------------------------------
create or replace function request_contact(p_donor uuid, p_ip_hash text, p jsonb)
returns table (phone text, first_name text, blood_group text, lang text)
language plpgsql as $$
#variable_conflict use_column
declare
  d donors;
  v_repeat boolean;
begin
  if char_length(trim(coalesce(p->>'hospital',''))) < 3 then perform fail('NEED_HOSPITAL'); end if;

  select * into d from donors where donors.id = p_donor for update;
  if not found then perform fail('NOT_FOUND'); end if;

  -- Same family re-opening the same donor within a day doesn't count again.
  select exists (select 1 from events e where e.kind = 'contact' and e.ip_hash = p_ip_hash
                   and e.donor_id = d.id and e.at > now() - interval '1 day') into v_repeat;

  if not v_repeat then
    if not is_available(d) then perform fail('UNAVAILABLE'); end if;
    if (select count(*) from events e where e.kind = 'contact' and e.ip_hash = p_ip_hash
          and e.at > now() - interval '1 day') >= cfg('contacts_per_ip_day') then
      perform fail('RATE_LIMIT');
    end if;
    if (select count(*) from events e where e.kind = 'contact' and e.donor_id = d.id
          and e.at > now() - interval '1 day') >= cfg('contacts_per_donor_day') then
      perform fail('UNAVAILABLE');
    end if;
    insert into events (kind, ip_hash, donor_id, detail)
    values ('contact', p_ip_hash, d.id, jsonb_build_object(
      'hospital', left(trim(p->>'hospital'), 80),
      'units',    left(coalesce(p->>'units',''), 4),
      'group',    left(coalesce(p->>'group',''), 3)));
  end if;

  return query select d.phone, split_part(trim(d.name), ' ', 1), d.blood_group, d.lang;
end $$;

-- ---------------------------------------------------------------------
-- API: donor self-service via secret link.
--   actions: get | pause | resume | donated | confirm | delete
-- ---------------------------------------------------------------------
create or replace function manage_donor(p_token text, p_action text, p_date date default null)
returns table (first_name text, blood_group text, pincode text, paused boolean,
               last_donated_on date, next_eligible date, available boolean, deleted boolean)
language plpgsql as $$
#variable_conflict use_column
declare
  d donors;
begin
  if coalesce(p_token,'') !~ '^[0-9a-f]{32}$' then perform fail('BAD_TOKEN'); end if;
  select * into d from donors where manage_token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found then perform fail('BAD_TOKEN'); end if;

  if p_action = 'delete' then
    delete from donors where id = d.id;
    return query select null::text, null::text, null::text, null::boolean, null::date, null::date, null::boolean, true;
    return;
  elsif p_action = 'pause' then
    update donors set paused = true, confirmed_at = now() where id = d.id returning * into d;
  elsif p_action = 'resume' then
    update donors set paused = false, confirmed_at = now() where id = d.id returning * into d;
  elsif p_action = 'confirm' then
    update donors set confirmed_at = now() where id = d.id returning * into d;
  elsif p_action = 'donated' then
    if coalesce(p_date, current_date) > current_date then perform fail('BAD_DATE'); end if;
    update donors set last_donated_on = greatest(coalesce(last_donated_on, '1900-01-01'), coalesce(p_date, current_date)),
                      confirmed_at = now()
      where id = d.id returning * into d;
  elsif p_action <> 'get' then
    perform fail('BAD_INPUT');
  end if;

  return query select split_part(trim(d.name), ' ', 1), d.blood_group, d.pincode::text, d.paused,
                      d.last_donated_on, next_eligible_on(d), is_available(d), false;
end $$;

-- ---------------------------------------------------------------------
-- Daily job (Vercel Cron): keeps the free Supabase project awake and
-- deletes old logs (privacy: we keep request logs only 30 days).
-- ---------------------------------------------------------------------
create or replace function daily_maintenance() returns int
language sql as $$
  with del as (delete from events where at < now() - interval '30 days' returning 1)
  select count(*)::int from del;
$$;

-- ---------------------------------------------------------------------
-- Only the server (service_role) may call these.
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'lookup_pincode(text)', 'register_donor(jsonb,text)', 'search_donors(text,text,int)',
    'request_contact(uuid,text,jsonb)', 'manage_donor(text,text,date)', 'daily_maintenance()'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
