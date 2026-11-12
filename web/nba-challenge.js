const GOOGLE_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

// ======================= Accounts (shared Supabase session with the NFL pages) =======================
const ACCOUNTS = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
let sb = null, user = null;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.display = 'none'; }, 2200); }
function openModal(html) { $('#modal').innerHTML = html; $('#modalBg').hidden = false; const f = $('#modal').querySelector('input, button'); if (f) f.focus(); }
function closeModal() { $('#modalBg').hidden = true; $('#modal').innerHTML = ''; }
$('#modalBg').addEventListener('click', (e) => { if (e.target.id === 'modalBg') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modalBg').hidden) closeModal(); });
function confirmTwice(b) {
  if (b.dataset.armed) return true;
  b.dataset.armed = '1'; const t = b.textContent; b.textContent = 'Tap again to confirm';
  setTimeout(() => { delete b.dataset.armed; b.textContent = t; }, 3000);
  return false;
}
// ---- saved scenarios (sport 'nba' in the shared scenarios table) + share links ----
let active = store.get('active:' + RAW.season, null), autoTimer = null, autoState = 'saved';
function setActive(a) { active = a; store.set('active:' + RAW.season, a); autoState = 'saved'; paintSave(); }
const pickIds = () => Object.fromEntries(Object.entries(picks).map(([k, v]) => [G[k].id, v]));
function applyPicks(byId) {
  for (const k in picks) delete picks[k];
  for (const [id, v] of Object.entries(byId || {})) { const k = BY_ID[id]; if (k !== undefined && !G[k].played && (v === 1 || v === -1)) picks[k] = v; }
  recompute(); render();
}
function queueAutosave() {
  if (!active || !user || !sb) return;
  clearTimeout(autoTimer); autoState = 'pending'; paintSave();
  autoTimer = setTimeout(async () => {
    autoState = 'saving'; paintSave();
    const { data, error } = await sb.from('scenarios').update({ team: state.team, picks: pickIds() }).eq('id', active.id).select('id');
    if (error || !data || !data.length) { toast(error ? 'Auto-save failed: ' + error.message : `Stopped auto-saving: "${active.name}" no longer exists`); setActive(null); return; }
    autoState = 'saved'; paintSave();
  }, 1200);
}
function paintSave() {
  const b = document.querySelector('.hbtn[data-act="save"]'); if (!b) return;
  const on = active && user;
  b.classList.toggle('auto', !!on);
  b.querySelector('span').textContent = on ? (autoState === 'saved' ? 'Saved ✓' : 'Saving…') : 'Save';
  b.title = on ? `Auto-saving to "${active.name}". Click to save a copy` : 'Save these picks';
}
window.addEventListener('beforeunload', (e) => { if (autoState !== 'saved' && active) { e.preventDefault(); e.returnValue = ''; } });
function saveDialog() {
  if (!user) { store.set('pending', 'save'); return signInDialog('save'); }
  if (active) {
    return openModal(`<h3>Auto-saving</h3><p>Every pick saves to <b>${esc(active.name)}</b> automatically. Want a separate copy? Save it as a new scenario.</p>
      <label for="scnName" class="hint">New scenario name</label><input type="text" id="scnName" maxlength="80" value="${esc(active.name + ' (copy)')}">
      <div class="row-btns"><button class="btn" data-act="stopauto" style="margin-right:auto">Stop auto-saving</button><button class="btn" data-act="close">Done</button><button class="btn primary" data-act="dosave">Save as new</button></div>`);
  }
  const n = nPicks();
  if (!n) return toast('Pick some games first, then save them');
  openModal(`<h3>Save this scenario</h3><p>${n} game pick${n === 1 ? '' : 's'}. Saving to your account.</p>
    <label for="scnName" class="hint">Name</label><input type="text" id="scnName" maxlength="80" value="${esc(FULL[state.team] + ' scenario')}">
    <p class="hint">After this, your changes save to it automatically.</p>
    <div class="row-btns"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="dosave">Save</button></div>`);
  $('#scnName').select();
}
async function doSave() {
  const name = ($('#scnName').value || '').trim() || 'My NBA scenario';
  const { data, error } = await sb.from('scenarios').insert({ sport: 'nba', season: RAW.season, name, team: state.team, picks: pickIds(), flips: {} }).select('id,name').single();
  if (error) return toast('Could not save: ' + error.message);
  setActive({ id: data.id, name: data.name }); closeModal(); toast(`Saved "${name}". Changes now save automatically`);
}
async function myScenarios() {
  if (!user) return signInDialog('saved');
  const { data, error } = await sb.from('scenarios').select('id,name,team,picks,updated_at').eq('sport', 'nba').eq('season', RAW.season).order('updated_at', { ascending: false });
  const rows = myScenarios.cache = error ? [] : data;
  const row = (r) => `<div class="scn"><b>${esc(r.name)}${active && active.id === r.id ? ' <span class="tag autotag">auto-saving</span>' : ''}</b><small>${r.team && FULL[r.team] ? esc(FULL[r.team]) + ' · ' : ''}${Object.keys(r.picks || {}).length} picks · ${new Date(r.updated_at).toLocaleDateString()}</small><span class="acts"><button class="btn primary" data-act="loadscn" data-id="${r.id}">Load</button><button class="btn danger" data-act="delscn" data-id="${r.id}" aria-label="Delete ${esc(r.name)}">✕</button></span></div>`;
  openModal(`<h3>Saved NBA scenarios</h3>${rows.length ? rows.map(row).join('') : '<p>Nothing saved yet. Pick some games, then tap Save.</p>'}
    <div class="row-btns"><span class="hint" style="margin-right:auto">Signed in as ${esc(user.email || '')}</span><button class="btn" data-act="signout">Sign out</button></div>
    <div class="row-btns"><button class="btn" data-act="close">Close</button></div>`);
}
// Share link: ?p=<season>.<team>.<2 bits per regular-season game, ordered by game id>
const SHARE_ORDER = [...G].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true })).map((g) => g.k);
function packPicks() {
  const bytes = new Uint8Array(Math.ceil(SHARE_ORDER.length / 4));
  SHARE_ORDER.forEach((k, i) => { const v = picks[k] === 1 ? 1 : picks[k] === -1 ? 2 : 0; bytes[i >> 2] |= v << ((i & 3) * 2); });
  let end = bytes.length; while (end && !bytes[end - 1]) end--;
  return btoa(String.fromCharCode(...bytes.slice(0, end))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unpackPicks(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/')), out = {};
  SHARE_ORDER.forEach((k, i) => { const byte = bin.charCodeAt(i >> 2) || 0, v = (byte >> ((i & 3) * 2)) & 3; if (v && !G[k].played) out[G[k].id] = v === 1 ? 1 : -1; });
  return out;
}
async function shareLink() {
  if (!nPicks()) return toast('Pick some games first, then share them');
  const url = `${SITE()}${location.pathname}?p=${RAW.season}.${state.team}.${packPicks()}`;
  try { if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'My NBA scenario on Clinch', url }); else { await navigator.clipboard.writeText(url); toast('Link copied. Anyone who opens it sees your picks'); } }
  catch { openModal(`<h3>Share link</h3><input type="text" readonly value="${esc(url)}" onfocus="this.select()"><div class="row-btns"><button class="btn primary" data-act="close">Done</button></div>`); }
}
function openShareFromUrl() {
  const q = new URLSearchParams(location.search), p = q.get('p');
  if (!p) return;
  history.replaceState(null, '', location.pathname);
  const [season, team, data] = p.split('.');
  if (+season !== RAW.season) return toast(`That link is from the ${season} season`);
  try { setActive(null); applyPicks(unpackPicks(data || '')); if (T.includes(team)) { state.team = team; store.set('team', team); } toast(`Loaded ${nPicks()} shared pick${nPicks() === 1 ? '' : 's'}`); render(); }
  catch { toast('That share link looks broken'); }
}

