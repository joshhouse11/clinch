// NFL standings, tiebreaker, playoff seeding, draft order and Monte Carlo engine.
// Plain ES module so the same code runs in the browser and in Node.

export const DIVISIONS = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West': ['DEN', 'KC', 'LV', 'LAC'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West': ['ARI', 'LA', 'SF', 'SEA'],
};

export const TEAM_NAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears',
  CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LA: 'Rams', LAC: 'Chargers',
  LV: 'Raiders', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders',
};

// Historical codes map onto the current franchise slot.
const LEGACY = { OAK: 'LV', SD: 'LAC', STL: 'LA' };
export const normTeam = (t) => LEGACY[t] || t;

export const TEAMS = Object.values(DIVISIONS).flat();
const N = TEAMS.length;
export const IDX = Object.fromEntries(TEAMS.map((t, i) => [t, i]));
export const DIV_OF = new Int8Array(N);
export const CONF_OF = new Int8Array(N); // 0 AFC, 1 NFC
export const DIV_NAMES = Object.keys(DIVISIONS);
DIV_NAMES.forEach((d, di) => DIVISIONS[d].forEach((t) => {
  DIV_OF[IDX[t]] = di;
  CONF_OF[IDX[t]] = d.startsWith('AFC') ? 0 : 1;
}));

// ---------------------------------------------------------------------------
// Context: one season's regular-season games.
// game: { id, week, h, a (team indexes), hs, as (scores or null), played, spread }
// outcome codes: 1 = home win, -1 = away win, 0 = tie
// ---------------------------------------------------------------------------
export function buildContext(rows) {
  const games = rows.map((r) => {
    const played = r.home_score !== '' && r.home_score != null && r.away_score !== '' && r.away_score != null;
    const hs = played ? +r.home_score : null;
    const as = played ? +r.away_score : null;
    return {
      id: r.game_id,
      week: +r.week,
      h: IDX[normTeam(r.home_team)],
      a: IDX[normTeam(r.away_team)],
      hs, as, played,
      spread: r.spread_line === '' || r.spread_line == null ? null : +r.spread_line,
      fixed: played ? Math.sign(hs - as) : null,
    };
  });
  return { games };
}

