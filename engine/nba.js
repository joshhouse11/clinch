// NBA engine: standings with the NBA's official tiebreakers, play-in, playoffs, draft lottery, and season simulation.
// Plain ES module; the build inlines it (stripping `export`) like the NFL engine.

export const NBA_DIVS = {
  Atlantic: ['BOS', 'BKN', 'NY', 'PHI', 'TOR'],
  Central: ['CHI', 'CLE', 'DET', 'IND', 'MIL'],
  Southeast: ['ATL', 'CHA', 'MIA', 'ORL', 'WSH'],
  Northwest: ['DEN', 'MIN', 'OKC', 'POR', 'UTAH'],
  Pacific: ['GS', 'LAC', 'LAL', 'PHX', 'SAC'],
  Southwest: ['DAL', 'HOU', 'MEM', 'NO', 'SA'],
};
export const NBA_TEAMS = Object.values(NBA_DIVS).flat();
export const NBA_IDX = Object.fromEntries(NBA_TEAMS.map((t, i) => [t, i]));
export const NBA_DIV_NAMES = Object.keys(NBA_DIVS);
export const NBA_DIV_OF = NBA_TEAMS.map((t) => NBA_DIV_NAMES.findIndex((d) => NBA_DIVS[d].includes(t)));
export const NBA_CONF_OF = NBA_DIV_OF.map((d) => (d < 3 ? 0 : 1)); // 0 East, 1 West
export const NBA_ABBR = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
const NT = NBA_TEAMS.length;

// rows: { id, date, home, away, hs, as, final, type, note } -> regular-season context
export function nbaContext(rows) {
  const games = [];
  for (const r of rows) {
    if (r.type !== '2' || /championship/i.test(r.note || '')) continue; // NBA Cup final doesn't count
    const h = NBA_IDX[r.home], a = NBA_IDX[r.away];
    if (h === undefined || a === undefined) continue;
    const played = r.final === '1';
    if (!played && rows.some((x) => x !== r && x.home === r.home && x.away === r.away && x.final === '1' && x.date === r.date)) continue;
    games.push({ id: r.id, date: r.date, when: r.when, h, a, played, hs: played ? +r.hs : null, as: played ? +r.as : null, k: games.length });
  }
  return { games };
}

// outcomes[k]: 1 home win, -1 away win (null = unplayed, not counted)
export function nbaRecords(ctx, outcomes) {
  const W = new Int16Array(NT), L = new Int16Array(NT), cW = new Int16Array(NT), cL = new Int16Array(NT), dW = new Int16Array(NT), dL = new Int16Array(NT);
  const pd = new Float64Array(NT);
  const hw = Array.from({ length: NT }, () => new Int16Array(NT)); // hw[i][j] wins of i over j
  const opp = Array.from({ length: NT }, () => []); // [opponent, won]
  ctx.games.forEach((G, k) => {
    const o = outcomes[k];
    if (o !== 1 && o !== -1) return;
    const w = o > 0 ? G.h : G.a, l = o > 0 ? G.a : G.h;
    W[w]++; L[l]++; hw[w][l]++;
    opp[w].push([l, 1]); opp[l].push([w, 0]);
    if (NBA_CONF_OF[w] === NBA_CONF_OF[l]) { cW[w]++; cL[l]++; }
    if (NBA_DIV_OF[w] === NBA_DIV_OF[l]) { dW[w]++; dL[l]++; }
    if (G.played && o === (G.hs > G.as ? 1 : -1)) { pd[G.h] += G.hs - G.as; pd[G.a] += G.as - G.hs; }
  });
  const pct = Array.from(W, (w, i) => (w + L[i] ? w / (w + L[i]) : 0));
  return { W, L, cW, cL, dW, dL, pd, hw, opp, pct };
}
const wp = (w, l) => (w + l ? w / (w + l) : 0.5);

