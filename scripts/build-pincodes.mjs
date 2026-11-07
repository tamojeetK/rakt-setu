// Turns India Post's "All India Pincode Directory" CSV (from data.gov.in)
// into a small pincodes.csv you can import into Supabase.
//
//   node scripts/build-pincodes.mjs <downloaded.csv> [STATE ...]
//
// Examples:
//   node scripts/build-pincodes.mjs pincode_directory.csv                 # all India
//   node scripts/build-pincodes.mjs pincode_directory.csv "WEST BENGAL"   # pilot state only
//
// Output: pincodes.csv  (pincode,district,state,lat,lon) — one row per pincode.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, ...states] = process.argv;
if (!input) { console.error('Usage: node scripts/build-pincodes.mjs <file.csv> [STATE ...]'); process.exit(1); }
const wantStates = new Set(states.map((s) => s.trim().toUpperCase()));

function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, ' ').trim();
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mode = (a) => { const m = new Map(); a.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m].sort((x, y) => y[1] - x[1])[0][0]; };

const rows = parseCSV(readFileSync(input, 'utf8').replace(/^﻿/, ''));
const head = rows.shift().map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
const col = (...names) => { const i = head.findIndex((h) => names.includes(h)); if (i < 0) throw new Error(`Column not found: ${names[0]} (have: ${head.join(', ')})`); return i; };
const iPin = col('pincode'), iDist = col('district', 'districtname'), iState = col('statename', 'state');
const iLat = col('latitude', 'lat'), iLon = col('longitude', 'long', 'lon');

const by = new Map();
for (const r of rows) {
  const pin = (r[iPin] || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) continue;
  const state = (r[iState] || '').trim().toUpperCase();
  if (wantStates.size && !wantStates.has(state)) continue;
  const g = by.get(pin) || { d: [], s: [], lat: [], lon: [] };
  if (r[iDist]) g.d.push(titleCase(r[iDist]));
  if (state) g.s.push(titleCase(state));
  const lat = parseFloat(r[iLat]), lon = parseFloat(r[iLon]);
  if (lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 98) { g.lat.push(lat); g.lon.push(lon); } // inside India only
  by.set(pin, g);
}

const out = ['pincode,district,state,lat,lon'];
let withCoords = 0;
for (const [pin, g] of [...by].sort()) {
  if (!g.d.length || !g.s.length) continue;
  const lat = median(g.lat), lon = median(g.lon);
  if (lat != null) withCoords++;
  const q = (s) => `"${s.replace(/"/g, '""')}"`;
  out.push([pin, q(mode(g.d)), q(mode(g.s)), lat ?? '', lon ?? ''].join(','));
}
writeFileSync('pincodes.csv', out.join('\n') + '\n');
console.log(`pincodes.csv: ${out.length - 1} pincodes (${withCoords} with coordinates)`);