// ---------------------------------------------------------------------------
// Records for a full set of outcomes.
// ---------------------------------------------------------------------------
function computeRecords(ctx, outcomes) {
  const W = new Float64Array(N), L = new Float64Array(N), T = new Float64Array(N);
  const g = new Int16Array(N * N), w = new Int16Array(N * N), t = new Int16Array(N * N);
  const dW = new Float64Array(N), dL = new Float64Array(N), dT = new Float64Array(N);
  const cW = new Float64Array(N), cL = new Float64Array(N), cT = new Float64Array(N);
  const pf = new Float64Array(N), pa = new Float64Array(N);
  const pfm = new Float64Array(N * N); // points for i vs j (played games only)
  const pam = new Float64Array(N * N);
  const games = ctx.games;
  for (let k = 0; k < games.length; k++) {
    const o = outcomes[k];
    if (o === null || o === undefined || Number.isNaN(o)) continue; // unplayed/cancelled
    const G = games[k], h = G.h, a = G.a;
    g[h * N + a]++; g[a * N + h]++;
    const sameDiv = DIV_OF[h] === DIV_OF[a], sameConf = CONF_OF[h] === CONF_OF[a];
    if (o > 0) {
      W[h]++; L[a]++; w[h * N + a]++;
      if (sameDiv) { dW[h]++; dL[a]++; }
      if (sameConf) { cW[h]++; cL[a]++; }
    } else if (o < 0) {
      W[a]++; L[h]++; w[a * N + h]++;
      if (sameDiv) { dW[a]++; dL[h]++; }
      if (sameConf) { cW[a]++; cL[h]++; }
    } else {
      T[h]++; T[a]++; t[h * N + a]++; t[a * N + h]++;
      if (sameDiv) { dT[h]++; dT[a]++; }
      if (sameConf) { cT[h]++; cT[a]++; }
    }
    if (G.played && o === G.fixed) { // flipped (what-if) results carry no real score
      pf[h] += G.hs; pa[h] += G.as; pf[a] += G.as; pa[a] += G.hs;
      pfm[h * N + a] += G.hs; pam[h * N + a] += G.as;
      pfm[a * N + h] += G.as; pam[a * N + h] += G.hs;
    }
  }
  const pct = new Float64Array(N);
  for (let i = 0; i < N; i++) pct[i] = pctOf(W[i], L[i], T[i]);
  const R = { W, L, T, g, w, t, dW, dL, dT, cW, cL, cT, pf, pa, pfm, pam, pct };
  // Strength of victory / schedule (per game, ties count half)
  const sov = new Float64Array(N), sos = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let vW = 0, vG = 0, sW = 0, sG = 0;
    for (let j = 0; j < N; j++) {
      const gij = g[i * N + j];
      if (!gij) continue;
      const oppW = W[j] + 0.5 * T[j], oppG = W[j] + L[j] + T[j];
      sW += gij * oppW; sG += gij * oppG;
      const wij = w[i * N + j], tij = t[i * N + j];
      vW += (wij + 0.5 * tij) * oppW; vG += (wij + 0.5 * tij) * oppG;
    }
    sov[i] = vG ? vW / vG : 0;
    sos[i] = sG ? sW / sG : 0;
  }
  R.sov = sov; R.sos = sos;
  // Points rankings (lower combined rank is better). Ties share the better rank.
  R.confPtsRank = new Float64Array(N);
  R.allPtsRank = new Float64Array(N);
  const rankSum = (members, out) => {
    const rankBy = (arr, desc) => {
      const r = new Map();
      for (const i of members) {
        let better = 0;
        for (const j of members) if (desc ? arr[j] > arr[i] : arr[j] < arr[i]) better++;
        r.set(i, better + 1);
      }
      return r;
    };
    const rf = rankBy(pf, true), ra = rankBy(pa, false);
    for (const i of members) out[i] = rf.get(i) + ra.get(i);
  };
  const all = [...Array(N).keys()];
  rankSum(all, R.allPtsRank);
  rankSum(all.filter((i) => CONF_OF[i] === 0), R.confPtsRank);
  rankSum(all.filter((i) => CONF_OF[i] === 1), R.confPtsRank);
  return R;
}

function pctOf(w, l, t) {
  const gp = w + l + t;
  return gp ? (w + 0.5 * t) / gp : 0;
}

// ---------------------------------------------------------------------------
// Tiebreak step helpers. Each returns a value per team; higher is better.
// ---------------------------------------------------------------------------
function h2hPct(R, i, group) {
  let w = 0, gp = 0, t = 0;
  for (const j of group) if (j !== i) { w += R.w[i * N + j]; t += R.t[i * N + j]; gp += R.g[i * N + j]; }
  return gp ? (w + 0.5 * t) / gp : null;
}

function commonOpponents(R, group) {
  const opps = [];
  for (let k = 0; k < N; k++) {
    if (group.includes(k)) continue;
    let ok = true;
    for (const i of group) if (!R.g[i * N + k]) { ok = false; break; }
    if (ok) opps.push(k);
  }
  return opps;
}

function commonStats(R, i, opps) {
  let w = 0, t = 0, gp = 0, net = 0;
  for (const k of opps) {
    w += R.w[i * N + k]; t += R.t[i * N + k]; gp += R.g[i * N + k];
    net += R.pfm[i * N + k] - R.pam[i * N + k];
  }
  return { pct: gp ? (w + 0.5 * t) / gp : 0, gp, net };
}

// Deterministic "coin toss" for reproducibility; Monte Carlo passes its own RNG.
let coin = (i) => -((i * 2654435761) % 1000);

