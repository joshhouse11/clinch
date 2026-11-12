// Checks the NBA tiebreaker engine against real seasons: seeds 3-6 (first-round pairings), the play-in
// pairings (7 v 8, 9 v 10) and the 1 and 2 seeds' opponents. Exits 1 on any mismatch so a bad engine never ships.
import fs from 'node:fs';
import { parseCSV } from '../engine/data.js';
import { nbaContext, nbaStandings, NBA_TEAMS, NBA_IDX, NBA_CONF_OF } from '../engine/nba.js';

let ok = 0, bad = 0;
for (const y of [2024, 2025, 2026]) {
  const f = new URL(`../data/nba/games_${y}.csv`, import.meta.url);
  if (!fs.existsSync(f)) continue;
  const rows = parseCSV(fs.readFileSync(f, 'utf8'));
  const ctx = nbaContext(rows);
  const st = nbaStandings(ctx, ctx.games.map((g) => (g.played ? (g.hs > g.as ? 1 : -1) : null)));
  const T = (i) => NBA_TEAMS[i];
  for (const c of [0, 1]) {
    const conf = c ? 'West' : 'East', sd = st.seeds[c];
    const pi = rows.filter((r) => r.type === '5' && r.note.includes(conf));
    const g78 = pi.find((r) => /7th Place vs 8th/.test(r.note)), g910 = pi.find((r) => /9th Place vs 10th/.test(r.note)), g8 = pi.find((r) => /8th Seed Game/.test(r.note));
    const r1 = rows.filter((r) => r.type === '3' && r.note === `${conf} 1st Round - Game 1`);
    const vs = (t) => { const g = r1.find((r) => r.home === t); return g ? g.away : null; };
    const w78 = +g78.hs > +g78.as ? g78.home : g78.away, w8 = +g8.hs > +g8.as ? g8.home : g8.away;
    const checks = [
      ['7 v 8 play-in', `${T(sd[6])} v ${T(sd[7])}`, `${g78.home} v ${g78.away}`],
      ['9 v 10 play-in', `${T(sd[8])} v ${T(sd[9])}`, `${g910.home} v ${g910.away}`],
      ['1 seed vs 8', `${T(sd[0])} v ${w8}`, `${T(sd[0])} v ${vs(T(sd[0]))}`],
      ['2 seed vs 7', `${T(sd[1])} v ${w78}`, `${T(sd[1])} v ${vs(T(sd[1]))}`],
      ['3 v 6', `${T(sd[2])} v ${T(sd[5])}`, `${T(sd[2])} v ${vs(T(sd[2]))}`],
      ['4 v 5', `${T(sd[3])} v ${T(sd[4])}`, `${T(sd[3])} v ${vs(T(sd[3]))}`],
    ];
    for (const [name, mine, real] of checks) {
      if (mine === real) ok++; else { bad++; console.log(`MISMATCH ${y} ${conf} ${name}: engine ${mine}, actual ${real}`); }
    }
  }
}
console.log(`NBA checks matched: ${ok}/${ok + bad}`);
if (bad) process.exit(1);
