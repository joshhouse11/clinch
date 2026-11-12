// Runs a built page in a simulated browser (jsdom) and writes a finished copy of every route it exposes
// (window.__clinch.paths()), each with its own title, description, canonical URL and pre-filled content.
import fs from 'node:fs';

export async function prerender({ html, config, url, outDir, seoTags, escA, label }) {
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const snapHtml = html.replace('<script type="module">', '<script>').replace(JSON.stringify(config), JSON.stringify({ ...config, supabaseUrl: '', supabaseAnonKey: '' }));
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => console.warn(`prerender ${label}:`, e.message));
  const dom = new JSDOM(snapHtml, { url: (url || 'https://localhost') + '/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const W = dom.window;
  for (let i = 0; i < 300 && !(W.__clinch && W.__clinch.ready()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!W.__clinch || !W.__clinch.ready()) throw new Error(`Pre-render ${label}: the app never finished its simulation`);
  const paths = W.__clinch.paths();
  const swap = (h, re, v, optional) => { if (!re.test(h)) { if (optional) return h; throw new Error(`Pre-render ${label} marker missing: ${re}`); } return h.replace(re, () => v); };
  for (const pth of paths) {
    const s = W.__clinch.snap(pth), m = s.m;
    let page = html;
    page = swap(page, /<title>[^<]*<\/title>/, `<title>${escA(m.title)}</title>`);
    page = swap(page, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escA(m.desc)}">`);
    page = swap(page, /<!--__SEO__-->/, seoTags(m));
    page = swap(page, /<div id="view"><\/div>/, `<div id="view">${s.view}</div>`);
    page = swap(page, /<h1 class="pageh1" id="pageH1"><\/h1>/, `<h1 class="pageh1" id="pageH1">${escA(m.h1)}</h1>`);
    page = swap(page, /<p class="pagesum" id="pageSum"><\/p>/, `<p class="pagesum" id="pageSum">${escA(m.sum)}</p>`);
    page = swap(page, /<nav class="sf-teams" id="sfTeams" aria-label="([^"]*)"><\/nav>/, `<nav class="sf-teams" id="sfTeams" aria-label="${label} team playoff pages">${s.foot}</nav>`);
    page = swap(page, /(<nav class="tabs" role="tablist" aria-label="[^"]*">)[\s\S]*?<\/nav>/, `<nav class="tabs" role="tablist" aria-label="${label} sections">${s.tabs}</nav>`);
    if (/\/teams\/[a-z0-9-]+\/$/.test(pth)) page = swap(page, /<div class="teams" id="teams" aria-label="Pick your team"><\/div>/, `<div class="teams" id="teams" aria-label="Pick your team">${s.teams}</div>`);
    const dir = new URL('.' + pth, outDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(new URL('index.html', dir), page);
  }
  W.close();
  return paths;
}
