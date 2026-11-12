// Download the latest schedule, scores and betting lines from nflverse (open data, updated through game days).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const URL_GAMES = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const out = new URL('../data/games.csv', import.meta.url);

async function download(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    // some environments route HTTPS through a proxy that Node's fetch ignores; curl honors it
    return execFileSync('curl', ['-sSfL', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
}

const text = await download(URL_GAMES);
const lines = text.trim().split('\n');
if (!lines[0].startsWith('game_id,season') || lines.length < 5000) {
  console.error('Downloaded games.csv looks wrong; keeping the previous copy.');
  process.exit(1);
}
const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
fs.writeFileSync(out, text);
console.log(`games.csv: ${lines.length - 1} games${prev === text ? ' (no change)' : ' (updated)'}`);

// Trade log (used only to flag pick trades our own file might be missing; it lags and lacks conditions).
try {
  const tr = await download('https://raw.githubusercontent.com/nflverse/nfldata/master/data/trades.csv');
  if (tr.startsWith('trade_id,')) fs.writeFileSync(new URL('../data/trades.csv', import.meta.url), tr);
} catch (err) { console.warn('trades.csv download failed:', err.message); }