// ---------------------------------------------------------------------------
// Tiebreak tracing (off during Monte Carlo). When on, every tiebreak records each
// step, each club's number and the outcome, so the UI can explain the order.
// ---------------------------------------------------------------------------
let TRACE = null;
let LABEL = null;
const recTxt = (w, l, t) => `${w}-${l}${t ? '-' + t : ''}`;
const p3 = (v) => v.toFixed(3).replace(/^0/, '').replace(/^-0/, '-');

// Apply ordered steps to a group. Each step: { name, vals(group) -> number[] | null, show(i, group) }.
// Returns the single best team. Restarts via `restart` whenever a step trims the group.
function runSteps(R, group, steps, restart, kind) {
  const entry = TRACE ? { label: LABEL, kind, teams: [...group], steps: [] } : null;
  if (entry) TRACE.push(entry);
  for (const step of steps) {
    const vals = step.vals(group);
    if (!vals) {
      if (entry) entry.steps.push({ name: step.name, skipped: step.skipNote ? step.skipNote(group) : 'does not apply' });
      continue;
    }
    let best = -Infinity;
    for (const v of vals) if (v > best) best = v;
    const eps = 1e-9;
    const top = group.filter((_, k) => vals[k] >= best - eps);
    if (entry) {
      entry.steps.push({
        name: step.name,
        rows: group.map((i, k) => ({ team: i, text: step.show(i, group), best: vals[k] >= best - eps })),
        result: top.length === 1 ? 'decided' : top.length < group.length ? 'trimmed' : 'tied',
      });
    }
    if (top.length === 1) { if (entry) entry.winner = top[0]; return top[0]; }
    if (top.length < group.length) {
      if (entry) entry.restart = [...top];
      const w = restart(top);
      if (entry) entry.winner = w;
      return w;
    }
  }
  let best = group[0];
  for (const i of group) if (coin(i) > coin(best)) best = i;
  if (entry) { entry.steps.push({ name: 'Coin toss', rows: group.map((i) => ({ team: i, text: i === best ? 'won toss' : '', best: i === best })), result: 'decided' }); entry.winner = best; }
  return best;
}

function h2hRec(R, i, group) {
  let w = 0, l = 0, t = 0;
  for (const j of group) if (j !== i) { w += R.w[i * N + j]; t += R.t[i * N + j]; l += R.g[i * N + j] - R.w[i * N + j] - R.t[i * N + j]; }
  return recTxt(w, l, t);
}

function commonStepVals(R, group, minGames) {
  const opps = commonOpponents(R, group);
  const st = group.map((i) => commonStats(R, i, opps));
  if (minGames && st.some((s) => s.gp < minGames)) return null;
  if (!opps.length) return null;
  return st.map((s) => s.pct);
}
function commonShow(R, i, group) {
  const opps = commonOpponents(R, group);
  let w = 0, t = 0, gp = 0;
  for (const k of opps) { w += R.w[i * N + k]; t += R.t[i * N + k]; gp += R.g[i * N + k]; }
  return recTxt(w, gp - w - t, t);
}
const commonSkip = (R, minGames) => (gr) => {
  const opps = commonOpponents(R, gr);
  if (!opps.length) return 'no common opponents';
  return `fewer than ${minGames} common games`;
};

const netCommonVals = (R, group) => {
  const opps = commonOpponents(R, group);
  if (!opps.length) return null;
  return group.map((i) => commonStats(R, i, opps).net);
};
const signed = (v) => (v > 0 ? '+' : '') + Math.round(v);

function tailSteps(R) {
  return [
    { name: 'Strength of victory', vals: (gr) => gr.map((i) => R.sov[i]), show: (i) => p3(R.sov[i]) },
    { name: 'Strength of schedule', vals: (gr) => gr.map((i) => R.sos[i]), show: (i) => p3(R.sos[i]) },
    { name: 'Conference points rank', vals: (gr) => gr.map((i) => -R.confPtsRank[i]), show: (i) => `${R.confPtsRank[i]} (lower wins)` },
    { name: 'League points rank', vals: (gr) => gr.map((i) => -R.allPtsRank[i]), show: (i) => `${R.allPtsRank[i]} (lower wins)` },
    { name: 'Net points in common games', vals: (gr) => netCommonVals(R, gr), show: (i, gr) => signed(commonStats(R, i, commonOpponents(R, gr)).net) },
    { name: 'Net points, all games', vals: (gr) => gr.map((i) => R.pf[i] - R.pa[i]), show: (i) => signed(R.pf[i] - R.pa[i]) },
  ];
}

