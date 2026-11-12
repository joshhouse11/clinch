// Compares nflverse's trade log with data/pick_trades.json and lists first-round pick trades we may be missing.
// nflverse lags and doesn't record conditions, so this only raises a flag; a person confirms and edits the JSON.
// Output: writes trade-report.md and exits 0 always (a missing trade should never block the site).
import fs from 'node:fs';
import { parseCSV } from '../engine/data.js';

const root = new URL('../', import.meta.url);
const games = parseCSV(fs.readFileSync(new URL('data/games.csv', root), 'utf8'));
const season = Math.max(...games.filter((r) => r.game_type === 'REG').map((r) => +r.season));
const year = String(season + 1);
const file = JSON.parse(fs.readFileSync(new URL('data/pick_trades.json', root), 'utf8'))[year] || { traded: [], conditional: [] };
const trPath = new URL('data/trades.csv', root);
if (!fs.existsSync(trPath)) { console.log('No trades.csv; skipping check.'); process.exit(0); }
const LEGACY = { OAK: 'LV', SD: 'LAC', STL: 'LA' };
const n = (t) => LEGACY[t] || t;
const rows = parseCSV(fs.readFileSync(trPath, 'utf8')).filter((r) => r.pick_season === year && r.pick_round === '1');

// Every team-to-team move of a first-round pick that our file explains, directly or through a conditional deal.
const known = new Set(file.traded.map((t) => `${t.from}>${t.to}`));
for (const c of file.conditional || []) for (const t of c.teams) { known.add(`${t}>${c.earlierTo}`); known.add(`${t}>${c.laterTo}`); }
const ours = new Set([...file.traded.map((t) => t.to), ...(file.conditional || []).flatMap((c) => [c.earlierTo, c.laterTo])]);
const missing = rows.filter((r) => {
  const g = n(r.gave), rc = n(r.received);
  if (known.has(`${g}>${rc}`)) return false;
  // pick passed along again by a team that acquired one: explained if the new owner is in our file as an owner
  return true;
});
const latest = rows.map((r) => r.trade_date).sort().at(-1) || 'none';
let md = '';
if (missing.length) {
  md = `nflverse lists ${missing.length} first-round ${year} pick trade(s) that data/pick_trades.json doesn't explain:\n\n` +
    missing.map((r) => `- ${r.trade_date}: ${n(r.gave)} sent a ${year} 1st to ${n(r.received)}${r.conditional === '1' ? ' (conditional)' : ''} (nflverse trade ${r.trade_id})`).join('\n') +
    `\n\nIf it's real, add it to data/pick_trades.json ("from" = the team whose record sets the pick, "to" = new owner). If our file already covers it some other way (a re-trade or a conditional deal), close this issue.\n`;
}
fs.writeFileSync(new URL('trade-report.md', root), md);
console.log(missing.length ? md : `Pick trades OK: our file explains every ${year} first-round trade nflverse knows about (latest nflverse trade ${latest}).`);
