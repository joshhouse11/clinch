// ---------- NBA share images: 1080x1350 cards for Instagram / X, drawn on a canvas (same look as the NFL cards) ----------
const CARD = { W: 1080, H: 1350, bg: '#0f1422', surf: '#182033', line: '#2c3854', text: '#eaf0fb', muted: '#8693b0', lime: '#35e3bf', gold: '#ffc861', red: '#ff6b6b' };
function cv() { const c = document.createElement('canvas'); c.width = CARD.W; c.height = CARD.H; return [c, c.getContext('2d')]; }
function rr(x, cx, cy, w, h, r) { x.beginPath(); x.moveTo(cx + r, cy); x.arcTo(cx + w, cy, cx + w, cy + h, r); x.arcTo(cx + w, cy + h, cx, cy + h, r); x.arcTo(cx, cy + h, cx, cy, r); x.arcTo(cx, cy, cx + w, cy, r); x.closePath(); }
const F = (w, s, fam = 'Poppins') => `${w} ${s}px ${fam === 'Poppins' ? '"Poppins"' : '"DM Sans"'}, system-ui, sans-serif`;
function fitText(x, t, max, w, s, fam) { let z = s; x.font = F(w, z, fam); while (x.measureText(t).width > max && z > 12) { z -= 2; x.font = F(w, z, fam); } return z; }
function cChip(x, t, cx, cy, r, dim = false) {
  x.save(); x.globalAlpha = dim ? 0.35 : 1;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = COLORS[t]; x.fill();
  x.fillStyle = ink(COLORS[t]); x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = F(800, Math.round(r * (AB(t).length > 3 ? 0.5 : 0.6))); x.fillText(AB(t), cx, cy + 1);
  x.restore();
}
function cLogo(x, lx, ly, s) {
  const g = x.createLinearGradient(lx, ly + s, lx + s, ly); g.addColorStop(0, '#1fc9a6'); g.addColorStop(1, '#7ff5dd');
  rr(x, lx, ly, s, s, s * 0.28); x.fillStyle = g; x.fill();
  x.strokeStyle = '#062a22'; x.lineWidth = s * 0.125; x.lineCap = 'round';
  x.beginPath(); x.moveTo(lx + s * 0.25, ly + s * 0.515); x.lineTo(lx + s * 0.383, ly + s * 0.648); x.stroke();
  x.beginPath(); x.moveTo(lx + s * 0.516, ly + s * 0.672); x.lineTo(lx + s * 0.758, ly + s * 0.344); x.stroke();
}
function cFrame(x, glow = CARD.lime) {
  x.fillStyle = CARD.bg; x.fillRect(0, 0, CARD.W, CARD.H);
  const g1 = x.createRadialGradient(980, 60, 0, 980, 60, 620); g1.addColorStop(0, glow + '38'); g1.addColorStop(1, glow + '00');
  x.fillStyle = g1; x.fillRect(0, 0, CARD.W, CARD.H);
  const g2 = x.createRadialGradient(60, 1320, 0, 60, 1320, 520); g2.addColorStop(0, '#ffc86118'); g2.addColorStop(1, '#ffc86100');
  x.fillStyle = g2; x.fillRect(0, 0, CARD.W, CARD.H);
  cLogo(x, 64, 60, 64);
  x.fillStyle = CARD.text; x.font = F(800, 46); x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText('clinch', 144, 94);
  x.font = F(800, 24, 'DM'); x.fillStyle = CARD.muted; x.textAlign = 'right'; x.fillText('🏀 NBA', CARD.W - 64, 94); x.textAlign = 'left';
  x.fillStyle = CARD.line; x.fillRect(64, CARD.H - 118, CARD.W - 128, 2);
  x.font = F(800, 34); x.fillStyle = CARD.text; x.fillText('clinchscenarios.com', 64, CARD.H - 62);
  x.font = F(700, 28, 'DM'); x.fillStyle = CARD.lime; x.textAlign = 'right'; x.fillText('Make yours →', CARD.W - 64, CARD.H - 62); x.textAlign = 'left';
}
function cHead(x, eyebrow, title, sub, y = 210) {
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.font = F(800, 26, 'DM'); x.fillStyle = CARD.lime; x.fillText(eyebrow.toUpperCase().split('').join(' '), 64, y);
  const z = fitText(x, title, CARD.W - 128, 800, 78); x.fillStyle = CARD.text; x.fillText(title, 64, y + z + 6);
  if (sub) { fitText(x, sub, CARD.W - 128, 500, 30, 'DM'); x.fillStyle = CARD.muted; x.fillText(sub, 64, y + z + 58); }
}
const pickedLabel = () => (nPicks() ? `with my picks · through ${fmtDate(lastDate)}` : `if the season ended today · ${fmtDate(lastDate)}`);

