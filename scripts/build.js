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

const trades = JSON.parse(fs.readFileSync(new URL('data/pick_trades.json', root), 'utf8'))[String(SEASON + 1)] || { traded: [], conditional: [] };

const config = {
  siteName: process.env.SITE_NAME || 'clinch',
  siteUrl: process.env.SITE_URL || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
};

const data = { season: SEASON, built: new Date().toISOString(), games, trades };
const engine = fs.readFileSync(new URL('engine/engine.js', root), 'utf8').replace(/^export /gm, '');
let html = fs.readFileSync(new URL('web/template.html', root), 'utf8');
html = html
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__DATA__*/', () => JSON.stringify(data))
  .replace('/*__CONFIG__*/', () => JSON.stringify(config));

const outDir = new URL('public/', root);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(new URL('index.html', outDir), html);
// 404 -> app shell, so share links like /s/abc123 resolve on static hosting
fs.writeFileSync(new URL('404.html', outDir), html);
fs.writeFileSync(new URL('robots.txt', outDir), `User-agent: *\nAllow: /\n${config.siteUrl ? `Sitemap: ${config.siteUrl}/sitemap.xml\n` : ''}`);
if (config.siteUrl) {
  fs.writeFileSync(new URL('sitemap.xml', outDir), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.siteUrl}/</loc><lastmod>${data.built.slice(0, 10)}</lastmod><changefreq>hourly</changefreq></url></urlset>\n`);
  fs.writeFileSync(new URL('CNAME', outDir), new URL(config.siteUrl).host + '\n');
}
const final = games.filter((g) => g[4] !== null).length;
console.log(`built ${SEASON} season: ${games.length} games, ${final} final, ${trades.traded.length + trades.conditional.length} pick trades, accounts ${config.supabaseUrl ? 'ON' : 'off (no Supabase configured)'}`);
