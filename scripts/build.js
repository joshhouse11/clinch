// Build the site into public/: inline the engine, the current season's games, pick trades and settings.
// Settings come from environment variables (GitHub Actions variables/secrets in production):
//   SITE_NAME, SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY
import fs from 'node:fs';
import { loadGames } from '../engine/data.js';

const root = new URL('../', import.meta.url);
const all = loadGames();

// Current season = the latest season with a regular-season schedule (nflverse adds the next one in May).
const SEASON = +(process.env.SEASON || Math.max(...all.filter((r) => r.game_type === 'REG').map((r) => +r.season)));
const rows = all.filter((r) => +r.season === SEASON && r.game_type === 'REG');
if (rows.length < 250) throw new Error(`Season ${SEASON} has only ${rows.length} games; refusing to build.`);

const num = (v) => (v === '' || v == null ? null : +v);
const games = rows.map((r) => [r.game_id, +r.week, r.away_team, r.home_team, num(r.away_score), num(r.home_score), num(r.spread_line), r.gameday, r.gametime]);

// Real postseason results (once the playoffs start): [round, away, home, away_score, home_score]
const post = all.filter((r) => +r.season === SEASON && ['WC', 'DIV', 'CON', 'SB'].includes(r.game_type)).map((r) => [r.game_type, r.away_team, r.home_team, num(r.away_score), num(r.home_score)]);
const trades = JSON.parse(fs.readFileSync(new URL('data/pick_trades.json', root), 'utf8'))[String(SEASON + 1)] || { traded: [], conditional: [] };

const site = fs.existsSync(new URL('data/site.json', root)) ? JSON.parse(fs.readFileSync(new URL('data/site.json', root), 'utf8')) : {};
const setting = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : site[k] ?? d);
const config = {
  siteName: setting('SITE_NAME', 'clinch'),
  siteUrl: setting('SITE_URL'),
  supabaseUrl: setting('SUPABASE_URL'),
  supabaseAnonKey: setting('SUPABASE_ANON_KEY'),
  providers: String(setting('AUTH_PROVIDERS', 'google')).split(',').map((x) => x.trim()).filter(Boolean),
};
if (process.env.LOCAL_PREVIEW) { config.supabaseUrl = ''; config.supabaseAnonKey = ''; }

const data = { season: SEASON, built: new Date().toISOString(), games, post, trades };
const engine = fs.readFileSync(new URL('engine/engine.js', root), 'utf8').replace(/^export /gm, '');
let html = fs.readFileSync(new URL('web/template.html', root), 'utf8');
html = html
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__DATA__*/', () => JSON.stringify(data))
  .replace('/*__CONFIG__*/', () => JSON.stringify(config));
// Versioned icon/image URLs (content hash) so browsers and link previews pick up logo changes instead of cached copies.
import crypto from 'node:crypto';
const ver = (f) => crypto.createHash('md5').update(fs.readFileSync(new URL('web/assets/' + f, root))).digest('hex').slice(0, 8);
const V = { svg: ver('favicon.svg'), png: ver('favicon-32.png'), touch: ver('apple-touch-icon.png'), og: ver('og.png') };
html = html.replace('href="/favicon.svg"', `href="/favicon.svg?v=${V.svg}"`).replace('href="/favicon-32.png"', `href="/favicon-32.png?v=${V.png}"`).replace('href="/apple-touch-icon.png"', `href="/apple-touch-icon.png?v=${V.touch}"`);
const url = config.siteUrl || '';
const escA = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const seoTags = (m) => url ? [
  `<link rel="canonical" href="${url}${m.path}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="Clinch">`,
  `<meta property="og:title" content="${escA(m.title)}">`,
  `<meta property="og:description" content="${escA(m.desc)}">`,
  `<meta property="og:url" content="${url}${m.path}">`,
  `<meta property="og:image" content="${url}/og.png?v=${V.og}">`,
  `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:image" content="${url}/og.png?v=${V.og}">`,
  `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: m.title, description: m.desc, url: url + m.path,
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Clinch', item: url + '/' },
      ...(m.path === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: 'NFL', item: url + '/nfl/playoff-scenarios/' }]),
      ...(m.path.startsWith('/nfl/') && m.path !== '/nfl/playoff-scenarios/' ? [{ '@type': 'ListItem', position: 3, name: m.h1, item: url + m.path }] : []),
    ] },
  }).replace(/</g, '\\u003c')}</script>`,
].join('\n') : '';