function cardPicture() {
  const [c, x] = cv(); cFrame(x);
  cHead(x, `${seasonLabel} NBA playoff picture`, 'My playoff picture', pickedLabel());
  [0, 1].forEach((cf) => {
    const x0 = cf ? 556 : 64, w = 460, y0 = 390;
    rr(x, x0, y0, w, 790, 28); x.fillStyle = CARD.surf; x.fill(); x.strokeStyle = CARD.line; x.lineWidth = 2; x.stroke();
    x.font = F(800, 38); x.fillStyle = CARD.text; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(cf ? 'WEST' : 'EAST', x0 + 28, y0 + 46);
    ST.seeds[cf].slice(0, 10).forEach((t, k) => {
      const ry = y0 + 108 + k * 64 + (k >= 6 ? 26 : 0);
      if (k === 6) { x.fillStyle = CARD.line; x.fillRect(x0 + 24, ry - 46, w - 48, 2); x.font = F(800, 16, 'DM'); x.fillStyle = CARD.gold; x.textAlign = 'right'; x.fillText('PLAY-IN', x0 + w - 28, ry - 30); }
      if (k === 0) { rr(x, x0 + 12, ry - 30, w - 24, 60, 16); x.fillStyle = CARD.lime + '1f'; x.fill(); }
      x.font = F(800, 26); x.fillStyle = k === 0 ? CARD.lime : k >= 6 ? CARD.gold : CARD.muted; x.textAlign = 'center'; x.fillText(String(k + 1), x0 + 42, ry + 2);
      cChip(x, T[t], x0 + 92, ry, 22);
      x.textAlign = 'left'; fitText(x, NICK[T[t]], 210, 800, 28); x.fillStyle = CARD.text; x.fillText(NICK[T[t]], x0 + 126, ry + 2);
      x.font = F(700, 24, 'DM'); x.fillStyle = CARD.muted; x.textAlign = 'right'; x.fillText(rec(t), x0 + w - 28, ry + 2);
    });
  });
  const fav = odds ? T.map((t, i) => ({ t, ...odds[i] })).sort((a, b) => b.title - a.title)[0] : null;
  if (fav) { x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = F(700, 30, 'DM'); x.fillStyle = CARD.text; x.fillText(`Title favorite: ${NICK[fav.t]} ${pct(fav.title)}`, 64, 1208); }
  return c;
}

function cardTeam() {
  const t = state.team, i0 = NBA_IDX[t], tc = COLORS[t], o = odds && odds[i0];
  const [c, x] = cv(); cFrame(x, tc);
  const band = x.createLinearGradient(0, 180, CARD.W, 700); band.addColorStop(0, tc); band.addColorStop(1, '#0f1422');
  rr(x, 40, 160, CARD.W - 80, 600, 36); x.fillStyle = band; x.fill();
  const cf = NBA_CONF_OF[i0], sd = ST.seeds[cf].indexOf(i0), tank = o && o.playoffs < 0.25;
  x.fillStyle = '#ffffffcc'; x.font = F(800, 26, 'DM'); x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.fillText((nPicks() ? `My ${AB(t)} scenario` : `${AB(t)} right now`).toUpperCase(), 92, 250);
  const nz = fitText(x, FULL[t], 640, 800, 110); x.fillStyle = '#fff'; x.fillText(FULL[t], 88, 250 + nz);
  x.font = F(700, 40, 'DM'); x.fillStyle = '#ffffffd9';
  x.fillText(`${rec(i0)} · ${sd + 1}${['st', 'nd', 'rd'][sd] || 'th'} in the ${cf ? 'West' : 'East'}`, 92, 250 + nz + 64);
  cChip(x, t, CARD.W - 170, 300, 86);
  x.font = F(800, 200); x.fillStyle = '#fff'; x.fillText(o ? pct(tank ? o.pick1 : o.playoffs) : '…', 80, 660);
  x.font = F(700, 34, 'DM'); x.fillStyle = '#ffffffd9'; x.fillText(tank ? 'chance at the #1 pick' : 'to make the playoffs', 92, 716);
  const stats = !o ? [] : tank ? [['Make playoffs', pct(o.playoffs)], ['Top-4 pick', pct(o.top4)], ['Avg pick', o.avgPick.toFixed(1)]] : [['Top 6', pct(o.top6)], ['Reach Finals', pct(o.finals)], ['Win title', pct(o.title)]];
  stats.forEach(([l, v], k) => {
    const sx = 64 + k * 324; rr(x, sx, 776, 304, 150, 24); x.fillStyle = CARD.surf; x.fill(); x.strokeStyle = CARD.line; x.lineWidth = 2; x.stroke();
    x.font = F(800, 64); x.fillStyle = k === 2 ? CARD.gold : CARD.text; x.fillText(v, sx + 26, 862);
    x.font = F(700, 26, 'DM'); x.fillStyle = CARD.muted; x.fillText(l, sx + 28, 904);
  });
  const games = G.filter((g) => !g.played && (g.h === i0 || g.a === i0)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 9);
  x.font = F(800, 24, 'DM'); x.fillStyle = CARD.muted; x.fillText(games.length ? (nPicks() ? 'MY PICKS, NEXT 9 GAMES' : 'NEXT 9 GAMES') : 'REGULAR SEASON COMPLETE', 64, 990);
  games.forEach((g, k) => {
    const gx = 64 + k * 106, opp = T[g.h === i0 ? g.a : g.h], p = picks[g.k];
    const res = p === undefined ? null : (p > 0) === (g.h === i0) ? 'W' : 'L';
    rr(x, gx, 1012, 94, 132, 18); x.fillStyle = res === 'W' ? CARD.lime + '2a' : res === 'L' ? '#ff6b6b22' : CARD.surf; x.fill();
    x.strokeStyle = res === 'W' ? CARD.lime : res === 'L' ? CARD.red : CARD.line; x.lineWidth = 2; x.stroke();
    cChip(x, opp, gx + 47, 1058, 26);
    x.textAlign = 'center'; x.font = F(800, res ? 30 : 20); x.fillStyle = res === 'W' ? CARD.lime : res === 'L' ? CARD.red : CARD.muted;
    x.fillText(res || (g.h === i0 ? 'vs' : '@'), gx + 47, 1122); x.textAlign = 'left';
  });
  return c;
}