const myName = () => (user && (user.user_metadata?.full_name || (user.email || '').split('@')[0])) || 'Player';
function paintAccount() {
  const b = $('#acctBtn'); if (!b) return;
  if (user) { const name = myName(); b.classList.add('in'); b.innerHTML = `<span class="av">${esc(name[0].toUpperCase())}</span>${esc(name.split(' ')[0])}`; }
  else { b.classList.remove('in'); b.textContent = 'Sign in'; }
}
function signInDialog(why) {
  if (!ACCOUNTS) return openModal('<h3>Accounts are almost here</h3><p>Sign-in is not switched on for this preview.</p><div class="row-btns"><button class="btn primary" data-act="close">Got it</button></div>');
  const head = why === 'chsave' ? ['Sign in to submit your bracket', 'Your picks stay right here while you sign in. Brackets are free; you only need an account so your friends can see your score.']
    : why === 'challenge' ? ['Sign in to play', 'Groups and brackets are tied to your account so your friends can find you. Free, no spam.']
    : why === 'save' ? ['Sign in to save', 'Saving needs a free account so your scenarios follow you to every device. Your picks stay right where they are while you sign in.']
    : why === 'saved' ? ['Sign in to see your saves', 'Saved scenarios live in your account, on every device. You can still Share any scenario as a link without signing in.']
    : ['Sign in to Clinch', 'One account for every sport. No password, no spam.'];
  openModal(`<h3>${head[0]}</h3><p>${head[1]}</p>
    <button class="oauth" data-act="oauth" data-provider="google">${GOOGLE_SVG}Continue with Google</button>
    <div class="row-btns"><button class="btn" data-act="close">Not now</button></div>`);
}
function loadSupabase() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
    el.onload = resolve; el.onerror = () => reject(new Error('Could not load sign-in library'));
    document.head.appendChild(el);
  });
}
async function initAccounts() {
  paintAccount(); paintSave();
  openShareFromUrl();
  if (!ACCOUNTS) return;
  try {
    await loadSupabase();
    sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    sb.auth.onAuthStateChange((_e, session) => { const was = user?.id; user = session?.user || null; paintAccount(); if (was !== user?.id) { ch.loaded = false; ch.group = null; if (state.tab === 'challenge') chLoad(true); } });
    paintAccount();
    const q = new URLSearchParams(location.search), jc = (q.get('join') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (jc) { history.replaceState(null, '', location.pathname); if (state.tab !== 'challenge') go('challenge'); chJoinDialog(jc); }
    if (q.get('emails') === 'off') { history.replaceState(null, '', location.pathname); if (user) setEmails(false); else { store.set('pending', 'emailsoff'); signInDialog('challenge'); } }
    const pending = store.get('pending', null);
    if (pending && user) {
      if (pending === 'emailsoff') { store.set('pending', null); setEmails(false); }
      store.set('pending', null);
      if (pending.startsWith('join:')) { go('challenge'); chJoinDialog(pending.slice(5)); }
      else if (pending === 'save') saveDialog();
      else if (pending === 'chnew') { go('challenge'); chGroupForm(null); }
      else if (pending === 'chjoin') { go('challenge'); chJoinDialog(''); }
    }
    if (state.tab === 'challenge') chLoad(true);
  } catch (err) { console.warn(err); }
}

// ======================= NBA Playoff Bracket Challenge =======================
const CH_PTS = { PI: 2, R1: 4, R2: 5, CF: 6, F: 8 };
const ROUNDS = ['PI', 'R1', 'R2', 'CF', 'F'];
const RNAME = { PI: 'Play-in', R1: 'First round', R2: 'Conf. semis', CF: 'Conf. finals', F: 'NBA Finals' };
const POST = nbaPostResults((RAW.post || []).map((g) => [NBA_IDX[g[0]], NBA_IDX[g[1]], g[2], g[3], g[4], g[5]]).filter((g) => g[0] !== undefined && g[1] !== undefined));
const REG_DONE = G.length > 0 && G.every((g) => g.played);
const REAL_SEEDS = REG_DONE ? nbaStandings(ctx, REAL).seeds.map((s) => s.slice(0, 10)) : null;
// Brackets open early (about the last 10 days) on projected seeds; final seeds replace them when the regular season ends.
const EARLY_GAMES = 75;
const EARLY = !REG_DONE && G.filter((g) => !g.played).length <= EARLY_GAMES;
const CH_SEEDS = REAL_SEEDS || (EARLY ? nbaStandings(ctx, REAL).seeds.map((s) => s.slice(0, 10)) : null);
const sameSeeds = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function staleNote() {
  return ch.entry && REAL_SEEDS && !sameSeeds(ch.entry.seeds, REAL_SEEDS) ? '<p class="chnote warn">Final seeds are set and some matchups changed since you submitted. Check the picks below and tap Update bracket.</p>' : '';
}
const ch = {
  loaded: false, loading: false, lockAt: null, entry: null,
  picks: store.get('ch:' + RAW.season, {}), practice: store.get('chp:' + RAW.season, {}), tiebreak: store.get('chtb:' + RAW.season, ''),
  groups: [], group: null, members: [], hasBracket: new Set(), board: null,
};
const anyPlayIn = (RAW.post || []).some((g) => +g[5] === 5 && (g[4] === '1' || g[4] === 1));
const chLocked = () => (ch.lockAt ? Date.now() >= new Date(ch.lockAt).getTime() : anyPlayIn);
const keyOf = (r, a, b) => `${r}:${nbaPair(a, b)}`;
const decideFrom = (src) => (a, b, r) => { const w = src[keyOf(r, a, b)]; return w === a || w === b ? w : null; };
const practiceSeeds = () => ST.seeds.map((s) => s.slice(0, 10));
const inviteUrl = (code) => `${SITE()}/nba/bracket-challenge/?join=${code}`;
const realBracket = () => (REAL_SEEDS ? nbaBracket(REAL_SEEDS, (a, b, r) => POST.winner(a, b, r)) : null);

function scoreBracket(b) {
  const seedOf = new Map(); b.seeds.forEach((cs) => cs.forEach((t, k) => seedOf.set(t, k + 1)));
  const mine = nbaBracket(b.seeds, decideFrom(b.picks));
  const picked = Object.fromEntries(ROUNDS.map((r) => [r, new Set()]));
  const piPick = new Map();
  for (const m of mine.all) if (m.w != null) { picked[m.r].add(m.w); if (m.r === 'PI') piPick.set(nbaPair(m.a, m.b), m.w); }
  const RB = nbaBracket(b.seeds, (a, c, r) => POST.winner(a, c, r));
  const out = new Set(), won = Object.fromEntries(ROUNDS.map((r) => [r, new Set()]));
  RB.conf.forEach((c) => { [c.pi[1], c.pi[2]].forEach((m) => { if (m.w != null) out.add(m.w === m.a ? m.b : m.a); }); });
  for (const m of RB.all) if (m.w != null && m.r !== 'PI') { out.add(m.w === m.a ? m.b : m.a); won[m.r].add(m.w); }
  let pts = 0, right = 0, maxLeft = 0;
  for (const m of RB.all) {
    if (m.w == null) continue;
    const hit = m.r === 'PI' ? piPick.get(nbaPair(m.a, m.b)) === m.w : picked[m.r].has(m.w);
    if (!hit) continue;
    right++; pts += CH_PTS[m.r];
    if (m.r !== 'PI' && m.r !== 'F') pts += Math.max(0, (seedOf.get(m.w) || 0) - (seedOf.get(m.w === m.a ? m.b : m.a) || 0));
  }
  for (const r of ROUNDS.slice(1)) for (const t of picked[r]) if (!won[r].has(t) && !out.has(t)) maxLeft += CH_PTS[r];
  for (const m of RB.all) if (m.r === 'PI' && m.a != null && m.b != null && m.w == null && piPick.has(nbaPair(m.a, m.b))) maxLeft += CH_PTS.PI;
  const champ = mine.f.w;
  return { pts, right, max: pts + maxLeft, champ, champAlive: champ != null && !out.has(champ) };
}
const countPicks = (seeds, src) => nbaBracket(seeds, decideFrom(src)).all.filter((m) => m.w != null).length;
const TOTAL_PICKS = 21;

function nbaBracketHtml(seeds, src, { mode = 'ch', readOnly = false } = {}) {
  const br = nbaBracket(seeds, decideFrom(src));
  const RB = mode === 'ch' && readOnly ? realBracket() : null;
  const realW = new Map(); if (RB) for (const m of RB.all) if (m.w != null) realW.set(`${m.r}:${m.w}`, true);
  const seedOf = new Map(); seeds.forEach((cs) => cs.forEach((t, k) => seedOf.set(t, k + 1)));
  const row = (m, t) => {
    const st = m.w == null ? '' : m.w === t ? 'win' : 'loss';
    let mark = '', right = '';
    if (RB && m.w === t) { if (realW.has(`${m.r}:${t}`)) { mark = ' right'; right = `+${CH_PTS[m.r]}`; } else { const rm = RB.all.find((x) => x.r === m.r && (x.a === t || x.b === t) && x.w != null); if (rm && rm.w !== t) mark = ' wrong'; } }
    const pa = nbaWinProb(RATING, m.a, m.b, m.r === 'F'), p = t === m.a ? pa : 1 - pa;
    return `<button class="bt ${st}${mark}" style="--tc:${COLORS[T[t]]}" ${readOnly ? 'disabled' : `data-nch="${keyOf(m.r, m.a, m.b)}" data-pw="${t}" data-mode="${mode}"`} aria-label="${FULL[T[t]]} win">
      <span class="sd">${m.r === 'F' ? (NBA_CONF_OF[t] ? 'W' : 'E') : seedOf.get(t)}</span>${chip(T[t])}<span class="bn">${NICK[T[t]]}</span><span class="bp num">${right || (readOnly ? '' : pct(p))}</span></button>`;
  };
  const tbd = (a, b) => `<div class="mu tbd"><div class="bt ghost"><span class="sd"></span><span class="bn">${a}</span></div><div class="bt ghost"><span class="sd"></span><span class="bn">${b}</span></div></div>`;
  const mu = (m, la = 'Winner', lb = 'Winner') => (m.a != null && m.b != null ? `<div class="mu${m.r === 'F' ? ' sbm' : ''}">${row(m, m.a)}${row(m, m.b)}</div>` : tbd(m.a != null ? NICK[T[m.a]] : la, m.b != null ? NICK[T[m.b]] : lb));
  const block = (c) => {
    const C = br.conf[c], nm = c ? 'West' : 'East';
    return `<section class="bconf nb"><h3>${nm}</h3><div class="bcols n4">
      <div class="bcol"><h4>Play-in</h4><div class="bl"><small class="pil">7 v 8 · winner is the 7 seed</small>${mu(C.pi[0])}<small class="pil">9 v 10</small>${mu(C.pi[1])}<small class="pil">For the 8 seed</small>${mu(C.pi[2], '7-8 loser', '9-10 winner')}</div></div>
      <div class="bcol"><h4>First round</h4><div class="bl">${C.r1.map((m, k) => mu(m, ['1 seed', '4 seed', '3 seed', '2 seed'][k], ['8 seed', '5 seed', '6 seed', '7 seed'][k])).join('')}</div></div>
      <div class="bcol"><h4>Semis</h4><div class="bl">${C.r2.map((m) => mu(m)).join('')}</div></div>
      <div class="bcol"><h4>${nm} finals</h4><div class="bl">${mu(C.cf)}${C.cf.w != null ? `<div class="cchamp" style="--tc:${COLORS[T[C.cf.w]]}">${chip(T[C.cf.w])}<span>${NICK[T[C.cf.w]]}<small>${nm} champion</small></span></div>` : ''}</div></div>
    </div></section>`;
  };
  const champ = br.f.w;
  const fin = `<section class="bsb${champ != null ? ' done' : ''}" style="${champ != null ? `--tc:${COLORS[T[champ]]}` : ''}"><h3>NBA Finals</h3>${mu(br.f, 'East champion', 'West champion')}
    ${champ != null ? `<div class="trophy">${chip(T[champ])}<div><small>${mode === 'ch' ? 'Your pick' : 'Your champion'}</small><b>${NICK[T[champ]]}</b></div></div>` : '<p class="hint">Pick every round to crown a champion.</p>'}</section>`;
  return `<div class="bwrap"><div class="bracket">${block(0)}${fin}${block(1)}</div></div>`;
}

async function chLoad(force) {
  if (!ACCOUNTS || !sb || ch.loading || (ch.loaded && !force)) return;
  ch.loading = true;
  try {
    const st = await sb.from('challenge_settings').select('lock_at').eq('sport', 'nba').eq('season', RAW.season).maybeSingle();
    ch.lockAt = st.data?.lock_at || null;
    if (user) {
      const [e, g] = await Promise.all([
        sb.from('brackets').select('*').eq('sport', 'nba').eq('season', RAW.season).eq('user_id', user.id).maybeSingle(),
        sb.from('bgroups').select('id,name,code,owner,dues,dues_note').eq('sport', 'nba').eq('season', RAW.season).order('created_at'),
      ]);
      ch.entry = e.data || null;
      if (ch.entry && !Object.keys(ch.picks).length) { ch.picks = ch.entry.picks; ch.tiebreak = ch.entry.tiebreak ?? ''; }
      ch.groups = g.data || [];
      const ep = await sb.from('email_prefs').select('bracket_emails').maybeSingle();
      ch.emails = ep.data ? ep.data.bracket_emails : true;
    } else { ch.entry = null; ch.groups = []; }
    if (chLocked()) {
      const all = await sb.from('brackets').select('user_id,display_name,seeds,picks,tiebreak').eq('sport', 'nba').eq('season', RAW.season).limit(5000);
      ch.board = (all.data || []).map((b) => ({ ...b, ...scoreBracket(b) })).sort((x, y) => y.pts - x.pts || x.display_name.localeCompare(y.display_name));
    }
    ch.loaded = true;
  } catch (err) { console.warn(err); }
  ch.loading = false;
  if (state.tab === 'challenge') render();
}
async function chOpenGroup(id) {
  const g = ch.groups.find((x) => x.id === id);
  if (!g) return;
  ch.group = g; ch.members = []; render();
  const [m, s] = await Promise.all([
    sb.from('group_members').select('user_id,display_name,paid,joined_at').eq('group_id', id).order('joined_at'),
    sb.rpc('group_bracket_status', { g: id }),
  ]);
  ch.members = m.data || [];
  ch.hasBracket = new Set((s.data || []).map((r) => r.user_id));
  if (chLocked() && ch.board) {
    const by = new Map(ch.board.map((b) => [b.user_id, b]));
    ch.members = ch.members.map((mm) => ({ ...mm, b: by.get(mm.user_id) || null })).sort((x, y) => (y.b?.pts ?? -1) - (x.b?.pts ?? -1));
  }
  render();
}
function chPhase() {
  if (chLocked()) return { k: 'live', t: 'Brackets locked · live scoring' };
  if (!REG_DONE && !EARLY) return { k: 'pre', t: 'Groups are open now · brackets open for the last 10 days of the regular season' };
  const ms = ch.lockAt ? new Date(ch.lockAt) - Date.now() : null;
  const left = ms ? `${Math.floor(ms / 864e5)}d ${Math.floor((ms % 864e5) / 36e5)}h` : '';
  return { k: 'open', t: `Brackets are open${EARLY ? ' · projected seeds until the regular season ends' : left ? ` · lock in ${left}` : ''}` };
}
function bracketHead(seeds, src, mode) {
  const n = countPicks(seeds, src);
  return `<span class="hint">${n} of ${TOTAL_PICKS} picked</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn" data-act="chfav" data-mode="${mode}">Favorites win</button>${n ? `<button class="btn" data-act="chclear" data-mode="${mode}">Clear</button>` : ''}</span>`;
}
function renderChallenge() {
  if (!ch.loaded) chLoad();
  if (ch.group) return chGroupView();
  const ph = chPhase();
  const hero = `<section class="chhero">
    <div class="chh-text"><span class="chpill ${ph.k}">${ph.t}</span>
      <h2 class="chh1">NBA Playoff Bracket Challenge</h2>
      <p>Pick the play-in and every series through the Finals, start a group with your friends, and settle who really knows ball. Free to play.</p>
      <div class="row-btns" style="justify-content:flex-start">
        <button class="btn primary big" data-act="chnew">Start a group</button>
        <button class="btn big" data-act="chjoin">Join with a code</button>
      </div></div>
    <div class="chh-pts n5">${ROUNDS.map((r) => `<div><b>${CH_PTS[r]}</b><span>${RNAME[r]}</span></div>`).join('')}<small>points per correct pick · +1 per seed on series upsets you call · total points in the last Finals game breaks ties</small></div>
  </section>`;
  let mine;
  if (ph.k === 'pre') {
    mine = `<div class="card chcard"><h3>Your bracket</h3><p>Brackets open about 10 days before the regular season ends, with projected seeds, so your group can fill them out early. Seeds go final the night the season ends, and brackets lock at the first play-in tip.</p><p class="hint">Want to practice? Build a what-if bracket on the <a href="/nba/playoff-odds/">Playoff odds tab</a>.</p></div>`;
  } else if (ph.k === 'open') {
    const n = countPicks(CH_SEEDS, ch.picks), done = n === TOTAL_PICKS;
    mine = `<div class="card chcard wide"><div class="section-head" style="margin-top:0"><h3>Your bracket</h3>
      <span class="hint">${ch.entry ? `Saved ${new Date(ch.entry.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ` : 'Not submitted yet · '}</span>${bracketHead(CH_SEEDS, ch.picks, 'ch')}</div>
      ${EARLY ? '<p class="chnote">Seeds are projected from today\'s standings. When the regular season ends they become final, and if your matchups change we\'ll ask you to recheck your picks.</p>' : ''}${staleNote()}${nbaBracketHtml(CH_SEEDS, ch.picks, { mode: 'ch' })}
      <div class="chsave"><label>Total points, last Finals game <input type="number" id="chTb" min="0" max="400" inputmode="numeric" value="${esc(ch.tiebreak)}" placeholder="e.g. 212"></label>
        <label>Name on leaderboards <input type="text" id="chName" maxlength="40" value="${esc(ch.entry?.display_name || myName())}"></label>
        <button class="btn primary big" data-act="chsave" ${done ? '' : 'disabled'}>${user ? (ch.entry ? 'Update bracket' : 'Submit bracket') : 'Sign in to submit'}</button></div>
      ${done ? '' : '<p class="hint" style="margin:6px 0 0">Pick every game through the Finals to submit.</p>'}
      ${ch.entry ? `<div class="row-btns" style="justify-content:flex-start;margin-top:10px">${shareBtn('bracket', 'Share my picks', true)}</div>` : ''}</div>`;
  } else {
    const sc = ch.entry ? scoreBracket(ch.entry) : null;
    const rank = sc && ch.board && user ? ch.board.findIndex((b) => b.user_id === user.id) + 1 : 0;
    mine = ch.entry ? `<div class="card chcard wide"><div class="section-head" style="margin-top:0"><h3>Your bracket</h3>
      <span class="chscore num"><b>${sc.pts}</b> pts</span><span class="hint num">${sc.right} right · max ${sc.max}${rank ? ` · #${rank} of ${ch.board.length}` : ''}</span></div>
      ${nbaBracketHtml(ch.entry.seeds, ch.entry.picks, { mode: 'ch', readOnly: true })}<div class="row-btns" style="justify-content:flex-start;margin-top:10px">${shareBtn('bracket', 'Share my bracket', true)}</div></div>`
      : `<div class="card chcard"><h3>Your bracket</h3><p>Brackets are locked${user ? " and you didn't submit one this year" : ''}. Follow along with your groups, and you'll be first in line next season.</p></div>`;
  }
  const groups = !user ? `<div class="card chcard"><h3>Your groups</h3><p>Sign in to start or join a group.</p><button class="btn primary" data-act="signin">Sign in</button></div>`
    : `<div class="card chcard"><h3>Your groups</h3>${ch.groups.length ? ch.groups.map((g) => `<button class="chgroup" data-chgroup="${g.id}"><b>${esc(g.name)}</b><span>${g.owner === user.id ? 'Commissioner' : 'Member'}${g.dues ? ` · $${g.dues} dues` : ''}</span><i>›</i></button>`).join('') : '<p class="hint">No groups yet. Start one and send the link to your group chat.</p>'}${emailToggle()}</div>`;
  const board = ph.k === 'live' && ch.board ? `<div class="card chcard"><h3>Everyone</h3><table class="t chboard"><thead><tr><th>#</th><th>Name</th><th>Champion</th><th>Pts</th></tr></thead><tbody>${ch.board.slice(0, 25).map((b, k) => `<tr class="${user && b.user_id === user.id ? 'me' : ''}"><td class="num">${k + 1}</td><td>${esc(b.display_name)}</td><td>${b.champ != null ? `<span class="tn${b.champAlive ? '' : ' dead'}">${chip(T[b.champ])}</span>` : ''}</td><td class="num"><b>${b.pts}</b></td></tr>`).join('')}</tbody></table></div>` : '';
  return `${hero}<div class="chgrid">${mine}<div class="chside">${groups}${board}</div></div>
    <p class="hint chlegal">Free to play. Clinch never collects, holds or pays out money. The dues tracker is a checklist; groups settle up however they choose, where it's legal for them.</p>`;
}
function emailToggle() {
  return `<label class="emt"><input type="checkbox" id="chEmails" ${ch.emails !== false ? 'checked' : ''}> Email me when brackets open and before they lock</label>`;
}
async function setEmails(on) {
  if (!user) return;
  const { error } = await sb.from('email_prefs').upsert({ user_id: user.id, bracket_emails: on, updated_at: new Date().toISOString() });
  if (error) return toast('Could not save: ' + error.message);
  ch.emails = on; toast(on ? 'Bracket emails on' : 'Bracket emails off'); render();
}
document.addEventListener('change', (e) => { if (e.target.id === 'chEmails') setEmails(e.target.checked); });
function chGroupView() {
  const g = ch.group, own = user && g.owner === user.id, locked = chLocked();
  const unpaid = ch.members.filter((m) => !m.paid);
  const rows = ch.members.map((m, k) => {
    const has = ch.hasBracket.has(m.user_id);
    return `<tr class="${user && m.user_id === user.id ? 'me' : ''}">
      ${locked ? `<td class="num">${m.b ? k + 1 : ''}</td>` : ''}
      <td>${esc(m.display_name)}${m.user_id === g.owner ? ' <span class="tag">commish</span>' : ''}</td>
      <td>${has ? '<span class="ok">✓ in</span>' : '<span class="muted">—</span>'}</td>
      ${locked ? `<td>${m.b && m.b.champ != null ? `<span class="tn${m.b.champAlive ? '' : ' dead'}">${chip(T[m.b.champ])}</span>` : ''}</td><td class="num"><b>${m.b ? m.b.pts : ''}</b></td>` : ''}
      ${g.dues ? `<td>${own ? `<button class="paid ${m.paid ? 'on' : ''}" data-chpaid="${m.user_id}" aria-pressed="${m.paid}">${m.paid ? '✓ Paid' : 'Unpaid'}</button>` : m.paid ? '<span class="ok">✓ Paid</span>' : '<span class="muted">Unpaid</span>'}</td>` : ''}
      ${own && m.user_id !== g.owner ? `<td><button class="btn danger mini" data-chkick="${m.user_id}" aria-label="Remove ${esc(m.display_name)}">✕</button></td>` : own ? '<td></td>' : ''}
    </tr>`;
  }).join('');
  const pot = g.dues * ch.members.length, got = g.dues * (ch.members.length - unpaid.length);
  return `<div class="section-head" style="margin-top:4px"><button class="btn" data-act="chback">← Bracket Challenge</button></div>
  <section class="chhero grp"><div class="chh-text">
    <span class="chpill ${chPhase().k}">${chPhase().t}</span>
    <h2 class="chh1">${esc(g.name)}</h2>
    <p>${ch.members.length} member${ch.members.length === 1 ? '' : 's'} · ${ch.hasBracket.size} bracket${ch.hasBracket.size === 1 ? '' : 's'} in${g.dues ? ` · $${g.dues} dues` : ''}</p>
    <div class="sharebox"><input type="text" readonly value="${esc(inviteUrl(g.code))}" id="chInvite" aria-label="Invite link"><button class="btn primary" data-act="chcopyinvite">Copy invite</button>${navigator.share ? '<button class="btn" data-act="chshareinvite">Share</button>' : ''}</div>
  </div>
  ${g.dues ? `<div class="chdues"><div><b class="num">$${got}</b><span>of $${pot} paid</span></div><div class="meter"><i style="width:${pot ? Math.round((got / pot) * 100) : 0}%"></i></div>${g.dues_note ? `<small>Pay: ${esc(g.dues_note)}</small>` : ''}</div>` : ''}
  </section>
  <div class="card scroll"><table class="t chmembers"><thead><tr>${locked ? '<th>#</th>' : ''}<th>Member</th><th>Bracket</th>${locked ? '<th>Champion</th><th>Pts</th>' : ''}${g.dues ? '<th>Dues</th>' : ''}${own ? '<th></th>' : ''}</tr></thead><tbody>${rows || '<tr><td>Loading…</td></tr>'}</tbody></table></div>
  <div class="row-btns" style="justify-content:flex-start;margin-top:12px">
    ${chPhase().k === 'open' && ch.members.some((m) => !ch.hasBracket.has(m.user_id)) ? `<button class="btn primary" data-act="chnudge">Copy bracket reminder (${ch.members.filter((m) => !ch.hasBracket.has(m.user_id)).length})</button>` : ''}${own ? `<button class="btn" data-act="chedit">Group settings</button>${g.dues && unpaid.length ? `<button class="btn" data-act="chremind">Copy dues reminder (${unpaid.length})</button>` : ''}` : '<button class="btn danger" data-act="chleave">Leave group</button>'}
  </div>
  <p class="hint chlegal">Clinch doesn't collect or hold money. The commissioner marks who's paid.</p>`;
}
function chGroupForm(g) {
  openModal(`<h3>${g ? 'Group settings' : 'Start an NBA group'}</h3>
    <label class="hint" for="cgName">Group name</label><input type="text" id="cgName" maxlength="60" value="${esc(g ? g.name : `${myName().split(' ')[0]}'s NBA Bracket`)}">
    <label class="hint" for="cgDues">Dues per person (optional, tracking only)</label><input type="number" id="cgDues" min="0" max="10000" inputmode="numeric" value="${g ? g.dues || '' : ''}" placeholder="0">
    <label class="hint" for="cgNote">How to pay (optional)</label><input type="text" id="cgNote" maxlength="200" value="${esc(g?.dues_note || '')}" placeholder="e.g. Venmo @your-name">
    <p class="hint">Clinch only tracks who's paid. Money goes directly between members.</p>
    <div class="row-btns">${g ? '<button class="btn danger" data-act="chdelete" style="margin-right:auto">Delete group</button>' : ''}<button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="${g ? 'chupdate' : 'chcreate'}">${g ? 'Save' : 'Create group'}</button></div>`);
  $('#cgName').select();
}
async function chJoinDialog(code) {
  if (!code) {
    return openModal(`<h3>Join a group</h3><label class="hint" for="cjCode">Invite code or link</label><input type="text" id="cjCode" placeholder="e.g. 3f9a1c2b">
      <div class="row-btns"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="chlookup">Next</button></div>`);
  }
  if (!sb) return;
  const { data } = await sb.rpc('peek_group', { c: code });
  const g = data && data[0];
  if (!g) return toast('That invite code does not exist');
  if (g.sport && g.sport !== 'nba') { location.href = `/?join=${encodeURIComponent(code)}`; return; }
  openModal(`<h3>Join ${esc(g.name)}?</h3><p>${esc(g.commissioner || 'A friend')} invited you to their NBA Playoff Bracket Challenge. ${g.members} member${g.members === 1 ? '' : 's'} so far${g.dues ? ` · $${g.dues} dues, tracked by the commissioner` : ''}.</p>
    ${user ? `<label class="hint" for="cjName">Your name in this group</label><input type="text" id="cjName" maxlength="40" value="${esc(myName())}">` : ''}
    <div class="row-btns"><button class="btn" data-act="close">Not now</button><button class="btn primary" data-act="chdojoin" data-code="${esc(code)}">${user ? 'Join group' : 'Sign in to join'}</button></div>`);
}
function chSet(mode, obj) { if (mode === 'practice') { ch.practice = obj; store.set('chp:' + RAW.season, obj); } else { ch.picks = obj; store.set('ch:' + RAW.season, obj); } }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.nch) {
    const mode = b.dataset.mode, src = { ...(mode === 'practice' ? ch.practice : ch.picks) }, w = +b.dataset.pw;
    if (src[b.dataset.nch] === w) delete src[b.dataset.nch]; else src[b.dataset.nch] = w;
    chSet(mode, src); render(); return;
  }
  if (b.dataset.chgroup) return chOpenGroup(b.dataset.chgroup);
  if (b.dataset.chpaid) {
    const m = ch.members.find((x) => x.user_id === b.dataset.chpaid); if (!m) return;
    const { error } = await sb.from('group_members').update({ paid: !m.paid }).eq('group_id', ch.group.id).eq('user_id', m.user_id);
    if (error) return toast(error.message);
    m.paid = !m.paid; render(); return;
  }
  if (b.dataset.chkick) {
    const m = ch.members.find((x) => x.user_id === b.dataset.chkick);
    if (!m || !confirmTwice(b)) return;
    const { error } = await sb.from('group_members').delete().eq('group_id', ch.group.id).eq('user_id', m.user_id);
    if (error) return toast(error.message);
    return chOpenGroup(ch.group.id);
  }
  const act = b.dataset.act;
  if (act === 'close') return closeModal();
  if (act === 'signin') return signInDialog('challenge');
  if (act === 'account') return user ? myScenarios() : signInDialog();
  if (act === 'signout') { await sb.auth.signOut(); setActive(null); closeModal(); return; }
  if (act === 'share') return share();
  if (act === 'save') return saveDialog();
  if (act === 'myscn') return myScenarios();
  if (act === 'dosave') return doSave();
  if (act === 'stopauto') { setActive(null); closeModal(); toast('Stopped auto-saving. Your saved copy is unchanged'); return; }
  if (act === 'loadscn') {
    const r = (myScenarios.cache || []).find((x) => x.id === b.dataset.id); if (!r) return;
    setActive(null); applyPicks(r.picks); if (r.team && T.includes(r.team)) { state.team = r.team; store.set('team', r.team); }
    setActive({ id: r.id, name: r.name }); closeModal(); toast(`Loaded "${r.name}"`); return;
  }
  if (act === 'delscn') {
    if (!confirmTwice(b)) return;
    const { error } = await sb.from('scenarios').delete().eq('id', b.dataset.id);
    if (error) return toast('Could not delete: ' + error.message);
    if (active && active.id === b.dataset.id) setActive(null);
    return myScenarios();
  }
  if (act === 'oauth') { store.set('lastPath', location.pathname); const { error } = await sb.auth.signInWithOAuth({ provider: b.dataset.provider, options: { redirectTo: location.origin + location.pathname } }); if (error) toast('Sign-in failed: ' + error.message); return; }
  if (!act || !act.startsWith('ch')) return;
  if (act === 'chback') { ch.group = null; render(); return; }
  if (act === 'chfav' || act === 'chclear') {
    const mode = b.dataset.mode, seeds = mode === 'practice' ? practiceSeeds() : CH_SEEDS;
    const src = act === 'chclear' ? {} : { ...(mode === 'practice' ? ch.practice : ch.picks) };
    if (act === 'chfav') nbaBracket(seeds, (a, c, r) => { const k = keyOf(r, a, c); if (src[k] !== a && src[k] !== c) src[k] = nbaWinProb(RATING, a, c, r === 'F') >= 0.5 ? a : c; return src[k]; });
    chSet(mode, src); render(); return;
  }
  if (act === 'chsave') {
    ch.tiebreak = $('#chTb').value; store.set('chtb:' + RAW.season, ch.tiebreak);
    if (!user) { store.set('pending', 'chsave'); return signInDialog('chsave'); }
    const tb = parseInt(ch.tiebreak, 10);
    if (!(tb >= 0 && tb <= 400)) return toast('Add your guess for total points in the last Finals game (the tiebreaker)');
    const name = ($('#chName').value || '').trim() || myName();
    const keep = {}; nbaBracket(CH_SEEDS, (a, c, r) => { const w = decideFrom(ch.picks)(a, c, r); if (w != null) keep[keyOf(r, a, c)] = w; return w; });
    const { data, error } = await sb.from('brackets').upsert({ sport: 'nba', season: RAW.season, display_name: name, seeds: CH_SEEDS, picks: keep, tiebreak: tb }, { onConflict: 'user_id,sport,season' }).select().single();
    if (error) return toast('Could not save: ' + error.message);
    ch.entry = data; toast(`Bracket ${ch.entry.created_at === ch.entry.updated_at ? 'submitted' : 'updated'}. Good luck!`); render(); return;
  }
  if (!user && ['chnew', 'chjoin'].includes(act)) { store.set('pending', act); return signInDialog('challenge'); }
  if (act === 'chnew') return chGroupForm(null);
  if (act === 'chedit') return chGroupForm(ch.group);
  if (act === 'chcreate' || act === 'chupdate') {
    const rec = { name: $('#cgName').value.trim(), dues: Math.max(0, parseInt($('#cgDues').value || '0', 10) || 0), dues_note: $('#cgNote').value.trim() || null };
    if (!rec.name) return toast('Give your group a name');
    if (act === 'chcreate') {
      const { data, error } = await sb.from('bgroups').insert({ ...rec, sport: 'nba', season: RAW.season }).select().single();
      if (error) return toast('Could not create: ' + error.message);
      closeModal(); ch.groups.push(data); toast('Group created. Send the invite link to your group chat'); return chOpenGroup(data.id);
    }
    const { data, error } = await sb.from('bgroups').update(rec).eq('id', ch.group.id).select().single();
    if (error) return toast(error.message);
    Object.assign(ch.group, data); closeModal(); render(); return;
  }
  if (act === 'chdelete') {
    if (!confirmTwice(b)) return;
    const { error } = await sb.from('bgroups').delete().eq('id', ch.group.id);
    if (error) return toast(error.message);
    ch.groups = ch.groups.filter((x) => x.id !== ch.group.id); ch.group = null; closeModal(); render(); return;
  }
  if (act === 'chleave') {
    if (!confirmTwice(b)) return;
    await sb.from('group_members').delete().eq('group_id', ch.group.id).eq('user_id', user.id);
    ch.groups = ch.groups.filter((x) => x.id !== ch.group.id); ch.group = null; render(); return;
  }
  if (act === 'chjoin') return chJoinDialog('');
  if (act === 'chlookup') { const v = ($('#cjCode').value || '').trim(); const code = (v.match(/join=([a-z0-9]+)/i) || [, v])[1].toLowerCase(); return chJoinDialog(code); }
  if (act === 'chdojoin') {
    const code = b.dataset.code;
    if (!user) { store.set('pending', 'join:' + code); return signInDialog('challenge'); }
    const { data, error } = await sb.rpc('join_group', { c: code, nm: ($('#cjName')?.value || myName()).trim() });
    if (error) return toast(error.message);
    closeModal(); ch.loaded = false; await chLoad(true); return chOpenGroup(data);
  }
  if (act === 'chcopyinvite') { try { await navigator.clipboard.writeText(inviteUrl(ch.group.code)); toast('Invite link copied'); } catch { $('#chInvite').select(); } return; }
  if (act === 'chshareinvite') { try { await navigator.share({ title: ch.group.name, text: `Join my NBA Playoff Bracket Challenge on Clinch: ${ch.group.name}`, url: inviteUrl(ch.group.code) }); } catch {} return; }
  if (act === 'chnudge') {
    const g = ch.group, need = ch.members.filter((m) => !ch.hasBracket.has(m.user_id)).map((m) => m.display_name);
    const lock = ch.lockAt ? ` Locks ${new Date(ch.lockAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : '';
    const msg = `🏀 ${g.name}: brackets are open! Still waiting on ${need.join(', ')}.${lock} Make your picks: ${SITE()}/nba/bracket-challenge/`;
    try { await navigator.clipboard.writeText(msg); toast('Reminder copied. Paste it in your group chat'); } catch { toast(msg); }
    return;
  }
  if (act === 'chremind') {
    const g = ch.group, unpaid = ch.members.filter((m) => !m.paid).map((m) => m.display_name);
    const msg = `🏀 ${g.name}: $${g.dues} dues still owed by ${unpaid.join(', ')}.${g.dues_note ? ` Pay: ${g.dues_note}.` : ''} Make your bracket: ${inviteUrl(g.code)}`;
    try { await navigator.clipboard.writeText(msg); toast('Reminder copied. Paste it in your group chat'); } catch { toast(msg); }
  }
});
