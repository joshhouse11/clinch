// Builds the NBA section: /nba/, /nba/playoff-odds/, /nba/draft-lottery/, /nba/teams/<team>/.
import fs from 'node:fs';
import { parseCSV } from '../engine/data.js';
import { nbaContext, NBA_TEAMS } from '../engine/nba.js';

export async function buildNBA({ root, outDir, config, url, seoTags, escA, V, prerender }) {
  const dir = new URL('data/nba/', root);
  const seasons = fs.readdirSync(dir).map((f) => (f.match(/^games_(\d{4})\.csv$/) || [])[1]).filter(Boolean).map(Number).sort();
  const season = seasons.at(-1);
  const load = (y) => parseCSV(fs.readFileSync(new URL(`games_${y}.csv`, dir), 'utf8'));
  const rows = load(season);
  // last season's point differential per game, used as a prior for team strength early in the season
  const prior = {};
  if (seasons.includes(season - 1)) {
    const pc = nbaContext(load(season - 1));
    for (const t of NBA_TEAMS) {
      let pd = 0, gp = 0;
      for (const g of pc.games) if (g.played) { const ti = NBA_TEAMS.indexOf(t); if (g.h === ti) { pd += g.hs - g.as; gp++; } if (g.a === ti) { pd += g.as - g.hs; gp++; } }
      prior[t] = gp ? +(pd / gp).toFixed(2) : 0;
    }
  }
  const games = rows.filter((r) => r.type === '2' && !/championship/i.test(r.note || '')).map((r) => [r.id, r.when, r.date, r.home, r.away, r.final === '1' ? +r.hs : null, r.final === '1' ? +r.as : null, r.final]);
  const teams = JSON.parse(fs.readFileSync(new URL('teams.json', dir), 'utf8'));
  const data = { season, built: new Date().toISOString(), games, prior, teams };
  const nflTpl = fs.readFileSync(new URL('web/template.html', root), 'utf8');
  const css = nflTpl.slice(nflTpl.indexOf('<style>') + 7, nflTpl.indexOf('</style>'));
  const engine = fs.readFileSync(new URL('engine/nba.js', root), 'utf8').replace(/^export /gm, '');
  let html = fs.readFileSync(new URL('web/nba.html', root), 'utf8')
    .replace('/*__CSS__*/', () => css)
    .replace('/*__ENGINE__*/', () => engine)
    .replace('/*__DATA__*/', () => JSON.stringify(data))
    .replace('/*__CONFIG__*/', () => JSON.stringify({ siteUrl: config.siteUrl }))
    .replace('/*__APP__*/', () => fs.readFileSync(new URL('web/nba.js', root), 'utf8'));
  html = html.replace('href="/favicon.svg"', `href="/favicon.svg?v=${V.svg}"`).replace('href="/favicon-32.png"', `href="/favicon-32.png?v=${V.png}"`).replace('href="/apple-touch-icon.png"', `href="/apple-touch-icon.png?v=${V.touch}"`);
  if (config.analytics && url && !process.env.LOCAL_PREVIEW) html = html.replace('</head>', `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${config.analytics}", "spa": true}'></script>\n</head>`);
  const paths = await prerender({ html, config: { siteUrl: config.siteUrl }, url, outDir, seoTags, escA, label: 'NBA' });
  console.log(`built NBA ${season - 1}-${String(season).slice(2)}: ${games.length} games, ${games.filter((g) => g[7] === '1').length} final`);
  return paths;
}