function cardBracket(seeds, src, title, sub) {
  const [c, x] = cv(); cFrame(x, CARD.gold);
  cHead(x, `${RAW.season} NBA playoffs`, title, sub);
  const br = nbaBracket(seeds, decideFrom(src));
  const champ = br.f.w;
  // champion banner
  rr(x, 64, 380, CARD.W - 128, 170, 28);
  const g = x.createLinearGradient(64, 380, CARD.W, 550); g.addColorStop(0, champ != null ? COLORS[T[champ]] : CARD.surf); g.addColorStop(1, CARD.surf); x.fillStyle = g; x.fill();
  x.strokeStyle = CARD.gold; x.lineWidth = 3; x.stroke();
  x.textBaseline = 'middle'; x.textAlign = 'left';
  x.font = F(800, 24, 'DM'); x.fillStyle = CARD.gold; x.fillText('🏆  MY CHAMPION', 104, 430);
  if (champ != null) { cChip(x, T[champ], CARD.W - 160, 465, 56); fitText(x, FULL[T[champ]], 700, 800, 64); x.fillStyle = '#fff'; x.fillText(FULL[T[champ]], 100, 490); }
  else { x.font = F(800, 52); x.fillStyle = CARD.muted; x.fillText('Still deciding…', 100, 490); }
  // per conference: round winners
  [0, 1].forEach((cf) => {
    const C = br.conf[cf], x0 = cf ? 556 : 64, w = 460, y0 = 580;
    rr(x, x0, y0, w, 600, 28); x.fillStyle = CARD.surf; x.fill(); x.strokeStyle = CARD.line; x.lineWidth = 2; x.stroke();
    x.font = F(800, 34); x.fillStyle = CARD.text; x.textAlign = 'left'; x.fillText(cf ? 'WEST' : 'EAST', x0 + 28, y0 + 46);
    const rows = [['Play-in: 7 & 8 seeds', [C.pi[0].w, C.pi[2].w]], ['First round', C.r1.map((m) => m.w)], ['Semis', C.r2.map((m) => m.w)], [`${cf ? 'West' : 'East'} champ`, [C.cf.w]]];
    rows.forEach(([label, ws], k) => {
      const ry = y0 + 110 + k * 124;
      x.font = F(800, 18, 'DM'); x.fillStyle = CARD.muted; x.fillText(label.toUpperCase(), x0 + 28, ry - 26);
      ws.forEach((t, j) => { if (t != null) cChip(x, T[t], x0 + 60 + j * 92, ry + 26, 36, false); else { x.beginPath(); x.arc(x0 + 60 + j * 92, ry + 26, 36, 0, Math.PI * 2); x.strokeStyle = CARD.line; x.setLineDash([6, 6]); x.stroke(); x.setLineDash([]); } });
    });
  });
  return c;
}

