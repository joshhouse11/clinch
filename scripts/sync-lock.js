// Sets the Bracket Challenge lock time to the first wild card kickoff once the NFL schedules it.
// Needs SUPABASE_SERVICE_ROLE_KEY (a GitHub Actions secret, never in the repo). Skips quietly otherwise.
import fs from 'node:fs';
import { parseCSV } from '../engine/data.js';

const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = JSON.parse(fs.readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
if (!key || !site.SUPABASE_URL) { console.log('No service key; lock time left as is.'); process.exit(0); }
const rows = parseCSV(fs.readFileSync(new URL('../data/games.csv', import.meta.url), 'utf8'));
const season = Math.max(...rows.filter((r) => r.game_type === 'REG').map((r) => +r.season));
const wc = rows.filter((r) => +r.season === season && r.game_type === 'WC' && r.gameday && r.gametime);
if (!wc.length) { console.log(`No ${season} wild card times yet.`); process.exit(0); }
// nflverse times are US Eastern; playoff games are in January (EST, UTC-5).
const toUtc = (d, t) => new Date(`${d}T${t.padStart(5, '0')}:00-05:00`);
const first = wc.map((r) => toUtc(r.gameday, r.gametime)).sort((a, b) => a - b)[0];
const res = await fetch(`${site.SUPABASE_URL}/rest/v1/challenge_settings?on_conflict=season`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ season, lock_at: first.toISOString() }),
});
console.log(res.ok ? `Bracket lock for ${season} set to ${first.toISOString()} (first wild card kickoff).` : `Could not set lock time: HTTP ${res.status} ${await res.text()}`);