// Order a set of teams with the NBA tiebreaking procedure. elig[c] = Set of postseason-eligible teams in conference c.
function breakTies(R, teams, divWinners, elig, isDivRace) {
  if (teams.length < 2) return teams.slice();
  const groups = groupBy(teams, (t) => R.pct[t]);
  return groups.flatMap((g) => (g.length === 1 ? g : resolve(R, g, divWinners, elig, isDivRace)));
}
function groupBy(teams, key) {
  const s = [...teams].sort((x, y) => key(y) - key(x));
  const out = []; let cur = [s[0]];
  for (let i = 1; i < s.length; i++) { if (Math.abs(key(s[i]) - key(cur[0])) < 1e-12) cur.push(s[i]); else { out.push(cur); cur = [s[i]]; } }
  out.push(cur); return out;
}
function resolve(R, tied, divWinners, elig, isDivRace) {
  const two = tied.length === 2;
  const sameDiv = tied.every((t) => NBA_DIV_OF[t] === NBA_DIV_OF[tied[0]]);
  const h2h = (t) => { let w = 0, l = 0; for (const u of tied) if (u !== t) { w += R.hw[t][u]; l += R.hw[u][t]; } return wp(w, l); };
  const vsSet = (t, set) => { let w = 0, l = 0; for (const [u, won] of R.opp[t]) if (set.has(u)) (won ? w++ : l++); return wp(w, l); };
  const conf = NBA_CONF_OF[tied[0]];
  const dw = (t) => (!isDivRace && divWinners.has(t) ? 1 : 0);
  const steps = two
    ? [h2h, dw, sameDiv ? (t) => wp(R.dW[t], R.dL[t]) : null, (t) => wp(R.cW[t], R.cL[t]), (t) => vsSet(t, elig[conf]), (t) => vsSet(t, elig[1 - conf]), (t) => R.pd[t]]
    : [dw, h2h, sameDiv ? (t) => wp(R.dW[t], R.dL[t]) : null, (t) => wp(R.cW[t], R.cL[t]), (t) => vsSet(t, elig[conf]), (t) => R.pd[t]];
  for (const f of steps) {
    if (!f) continue;
    const g = groupBy(tied, f);
    if (g.length > 1) {
      // Separated: each subgroup restarts the procedure (two-team or multi-team as appropriate).
      return g.flatMap((sub) => (sub.length === 1 ? sub : resolve(R, sub, divWinners, elig, isDivRace)));
    }
  }
  return [...tied].sort((x, y) => x - y); // drawing of lots: stable fallback
}

// Standings: conference order 1-15 for each conference, division winners, and the draft order (30 picks pre-lottery).
export function nbaStandings(ctx, outcomes) {
  const R = nbaRecords(ctx, outcomes);
  // postseason-eligible (top 10 of conference by win %, ties at the line included)
  const elig = [0, 1].map((c) => {
    const ts = NBA_TEAMS.map((_, i) => i).filter((i) => NBA_CONF_OF[i] === c).sort((x, y) => R.pct[y] - R.pct[x]);
    const cut = R.pct[ts[9]];
    return new Set(ts.filter((t) => R.pct[t] >= cut - 1e-12));
  });
  const divWinners = new Set();
  const divOrder = NBA_DIV_NAMES.map((dn, di) => {
    const mem = NBA_TEAMS.map((_, i) => i).filter((i) => NBA_DIV_OF[i] === di);
    const ord = breakTies(R, mem, divWinners, elig, true);
    return ord;
  });
  divOrder.forEach((o) => divWinners.add(o[0]));
  const seeds = [0, 1].map((c) => breakTies(R, NBA_TEAMS.map((_, i) => i).filter((i) => NBA_CONF_OF[i] === c), divWinners, elig, false));
  return { R, seeds, divOrder, divWinners };
}