function cardOdds() {
  const [c, x] = cv(); cFrame(x, CARD.gold);
  cHead(x, `${seasonLabel} NBA title odds`, 'Who wins it all?', nPicks() ? `With my picks · ${fmtDate(lastDate)}` : `From 5,000 simulated seasons · ${fmtDate(lastDate)}`);
  const top = odds ? T.map((t, i) => ({ t, ...odds[i] })).sort((a, b) => b.title - a.title).slice(0, 8) : [];
  const max = top.length ? top[0].title : 1;
  top.forEach((o, k) => {
    const ry = 430 + k * 92;
    rr(x, 64, ry - 38, CARD.W - 128, 80, 20); x.fillStyle = k === 0 ? CARD.gold + '22' : CARD.surf; x.fill();
    x.textBaseline = 'middle'; x.font = F(800, 30); x.fillStyle = k === 0 ? CARD.gold : CARD.muted; x.textAlign = 'center'; x.fillText(String(k + 1), 112, ry + 2);
    cChip(x, o.t, 180, ry, 26); x.textAlign = 'left';
    x.font = F(800, 32); x.fillStyle = CARD.text; x.fillText(NICK[o.t], 222, ry + 2);
    const bw = 300 * (o.title / max); rr(x, 560, ry - 10, Math.max(bw, 8), 20, 10); x.fillStyle = k === 0 ? CARD.gold : CARD.lime; x.fill();
    x.font = F(800, 34); x.fillStyle = k === 0 ? CARD.gold : CARD.text; x.textAlign = 'right'; x.fillText(pct(o.title), CARD.W - 96, ry + 2); x.textAlign = 'left';
  });
  return c;
}

// Lottery: the user's latest simmed draw if there is one, otherwise the projected #1-pick chances by pick owner.
function cardLottery() {
  const [c, x] = cv(); cFrame(x, CARD.red);
  const d = state.draws;
  if (d) {
    const { slot } = slotsFor(d), { owner } = resolvePickOwners(RULES, slot), field = lotField(), pre = Object.fromEntries(field.map((f, k) => [f.t, k + 1]));
    cHead(x, `${RAW.season} NBA draft lottery`, 'My lottery sim', `3-2-1 odds · ${state.drawN} sim${state.drawN === 1 ? '' : 's'} · standings ${fmtDate(lastDate)}`);
    d.slice(0, 10).forEach((t, k) => {
      const ow = owner[t], ry = 420 + k * 76, jump = pre[t] - (k + 1);
      rr(x, 64, ry - 32, CARD.W - 128, 64, 18); x.fillStyle = k === 0 ? CARD.red + '2a' : CARD.surf; x.fill();
      x.textBaseline = 'middle'; x.font = F(800, 32); x.fillStyle = k === 0 ? '#ff8b8b' : CARD.muted; x.textAlign = 'center'; x.fillText(String(k + 1), 116, ry + 2);
      cChip(x, T[ow], 190, ry, 24); x.textAlign = 'left';
      x.font = F(800, 30); x.fillStyle = CARD.text; x.fillText(NICK[T[ow]], 232, ry + 2);
      if (ow !== t) { const nw = x.measureText(NICK[T[ow]]).width; x.font = F(700, 22, 'DM'); x.fillStyle = CARD.gold; x.fillText(`via ${AB(T[t])}`, 246 + nw, ry + 4); }
      x.font = F(800, 26, 'DM'); x.textAlign = 'right'; x.fillStyle = jump > 0 ? CARD.lime : jump < 0 ? CARD.red : CARD.muted;
      x.fillText(jump > 0 ? `▲ ${jump}` : jump < 0 ? `▼ ${-jump}` : '–', CARD.W - 96, ry + 2); x.textAlign = 'left';
    });
  } else {
    cHead(x, `${RAW.season} NBA draft lottery`, 'Who lands #1?', 'Chance at the #1 pick by pick owner · new 3-2-1 lottery');
    const top = odds ? T.map((t, i) => ({ t, p: odds[i].own1, t4: odds[i].ownTop4 })).sort((a, b) => b.p - a.p).slice(0, 10) : [];
    top.forEach((o, k) => {
      const ry = 420 + k * 76;
      rr(x, 64, ry - 32, CARD.W - 128, 64, 18); x.fillStyle = k === 0 ? CARD.red + '2a' : CARD.surf; x.fill();
      x.textBaseline = 'middle'; cChip(x, o.t, 116, ry, 24); x.textAlign = 'left';
      x.font = F(800, 30); x.fillStyle = CARD.text; x.fillText(NICK[o.t], 160, ry + 2);
      x.font = F(600, 24, 'DM'); x.fillStyle = CARD.muted; x.textAlign = 'right'; x.fillText(`top 4: ${pct(o.t4)}`, CARD.W - 250, ry + 2);
      x.font = F(800, 32); x.fillStyle = k === 0 ? '#ff8b8b' : CARD.text; x.fillText(pct(o.p), CARD.W - 96, ry + 2); x.textAlign = 'left';
    });
  }
  return c;
}