// Division tiebreaker: returns best team in group (all same division).
function breakDiv(R, group) {
  if (group.length === 1) return group[0];
  const steps = [
    { name: 'Head-to-head', vals: (gr) => { const v = gr.map((i) => h2hPct(R, i, gr)); return v.some((x) => x === null) ? null : v; }, show: (i, gr) => h2hRec(R, i, gr) },
    { name: 'Division record', vals: (gr) => gr.map((i) => pctOf(R.dW[i], R.dL[i], R.dT[i])), show: (i) => recTxt(R.dW[i], R.dL[i], R.dT[i]) },
    { name: 'Common games', vals: (gr) => commonStepVals(R, gr, 0), show: (i, gr) => commonShow(R, i, gr), skipNote: commonSkip(R, 1) },
    { name: 'Conference record', vals: (gr) => gr.map((i) => pctOf(R.cW[i], R.cL[i], R.cT[i])), show: (i) => recTxt(R.cW[i], R.cL[i], R.cT[i]) },
    ...tailSteps(R),
  ];
  return runSteps(R, group, steps, (top) => breakDiv(R, top), 'division');
}

// Wild card / conference tiebreaker: returns best team in group (same conference).
function breakConf(R, group, divRank) {
  if (group.length === 1) return group[0];
  // Only the highest-ranked club from each division can advance.
  const byDiv = new Map();
  for (const i of group) {
    const d = DIV_OF[i];
    if (!byDiv.has(d) || divRank[i] < divRank[byDiv.get(d)]) byDiv.set(d, i);
  }
  const cand = [...byDiv.values()];
  if (cand.length < group.length && TRACE) {
    const dropped = group.filter((i) => !cand.includes(i));
    TRACE.push({ label: LABEL, kind: 'divfilter', teams: [...group], dropped, keptOver: dropped.map((i) => byDiv.get(DIV_OF[i])), ...(cand.length === 1 ? { winner: cand[0] } : {}) });
  }
  if (cand.length === 1) return cand[0];
  if (cand.length < group.length) return breakConf(R, cand, divRank);
  const steps = [];
  if (cand.length === 2) {
    steps.push({
      name: 'Head-to-head',
      vals: (gr) => { const [x, y] = gr; if (!R.g[x * N + y]) return null; return [h2hPct(R, x, gr), h2hPct(R, y, gr)]; },
      show: (i, gr) => h2hRec(R, i, gr),
      skipNote: () => 'they did not play each other',
    });
  } else {
    steps.push({
      name: 'Head-to-head sweep',
      vals: (gr) => {
        // applies only if one club beat each of the others, or lost to each of the others
        for (const i of gr) if (gr.every((j) => j === i || (R.g[i * N + j] && R.w[i * N + j] === R.g[i * N + j]))) return gr.map((j) => (j === i ? 1 : 0));
        for (const i of gr) if (gr.every((j) => j === i || (R.g[i * N + j] && R.w[j * N + i] === R.g[i * N + j]))) return gr.map((j) => (j === i ? 0 : 1));
        return null;
      },
      show: (i, gr) => h2hRec(R, i, gr),
      skipNote: () => 'no club beat (or lost to) all the others',
    });
  }
  steps.push(
    { name: 'Conference record', vals: (gr) => gr.map((i) => pctOf(R.cW[i], R.cL[i], R.cT[i])), show: (i) => recTxt(R.cW[i], R.cL[i], R.cT[i]) },
    { name: 'Common games (min. 4)', vals: (gr) => commonStepVals(R, gr, 4), show: (i, gr) => commonShow(R, i, gr), skipNote: commonSkip(R, 4) },
    ...tailSteps(R),
  );
  return runSteps(R, cand, steps, (top) => breakConf(R, top, divRank), 'conference');
}