// Draft lottery (since 2019): 14 non-playoff teams; four picks drawn. Chances per 1000 for the #1 pick, worst first.
export const LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];
// Exact pick probabilities for lottery slots 1-14 (ignoring ties): P[slot][pick]
export function lotteryTable(odds = LOTTERY_ODDS) {
  const n = odds.length, P = Array.from({ length: n }, () => new Float64Array(n));
  const rec = (drawn, prob) => {
    if (drawn.length === 4) {
      const rest = [...Array(n).keys()].filter((i) => !drawn.includes(i));
      drawn.forEach((t, k) => { P[t][k] += prob; });
      rest.forEach((t, k) => { P[t][4 + k] += prob; });
      return;
    }
    const left = odds.reduce((s, o, i) => (drawn.includes(i) ? s : s + o), 0);
    for (let i = 0; i < n; i++) if (!drawn.includes(i)) rec([...drawn, i], (prob * odds[i]) / left);
  };
  rec([], 1);
  return P;
}
export function drawLottery(rand, odds = LOTTERY_ODDS) {
  const left = odds.map((o, i) => [i, o]), top = [];
  while (top.length < 4) {
    const tot = left.reduce((s, x) => s + x[1], 0);
    let r = rand() * tot, j = 0;
    while (r >= left[j][1]) { r -= left[j][1]; j++; }
    top.push(left[j][0]); left.splice(j, 1);
  }
  return [...top, ...left.map((x) => x[0])]; // order of lottery slots by pick
}

// Pre-lottery draft order: 14 non-playoff teams worst first, then playoff teams by record. playoff = Set of 16 teams.
export function nbaDraftOrder(R, playoff) {
  const by = (a, b) => R.pct[a] - R.pct[b] || a - b;
  const all = NBA_TEAMS.map((_, i) => i);
  return [...all.filter((t) => !playoff.has(t)).sort(by), ...all.filter((t) => playoff.has(t)).sort(by)];
}