const outDir = new URL('public/', root);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(new URL('web/assets/', root))) fs.copyFileSync(new URL('web/assets/' + f, root), new URL(f, outDir));
fs.writeFileSync(new URL('site.webmanifest', outDir), JSON.stringify({ name: 'Clinch', short_name: 'Clinch', start_url: '/', display: 'standalone', background_color: '#0f1422', theme_color: '#0f1422', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
// 404 -> app shell (not indexed), so unknown paths and old share links still open the app
fs.writeFileSync(new URL('404.html', outDir), html.replace('<!--__SEO__-->', '<meta name="robots" content="noindex">'));

// Pre-render every page (home, each section, 32 teams) so search engines get real content without running JavaScript.
// The app runs once in a simulated browser; each page's finished HTML is written to its own folder.
const { JSDOM, VirtualConsole } = await import('jsdom');
const snapHtml = html.replace('<script type="module">', '<script>').replace(JSON.stringify(config), JSON.stringify({ ...config, supabaseUrl: '', supabaseAnonKey: '' }));
const vc = new VirtualConsole(); vc.on('jsdomError', (e) => console.warn('prerender:', e.message));
const dom = new JSDOM(snapHtml, { url: (url || 'https://localhost') + '/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
const W = dom.window;
for (let i = 0; i < 300 && !(W.__clinch && W.__clinch.ready()); i++) await new Promise((r) => setTimeout(r, 100));
if (!W.__clinch || !W.__clinch.ready()) throw new Error('Pre-render: the app never finished its odds simulation');
const paths = W.__clinch.paths();
const swap = (h, re, v) => { if (!re.test(h)) throw new Error('Pre-render marker missing: ' + re); return h.replace(re, () => v); };
for (const pth of paths) {
  const s = W.__clinch.snap(pth), m = s.m;
  let page = html;
  page = swap(page, /<title>[^<]*<\/title>/, `<title>${escA(m.title)}</title>`);
  page = swap(page, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escA(m.desc)}">`);
  page = swap(page, /<!--__SEO__-->/, seoTags(m));
  page = swap(page, /<div id="view"><\/div>/, `<div id="view">${s.view}</div>`);
  page = swap(page, /<h1 class="pageh1" id="pageH1"><\/h1>/, `<h1 class="pageh1" id="pageH1">${escA(m.h1)}</h1>`);
  page = swap(page, /<p class="pagesum" id="pageSum"><\/p>/, `<p class="pagesum" id="pageSum">${escA(m.sum)}</p>`);
  page = swap(page, /<nav class="sf-teams" id="sfTeams" aria-label="NFL team playoff pages"><\/nav>/, `<nav class="sf-teams" id="sfTeams" aria-label="NFL team playoff pages">${s.foot}</nav>`);
  page = swap(page, /<nav class="tabs" role="tablist" aria-label="NFL sections">[\s\S]*?<\/nav>/, `<nav class="tabs" role="tablist" aria-label="NFL sections">${s.tabs}</nav>`);
  if (pth.startsWith('/nfl/teams/')) page = swap(page, /<div class="teams" id="teams" aria-label="Pick your team"><\/div>/, `<div class="teams" id="teams" aria-label="Pick your team">${s.teams}</div>`);
  const dir = new URL('.' + pth, outDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(new URL('index.html', dir), page);
}
W.close();

fs.writeFileSync(new URL('robots.txt', outDir), `User-agent: *\nAllow: /\n${url ? `Sitemap: ${url}/sitemap.xml\n` : ''}`);
if (url) {
  const day = data.built.slice(0, 10);
  fs.writeFileSync(new URL('sitemap.xml', outDir), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `<url><loc>${url}${p}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq><priority>${p === '/' ? '1.0' : p.startsWith('/nfl/teams/') ? '0.8' : '0.9'}</priority></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(new URL('CNAME', outDir), new URL(url).host + '\n');
}
console.log(`pre-rendered ${paths.length} pages`);
const final = games.filter((g) => g[4] !== null).length;
console.log(`built ${SEASON} season: ${games.length} games, ${final} final, ${trades.traded.length + trades.conditional.length} pick trades, accounts ${config.supabaseUrl ? 'ON' : 'off (no Supabase configured)'}`);
