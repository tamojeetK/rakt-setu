# Rakt Setu: Rural India Blood Registry (V1)

A free, very light web app that connects village blood donors with families in an emergency.
There's nothing to download. It works on phones over slow 3G and on laptops and desktops, in English, Hindi and Bengali, and costs ₹0 to run on the free plans of Vercel and Supabase.

- **Families**: enter a pincode (or district) and the blood group needed. They see nearby donors who can give, then tap **Message on WhatsApp**. WhatsApp opens with a message already written in the donor's language.
- **Donors**: register in about 2 minutes. They get a private link to pause, mark "I gave blood today", or delete their details.
- **Home page**: points families to e-RaktKosh first, so they check the blood bank's stock before asking volunteers.

The first visit downloads about 16 KB compressed. On a simulated slow 3G connection the home page loads in about 1.2 s.

---

## How it protects donors

| Rule | Where it's enforced |
|---|---|
| Phone numbers are never in search results | `search_donors()` doesn't return them |
| A number is given out only when a family names a hospital and confirms the need is real | `request_contact()`, the only code that reads `phone` |
| A family can open at most 8 donor chats in 24 h | `cfg('contacts_per_ip_day')` |
| A donor gets at most 3 requests in 24 h, then is hidden for the rest of that day | `cfg('contacts_per_donor_day')` |
| After a donation, the donor is locked for **90 days (men) / 120 days (women, other)** (NBTC 2017) | `is_available()` |
| Only donors aged 18–65 who weigh at least 45 kg can register | database and form |
| Donors who haven't confirmed in 6 months appear lower with a warning. After 12 months they're hidden. | `stale_days`, `hide_days` |
| Raw IP addresses are never stored, only a salted hash. Request logs are deleted after 30 days. | `api/_lib.js`, `daily_maintenance()` |
| The browser can't reach the database. All tables are locked, and only the server key can call the functions. | end of `db/schema.sql` |

You can change any of these numbers in the `cfg()` function at the top of `db/schema.sql`.

---

## Set it up (about 30 minutes, ₹0)

### 1. Database (Supabase)
1. Go to supabase.com and create a free project. Choose the region **Mumbai (ap-south-1)**.
2. Open **SQL Editor**, paste all of `db/schema.sql`, and click **Run**.
3. Go to **Project Settings → API Keys** and copy:
   - the **Project URL**
   - the **secret key** (`sb_secret_…`), or the legacy `service_role` key

### 2. Pincodes (already prepared)
`db/pincodes-india.csv` is ready to import. It covers all 19,300 Indian pincodes with district, state and approximate coordinates.
1. In Supabase, open **Table Editor → pincodes → Insert → Import data from CSV**.
2. Choose `db/pincodes-india.csv` and import.

Source: India Post's All India Pincode Directory on data.gov.in, released under the Government Open Data License – India, via the IndiaPIN package (December 2021 snapshot). Some coordinates are approximate, so distances are a guide only. To refresh it from a newer download, run `node scripts/build-pincodes.mjs <file.csv> [STATE]`.

### 3. Hosting: Netlify or Vercel (both work from this repo)

**Netlify** (uses `netlify.toml` and `netlify/functions/`)
1. On netlify.com, sign up, then go to **Add new site → Import an existing project → GitHub** and pick this repo. The build settings are read from `netlify.toml`, so leave them as they are.
2. Under **Site configuration → Environment variables**, add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `IP_SALT` (any long random text) and `APP_NAME` (optional, defaults to "Rakt Setu").
3. Deploy. The scheduled function `keepalive` runs daily to keep Supabase awake and clear old logs.

**Vercel** (uses `vercel.json` and `api/`)
1. On vercel.com, go to **Add New → Project**, import the repo, and keep the default settings.
2. Add the same environment variables, plus `CRON_SECRET` (any long random text).
3. Deploy. The daily cron in `vercel.json` keeps the free Supabase project from pausing.

### 4. Check that it works
- Register yourself as a test donor. Then search your pincode and confirm you show up.
- Tap WhatsApp and check the message.
- Open your private link, tap **I gave blood today**, and confirm you disappear from search.
- Delete the test donor.

### 5. Pilot
- Make a QR code for your live URL with any free QR generator, or `npx qrcode -o qr.png https://your-site.vercel.app`.
- Print it at the CHC or district blood bank with one line in each language: "Need blood? Scan here / खून चाहिए? स्कैन करें / রক্ত দরকার? স্ক্যান করুন".
- ASHA workers and youth clubs can register villagers from one phone. The limit is 25 sign-ups per phone per day.

---

## Project layout

```
public/            the website (plain HTML/CSS/JS, no framework, no build step)
  index.html       home: "Need blood?" / "Give blood" + e-RaktKosh link
  find.html        pincode search + WhatsApp contact sheet
  register.html    donor sign-up with health checks + consent
  me.html          donor's private page (link: /me#<token>)
  privacy.html     plain-language privacy notice
  i18n.js          ALL text in English / Hindi / Bengali (edit translations here)
  app.js, app.css, sw.js (offline cache), manifest, icon
api/               serverless functions (thin; logic is in the database)
netlify/           Netlify wrappers that run the same api/ code
  search, pincode, register, contact, manage, keepalive
  _messages.js     the pre-filled WhatsApp message in 3 languages
db/schema.sql      tables, rules and functions (run in Supabase)
scripts/           pincode CSV builder
test/              local dev server + SQL tests
```

## Run it locally (optional)

You need Node 20+ and a Supabase project. Put your keys in `.env`, then:
```bash
set -a; . ./.env; set +a; node test/dev-server.mjs   # http://localhost:3000
```

---

## Before scaling past the pilot

1. **Get the Hindi and Bengali reviewed by native speakers**, ideally the ASHA workers who'll use the site. Everything is in `public/i18n.js` and `api/_messages.js`.
2. **Phone numbers aren't verified.** Someone could register another person's number. ASHA-assisted sign-up reduces this risk for the pilot. A free fix for V2 is to ask new donors to send one WhatsApp message to the project's number before they're listed.
3. **Duplicate-number check**: registering an existing number shows "already registered", which tells someone that number is in the registry. This is acceptable for V1. Revisit it if abuse appears.
4. **Legal**: this stores personal data covered by India's DPDP Act. Have the consent text and privacy page reviewed before going beyond one district.
5. **Health rules** follow the NBTC 2017 donor-selection guidelines in a simplified form. The blood bank still does the full medical screening.
6. The name "Rakt Setu" is a placeholder. Check that no one else is using it, then change it in `i18n.js` (`site_name`) and `APP_NAME`.
