// Bracket Challenge emails to group members, sent from the scheduled update (GitHub Actions).
//   open   - brackets just opened (NFL: final seeds after Week 18; NBA: projected seeds ~10 days early)              -> every member of a group for that sport
//   final  - seeds are final and changed since you submitted     -> members whose saved bracket used other seeds
//   lock24 - brackets lock within 24 hours                        -> members with no bracket yet
// Each email goes once per person per event (notify_log). Anyone can turn them off (email_prefs / link in the email).
// Needs SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY (GitHub Actions secrets). Skips quietly without them. Always exits 0.
import fs from 'node:fs';
import { loadGames, parseCSV } from '../engine/data.js';
import { buildContext, evaluate } from '../engine/engine.js';
import { nbaContext, nbaStandings } from '../engine/nba.js';

const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const RESEND = (process.env.RESEND_API_KEY || '').trim();
const site = JSON.parse(fs.readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const SITE = site.SITE_URL || 'https://clinchscenarios.com';
const FROM = process.env.NOTIFY_FROM || site.NOTIFY_FROM || 'Clinch <brackets@clinchscenarios.com>';
const DRY = !!process.env.NOTIFY_DRY_RUN;
if (!KEY || !site.SUPABASE_URL || (!RESEND && !DRY)) { console.log('Bracket emails: no Supabase service key or Resend key; skipping.'); process.exit(0); }

const H = { apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }), 'Content-Type': 'application/json' };
const rest = async (path, opts = {}) => {
  const r = await fetch(`${site.SUPABASE_URL}/rest/v1/${path}`, { headers: { ...H, ...(opts.headers || {}) }, ...opts });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

// ---- where each sport stands ----
function nflState() {
  const all = loadGames();
  const season = Math.max(...all.filter((r) => r.game_type === 'REG').map((r) => +r.season));
  const ctx = buildContext(all.filter((r) => +r.season === season && r.game_type === 'REG'));
  const left = ctx.games.filter((g) => !g.played).length;
  const seeds = evaluate(ctx, ctx.games.map((g) => (g.played ? g.fixed : null))).seeds.map((x) => x.slice(0, 7));
  return { sport: 'nfl', label: 'NFL', emoji: '🏈', season, done: left === 0, open: left === 0, seeds, path: '/nfl/bracket-challenge/', end: 'Week 18', start: 'wild card kickoff' };
}
function nbaState() {
  const dir = new URL('../data/nba/', import.meta.url);
  const season = Math.max(...fs.readdirSync(dir).map((f) => +((f.match(/^games_(\d{4})\.csv$/) || [])[1] || 0)));
  const ctx = nbaContext(parseCSV(fs.readFileSync(new URL(`games_${season}.csv`, dir), 'utf8')));
  const left = ctx.games.filter((g) => !g.played).length;
  const seeds = nbaStandings(ctx, ctx.games.map((g) => (g.played ? (g.hs > g.as ? 1 : -1) : null))).seeds.map((s) => s.slice(0, 10));
  return { sport: 'nba', label: 'NBA', emoji: '🏀', season, done: left === 0 && ctx.games.length > 0, open: ctx.games.length > 0 && left <= 75, seeds, path: '/nba/bracket-challenge/', end: 'the regular season', start: 'first play-in tip' };
}

// ---- recipients ----
async function authUsers() {
  const out = new Map();
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`${site.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: H });
    if (!r.ok) throw new Error(`auth users: HTTP ${r.status} ${await r.text()}`);
    const { users = [] } = await r.json();
    for (const u of users) if (u.email) out.set(u.id, { email: u.email, name: (u.user_metadata?.full_name || '').split(' ')[0] });
    if (users.length < 1000) break;
  }
  return out;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function email(S, event, u, groups, lockAt) {
  const url = SITE + S.path, off = `${url}?emails=off`;
  const lock = lockAt ? new Date(lockAt).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }) : `the ${S.start}`;
  const g = groups.length === 1 ? esc(groups[0]) : `your ${groups.length} groups`;
  const copy = {
    open: [`${S.emoji} ${S.label} brackets are open`, (S.done ? `Brackets are open for ${g}. Seeds are set: make your picks before brackets lock ${lock}.` : `Brackets are open for ${g}. Seeds are projected from the current standings and go final when ${S.end} ends, so you can fill yours out now and tweak it later.`), 'Make my bracket'],
    final: [`${S.emoji} Final seeds are set: check your ${S.label} bracket`, `${S.label} seeds are final, and some of your matchups changed since you submitted. Take a minute to check your picks and tap Update bracket before brackets lock ${lock}.`, 'Check my bracket'],
    lock24: [`⏰ ${S.label} brackets lock in less than a day`, `You haven't submitted a bracket for ${g} yet. Brackets lock ${lock}.`, 'Make my bracket'],
  }[event];
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <p style="font-size:16px">${u.name ? `Hey ${esc(u.name)},` : 'Hey,'}</p>
    <p style="font-size:16px;line-height:1.5">${copy[1]}</p>
    <p style="margin:24px 0"><a href="${url}" style="background:#1fc9a6;color:#062a22;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">${copy[2]}</a></p>
    <p style="font-size:12px;color:#777">You're getting this because you're in a Clinch ${S.label} Bracket Challenge group. <a href="${off}" style="color:#777">Turn off bracket emails</a>.</p></div>`;
  return { from: FROM, to: [u.email], subject: copy[0], html, headers: { 'List-Unsubscribe': `<${off}>` } };
}

let sent = 0;
for (const S of [nflState(), nbaState()]) {
  try {
    const [settings] = await rest(`challenge_settings?sport=eq.${S.sport}&season=eq.${S.season}&select=lock_at`);
    const lockAt = settings?.lock_at || null, now = Date.now(), lockMs = lockAt ? new Date(lockAt).getTime() : Infinity;
    if (!S.open || now >= lockMs) { console.log(`${S.label}: brackets not open (or already locked); nothing to send.`); continue; }
    const groups = await rest(`bgroups?sport=eq.${S.sport}&season=eq.${S.season}&select=id,name`);
    if (!groups.length) { console.log(`${S.label}: no groups yet.`); continue; }
    const gname = new Map(groups.map((g) => [g.id, g.name]));
    const members = await rest(`group_members?group_id=in.(${groups.map((g) => g.id).join(',')})&select=group_id,user_id`);
    const byUser = new Map();
    for (const m of members) { if (!byUser.has(m.user_id)) byUser.set(m.user_id, []); byUser.get(m.user_id).push(gname.get(m.group_id)); }
    const brackets = new Map((await rest(`brackets?sport=eq.${S.sport}&season=eq.${S.season}&select=user_id,seeds`)).map((b) => [b.user_id, b.seeds]));
    const optedOut = new Set((await rest('email_prefs?bracket_emails=eq.false&select=user_id')).map((r) => r.user_id));
    const log = new Set((await rest(`notify_log?sport=eq.${S.sport}&season=eq.${S.season}&select=user_id,event`)).map((r) => `${r.user_id}:${r.event}`));
    const users = await authUsers();
    const want = [];
    for (const [uid, gs] of byUser) {
      if (optedOut.has(uid) || !users.has(uid)) continue;
      const event = S.done && brackets.has(uid) && JSON.stringify(brackets.get(uid)) !== JSON.stringify(S.seeds) ? 'final'
        : lockMs - now < 864e5 && !brackets.has(uid) ? 'lock24'
        : 'open';
      // 'open' only once; a fresher event (final / lock24) can still follow it
      if (log.has(`${uid}:${event}`)) continue;
      if (event === 'open' && brackets.has(uid)) continue;
      want.push({ uid, event, msg: email(S, event, users.get(uid), gs, lockAt) });
    }
    for (let i = 0; i < want.length; i += 100) {
      const batch = want.slice(i, i + 100);
      if (DRY) { batch.forEach((w) => console.log(`[dry run] ${w.event} -> ${w.msg.to[0]}: ${w.msg.subject}`)); continue; }
      const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(batch.map((w) => w.msg)) });
      if (!r.ok) { console.log(`${S.label}: Resend error HTTP ${r.status} ${await r.text()}`); break; }
      await rest('notify_log', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(batch.map((w) => ({ user_id: w.uid, sport: S.sport, season: S.season, event: w.event }))) });
      sent += batch.length;
    }
    console.log(`${S.label}: ${want.length} bracket email(s) ${DRY ? 'would be sent' : 'sent'}.`);
  } catch (e) { console.log(`${S.label}: bracket emails skipped (${e.message}).`); }
}
console.log(`Bracket emails done: ${sent} sent.`);
