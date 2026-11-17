// Draws the daily debrief dashboard as a PNG from stats/<day>.json + stats/history.csv.
// Usage: node scripts/stats-chart.js [stats-dir] [day]   -> <dir>/charts/<day>.png and <dir>/latest.png
// Needs @resvg/resvg-js (the stats workflow installs it); fonts are bundled in scripts/fonts.
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const dir = process.argv[2] || 'stats';
const day = process.argv[3] || fs.readdirSync(dir).filter((f) => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().pop().slice(0, 10);
const S = JSON.parse(fs.readFileSync(path.join(dir, `${day}.json`), 'utf8'));
const T = S.traffic || {}, Y = T.yesterday || {}, W = T.last7 || {}, P7 = T.prior7 || {}, P = S.product;

// Daily series. Exact daily totals (history.csv, the daily json files) win; Cloudflare's sampled 30-day
// series only fills days we never collected, and those bars are drawn as estimates.
const series = new Map(), hist = new Map();
for (const x of S.series || []) series.set(x.day, { ...x, est: true });
try {
  const [head, ...rows] = fs.readFileSync(path.join(dir, 'history.csv'), 'utf8').trim().split('\n');
  const k = head.split(',');
  for (const r of rows) { const o = Object.fromEntries(r.split(',').map((v, i) => [k[i], v])); hist.set(o.day, o); if (o.visits !== '') series.set(o.day, { day: o.day, visits: +o.visits, pageviews: +o.pageviews }); }
} catch { /* no history yet */ }
if (Y.visits != null) series.set(day, { day, visits: Y.visits, pageviews: Y.pageviews });
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daily = (d) => { if (d === day) return S; try { return JSON.parse(fs.readFileSync(path.join(dir, `${d}.json`), 'utf8')); } catch { return null; } };
const MONTH = 30;
const days = []; for (let i = MONTH - 1; i >= 0; i--) { const d = addDays(day, -i); const s = series.get(d); const j = daily(d); days.push({ day: d, visits: s ? s.visits : null, pageviews: s ? s.pageviews : null, est: !!(s && s.est), j, h: hist.get(d) }); }
const prevDays = []; for (let i = 2 * MONTH - 1; i >= MONTH; i--) { const s = series.get(addDays(day, -i)); if (s && !s.est) prevDays.push(s); }

// Palette (site colors)
const C = { bg: '#0f1422', surface: '#182033', line: '#2c3854', text: '#eaf0fb', muted: '#8693b0', accent: '#35e3bf', accentDim: '#1f6e60', coral: '#ff6f8e', gold: '#ffc861', blue: '#6aa8ff', ghost: '#232c42' };
const SEARCH = /google|bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|search/i, SOCIAL = /reddit|t\.co$|twitter|x\.com|facebook|fb\.|instagram|tiktok|threads|bsky|discord|linkedin|youtube|messenger|whatsapp|telegram|slack/i;
const self = /clinchscenarios\.com$/i;
const kind = (h) => (h === '(direct)' ? 'Direct / apps' : self.test(h) ? null : /reddit/i.test(h) ? 'Reddit' : SEARCH.test(h) ? 'Search' : SOCIAL.test(h) ? 'Social' : 'Other sites');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US'));
const clip = (s, max) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const country = (() => { try { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return (c) => { try { return dn.of(c) || c; } catch { return c; } }; } catch { return (c) => c; } })();

const Wd = 1080, PAD = 48, IN = Wd - PAD * 2;
let y = 0; const out = [];
const t = (x, yy, s, o = {}) => out.push(`<text x="${x}" y="${yy}" font-size="${o.size || 26}" font-weight="${o.weight || 400}" fill="${o.fill || C.text}" text-anchor="${o.anchor || 'start'}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`);
const card = (x, yy, w, h) => out.push(`<rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="18" fill="${C.surface}" stroke="${C.line}"/>`);
const section = (title, sub) => { y += 64; t(PAD, y, title, { size: 30, weight: 700 }); if (sub) t(PAD + IN, y, sub, { size: 22, fill: C.muted, anchor: 'end' }); y += 22; };

// Header
y = 70;
t(PAD, y, 'CLINCH · DAILY DEBRIEF', { size: 22, weight: 700, fill: C.accent, ls: 3 });
const dLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
y += 56; t(PAD, y, dLabel, { size: 48, weight: 700 });

// ---- Month view: always the last 30 days, untracked days shown as empty slots ----
const fmtD = (d, o = { month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
const isSun = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
const mix = (a, b, k) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const SRC = [['Search', C.accent], ['Direct / apps', C.blue], ['Social', C.coral], ['Other sites', C.gold]];
const srcOf = (h) => { const k = kind(h); return k === 'Reddit' ? 'Social' : k; };
for (const d of days) {
  const refs = d.j && d.j.traffic && d.j.traffic.yesterday && d.j.traffic.yesterday.referrers;
  if (d.visits == null || !refs) continue;
  const split = {}; let tot = 0;
  for (const r of refs) { const k = srcOf(r.host); if (k && r.visits) { split[k] = (split[k] || 0) + r.visits; tot += r.visits; } }
  if (tot < d.visits) split['Other sites'] = (split['Other sites'] || 0) + d.visits - tot;
  const f = tot > d.visits && tot ? d.visits / tot : 1; for (const k in split) split[k] *= f;
  d.split = split;
}
const tracked = days.filter((d) => d.visits != null);
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const v30 = sum(tracked, (d) => d.visits), pv30 = sum(tracked, (d) => d.pageviews);
const best = tracked.reduce((b, d) => (!b || d.visits > b.visits ? d : b), null);
const withSplit = days.filter((d) => d.split);
const search30 = sum(withSplit, (d) => d.split.Search), splitTot = sum(withSplit, (d) => d.visits);

// KPI tiles
const sameDayLastWeek = series.get(addDays(day, -7));
const wk = 'vs last ' + fmtD(day, { weekday: 'short' });
const prev30 = sum(prevDays, (d) => d.visits);
const tiles = [
  { label: 'Visits yesterday', value: n(Y.visits), delta: sameDayLastWeek && sameDayLastWeek.visits ? pct(Y.visits, sameDayLastWeek.visits) : null, note: sameDayLastWeek ? wk : `${n(Y.pageviews)} pageviews` },
  { label: 'Visits · 30 days', value: n(v30), delta: prevDays.length >= 20 && prev30 ? pct(v30, prev30) : null, note: prevDays.length >= 20 ? 'vs prior 30d' : `${tracked.length} of 30 days tracked` },
  { label: 'Avg per day', value: tracked.length ? (v30 / tracked.length).toFixed(v30 / tracked.length < 10 ? 1 : 0) : '–', delta: null, note: best ? `best ${fmtD(best.day)} (${n(best.visits)})` : 'no data' },
  { label: 'From search', value: splitTot ? `${Math.round((100 * search30) / splitTot)}%` : '–', delta: null, note: splitTot ? `${n(Math.round(search30))} visits, 30d` : 'no data' },
];
y += 34; const tw = (IN - 3 * 16) / 4, th = 150;
tiles.forEach((k, i) => {
  const x = PAD + i * (tw + 16); card(x, y, tw, th);
  t(x + 20, y + 40, k.label, { size: 21, fill: C.muted, weight: 600 });
  t(x + 20, y + 94, k.value, { size: 46, weight: 700 });
  if (k.delta != null) { const up = k.delta >= 0; t(x + 20, y + 130, `${up ? '▲' : '▼'} ${Math.abs(k.delta)}%`, { size: 20, weight: 700, fill: up ? C.accent : C.coral }); t(x + 108, y + 130, clip(k.note, 16), { size: 17, fill: C.muted }); }
  else t(x + 20, y + 130, clip(k.note, 22), { size: 19, fill: C.muted });
});
y += th;

// Shared x-axis for every 30-day chart
const axis = (x0, w) => { const bw = w / MONTH; return { bw, x: (i) => x0 + i * bw, cx: (i) => x0 + i * bw + bw / 2 }; };
const sundays = (ax, top, h) => days.forEach((d, i) => { if (isSun(d.day)) out.push(`<rect x="${ax.x(i)}" y="${top}" width="${ax.bw}" height="${h}" fill="${C.line}" opacity="0.35"/>`); });
const dateLabels = (ax, yy) => days.forEach((d, i) => { if (isSun(d.day) || i === MONTH - 1) t(ax.cx(i), yy, i === MONTH - 1 && !isSun(d.day) ? fmtD(d.day) : (i === MONTH - 1 ? fmtD(d.day) : fmtD(d.day)), { size: 17, fill: i === MONTH - 1 ? C.accent : C.muted, anchor: 'middle', weight: i === MONTH - 1 ? 700 : 400 }); });

// Visits per day, stacked by source, with 7-day average
section('Visits · last 30 days', 'by source · shaded = Sundays');
{
  const ch = 330, cy = y + 16; card(PAD, cy, IN, ch + 80);
  // legend
  let lx = PAD + 24; const ly = cy + 38;
  for (const [name, col] of [...SRC, ['No source data', C.line]]) { out.push(`<rect x="${lx}" y="${ly - 14}" width="16" height="16" rx="4" fill="${col}"/>`); t(lx + 24, ly, name, { size: 18, fill: C.muted }); lx += 24 + name.length * 9.6 + 26; }
  out.push(`<line x1="${lx}" x2="${lx + 26}" y1="${ly - 6}" y2="${ly - 6}" stroke="${C.text}" stroke-width="3" stroke-linecap="round"/>`); t(lx + 34, ly, '7-day avg', { size: 18, fill: C.muted });
  const plotX = PAD + 64, plotW = IN - 64 - 24, plotY = cy + 70, plotH = ch - 50, ax = axis(plotX, plotW);
  const vmax = Math.max(4, ...tracked.map((d) => d.visits)); const step = Math.max(1, Math.ceil(vmax / 4 / (vmax > 40 ? 10 : 2)) * (vmax > 40 ? 10 : 2)), top = step * 4;
  sundays(ax, plotY, plotH);
  for (let g = 0; g <= 4; g++) { const gy = plotY + plotH - (plotH * g) / 4; out.push(`<line x1="${plotX}" x2="${plotX + plotW}" y1="${gy}" y2="${gy}" stroke="${C.line}" stroke-width="1"/>`); t(plotX - 12, gy + 6, n(step * g), { size: 17, fill: C.muted, anchor: 'end' }); }
  const bar = Math.max(6, Math.min(26, ax.bw - 6)), Yv = (v) => plotY + plotH - (plotH * v) / top;
  let firstTracked = days.findIndex((d) => d.visits != null);
  days.forEach((d, i) => {
    const bx = ax.cx(i) - bar / 2;
    if (d.visits == null) { out.push(`<rect x="${bx}" y="${plotY + plotH - 6}" width="${bar}" height="6" rx="3" fill="${C.ghost}"/>`); return; }
    const segs = d.split ? SRC.map(([k, col]) => [d.split[k] || 0, col]).filter((s) => s[0] > 0) : [[d.visits, C.line]];
    let acc = 0;
    segs.forEach(([v, col]) => { const y1 = Yv(acc + v), y0 = Yv(acc); out.push(`<rect x="${bx}" y="${y1}" width="${bar}" height="${Math.max(0, y0 - y1)}" fill="${col}"${d.est ? ' opacity="0.6"' : ''}/>`); acc += v; });
    if (i === MONTH - 1 || d === best) t(ax.cx(i), Yv(d.visits) - 10, n(d.visits), { size: 19, weight: 700, anchor: 'middle', fill: i === MONTH - 1 ? C.accent : C.text });
  });
  if (firstTracked > 3) t(ax.cx(Math.floor(firstTracked / 2)), plotY + plotH - 22, 'not tracked yet', { size: 18, fill: C.muted, anchor: 'middle' });
  // 7-day rolling average over tracked days (needs 3+ of the last 7)
  const pts = []; days.forEach((d, i) => { const win = days.slice(Math.max(0, i - 6), i + 1).filter((x) => x.visits != null); if (d.visits != null && win.length >= 3) pts.push([ax.cx(i), Yv(sum(win, (x) => x.visits) / win.length)]); else if (pts.length && pts[pts.length - 1] !== null) pts.push(null); });
  const runs = []; let cur = []; for (const p of pts) { if (p) cur.push(p); else { if (cur.length) runs.push(cur); cur = []; } } if (cur.length) runs.push(cur);
  for (const r of runs) { if (r.length === 1) out.push(`<circle cx="${r[0][0]}" cy="${r[0][1]}" r="4" fill="${C.text}"/>`); else out.push(`<polyline points="${r.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${C.text}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`); }
  dateLabels(ax, plotY + plotH + 30);
  y = cy + ch + 80;
}

// Two small 30-day trends: pageviews per day, signed-in users (running total)
{
  y += 16; const w2 = (IN - 16) / 2, h = 230;
  const mini = (x, title, vals, fmtLast, col, step) => {
    card(x, y, w2, h); t(x + 22, y + 40, title, { size: 22, weight: 700 });
    const known = vals.filter((v) => v != null), last = [...vals].reverse().find((v) => v != null);
    t(x + w2 - 22, y + 40, last == null ? '–' : fmtLast(last), { size: 22, weight: 700, fill: col, anchor: 'end' });
    const px = x + 22, pw = w2 - 44, py = y + 66, ph = h - 66 - 44, ax = axis(px, pw), max = Math.max(1, ...known) * 1.15, Yv = (v) => py + ph - (ph * v) / max;
    sundays(ax, py, ph); out.push(`<line x1="${px}" x2="${px + pw}" y1="${py + ph}" y2="${py + ph}" stroke="${C.line}"/>`);
    if (!known.length) { t(px + pw / 2, py + ph / 2, 'No data yet', { size: 18, fill: C.muted, anchor: 'middle' }); }
    let seg = [];
    const flush = () => { if (!seg.length) return; if (seg.length === 1) out.push(`<circle cx="${seg[0][0]}" cy="${seg[0][1]}" r="4" fill="${col}"/>`); else { const pts = step ? seg.flatMap((p, i) => (i ? [[p[0], seg[i - 1][1]], p] : [p])) : seg; out.push(`<path d="M${pts[0][0]},${py + ph} ${pts.map((p) => 'L' + p.join(',')).join(' ')} L${pts[pts.length - 1][0]},${py + ph} Z" fill="${col}" opacity="0.18"/><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round"/>`); } seg = []; };
    vals.forEach((v, i) => { if (v == null) flush(); else seg.push([ax.cx(i), Yv(v)]); }); flush();
    t(px, y + h - 14, fmtD(days[0].day), { size: 16, fill: C.muted }); t(px + pw, y + h - 14, fmtD(day), { size: 16, fill: C.muted, anchor: 'end' });
  };
  mini(PAD, 'Pageviews per day', days.map((d) => d.pageviews), (v) => n(v), C.accent, false);
  const users = days.map((d) => (d.day === day && P ? P.users.total : d.h && d.h.users_total !== '' && d.h.users_total != null ? +d.h.users_total : d.j && d.j.product ? d.j.product.users.total : null));
  mini(PAD + w2 + 16, 'Signed-in users', users, (v) => `${n(v)} total`, C.gold, true);
  y += h;
}

// Pages heatmap: which pages got views on which days
{
  const tally = new Map();
  days.forEach((d, i) => { for (const p of (d.j && d.j.traffic && d.j.traffic.yesterday && d.j.traffic.yesterday.topPages) || []) { const r = tally.get(p.path) || { path: p.path, total: 0, by: {} }; r.total += p.views; r.by[i] = p.views; tally.set(p.path, r); } });
  const rows = [...tally.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  section('Pages · last 30 days', 'views per day');
  const rh = 34, h = 40 + Math.max(1, rows.length) * rh + 50, cy = y + 16; card(PAD, cy, IN, h);
  const lx = PAD + 22, gx = PAD + 300, gw = IN - 300 - 80, ax = axis(gx, gw), max = Math.max(1, ...rows.flatMap((r) => Object.values(r.by)));
  const pgn = (p) => (p === '/' ? 'Home' : p.replace(/^\/|\/$/g, ''));
  if (!rows.length) t(lx, cy + 70, 'No page data yet', { size: 20, fill: C.muted });
  rows.forEach((r, ri) => {
    const ry = cy + 28 + ri * rh;
    t(lx, ry + 23, clip(pgn(r.path), 25), { size: 19 });
    days.forEach((d, i) => {
      const v = r.by[i], has = d.j && d.j.traffic;
      out.push(`<rect x="${ax.x(i) + 1.5}" y="${ry + 4}" width="${ax.bw - 3}" height="${rh - 8}" rx="4" fill="${!has ? C.ghost : v ? mix('#16403c', C.accent, Math.sqrt(v / max)) : C.bg}"${!has ? ' opacity="0.5"' : ''}/>`);
    });
    t(PAD + IN - 22, ry + 23, n(r.total), { size: 19, weight: 700, anchor: 'end' });
  });
  dateLabels(ax, cy + h - 16);
  y = cy + h;
}

// Bar list helper: rows of label / bar / value, single hue.
function barList(x, yy, w, title, rows, unit) {
  const rh = 46, h = 64 + Math.max(1, rows.length) * rh + 12; card(x, yy, w, h);
  t(x + 22, yy + 42, title, { size: 22, weight: 700 });
  if (unit) t(x + w - 22, yy + 42, unit, { size: 18, fill: C.muted, anchor: 'end' });
  if (!rows.length) { t(x + 22, yy + 96, 'No data yet', { size: 20, fill: C.muted }); return h; }
  const max = Math.max(...rows.map((r) => r.v), 1), lw = w * 0.56, bx = x + 22 + lw, bwid = w - 44 - lw - 70;
  rows.forEach((r, i) => {
    const ry = yy + 64 + i * rh;
    t(x + 22, ry + 29, clip(r.label, Math.floor((lw - 12) / 10.6)), { size: 20 });
    out.push(`<rect x="${bx}" y="${ry + 12}" width="${bwid}" height="22" rx="4" fill="${C.bg}"/>`);
    out.push(`<rect x="${bx}" y="${ry + 12}" width="${Math.max(r.v ? 6 : 0, (bwid * r.v) / max)}" height="22" rx="4" fill="${i === 0 ? C.accent : C.accentDim}"/>`);
    t(x + w - 22, ry + 30, n(r.v), { size: 20, weight: 700, anchor: 'end' });
  });
  return h;
}
const pair = (a, b) => { const w2 = (IN - 16) / 2; const h1 = barList(PAD, y + 16, w2, ...a); const h2 = barList(PAD + w2 + 16, y + 16, w2, ...b); y += 16 + Math.max(h1, h2); };

// Sources
const cats = {}; for (const r of W.referrers || []) { const k = kind(r.host); if (k && r.visits) cats[k] = (cats[k] || 0) + r.visits; }
section('Where visitors come from', 'last 7 days · visits');
pair(
  ['By source', Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, v }))],
  ['Top referrers', (W.referrers || []).filter((r) => r.visits && r.host !== '(direct)' && !self.test(r.host)).slice(0, 6).map((r) => ({ label: r.host.replace(/^www\./, ''), v: r.visits }))],
);
const refPages = (W.referrerPages || []).filter((r) => !self.test(r.url.split('/')[0]) && /\/[^/]/.test(r.url)).slice(0, 5);
if (refPages.length) { y += 16; y += barList(PAD, y, IN, 'Links people clicked to get here', refPages.map((r) => ({ label: r.url.replace(/^www\./, ''), v: r.visits }))); }

// Pages
const pg = (p) => (p === '/' ? 'Home' : p.replace(/^\/|\/$/g, ''));
section('What they looked at', 'last 7 days');
pair(
  ['Top pages', (W.topPages || []).slice(0, 7).map((p) => ({ label: pg(p.path), v: p.views })), 'views'],
  ['Landing pages', (W.landingPages || (W.topPages || []).filter((p) => p.visits)).slice(0, 7).map((p) => ({ label: pg(p.path), v: p.visits })), 'visits'],
);

// Audience
section('Who they are', 'last 7 days · visits');
pair(
  ['Countries', (W.countries || []).slice(0, 6).map((c) => ({ label: country(c.country), v: c.visits }))],
  ['Devices', (W.devices || []).map((d) => ({ label: d.type[0].toUpperCase() + d.type.slice(1), v: d.visits }))],
);
const UA = { ChromeMobile: 'Chrome (phone)', MobileSafari: 'Safari (phone)', ChromeDerivative: 'Chrome-based', MacOSX: 'macOS', FirefoxMobile: 'Firefox (phone)', SamsungBrowser: 'Samsung Internet', EdgeMobile: 'Edge (phone)' };
const ua = (x) => UA[x] || x;
if (W.browsers || W.os) pair(['Browsers', (W.browsers || []).slice(0, 5).map((b) => ({ label: ua(b.name), v: b.visits }))], ['Operating systems', (W.os || []).slice(0, 5).map((b) => ({ label: ua(b.name), v: b.visits }))]);

// Product
section('Product', 'all-time total · new yesterday');
const sum2 = (o) => ({ total: (o.nfl.total || 0) + (o.nba.total || 0), yesterday: (o.nfl.yesterday || 0) + (o.nba.yesterday || 0) });
const prod = P ? [['Users', P.users], ['Groups', sum2(P.groups)], ['Group members', P.groupMembers], ['Brackets', sum2(P.brackets)], ['Chat messages', P.chatMessages], ['Saved scenarios', P.savedScenarios], ['Emails sent', P.emailsSent]] : [];
if (!prod.length) { y += 16; card(PAD, y, IN, 80); t(PAD + 22, y + 50, 'No product numbers (Supabase key missing)', { size: 20, fill: C.muted }); y += 80; }
const pw = (IN - 3 * 16) / 4, ph = 120;
prod.forEach(([label, v], i) => {
  const x = PAD + (i % 4) * (pw + 16), yy = y + 16 + Math.floor(i / 4) * (ph + 16); card(x, yy, pw, ph);
  t(x + 20, yy + 36, label, { size: 19, fill: C.muted, weight: 600 });
  t(x + 20, yy + 88, n(v.total), { size: 40, weight: 700 });
  if (v.yesterday) t(x + pw - 20, yy + 88, `+${n(v.yesterday)}`, { size: 24, weight: 700, fill: C.accent, anchor: 'end' });
});
if (prod.length) y += 16 + Math.ceil(prod.length / 4) * (ph + 16) - 16;

// Footer
y += 50;
const notes = (S.notes || []).join(' · ');
t(PAD, y, clip(notes ? `Notes: ${notes}` : 'Traffic: Cloudflare Web Analytics (bots excluded). Product: Supabase. Times: US Central.', 90), { size: 18, fill: notes ? C.gold : C.muted });
y += 36;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${y}" viewBox="0 0 ${Wd} ${y}" font-family="Inter"><rect width="100%" height="100%" fill="${C.bg}"/>${out.join('')}</svg>`;
const fontDir = new URL('./fonts/', import.meta.url).pathname;
const png = new Resvg(svg, { font: { fontFiles: fs.readdirSync(fontDir).map((f) => path.join(fontDir, f)), loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: Wd } }).render().asPng();
fs.mkdirSync(path.join(dir, 'charts'), { recursive: true });
fs.writeFileSync(path.join(dir, 'charts', `${day}.png`), png);
fs.writeFileSync(path.join(dir, 'latest.png'), png);
if (process.env.SVG_OUT) fs.writeFileSync(process.env.SVG_OUT, svg);
console.log(`chart: ${path.join(dir, 'charts', `${day}.png`)} (${Wd}x${y})`);