const CARD_KINDS = [
  { k: 'picture', label: 'Playoff picture' }, { k: 'team', label: 'My team' }, { k: 'odds', label: 'Title odds' }, { k: 'bracket', label: 'Bracket' }, { k: 'lottery', label: 'Lottery' },
];
const defaultCard = () => ({ standings: 'picture', team: 'team', odds: 'odds', challenge: 'bracket', lottery: 'lottery' })[state.tab] || 'picture';
async function makeCard(kind) {
  try { await Promise.all([document.fonts.load(F(800, 40)), document.fonts.load(F(700, 30, 'DM')), document.fonts.load(F(500, 30, 'DM'))]); } catch {}
  if (kind === 'team') return cardTeam();
  if (kind === 'odds') return cardOdds();
  if (kind === 'lottery') return cardLottery();
  if (kind === 'bracket') {
    if (state.tab === 'challenge' && CH_SEEDS) {
      const locked = ch.entry && chLocked();
      return cardBracket(locked ? ch.entry.seeds : CH_SEEDS, locked ? ch.entry.picks : ch.picks, 'My Bracket Challenge picks', 'NBA Playoff Bracket Challenge on Clinch');
    }
    return cardBracket(practiceSeeds(), ch.practice, 'My playoff bracket', `Seeds ${pickedLabel()} · pick yours`);
  }
  return cardPicture();
}
let cardKind = null, cardBlob = null;
async function share(kind) {
  cardKind = kind || defaultCard();
  const url = nPicks() ? `${SITE()}/nba/?p=${RAW.season}.${state.team}.${packPicks()}` : `${SITE()}${location.pathname}`;
  openModal(`<h3>Share</h3>
    <div class="seg cardseg">${CARD_KINDS.map((c) => `<button data-card="${c.k}" aria-pressed="${c.k === cardKind}">${c.label}</button>`).join('')}</div>
    <div class="cardprev"><img id="cardImg" alt="Share image preview"></div>
    <div class="row-btns">${navigator.canShare ? '<button class="btn primary" data-act="cardshare">Share image</button>' : ''}<button class="btn ${navigator.canShare ? '' : 'primary'}" data-act="carddl">Download image</button></div>
    <p class="hint" style="margin:12px 0 6px">${nPicks() ? 'Link to these exact picks' : 'Link'}</p>
    <div class="sharebox"><input type="text" id="shareUrl" readonly value="${esc(url)}" aria-label="Share link"><button class="btn" data-act="copyshare">Copy</button></div>
    <div class="row-btns"><button class="btn" data-act="close">Done</button></div>`);
  $('#modal').classList.add('wide');
  await drawPreview();
}
async function drawPreview() {
  const c = await makeCard(cardKind);
  cardBlob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const img = $('#cardImg'); if (img) img.src = URL.createObjectURL(cardBlob);
}
const shareText = () => ({ picture: 'My NBA playoff picture 👀', team: `My ${NICK[state.team]} scenario 👀`, odds: 'NBA title odds 🏆', bracket: 'My NBA playoff bracket 🏆', lottery: 'My NBA lottery sim 🎲' })[cardKind] + ' Make yours at clinchscenarios.com';
const shareBtn = (card, label, primary = false) => `<button class="btn sharecta${primary ? ' hot' : ''}" data-act="sharecard" data-card="${card}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>${label}</button>`;
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'sharecard') return share(b.dataset.card);
  if (b.dataset.card) { cardKind = b.dataset.card; document.querySelectorAll('.cardseg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.card === cardKind))); return drawPreview(); }
  if (b.dataset.act === 'copyshare') { try { await navigator.clipboard.writeText($('#shareUrl').value); toast('Link copied'); } catch { $('#shareUrl').select(); } return; }
  if (b.dataset.act === 'carddl' && cardBlob) { const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = `clinch-nba-${cardKind}.png`; a.click(); return; }
  if (b.dataset.act === 'cardshare' && cardBlob) {
    const file = new File([cardBlob], `clinch-nba-${cardKind}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: shareText() });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = file.name; a.click(); }
    } catch {}
  }
});
