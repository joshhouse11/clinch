// Downloads the current NBA season (schedule, scores) from sportsdataverse's daily ESPN export and
// keeps only what Clinch needs: data/nba/games_<season>.csv (season = the year it ends, e.g. 2027 for 2026-27).
// Usage: node scripts/fetch-nba.js [season]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const now = new Date();
const season = +(process.argv[2] || (now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()));
const url = `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/espn_nba_schedules/nba_schedule_${season}.csv`;
let text;
try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text(); }
catch { text = execFileSync('curl', ['-sSfL', url], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); }

// minimal CSV parser (quoted fields with commas/newlines)
function parse(t) {
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}
const rows = parse(text);
const H = rows[0], ix = (k) => H.indexOf(k);
const need = ['game_id', 'game_date_time', 'game_date', 'home_abbreviation', 'away_abbreviation', 'home_score', 'away_score', 'status_type_completed', 'season_type', 'notes_headline', 'home_color', 'home_display_name'];
for (const k of need) if (ix(k) < 0) { console.error('NBA feed is missing column ' + k + '; keeping the previous copy.'); process.exit(1); }
const TEAMS = new Set(['ATL','BKN','BOS','CHA','CHI','CLE','DAL','DEN','DET','GS','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY','OKC','ORL','PHI','PHX','POR','SA','SAC','TOR','UTAH','WSH']);
const keep = rows.slice(1).filter((r) => r.length >= H.length - 2 && TEAMS.has(r[ix('home_abbreviation')]) && TEAMS.has(r[ix('away_abbreviation')]) && ['2', '3', '5'].includes(r[ix('season_type')]));
const esc = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const outRows = [['id', 'when', 'date', 'home', 'away', 'hs', 'as', 'final', 'type', 'note']].concat(keep.map((r) => [
  r[ix('game_id')], r[ix('game_date_time')], r[ix('game_date')], r[ix('home_abbreviation')], r[ix('away_abbreviation')],
  r[ix('home_score')], r[ix('away_score')], /true/i.test(r[ix('status_type_completed')]) ? '1' : '0', r[ix('season_type')], r[ix('notes_headline')],
]));
const reg = keep.filter((r) => r[ix('season_type')] === '2').length;
if (reg < 1000) { console.error(`NBA ${season}: only ${reg} regular-season games; keeping the previous copy.`); process.exit(1); }
// team colors and names from the feed (for chips)
const meta = {};
for (const r of keep) meta[r[ix('home_abbreviation')]] = { color: '#' + (r[ix('home_color')] || '444444'), name: r[ix('home_display_name')] };
fs.mkdirSync(new URL('../data/nba/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`../data/nba/games_${season}.csv`, import.meta.url), outRows.map((r) => r.map(esc).join(',')).join('\n') + '\n');
if (Object.keys(meta).length === 30) fs.writeFileSync(new URL('../data/nba/teams.json', import.meta.url), JSON.stringify(meta, null, 1));
console.log(`NBA ${season}: ${reg} regular-season games, ${keep.filter((r) => /true/i.test(r[ix('status_type_completed')]) && r[ix('season_type')] === '2').length} final`);
