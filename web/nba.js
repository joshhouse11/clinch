// ---------- Clinch NBA ----------
const $ = (s) => document.querySelector(s);
const rows = RAW.games.map((g) => ({ id: g[0], when: g[1], date: g[2], home: g[3], away: g[4], hs: g[5], as: g[6], final: g[7], type: '2', note: '' }));
const ctx = nbaContext(rows);
const G = ctx.games;
const PRIOR = NBA_TEAMS.map((t) => RAW.prior[t] ?? 0);
const RATING = nbaRatings(ctx, PRIOR);
const REAL = G.map((g) => (g.played ? (g.hs > g.as ? 1 : -1) : null));
const ST = nbaStandings(ctx, REAL);
const T = NBA_TEAMS;
const COLORS = Object.fromEntries(T.map((t) => [t, (RAW.teams[t] && RAW.teams[t].color) || '#444']));
const FULL = Object.fromEntries(T.map((t) => [t, (RAW.teams[t] && RAW.teams[t].name) || t]));
const NICK = Object.fromEntries(T.map((t) => [t, FULL[t].replace(/^(Los Angeles|New York|New Orleans|Oklahoma City|San Antonio|Golden State|Portland Trail|\S+)\s/, '').replace(/^Blazers$/, 'Trail Blazers')]));
const AB = (t) => NBA_ABBR[t] || t;
const ink = (hex) => { const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#111' : '#fff'; };
const chip = (t) => `<span class="chip" style="--c:${COLORS[t]};--ci:${ink(COLORS[t])}">${AB(t)}</span>`;
const pct = (p) => (p == null ? '–' : p >= 0.995 && p < 1 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%');
const rec = (i) => `${ST.R.W[i]}-${ST.R.L[i]}`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const played = G.filter((g) => g.played).length;
const lastDate = G.filter((g) => g.played).map((g) => g.date).sort().at(-1) || '';
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const seasonLabel = `${RAW.season - 1}-${String(RAW.season).slice(2)}`;
const store = { get(k, d) { try { const v = localStorage.getItem('clinch:nba:' + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('clinch:nba:' + k, JSON.stringify(v)); } catch {} } };

// ---- routes ----
const slugOf = (t) => FULL[t].toLowerCase().replace(/[^a-z0-9]+/g, '-');
const BY_SLUG = Object.fromEntries(T.map((t) => [slugOf(t), t]));
const TAB_PATH = { standings: '/nba/', odds: '/nba/playoff-odds/', lottery: '/nba/draft-lottery/' };
const pathFor = (tab, team) => (tab === 'team' ? `/nba/teams/${slugOf(team)}/` : TAB_PATH[tab]);
function routeOf(p) {
  const m = p.match(/^\/nba\/teams\/([a-z0-9-]+)\/?$/);
  if (m && BY_SLUG[m[1]]) return { tab: 'team', team: BY_SLUG[m[1]] };
  if (/^\/nba\/teams\/?$/.test(p)) return { tab: 'team' };
  for (const [tab, pth] of Object.entries(TAB_PATH)) if (p === pth || p === pth.slice(0, -1)) return { tab };
  return { tab: 'standings' };
}
const R0 = routeOf(location.pathname);
const state = { tab: R0.tab, team: R0.team || store.get('team', 'BOS'), draws: null, drawN: 0 };
if (!T.includes(state.team)) state.team = 'BOS';
let odds = null;

// ---- standings ----
function gb(c, i) { const top = ST.seeds[c][0]; return ((ST.R.W[top] - ST.R.W[i]) + (ST.R.L[i] - ST.R.L[top])) / 2; }
function standingsTable(c) {
  const rowsH = ST.seeds[c].map((i, k) => {
    const t = T[i], o = odds ? odds[i] : null, g = gb(c, i);
    return `<tr class="${k === 5 || k === 9 ? 'cutline' : ''}${k >= 6 && k <= 9 ? ' pi' : ''}${t === state.team ? ' me' : ''}" style="--tc:${COLORS[t]}">
      <td class="sd">${k + 1}</td><td><span class="tn">${chip(t)}<a href="${pathFor('team', t)}">${NICK[t]}</a>${ST.divWinners.has(i) ? ' <span class="tag div">div</span>' : ''}</span></td>
      <td class="num">${rec(i)}</td><td class="num">${g === 0 ? '–' : g.toFixed(1).replace('.0', '')}</td>
      <td class="num">${ST.R.cW[i]}-${ST.R.cL[i]}</td>
      <td class="num">${o ? pct(o.playoffs) : '…'}</td><td class="num">${o ? pct(o.top6) : '…'}</td></tr>`;
  }).join('');
  return `<section class="card scroll"><div class="stand-head" style="padding:14px 14px 0"><h3>${c ? 'Western' : 'Eastern'} Conference</h3></div>
    <table class="t nst"><thead><tr><th></th><th>Team</th><th>W-L</th><th>GB</th><th>Conf</th><th title="Make the playoffs (top 6 or win the play-in)">Playoffs</th><th title="Finish top 6 and skip the play-in">Top 6</th></tr></thead><tbody>${rowsH}</tbody></table></section>`;
}
function upcoming() {
  const fut = G.filter((g) => !g.played).sort((a, b) => (a.when || a.date).localeCompare(b.when || b.date));
  if (!fut.length) return '';
  const day = fut[0].date, list = fut.filter((g) => g.date === day);
  return `<div class="section-head" style="margin-top:22px"><h2>Next up: ${fmtDate(day)}</h2><span class="hint">Win chances from Clinch's team ratings</span></div>
    <div class="ugames">${list.map((g) => { const p = nbaWinProb(RATING, g.h, g.a); const ft = (t, q) => `<div class="tm">${chip(T[t])}${NICK[T[t]]}</div><div class="p${q >= 0.5 ? ' fav' : ''}">${pct(q)}</div>`;
      return `<div class="card ug">${ft(g.a, 1 - p)}${ft(g.h, p)}<small>${g.when ? new Date(g.when).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : ''} · at ${NICK[T[g.h]]}</small></div>`; }).join('')}</div>`;
}
function renderStandings() {
  return `<div class="legend"><span><i style="background:var(--accent)"></i>Seeds 1-6: playoffs</span><span><i style="background:var(--gold)"></i>Seeds 7-10: play-in</span><span><i style="background:var(--line)"></i>11-15: lottery</span></div>
    <div class="ngrid">${standingsTable(0)}${standingsTable(1)}</div>${upcoming()}`;
}

// ---- odds ----
function renderOdds() {
  if (!odds) return '<div class="card empty">Running 5,000 seasons…</div>';
  const top = T.map((t, i) => ({ t, i, ...odds[i] })).sort((a, b) => b.title - a.title).slice(0, 6);
  const hero = `<section class="ohero" style="margin-top:4px"><div class="ohead"><h2>Title odds</h2><span class="hint">From 5,000 simulated seasons, play-ins and playoffs</span></div>
    <div class="hcards">${top.map((x) => `<div class="hcard" style="--tc:${COLORS[x.t]}">${chip(x.t)}<span class="nm">${NICK[x.t]}</span><b class="big num">${pct(x.title)}</b><span class="sub num">Finals ${pct(x.finals)}</span></div>`).join('')}</div></section>`;
  const tbl = (c) => {
    const list = ST.seeds[c].map((i) => ({ i, t: T[i], ...odds[i] })).sort((a, b) => b.playoffs - a.playoffs || b.avgWins - a.avgWins);
    return `<section class="card scroll"><div class="stand-head" style="padding:14px 14px 0"><h3>${c ? 'West' : 'East'}</h3></div><table class="t"><thead><tr><th>Team</th><th>Record</th><th>Proj. W</th><th>Playoffs</th><th>Top 6</th><th>Play-in</th><th>#1 seed</th><th>Conf. finals</th><th>Finals</th><th>Title</th></tr></thead><tbody>
      ${list.map((x) => `<tr class="${x.t === state.team ? 'me' : ''}" style="--tc:${COLORS[x.t]}"><td><span class="tn">${chip(x.t)}<a href="${pathFor('team', x.t)}" style="color:inherit;text-decoration:none">${NICK[x.t]}</a></span></td><td class="num">${rec(x.i)}</td><td class="num">${x.avgWins.toFixed(1)}</td><td><span class="bar"><i><b style="width:${Math.round(x.playoffs * 100)}%"></b></i><span class="num">${pct(x.playoffs)}</span></span></td><td class="num">${pct(x.top6)}</td><td class="num">${pct(x.playIn)}</td><td class="num">${pct(x.one)}</td><td class="num">${pct(x.conf)}</td><td class="num">${pct(x.finals)}</td><td class="num po champ">${pct(x.title)}</td></tr>`).join('')}</tbody></table></section>`;
  };
  return `${hero}<div class="section-head" style="margin-top:22px"><h2>Every team's chances</h2></div><div style="display:grid;gap:16px">${tbl(0)}${tbl(1)}</div>`;
}

// ---- draft lottery (2027+: "3-2-1", 16 teams, all 16 picks drawn; traded picks resolved) ----
const RULES = RAW.picks;
const BANS = pickBans(RULES);
const NEW_LOT = !!(RULES && RULES.format === '321');
const asOf = RULES && RULES.asOf ? new Date(RULES.asOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
// If the season ended today: 8 seeds assumed to lose the 7-v-8 game.
function lotField() { return lottery321Field(ST.R, ST.seeds, [ST.seeds[0][7], ST.seeds[1][7]]); }
function lotteryOrder() { return lotField().map((x) => x.t); }
function slotsFor(lot) { const full = draftOrder321(ST.R, lot), slot = Array(T.length); full.forEach((t, k) => { slot[t] = k + 1; }); return { full, slot }; }
let lotMC = null, lotKey = '';
function lotteryMC() {
  const field = lotField(), key = field.map((x) => x.t + ':' + x.balls).join(',');
  if (lotMC && lotKey === key) return lotMC;
  let s = 99991;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const N = 60000, P = {}, own = {}, ownerHits = {};
  field.forEach((x) => { P[x.t] = new Float64Array(16); own[x.t] = {}; });
  for (let n = 0; n < N; n++) {
    const lot = drawLottery321(rand, field, BANS), { slot } = slotsFor(lot);
    const { owner } = resolvePickOwners(RULES, slot);
    lot.forEach((t, k) => { P[t][k]++; own[t][owner[t]] = (own[t][owner[t]] || 0) + 1; if (k === 0) ownerHits[owner[t]] = (ownerHits[owner[t]] || 0) + 1; });
  }
  field.forEach((x) => { P[x.t] = Array.from(P[x.t], (v) => v / N); for (const o in own[x.t]) own[x.t][o] /= N; });
  lotKey = key; lotMC = { field, P, own };
  return lotMC;
}
const viaTxt = (orig, ow) => (orig === ow ? '' : `<span class="via">via ${AB(T[orig])}</span>`);
function ownerCell(t, dist) {
  const ent = Object.entries(dist || {}).map(([o, p]) => [+o, p]).sort((a, b) => b[1] - a[1]);
  if (!ent.length || (ent.length === 1 && ent[0][0] === t)) return '<span class="hint">Own</span>';
  if (ent[0][1] >= 0.995) return `${chip(T[ent[0][0]])}`;
  return `<span class="owns">${ent.filter((e) => e[1] >= 0.005).slice(0, 3).map(([o, p]) => `${chip(T[o])}<small class="num">${pct(p)}</small>`).join('')}</span>`;
}
function ruleNotes() {
  if (!RULES) return '';
  const nm = (c) => NICK[c] || c;
  const lines = RULES.rules.map((r) => {
    if (r.type === 'convey') return `<b>${nm(r.pick)}</b> pick → ${nm(r.to)}${r.keepIf ? `, top-${r.keepIf[1]} protected` : ', unprotected'}`;
    if (r.type === 'swap') return `<b>${nm(r.a)}</b> can swap its pick for ${nm(r.b)}'s`;
    if (r.type === 'rank') return r.picks.length === 3 ? `<b>${r.picks.map(nm).join(', ')}</b> picks: best → ${nm(r.to[0])}, 2nd → ${nm(r.to[1])}, worst → ${nm(r.to[2])}` : `<b>${r.picks.map(nm).join(' / ')}</b> picks: better → ${nm(r.to[0])}, other → ${nm(r.to[1])}${r.lastKeepIf ? ` (top-${r.lastKeepIf[1]} protected; if it lands there, ${nm(r.lastKeepTo)} keeps both)` : ''}`;
    if (r.type === 'split') return `<b>${nm(r.pick)}</b> pick → ${r.ranges.map(([lo, hi, to]) => `${nm(to)} if ${lo}-${hi}`).join(', ')}`;
    if (r.type === 'swapWorstOf') return `<b>${nm(r.holder)}</b> can swap the worse of its ${r.among.map(nm).join('/')} picks for ${nm(r.with)}'s`;
    if (r.type === 'swapIfHolding') return `<b>${nm(r.holder)}</b> can then swap that pick for ${nm(r.with)}'s`;
    return '';
  });
  const bans = RULES.bans.map((b) => `<b>${nm(b.pick)}</b> pick can't land ${b.noPicks.length === 1 ? '#1' : 'top ' + b.noPicks.length}: ${esc(b.why.split(';')[1] ? b.why.split(';')[1].trim() : b.why)}`);
  return `<section class="card notes"><h3>Traded picks &amp; protections</h3><ul>${[...lines, ...bans].map((l) => `<li>${l}</li>`).join('')}</ul><p class="hint">Pick ownership as of ${asOf}. Swaps go to whichever team holds the right, automatically taking the better pick.</p></section>`;
}
function renderLottery() {
  const mc = lotteryMC(), field = mc.field, pre = Object.fromEntries(field.map((x, k) => [x.t, k + 1]));
  const d = state.draws;
  let drawRow;
  if (d) {
    const { slot } = slotsFor(d), { owner } = resolvePickOwners(RULES, slot);
    const card = (t, k, big) => { const ow = owner[t], jump = pre[t] - (k + 1); return `<div class="drawc on${big ? '' : ' sm'}" style="--tc:${COLORS[T[ow]]};animation-delay:${Math.min(k, 8) * 0.12}s"><b>Pick ${k + 1}</b>${chip(T[ow])}<span class="nm">${NICK[T[ow]]}</span>${viaTxt(t, ow)}<span class="jump">${jump > 0 ? `▲ ${jump}` : jump < 0 ? `▼ ${-jump}` : '–'}</span></div>`; };
    drawRow = `<div class="draw">${d.slice(0, 4).map((t, k) => card(t, k, true)).join('')}</div><div class="draw rest">${d.slice(4, 16).map((t, k) => card(t, k + 4, false)).join('')}</div>`;
  } else drawRow = `<div class="draw">${[1, 2, 3, 4].map((k) => `<div class="drawc"><b>Pick ${k}</b><span class="hint">?</span></div>`).join('')}</div>`;
  const heat = (v) => `background:color-mix(in srgb, var(--accent) ${Math.round(Math.min(1, v * 4) * 70)}%, transparent)`;
  const tbl = `<section class="card scroll lot"><table class="t"><thead><tr><th>Slot</th><th>Pick</th><th>Owner</th><th>Record</th><th title="Lottery balls">Balls</th>${Array.from({ length: 16 }, (_, k) => `<th class="hm">#${k + 1}</th>`).join('')}</tr></thead><tbody>
    ${field.map((x, k) => { const i = x.t; return `<tr class="${T[i] === state.team ? 'me' : ''}${k === 2 ? ' cutline' : ''}" style="--tc:${COLORS[T[i]]}"><td class="num">${k + 1}</td><td><span class="tn">${chip(T[i])}<a href="${pathFor('team', T[i])}" style="color:inherit;text-decoration:none">${NICK[T[i]]}</a></span></td><td class="own">${ownerCell(i, mc.own[i])}</td><td class="num">${rec(i)}</td><td class="num balls">${'●'.repeat(x.balls)}${x.rel ? '<small title="Draft relegated: can\'t fall below #12"> R</small>' : ''}</td>${mc.P[i].map((v) => `<td class="hm num" style="${v >= 0.0005 ? heat(v) : ''}">${v >= 0.0005 ? (v * 100).toFixed(1) : ''}</td>`).join('')}</tr>`; }).join('')}</tbody></table></section>`;
  // projected odds by pick owner (season sim)
  let proj = [];
  if (odds) {
    proj = T.map((t, i) => ({ t, i, own1: odds[i].own1, ownTop4: odds[i].ownTop4, via: T.map((u, j) => [u, (odds[j].toOwner || {})[t] || 0]).filter(([u, p]) => u !== t && p >= 0.2).map(([u]) => AB(u)) })).sort((a, b) => b.own1 - a.own1).slice(0, 6);
  }
  return `<div class="lotbtn"><button class="btn primary big" data-act="sim">${d ? 'Sim it again' : '🎲 Sim the lottery'}</button>${state.drawN ? `<span class="hint">${state.drawN} lotter${state.drawN === 1 ? 'y' : 'ies'} simmed</span>` : '<span class="hint">Draws all 16 lottery picks with the new 3-2-1 odds and today\'s standings, then hands each pick to the team that owns it</span>'}</div>
    ${drawRow}
    <div class="section-head"><h2>If the season ended today</h2><span class="hint">Chance (%) of landing each pick. 37 balls: 3 for teams outside the play-in, 2 for the three worst records and the 9-10 seeds, 1 for the 7-v-8 losers (8 seeds for now).</span></div>${tbl}
    ${proj.length ? `<div class="section-head" style="margin-top:22px"><h2>Who lands the #1 pick</h2><span class="hint">By pick owner, simulating the rest of the season and the lottery</span></div>
    <div class="hcards">${proj.map((x) => `<div class="hcard" style="--tc:${COLORS[x.t]}">${chip(x.t)}<span class="nm">${NICK[x.t]}</span><b class="big num">${pct(x.own1)}</b><span class="sub num">Top 4: ${pct(x.ownTop4)}${x.via.length ? ` · via ${x.via.join(', ')}` : ''}</span></div>`).join('')}</div>` : ''}
    ${ruleNotes()}`;
}
// Plain-English line about a team's own 2027 first and the picks it holds from others.
function pickLine(i) {
  const o = odds && odds[i];
  if (!o || !RULES) return '';
  const own = o.toOwner || {}, keep = own[T[i]] || 0;
  const away = Object.entries(own).filter(([u, p]) => u !== T[i] && p >= 0.01).sort((a, b) => b[1] - a[1]);
  const holds = T.map((u, j) => [u, (odds[j].toOwner || {})[T[i]] || 0]).filter(([u, p]) => u !== T[i] && p >= 0.01);
  const parts = [];
  if (away.length) parts.push(`Their ${RAW.season} first goes to ${away.map(([u, p]) => `the ${NICK[u]}${p < 0.995 ? ` (${pct(p)})` : ''}`).join(' or ')}${keep >= 0.01 ? `; they keep it ${pct(keep)} of the time` : ''}.`);
  if (holds.length) parts.push(`They also hold ${holds.map(([u, p]) => `the ${NICK[u]}' pick${p < 0.995 ? ` (${pct(p)})` : ''}`).join(', ')}.`);
  return parts.length ? `<p class="hint pickline">${parts.join(' ')}</p>` : '';
}

// ---- team ----
function renderTeam() {
  const t = state.team, i = NBA_IDX[t], c = NBA_CONF_OF[i], sd = ST.seeds[c].indexOf(i), o = odds ? odds[i] : null;
  const fut = G.filter((g) => !g.played && (g.h === i || g.a === i)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  const last = G.filter((g) => g.played && (g.h === i || g.a === i)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const div = ST.divOrder[NBA_DIV_OF[i]];
  const stat = (k, v, sub = '') => `<div class="stat"><div class="k">${k}</div><div class="v num">${v}</div>${sub ? `<div class="d hint">${sub}</div>` : ''}</div>`;
  const tank = o && o.playoffs < 0.25;
  return `<section class="card hero" style="--tc:${COLORS[t]}"><div class="hero-head">${chip(t)}<div><div class="hero-name">${FULL[t]}</div><div class="hint num">${rec(i)} · ${sd + 1}${['st', 'nd', 'rd'][sd] || 'th'} in the ${c ? 'West' : 'East'} · ${NBA_DIV_NAMES[NBA_DIV_OF[i]]} ${div.indexOf(i) + 1}${['st', 'nd', 'rd'][div.indexOf(i)] || 'th'}</div></div></div>
    <div class="stats">${tank ? stat('#1 pick', o ? pct(o.pick1) : '…', o ? `Top 4: ${pct(o.top4)}` : '') + stat('Avg draft pick', o ? o.avgPick.toFixed(1) : '…') + stat('Make playoffs', o ? pct(o.playoffs) : '…') + stat('Proj. wins', o ? o.avgWins.toFixed(1) : '…')
      : stat('Make playoffs', o ? pct(o.playoffs) : '…', o ? `Play-in: ${pct(o.playIn)}` : '') + stat('Top 6', o ? pct(o.top6) : '…') + stat('Win title', o ? pct(o.title) : '…', o ? `Finals: ${pct(o.finals)}` : '') + stat('Proj. wins', o ? o.avgWins.toFixed(1) : '…')}</div>${pickLine(i)}</section>
    <div class="grid" style="margin-top:16px"><div>
      <div class="section-head"><h2>Next 10 games</h2><span class="hint">Win chance for the ${NICK[t]}</span></div>
      <div class="ugames">${fut.map((g) => { const home = g.h === i, op = home ? g.a : g.h, p = home ? nbaWinProb(RATING, g.h, g.a) : 1 - nbaWinProb(RATING, g.h, g.a);
        return `<div class="card ug"><div class="tm">${chip(T[op])}${home ? 'vs' : '@'} ${NICK[T[op]]}</div><div class="p${p >= 0.5 ? ' fav' : ''}">${pct(p)}</div><small>${fmtDate(g.date)}</small></div>`; }).join('') || '<p class="hint">Regular season complete.</p>'}</div>
      ${last.length ? `<div class="section-head" style="margin-top:18px"><h2>Last 5</h2></div><div class="ugames">${last.map((g) => { const home = g.h === i, op = home ? g.a : g.h, my = home ? g.hs : g.as, th = home ? g.as : g.hs;
        return `<div class="card ug"><div class="tm">${chip(T[op])}${home ? 'vs' : '@'} ${NICK[T[op]]}</div><div class="p${my > th ? ' fav' : ''}">${my > th ? 'W' : 'L'} ${my}-${th}</div><small>${fmtDate(g.date)}</small></div>`; }).join('')}</div>` : ''}
    </div><div class="sticky">${standingsTable(c)}</div></div>`;
}

// ---- meta + render ----
function pageMeta() {
  const yr = seasonLabel, through = fmtDate(lastDate);
  if (state.tab === 'team') {
    const t = state.team, i = NBA_IDX[t], c = NBA_CONF_OF[i], sd = ST.seeds[c].indexOf(i), o = odds && odds[i];
    const sum = `The ${FULL[t]} are ${rec(i)} through ${through} and ${sd < 6 ? `hold the ${c ? 'West' : 'East'}'s #${sd + 1} seed` : sd < 10 ? `sit ${sd + 1}th in the ${c ? 'West' : 'East'}, in the play-in` : `sit ${sd + 1}th in the ${c ? 'West' : 'East'}, outside the play-in`}.` +
      (o ? ` Clinch gives them ${/^(8|11|18)\d?%/.test(pct(o.playoffs)) ? 'an' : 'a'} ${pct(o.playoffs)} chance to make the playoffs, ${pct(o.top6)} to finish top 6 and ${pct(o.title)} to win the title${o.playoffs < 0.25 ? `, with a ${pct(o.pick1)} shot at the #1 pick` : ''}.` : '');
    return { title: `${FULL[t]} Playoff Chances ${yr}: Odds, Play-In & Lottery | Clinch`, h1: `${FULL[t]} playoff chances`, desc: sum.slice(0, 300), sum, path: pathFor('team', t) };
  }
  if (state.tab === 'odds') {
    const top = odds ? T.map((t, i) => ({ t, ...odds[i] })).sort((a, b) => b.title - a.title).slice(0, 3) : [];
    const sum = top.length ? `NBA title odds through ${through}: ${top.map((x) => `${NICK[x.t]} ${pct(x.title)}`).join(', ')}. Every team's chances to make the playoffs, finish top 6, reach the play-in and win the Finals.` : 'NBA playoff and title odds for every team.';
    return { title: `NBA Playoff Odds ${yr}: Title, Play-In & Top-6 Chances | Clinch`, h1: 'NBA playoff odds', desc: sum, sum, path: TAB_PATH.odds };
  }
  if (state.tab === 'lottery') {
    const f = lotField(), nm = (x) => `${NICK[T[x.t]]} (${rec(x.t)})`;
    const three = f.filter((x) => x.balls === 3).slice(0, 3);
    const sum = `${RAW.season} NBA draft lottery simulator with the new 3-2-1 odds, traded picks and protections. If the season ended today, the ${f.slice(0, 3).map(nm).join(', ')} would be draft relegated to 5.4% at #1, while the ${three.map(nm).join(', ')} lead a group at 8.1%. Sim all 16 lottery picks and see who owns each one.`;
    return { title: `NBA Draft Lottery Simulator ${RAW.season}: 3-2-1 Odds & Traded Picks | Clinch`, h1: `${RAW.season} NBA draft lottery simulator`, desc: sum.slice(0, 300), sum, path: TAB_PATH.lottery };
  }
  const e = T[ST.seeds[0][0]], w = T[ST.seeds[1][0]];
  const sum = `NBA standings through ${through} with playoff and play-in odds for every team. The ${NICK[e]} (${rec(NBA_IDX[e])}) lead the East and the ${NICK[w]} (${rec(NBA_IDX[w])}) lead the West.`;
  return { title: `NBA Standings ${yr} with Playoff & Play-In Odds | Clinch`, h1: `NBA standings & playoff picture`, desc: sum, sum, path: TAB_PATH.standings };
}
const SITE = () => CONFIG.siteUrl || location.origin;
function setMeta(sel, attr, val) { let el = document.head.querySelector(sel); if (!el) { el = document.createElement(sel.startsWith('link') ? 'link' : 'meta'); const m = sel.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/); if (m) el.setAttribute(m[1], m[2]); document.head.appendChild(el); } el.setAttribute(attr, val); }
function paintMeta() {
  const m = pageMeta();
  document.title = m.title; setMeta('meta[name="description"]', 'content', m.desc); setMeta('link[rel="canonical"]', 'href', SITE() + m.path);
  setMeta('meta[property="og:title"]', 'content', m.title); setMeta('meta[property="og:description"]', 'content', m.desc); setMeta('meta[property="og:url"]', 'content', SITE() + m.path);
  $('#pageH1').textContent = m.h1; $('#pageSum').textContent = m.sum; return m;
}
function render() {
  document.querySelectorAll('nav.tabs a').forEach((a) => { a.setAttribute('aria-selected', String(a.dataset.tab === state.tab)); if (a.dataset.tab === 'team') a.href = pathFor('team', state.team); });
  $('#teams').style.display = state.tab === 'team' ? '' : 'none';
  $('#teams').innerHTML = [...T].sort((a, b) => AB(a).localeCompare(AB(b))).map((t) => `<a class="chip" href="${pathFor('team', t)}" style="--c:${COLORS[t]};--ci:${ink(COLORS[t])}" aria-pressed="${t === state.team}" title="${FULL[t]} playoff chances">${AB(t)}</a>`).join('');
  $('#season').textContent = `NBA ${seasonLabel} season · through ${fmtDate(lastDate)} · ${played} games played`;
  $('#view').innerHTML = state.tab === 'odds' ? renderOdds() : state.tab === 'lottery' ? renderLottery() : state.tab === 'team' ? renderTeam() : renderStandings();
  paintMeta();
}
function go(tab, team) {
  if (team) { state.team = team; store.set('team', team); }
  state.tab = tab;
  const url = pathFor(tab, state.team);
  if (location.pathname !== url) history.pushState(null, '', url);
  render(); window.scrollTo({ top: 0 });
}
window.addEventListener('popstate', () => { const r = routeOf(location.pathname); if (r.team) state.team = r.team; state.tab = r.tab; render(); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/nba"]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.button) { e.preventDefault(); const r = routeOf(new URL(a.href, location.origin).pathname); return go(r.tab, r.team || (a.dataset.tab === 'team' ? state.team : null)); }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'sim') {
    let s = (Date.now() ^ (state.drawN * 2654435761)) >>> 0;
    const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    state.draws = drawLottery321(rand, lotField(), BANS); state.drawN++; render(); return;
  }
  if (b.dataset.act === 'sportmenu') { const m = $('.sportmenu'); m.hidden = !m.hidden; return; }
});
document.addEventListener('click', (e) => { const m = $('.sportmenu'); if (m && !m.hidden && !e.target.closest('.sport')) m.hidden = true; });
function paintFooterTeams() {
  $('#sfTeams').innerHTML = '<b>Team playoff chances</b><div>' + NBA_DIV_NAMES.map((dn) => `<span><i>${dn}</i>${NBA_DIVS[dn].map((t) => `<a href="${pathFor('team', t)}">${FULL[t]}</a>`).join('')}</span>`).join('') + '</div>';
}
window.__clinch = { ready: () => !!odds, snap(path) { const r = routeOf(path); if (r.team) state.team = r.team; state.tab = r.tab; render(); const m = paintMeta(); m.path = path; return { m, view: $('#view').innerHTML, teams: $('#teams').innerHTML, foot: $('#sfTeams').innerHTML, tabs: document.querySelector('nav.tabs').innerHTML }; }, paths: () => [...Object.values(TAB_PATH), ...T.map((t) => pathFor('team', t))] };
$('#yr').textContent = new Date().getFullYear();
paintFooterTeams();
render();
setTimeout(() => { odds = nbaSimulate(ctx, RATING, { sims: 5000, rules: RULES }); render(); }, 30);
