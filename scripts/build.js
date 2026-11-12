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
const url = config.siteUrl || '';
const seo = url ? [
  `<link rel="canonical" href="${url}/">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="Clinch">`,
  `<meta property="og:title" content="Clinch · NFL playoff scenarios, odds & tiebreakers">`,
  `<meta property="og:description" content="Pick every game. See who clinches, who tanks, and why.">`,
  `<meta property="og:url" content="${url}/">`,
  `<meta property="og:image" content="${url}/og.png">`,
  `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:image" content="${url}/og.png">`,
].join('\n') : '';
html = html.replace('<!--__SEO__-->', () => seo);

const outDir = new URL('public/', root);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(new URL('index.html', outDir), html);
for (const f of fs.readdirSync(new URL('web/assets/', root))) fs.copyFileSync(new URL('web/assets/' + f, root), new URL(f, outDir));
fs.writeFileSync(new URL('site.webmanifest', outDir), JSON.stringify({ name: 'Clinch', short_name: 'Clinch', start_url: '/', display: 'standalone', background_color: '#0f1422', theme_color: '#0f1422', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
// 404 -> app shell, so share links like /s/abc123 resolve on static hosting
fs.writeFileSync(new URL('404.html', outDir), html);
fs.writeFileSync(new URL('robots.txt', outDir), `User-agent: *\nAllow: /\n${config.siteUrl ? `Sitemap: ${config.siteUrl}/sitemap.xml\n` : ''}`);
if (config.siteUrl) {
  fs.writeFileSync(new URL('sitemap.xml', outDir), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.siteUrl}/</loc><lastmod>${data.built.slice(0, 10)}</lastmod><changefreq>hourly</changefreq></url></urlset>\n`);
  fs.writeFileSync(new URL('CNAME', outDir), new URL(config.siteUrl).host + '\n');
}
const final = games.filter((g) => g[4] !== null).length;
console.log(`built ${SEASON} season: ${games.length} games, ${final} final, ${trades.traded.length + trades.conditional.length} pick trades, accounts ${config.supabaseUrl ? 'ON' : 'off (no Supabase configured)'}`);
