// Check the engine against real playoff fields, 2002-2025.
// Real seeds are inferred from wild-card games (home = higher seed, seeds sum to 9)
// and byes (playoff teams absent from the wild-card round).
import { loadGames } from '../engine/data.js';
import { buildContext, evaluate, TEAMS, IDX, CONF_OF, normTeam } from '../engine/engine.js';

const all = loadGames();
let pass = 0, fail = 0;
const failures = [];
const seasons = [...new Set(all.filter((r) => r.game_type === 'WC' && r.home_score !== '').map((r) => +r.season))].filter((y) => y >= 2002);
for (const season of seasons) {
  const reg = all.filter((r) => +r.season === season && r.game_type === 'REG');
  const post = all.filter((r) => +r.season === season && r.game_type !== 'REG');
  const ctx = buildContext(reg);
  const res = evaluate(ctx, ctx.games.map((G) => (G.played ? G.fixed : null)));
  const nSeeds = season >= 2020 ? 7 : 6;
  const byes = season >= 2020 ? 1 : 2;
  const wc = post.filter((r) => r.game_type === 'WC');
  const postTeams = new Set(post.flatMap((r) => [normTeam(r.home_team), normTeam(r.away_team)]));
  const wcTeams = new Set(wc.flatMap((r) => [normTeam(r.home_team), normTeam(r.away_team)]));
  for (const c of [0, 1]) {
    const mine = res.seeds[c].slice(0, nSeeds).map((i) => TEAMS[i]);
    const errs = [];
    const realField = [...postTeams].filter((t) => CONF_OF[IDX[t]] === c);
    const realSet = new Set(realField);
    if (mine.length !== realSet.size || mine.some((t) => !realSet.has(t))) errs.push(`field mine=${mine} real=${realField}`);
    const realByes = realField.filter((t) => !wcTeams.has(t)).sort();
    const myByes = mine.slice(0, byes).sort();
    if (realByes.join() !== myByes.join()) errs.push(`byes mine=${myByes} real=${realByes}`);
    for (const g of wc) {
      const h = normTeam(g.home_team), a = normTeam(g.away_team);
      if (CONF_OF[IDX[h]] !== c) continue;
      const sh = mine.indexOf(h) + 1, sa = mine.indexOf(a) + 1;
      if (sh + sa !== 9 || sh > sa) errs.push(`WC ${a}@${h} seeds mine ${sa}@${sh}`);
    }
    const tag = `${season} ${c ? 'NFC' : 'AFC'}`;
    if (errs.length) { fail++; failures.push(`${tag}: ${errs.join(' | ')}`); } else pass++;
  }
}
console.log(`conference-seasons matched: ${pass}/${pass + fail}`);
failures.forEach((f) => console.log('  ' + f));
if (fail) process.exit(1);
