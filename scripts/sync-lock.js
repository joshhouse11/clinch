// Sets Bracket Challenge lock times: NFL = first wild card kickoff; NBA = first play-in tip
// (provisionally 7pm ET two days after the last regular-season game until the NBA schedules the play-in).
// Needs SUPABASE_SERVICE_ROLE_KEY (a GitHub Actions secret, never in the repo). Skips quietly otherwise.
import fs from 'node:fs';
import { parseCSV } from '../engine/data.js';

const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(); // pasted secrets often carry a trailing newline
const site = JSON.parse(fs.readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
if (!key || !site.SUPABASE_URL) { console.log('No service key; lock time left as is.'); process.exit(0); }
// New-style keys (sb_secret_...) go in the apikey header only; legacy JWT keys also need the Bearer header.
const auth = { apikey: key, ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }) };

async function setLock(sport, season, at, why) {
  const res = await fetch(`${site.SUPABASE_URL}/rest/v1/challenge_settings?on_conflict=sport,season`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ sport, season, lock_at: at.toISOString() }),
  });
  console.log(res.ok ? `${sport.toUpperCase()} bracket lock for ${season} set to ${at.toISOString()} (${why}).` : `Could not set ${sport} lock time: HTTP ${res.status} ${await res.text()}`);
}

// ---- NFL ----
{
  const rows = parseCSV(fs.readFileSync(new URL('../data/games.csv', import.meta.url), 'utf8'));
  const season = Math.max(...rows.filter((r) => r.game_type === 'REG').map((r) => +r.season));
  const wc = rows.filter((r) => +r.season === season && r.game_type === 'WC' && r.gameday && r.gametime);
  if (!wc.length) {
    // Nothing to set yet; confirm the key works so a bad secret shows up now, not in January.
    const r = await fetch(`${site.SUPABASE_URL}/rest/v1/challenge_settings?select=sport,season,lock_at`, { headers: auth });
    console.log(`No ${season} wild card times yet. Key check: HTTP ${r.status}${r.ok ? ' ' + (await r.text()) : ''}`);
  } else {
    // nflverse times are US Eastern; playoff games are in January (EST, UTC-5).
    const toUtc = (d, t) => new Date(`${d}T${t.padStart(5, '0')}:00-05:00`);
    await setLock('nfl', season, wc.map((r) => toUtc(r.gameday, r.gametime)).sort((a, b) => a - b)[0], 'first wild card kickoff');
  }
}

// ---- NBA ----
{
  const dir = new URL('../data/nba/', import.meta.url);
  const season = Math.max(...fs.readdirSync(dir).map((f) => +((f.match(/^games_(\d{4})\.csv$/) || [])[1] || 0)));
  const rows = parseCSV(fs.readFileSync(new URL(`games_${season}.csv`, dir), 'utf8'));
  const pi = rows.filter((r) => r.type === '5' && r.when).map((r) => new Date(r.when)).filter((d) => !isNaN(d)).sort((a, b) => a - b);
  if (pi.length) await setLock('nba', season, pi[0], 'first play-in tip');
  else {
    const last = rows.filter((r) => r.type === '2').map((r) => r.date).sort().at(-1);
    if (last) { const d = new Date(last + 'T23:00:00Z'); d.setUTCDate(d.getUTCDate() + 2); await setLock('nba', season, d, 'provisional: 2 days after the regular season'); }
  }
}
