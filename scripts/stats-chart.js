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

// Daily series: prefer Cloudflare's 30-day series, fill gaps from history.csv.
const series = new Map();
try {
  const [head, ...rows] = fs.readFileSync(path.join(dir, 'history.csv'), 'utf8').trim().split('\n');
  const k = head.split(',');
  for (const r of rows) { const o = Object.fromEntries(r.split(',').map((v, i) => [k[i], v])); if (o.visits !== '') series.set(o.day, { day: o.day, visits: +o.visits, pageviews: +o.pageviews }); }
} catch { /* no history yet */ }
for (const x of S.series || []) series.set(x.day, x);
if (Y.visits != null) series.set(day, { day, visits: Y.visits, pageviews: Y.pageviews });
const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const days = []; for (let i = 29; i >= 0; i--) { const d = addDays(day, -i); days.push(series.get(d) || { day: d, visits: null, pageviews: null }); }
const firstData = days.findIndex((d) => d.visits != null);
const shown = days.slice(Math.max(0, Math.min(firstData, 23))); // at least 7 bars

// Palette (site colors)
const C = { bg: '#0f1422', surface: '#182033', line: '#2c3854', text: '#eaf0fb', muted: '#8693b0', accent: '#35e3bf', accentDim: '#1f6e60', coral: '#ff6f8e', gold: '#ffc861' };
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

// KPI tiles
const sameDayLastWeek = series.get(addDays(day, -7));
const wk = 'vs last ' + new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const tiles = [
  { label: 'Visits', value: n(Y.visits), delta: sameDayLastWeek ? pct(Y.visits, sameDayLastWeek.visits) : null, note: sameDayLastWeek ? wk : 'yesterday' },
  { label: 'Pageviews', value: n(Y.pageviews), delta: sameDayLastWeek ? pct(Y.pageviews, sameDayLastWeek.pageviews) : null, note: sameDayLastWeek ? wk : Y.visits ? `${(Y.pageviews / Y.visits).toFixed(1)} per visit` : 'yesterday' },
  { label: 'Visits · 7 days', value: n(W.visits), delta: P7.visits ? pct(W.visits, P7.visits) : null, note: P7.visits ? 'vs prior 7d' : 'first week tracked' },
  { label: 'Signed-in users', value: n(P && P.users.total), delta: null, note: P ? `+${P.users.yesterday} yesterday` : 'no data' },
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

// Visits per day
section('Visits per day', `last ${shown.length} days`);
const ch = 260, cx = PAD, cy = y + 16, cw = IN; card(cx, cy, cw, ch + 70);
const vmax = Math.max(4, ...shown.map((d) => d.visits || 0)); const nice = Math.ceil(vmax / 4) * 4;
const plotX = cx + 64, plotW = cw - 64 - 24, plotY = cy + 30, plotH = ch - 30;
for (let g = 0; g <= 4; g++) { const gy = plotY + plotH - (plotH * g) / 4; out.push(`<line x1="${plotX}" x2="${plotX + plotW}" y1="${gy}" y2="${gy}" stroke="${C.line}" stroke-width="1"/>`); t(plotX - 12, gy + 7, n((nice * g) / 4), { size: 18, fill: C.muted, anchor: 'end' }); }
const bw = plotW / shown.length, bar = Math.max(6, Math.min(40, bw - 6));
shown.forEach((d, i) => {
  const bx = plotX + i * bw + (bw - bar) / 2;
  if (d.visits != null) {
    const h = Math.max(d.visits ? 4 : 0, (plotH * d.visits) / nice), last = i === shown.length - 1;
    out.push(`<path d="M${bx},${plotY + plotH} v${-(h - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${h - 4} z" fill="${last ? C.accent : C.accentDim}"/>`);
    if (last || d.visits === Math.max(...shown.map((s) => s.visits || 0))) t(bx + bar / 2, plotY + plotH - h - 10, n(d.visits), { size: 20, weight: 700, anchor: 'middle', fill: last ? C.accent : C.text });
  }
  const dd = new Date(`${d.day}T12:00:00Z`);
  if (i === shown.length - 1 || (shown.length - 1 - i) % 7 === 0) t(bx + bar / 2, plotY + plotH + 32, dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), { size: 18, fill: C.muted, anchor: 'middle' });
});
y = cy + ch + 70;

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
const SEARCH = /google|bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|search/i, SOCIAL = /reddit|t\.co$|twitter|x\.com|facebook|fb\.|instagram|tiktok|threads|bsky|discord|linkedin|youtube|messenger|whatsapp|telegram|slack/i;
const self = /clinchscenarios\.com$/i;
const kind = (h) => (h === '(direct)' ? 'Direct / apps' : self.test(h) ? null : /reddit/i.test(h) ? 'Reddit' : SEARCH.test(h) ? 'Search' : SOCIAL.test(h) ? 'Social' : 'Other sites');
const cats = {}; for (const r of W.referrers || []) { const k = kind(r.host); if (k && r.visits) cats[k] = (cats[k] || 0) + r.visits; }
section('Where visitors come from', 'last 7 days · visits');
pair(
  ['By source', Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, v }))],
  ['Top referrers', (W.referrers || []).filter((r) => r.visits && r.host !== '(direct)' && !self.test(r.host)).slice(0, 6).map((r) => ({ label: r.host.replace(/^www\./, ''), v: r.visits }))],
);
const refPages = (W.referrerPages || []).filter((r) => !self.test(r.url.split('/')[0])).slice(0, 5);
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
if (W.browsers || W.os) pair(['Browsers', (W.browsers || []).slice(0, 5).map((b) => ({ label: b.name, v: b.visits }))], ['Operating systems', (W.os || []).slice(0, 5).map((b) => ({ label: b.name, v: b.visits }))]);

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