// Order a list best-to-worst by pct, breaking ties with `breaker`. labelFn(k) names the slot.
function orderTeams(R, teams, breaker, labelFn) {
  const left = [...teams];
  const out = [];
  while (left.length) {
    let best = -1;
    for (const i of left) if (R.pct[i] > best) best = R.pct[i];
    const tied = left.filter((i) => Math.abs(R.pct[i] - best) < 1e-9);
    if (tied.length > 1 && TRACE && labelFn) LABEL = { ...labelFn(out.length), tied: [...tied] };
    const pick = tied.length === 1 ? tied[0] : breaker(tied);
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full evaluation of one set of outcomes.
// opts.explain = true returns result.trace: every tiebreak with its steps.
// ---------------------------------------------------------------------------
export function evaluate(ctx, outcomes, opts = {}) {
  if (opts.coin) coin = opts.coin;
  TRACE = opts.explain ? [] : null;
  const R = computeRecords(ctx, outcomes);
  const divRank = new Int8Array(N);
  const divOrder = DIV_NAMES.map((dn, di) => {
    const members = [];
    for (let i = 0; i < N; i++) if (DIV_OF[i] === di) members.push(i);
    const ord = orderTeams(R, members, (tied) => breakDiv(R, tied), (k) => ({ type: 'division', conf: CONF_OF[members[0]], div: dn, place: k + 1 }));
    ord.forEach((t, k) => { divRank[t] = k; });
    return ord;
  });
  const seeds = [0, 1].map((c) => {
    const winners = divOrder.filter((_, di) => CONF_OF[divOrder[di][0]] === c).map((o) => o[0]);
    const wOrd = orderTeams(R, winners, (tied) => breakConf(R, tied, divRank), (k) => ({ type: 'seed', conf: c, seed: k + 1 }));
    const rest = [];
    for (let i = 0; i < N; i++) if (CONF_OF[i] === c && !winners.includes(i)) rest.push(i);
    const restOrd = orderTeams(R, rest, (tied) => breakConf(R, tied, divRank), (k) => ({ type: 'seed', conf: c, seed: k + 5 }));
    return [...wOrd, ...restOrd]; // full conference order: seeds 1-7 then the rest
  });
  const result = { R, divOrder, divRank, seeds };
  if (opts.draft !== false) result.draft = draftOrder(R, seeds, divRank);
  if (TRACE) { result.trace = TRACE; TRACE = null; LABEL = null; }
  return result;
}

// Projected draft order. Non-playoff teams by record (worst first), SOS ascending,
// then division/conference tiebreakers. Playoff teams (picks 19-32) ordered by record
// as a projection since playoff results are unknown.
function draftOrder(R, seeds, divRank) {
  const playoff = new Set([...seeds[0].slice(0, 7), ...seeds[1].slice(0, 7)]);
  const non = [], po = [];
  for (let i = 0; i < N; i++) (playoff.has(i) ? po : non).push(i);
  const orderWorstFirst = (teams) => {
    const sorted = [...teams].sort((x, y) => R.pct[x] - R.pct[y] || R.sos[x] - R.sos[y]);
    // break remaining exact ties
    const out = [];
    let k = 0;
    while (k < sorted.length) {
      let j = k + 1;
      while (j < sorted.length && Math.abs(R.pct[sorted[j]] - R.pct[sorted[k]]) < 1e-9 && Math.abs(R.sos[sorted[j]] - R.sos[sorted[k]]) < 1e-9) j++;
      const tied = sorted.slice(k, j);
      out.push(...(tied.length === 1 ? tied : breakDraftTie(R, tied, divRank)));
      k = j;
    }
    return out;
  };
  return [...orderWorstFirst(non), ...orderWorstFirst(po)];
}

// Returns tied teams ordered worst-first (earliest pick first).
function breakDraftTie(R, tied, divRank) {
  const confs = [0, 1].map((c) => tied.filter((i) => CONF_OF[i] === c));
  const ordered = confs.map((grp) => {
    const best = [];
    const left = [...grp];
    while (left.length) {
      const allSameDiv = left.every((i) => DIV_OF[i] === DIV_OF[left[0]]);
      const pick = left.length === 1 ? left[0] : allSameDiv ? breakDiv(R, left) : breakConf(R, left, divRank);
      best.push(pick);
      left.splice(left.indexOf(pick), 1);
    }
    return best.reverse(); // worst first
  });
  // merge across conferences: earlier pick goes to the club that loses cross-conference tiebreak
  const [a, b] = ordered;
  const out = [];
  while (a.length || b.length) {
    if (!a.length) { out.push(b.shift()); continue; }
    if (!b.length) { out.push(a.shift()); continue; }
    const x = a[0], y = b[0];
    const h = R.g[x * N + y] ? h2hPct(R, x, [x, y]) - 0.5 : 0;
    let xBetter;
    if (h !== 0) xBetter = h > 0;
    else {
      const opps = commonOpponents(R, [x, y]);
      const sx = commonStats(R, x, opps), sy = commonStats(R, y, opps);
      if (sx.gp >= 4 && sy.gp >= 4 && sx.pct !== sy.pct) xBetter = sx.pct > sy.pct;
      else if (R.sov[x] !== R.sov[y]) xBetter = R.sov[x] > R.sov[y];
      else xBetter = coin(x) > coin(y);
    }
    out.push(xBetter ? b.shift() : a.shift());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Win probabilities and Monte Carlo.
// ---------------------------------------------------------------------------
function normCdf(x) {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Team ratings from this season's point differential, shrunk toward 0.
export function teamRatings(ctx) {
  const pd = new Float64Array(N), gp = new Float64Array(N);
  for (const G of ctx.games) if (G.played) {
    pd[G.h] += G.hs - G.as; pd[G.a] += G.as - G.hs; gp[G.h]++; gp[G.a]++;
  }
  const r = new Float64Array(N);
  for (let i = 0; i < N; i++) r[i] = gp[i] ? (pd[i] / gp[i]) * (gp[i] / (gp[i] + 4)) : 0;
  return r;
}

// Team ratings implied by this season's betting lines (least squares, recent weeks weighted).
export function marketRatings(ctx, halfLife = 6) {
  const lines = ctx.games.filter((G) => G.spread != null);
  if (!lines.length) return null;
  const maxW = Math.max(...lines.map((G) => G.week));
  const r = new Float64Array(N);
  let hfa = 1.5;
  for (let it = 0; it < 400; it++) {
    const g = new Float64Array(N);
    let gh = 0, wsum = 0;
    for (const G of lines) {
      const w = Math.pow(0.5, (maxW - G.week) / halfLife);
      const e = r[G.h] - r[G.a] + hfa - G.spread;
      g[G.h] += w * e; g[G.a] -= w * e; gh += w * e; wsum += w;
    }
    for (let i = 0; i < N; i++) r[i] -= 0.5 * ((g[i] / wsum) * 16 + 0.01 * r[i]);
    hfa -= (0.5 * gh) / wsum;
  }
  const mean = r.reduce((s, v) => s + v, 0) / N;
  for (let i = 0; i < N; i++) r[i] -= mean;
  return { r, hfa };
}

// Expected home margin for each unplayed game, and where it came from.
// Posted line when there is one; otherwise 75% market ratings + 25% point differential
// (backtested 2015-2025: beats either alone at 1, 3 and 6 weeks ahead).
export function homeMargins(ctx) {
  const pd = teamRatings(ctx);
  const mk = marketRatings(ctx);
  return ctx.games.map((G) => {
    if (G.played) return null;
    if (G.spread != null) return G.spread;
    const pdm = pd[G.h] - pd[G.a] + 1.5;
    return mk ? 0.75 * (mk.r[G.h] - mk.r[G.a] + mk.hfa) + 0.25 * pdm : pdm;
  });
}

// Probability the home team wins each unplayed game.
export function homeWinProbs(ctx) {
  return homeMargins(ctx).map((m) => (m === null ? null : normCdf(m / 13.5)));
}

function gauss(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// picks: Map/obj gameIndex -> outcome code for user-locked games.
// Each simulated season also redraws team strength (ratingNoise, in points) so
// odds reflect uncertainty about how good teams really are, not just game luck.
// track: { team, games: [gameIndex...] } -> result.track[k] = playoff odds for `team`
// when the home side wins game k vs when the away side wins (from the same simulations).
export function simulate(ctx, { sims = 10000, picks = {}, seed = 12345, ratingNoise = 3, track = null } = {}) {
  let s = seed >>> 0;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const margins = homeMargins(ctx);
  const noise = new Float64Array(N);
  const base = ctx.games.map((G, k) => (picks[k] !== undefined ? picks[k] : G.played ? G.fixed : undefined));
  const free = [];
  base.forEach((o, k) => { if (o === undefined) free.push(k); });
  const make = new Int16Array(N), div = new Int16Array(N), bye = new Int16Array(N);
  const seedCount = Array.from({ length: N }, () => new Int16Array(7));
  const pick1 = new Int16Array(N), top5 = new Int16Array(N);
  const draftSum = new Float64Array(N);
  const winsSum = new Float64Array(N);
  const tr = track ? track.games.filter((k) => base[k] === undefined).map((k) => ({ k, hN: 0, aN: 0, h: [0, 0, 0, 0], a: [0, 0, 0, 0] })) : [];
  const outcomes = base.slice();
  const coinRng = () => { const m = new Map(); return (i) => { if (!m.has(i)) m.set(i, rand()); return m.get(i); }; };
  for (let n = 0; n < sims; n++) {
    for (let i = 0; i < N; i++) noise[i] = gauss(rand) * ratingNoise;
    for (const k of free) {
      const G = ctx.games[k];
      const pk = normCdf((margins[k] + noise[G.h] - noise[G.a]) / 13.5);
      outcomes[k] = rand() < pk ? 1 : -1;
    }
    const res = evaluate(ctx, outcomes, { coin: coinRng() });
    for (const c of [0, 1]) {
      res.seeds[c].slice(0, 7).forEach((t, sd) => {
        make[t]++; seedCount[t][sd]++;
        if (sd === 0) bye[t]++;
        if (sd < 4) div[t]++;
      });
    }
    res.draft.forEach((t, k) => {
      draftSum[t] += k + 1;
      if (k === 0) pick1[t]++;
      if (k < 5) top5[t]++;
    });
    for (let i = 0; i < N; i++) winsSum[i] += res.R.W[i] + 0.5 * res.R.T[i];
    if (tr.length) {
      const c = CONF_OF[track.team];
      const sd = res.seeds[c].indexOf(track.team);
      const m = [sd < 7 ? 1 : 0, sd < 4 ? 1 : 0, sd === 0 ? 1 : 0, res.draft.indexOf(track.team) + 1]; // playoffs, division, #1 seed, draft slot
      for (const x of tr) {
        const side = outcomes[x.k] > 0 ? x.h : x.a;
        if (outcomes[x.k] > 0) x.hN++; else x.aN++;
        for (let q = 0; q < 4; q++) side[q] += m[q];
      }
    }
  }
  coin = (i) => -((i * 2654435761) % 1000);
  const out = TEAMS.map((team, i) => ({
    team,
    playoffs: make[i] / sims,
    division: div[i] / sims,
    bye: bye[i] / sims,
    seeds: Array.from(seedCount[i], (c) => c / sims),
    avgWins: winsSum[i] / sims,
    avgPick: draftSum[i] / sims,
    pick1: pick1[i] / sims,
    top5: top5[i] / sims,
  }));
  if (track) out.track = Object.fromEntries(tr.map((x) => [x.k, { home: x.h.map((v) => (x.hN ? v / x.hN : null)), away: x.a.map((v) => (x.aN ? v / x.aN : null)), n: Math.min(x.hN, x.aN) }]));
  return out;
}
