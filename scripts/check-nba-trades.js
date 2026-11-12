// Flags NBA trades that moved draft picks since data/nba/picks_<year>.json was last reviewed.
// Source: NBA.com's official player-movement feed. It says a team "received draft consideration" but not which pick or
// its protections, so this only raises a flag; a person (or the weekly pick-review task) reads the trade terms and edits
// the JSON, then adds the trade id to "reviewedTrades". Writes nba-trade-report.md; always exits 0.
import fs from 'node:fs';

const dir = new URL('../data/nba/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^picks_\d{4}\.json$/.test(f)).sort();
fs.writeFileSync(new URL('../nba-trade-report.md', import.meta.url), '');
if (!files.length) { console.log('No NBA pick file; skipping.'); process.exit(0); }
const pf = new URL(files.at(-1), dir), rules = JSON.parse(fs.readFileSync(pf, 'utf8'));
const reviewed = new Set(rules.reviewedTrades || []);
let rows;
try {
  const r = await fetch('https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (clinchscenarios.com pick check)', Referer: 'https://www.nba.com/', Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  rows = (await r.json()).NBA_Player_Movement.rows;
} catch (e) { console.log(`NBA transactions feed unavailable (${e.message}); skipping.`); process.exit(0); }

const since = rules.asOf || '2000-01-01';
const groups = new Map();
for (const x of rows) {
  if (x.Transaction_Type !== 'Trade' || x.TRANSACTION_DATE.slice(0, 10) < since) continue;
  const id = x.GroupSort.replace(/^Trade\s*/, '');
  if (!groups.has(id)) groups.set(id, { id, date: x.TRANSACTION_DATE.slice(0, 10), lines: [] });
  groups.get(id).lines.push(x.TRANSACTION_DESCRIPTION);
}
const flagged = [...groups.values()].filter((g) => !reviewed.has(g.id) && g.lines.some((l) => /draft|pick/i.test(l)));
let md = '';
if (flagged.length) {
  md = `NBA.com lists ${flagged.length} trade(s) since ${since} that moved draft picks and haven't been reviewed for ${files.at(-1)}:\n\n` +
    flagged.map((g) => `**${g.date} (trade ${g.id})**\n${g.lines.map((l) => `- ${l}`).join('\n')}`).join('\n\n') +
    `\n\nCheck the reported terms (year, round, protections). If a ${files.at(-1).slice(6, 10)} first-rounder moved, add a rule to the file. Either way, add the trade id to "reviewedTrades" so this stops flagging it.\n`;
}
fs.writeFileSync(new URL('../nba-trade-report.md', import.meta.url), md);
console.log(md || `NBA pick trades OK: no unreviewed pick trades since ${since}.`);
