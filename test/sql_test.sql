\set ON_ERROR_STOP 1
set role service_role;
create temp table toks(name text, tok text);
insert into toks select 'ram', manage_token from register_donor('{"name":"Ram Das","phone":"+91 98765 43210","blood_group":"O-","sex":"M","birth_year":1995,"weight_kg":60,"pincode":"721302","consent":true,"healthy":true,"lang":"bn"}','ip1');
insert into toks select 'sita', manage_token from register_donor('{"name":"Sita Devi","phone":"9876500001","blood_group":"A+","sex":"F","birth_year":1990,"weight_kg":52,"pincode":"721301","consent":true,"healthy":true,"last_donated_on":"2026-09-01"}','ip1');
insert into toks select 'gita', manage_token from register_donor('{"name":"Gita","phone":"9876500002","blood_group":"A+","sex":"F","birth_year":1990,"weight_kg":52,"pincode":"721301","consent":true,"healthy":true,"last_donated_on":"2026-06-01","locality":"Gopali"}','ip1');
insert into toks select 'far', manage_token from register_donor('{"name":"Far Away","phone":"9876500003","blood_group":"A+","sex":"M","birth_year":1990,"weight_kg":70,"pincode":"700001","consent":true,"healthy":true}','ip2');
insert into toks select 'bank', manage_token from register_donor('{"name":"Bankura Bhai","phone":"9876500004","blood_group":"O+","sex":"M","birth_year":1990,"weight_kg":70,"pincode":"722101","consent":true,"healthy":true}','ip2');
\echo '--- search A+ at 721301 (expect gita exact tier0, ram O- tier1; sita locked 120d; far/bankura excluded by distance)'
select first_name, blood_group, exact, area, distance_km, tier, stale from search_donors('721301','A+');
\echo '--- district search'
select first_name, tier from search_donors('paschim medinipur','AB+');
\echo '--- contact + rate limits'
select phone, lang from request_contact((select id from donors where name='Ram Das'),'fam1','{"hospital":"Kharagpur SDH","units":"2","group":"A+"}');
select phone from request_contact((select id from donors where name='Ram Das'),'fam1','{"hospital":"Kharagpur SDH"}'); -- repeat, not counted
select phone from request_contact((select id from donors where name='Ram Das'),'fam2','{"hospital":"Kharagpur SDH"}');
select phone from request_contact((select id from donors where name='Ram Das'),'fam3','{"hospital":"Kharagpur SDH"}');
\echo '--- ram should now be hidden (3 requests today)'
select first_name from search_donors('721301','O-');
\echo '--- manage'
select * from manage_donor((select tok from toks where name='gita'),'get');
select first_name, paused, available from manage_donor((select tok from toks where name='gita'),'pause');
select count(*) as gita_visible from search_donors('721301','A+') where first_name='Gita';
select first_name, last_donated_on, next_eligible, available from manage_donor((select tok from toks where name='far'),'donated');
select deleted from manage_donor((select tok from toks where name='bank'),'delete');
select count(*) as donors_left from donors;