// Team strength: this season's point differential per game, blended with last season's as a prior early on.
export function nbaRatings(ctx, prior = null) {
  const pd = new Float64Array(NT), gp = new Float64Array(NT);
  for (const G of ctx.games) if (G.played) { pd[G.h] += G.hs - G.as; pd[G.a] += G.as - G.hs; gp[G.h]++; gp[G.a]++; }
  const K = 18; // games of evidence the prior is worth
  // prior: last season's point differential per game, regressed ~45% toward average (rosters change)
  return Array.from(pd, (v, i) => (v + (prior ? prior[i] * 0.55 * K : 0)) / (gp[i] + K));
}
export const NBA_HCA = 2.2, NBA_SD = 12.5;
function normCdfN(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
export const nbaWinProb = (r, h, a, neutral = false) => normCdfN((r[h] - r[a] + (neutral ? 0 : NBA_HCA)) / NBA_SD);

// Play-in: 7v8 winner is the 7 seed; 9v10 winner plays the 7v8 loser for the 8 seed.
export function playIn(seedsC, decide) {
  const s = seedsC;
  const a = decide(s[6], s[7]), aL = a === s[6] ? s[7] : s[6];
  const b = decide(s[8], s[9]);
  const c = decide(aL, b);
  return { seven: a, eight: c, games: [[s[6], s[7], a], [s[8], s[9], b], [aL, b, c]] };
}
// Best-of-seven with 2-2-1-1-1 home pattern; hi = home-court team.
export function playSeries(r, hi, lo, rand, noise) {
  let w = 0, l = 0, g = 0;
  const pat = [1, 1, 0, 0, 1, 0, 1];
  while (w < 4 && l < 4) {
    const home = pat[g++] ? hi : lo, away = home === hi ? lo : hi;
    const p = normCdfN((r[home] + noise[home] - r[away] - noise[away] + NBA_HCA) / NBA_SD);
    const homeWins = rand() < p;
    if ((homeWins && home === hi) || (!homeWins && away === hi)) w++; else l++;
  }
  return w === 4 ? hi : lo;
}

// Monte Carlo season: odds to make the playoffs (top 6 or win the play-in), top 6, play-in, #1 seed, title,
// and lottery pick distribution for non-playoff teams.
export function nbaSimulate(ctx, ratings, { sims = 5000, seed = 7, picks = {} } = {}) {
  let s = seed >>> 0;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  const base = ctx.games.map((G, k) => (picks[k] !== undefined ? picks[k] : G.played ? (G.hs > G.as ? 1 : -1) : null));
  const free = base.map((o, k) => (o === null ? k : -1)).filter((k) => k >= 0);
  const out = NBA_TEAMS.map(() => ({ playoffs: 0, top6: 0, playIn: 0, one: 0, conf: 0, finals: 0, title: 0, wins: 0, seedSum: 0, pick1: 0, top4: 0, pickSum: 0 }));
  const noise = new Float64Array(NT), o = base.slice();
  for (let n = 0; n < sims; n++) {
    for (let i = 0; i < NT; i++) noise[i] = gauss() * 2.5;
    for (const k of free) { const G = ctx.games[k]; o[k] = rand() < normCdfN((ratings[G.h] + noise[G.h] - ratings[G.a] - noise[G.a] + NBA_HCA) / NBA_SD) ? 1 : -1; }
    const st = nbaStandings(ctx, o);
    const playoff = new Set();
    const champs = [];
    for (const c of [0, 1]) {
      const sd = st.seeds[c];
      sd.forEach((t, k) => { out[t].seedSum += k + 1; if (k < 6) out[t].top6++; else if (k < 10) out[t].playIn++; });
      out[sd[0]].one++;
      const decide = (h, a) => (rand() < normCdfN((ratings[h] + noise[h] - ratings[a] - noise[a] + NBA_HCA) / NBA_SD) ? h : a);
      const pi = playIn(sd, decide);
      const field = [...sd.slice(0, 6), pi.seven, pi.eight];
      field.forEach((t) => { playoff.add(t); out[t].playoffs++; });
      const pct = st.R.pct;
      const ser = (x, y) => { const hi = pct[x] > pct[y] || (pct[x] === pct[y] && field.indexOf(x) < field.indexOf(y)) ? x : y; return playSeries(ratings, hi, hi === x ? y : x, rand, noise); };
      const r1 = [ser(field[0], field[7]), ser(field[3], field[4]), ser(field[2], field[5]), ser(field[1], field[6])];
      const r2 = [ser(r1[0], r1[1]), ser(r1[2], r1[3])];
      const cf = ser(r2[0], r2[1]);
      r2.forEach((t) => out[t].conf++);
      out[cf].finals++; champs.push(cf);
    }
    const pct = st.R.pct;
    const hi = pct[champs[0]] >= pct[champs[1]] ? champs[0] : champs[1];
    out[playSeries(ratings, hi, hi === champs[0] ? champs[1] : champs[0], rand, noise)].title++;
    for (let i = 0; i < NT; i++) out[i].wins += st.R.W[i];
    const order = nbaDraftOrder(st.R, playoff);
    const lot = drawLottery(rand);
    lot.forEach((slot, pick) => { const t = order[slot]; out[t].pickSum += pick + 1; if (pick === 0) out[t].pick1++; if (pick < 4) out[t].top4++; });
    order.slice(14).forEach((t, k) => { out[t].pickSum += 15 + k; });
  }
  return out.map((x, i) => ({ team: NBA_TEAMS[i], playoffs: x.playoffs / sims, top6: x.top6 / sims, playIn: x.playIn / sims, one: x.one / sims, conf: x.conf / sims, finals: x.finals / sims, title: x.title / sims, avgWins: x.wins / sims, avgSeed: x.seedSum / sims, pick1: x.pick1 / sims, top4: x.top4 / sims, avgPick: x.pickSum / sims }));
}
