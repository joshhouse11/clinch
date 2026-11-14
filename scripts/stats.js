// Daily numbers for the Clinch debrief: yesterday's traffic (Cloudflare Web Analytics) and product activity (Supabase).
// Needs CF_API_TOKEN (read-only "Account Analytics") and SUPABASE_SERVICE_ROLE_KEY. Missing either: that half is skipped.
// Writes stats/YYYY-MM-DD.json and appends stats/history.csv (committed to the "stats" branch by the workflow).
import fs from 'node:fs';

const site = JSON.parse(fs.readFileSync(new URL('../data/site.json', import.meta.url), 'utf8'));
const CF = (process.env.CF_API_TOKEN || '').trim();
const ACCOUNT = process.env.CF_ACCOUNT_ID || '6521c7bf6013d90381085078813d4d4c';
const HOST = (site.SITE_URL || 'https://clinchscenarios.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// "Yesterday" in US Central time, as UTC bounds.
const tz = 'America/Chicago';
const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = fmt(new Date());
const day = fmt(new Date(Date.now() - 864e5));
const offsetH = (() => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName').value; return -parseInt(p.replace('GMT', '') || '0', 10); })();
const startOf = (d, back = 0) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCHours(t.getUTCHours() + offsetH); t.setUTCDate(t.getUTCDate() - back); return t; };
const out = { day, generated: new Date().toISOString(), traffic: null, product: null, notes: [] };

async function cf(query, variables) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${CF}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join('; '));
  return j.data.viewer.accounts[0];
}
const RUM = `query($a: String!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) { viewer { accounts(filter: { accountTag: $a }) {
  total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $f) { count sum { visits } }
  pages: rumPageloadEventsAdaptiveGroups(limit: 15, filter: $f, orderBy: [count_DESC]) { count sum { visits } dimensions { requestPath } }
  refs: rumPageloadEventsAdaptiveGroups(limit: 10, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
  countries: rumPageloadEventsAdaptiveGroups(limit: 6, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
  devices: rumPageloadEventsAdaptiveGroups(limit: 4, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType } }
} } }`;
async function traffic(fromBack, toBack) {
  const f = { AND: [{ datetime_geq: startOf(day, fromBack).toISOString(), datetime_lt: startOf(today, toBack).toISOString() }, { requestHost: HOST }, { bot: 0 }] };
  const a = await cf(RUM, { a: ACCOUNT, f });
  const t = a.total[0] || { count: 0, sum: { visits: 0 } };
  return {
    pageviews: t.count, visits: t.sum.visits,
    topPages: a.pages.map((x) => ({ path: x.dimensions.requestPath, views: x.count, visits: x.sum.visits })),
    referrers: a.refs.map((x) => ({ host: x.dimensions.refererHost || '(direct)', visits: x.sum.visits })),
    countries: a.countries.map((x) => ({ country: x.dimensions.countryName, visits: x.sum.visits })),
    devices: a.devices.map((x) => ({ type: x.dimensions.deviceType, visits: x.sum.visits })),
  };
}

if (CF) {
  try {
    out.traffic = { yesterday: await traffic(0, 0), last7: await traffic(6, 0), prior7: await traffic(13, 7) };
  } catch (e) { out.notes.push(`Cloudflare: ${e.message}`); }
  // Extras for the chart: a daily series (up to 30 days), referrer pages, browsers, OS. Optional: failures only add a note.
  for (const days of [30, 14, 7]) {
    try {
      const f = { AND: [{ datetime_geq: startOf(day, days - 1).toISOString(), datetime_lt: startOf(today).toISOString() }, { requestHost: HOST }, { bot: 0 }] };
      const a = await cf(`query($a: String!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) { viewer { accounts(filter: { accountTag: $a }) {
        s: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: $f) { count sum { visits } dimensions { datetimeHour } } } } }`, { a: ACCOUNT, f });
      const by = {};
      for (const x of a.s) { const d = fmt(new Date(x.dimensions.datetimeHour)); (by[d] = by[d] || { day: d, visits: 0, pageviews: 0 }); by[d].visits += x.sum.visits; by[d].pageviews += x.count; }
      out.series = Object.values(by).filter((x) => x.day <= day).sort((p, q) => p.day.localeCompare(q.day));
      break;
    } catch (e) { if (days === 7) out.notes.push(`Cloudflare series: ${e.message}`); }
  }
  try {
    const f = { AND: [{ datetime_geq: startOf(day, 6).toISOString(), datetime_lt: startOf(today).toISOString() }, { requestHost: HOST }, { bot: 0 }] };
    const a = await cf(`query($a: String!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) { viewer { accounts(filter: { accountTag: $a }) {
      refPages: rumPageloadEventsAdaptiveGroups(limit: 10, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost refererPath } }
      browsers: rumPageloadEventsAdaptiveGroups(limit: 6, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { userAgentBrowser } }
      os: rumPageloadEventsAdaptiveGroups(limit: 6, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { userAgentOS } }
      landing: rumPageloadEventsAdaptiveGroups(limit: 8, filter: $f, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { requestPath } }
    } } }`, { a: ACCOUNT, f });
    out.traffic.last7.referrerPages = a.refPages.filter((x) => x.dimensions.refererHost && x.sum.visits).map((x) => ({ url: x.dimensions.refererHost + (x.dimensions.refererPath || ''), visits: x.sum.visits }));
    out.traffic.last7.browsers = a.browsers.map((x) => ({ name: x.dimensions.userAgentBrowser, visits: x.sum.visits }));
    out.traffic.last7.os = a.os.map((x) => ({ name: x.dimensions.userAgentOS, visits: x.sum.visits }));
    out.traffic.last7.landingPages = a.landing.filter((x) => x.sum.visits).map((x) => ({ path: x.dimensions.requestPath, visits: x.sum.visits }));
  } catch (e) { out.notes.push(`Cloudflare extras: ${e.message}`); }
} else out.notes.push('No CF_API_TOKEN: traffic skipped.');

if (KEY && site.SUPABASE_URL) {
  const H = { apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }), Prefer: 'count=exact', Range: '0-0' };
  const since = startOf(day).toISOString(), until = startOf(today).toISOString();
  const count = async (table, filter = '') => {
    const r = await fetch(`${site.SUPABASE_URL}/rest/v1/${table}?select=*${filter}`, { headers: H });
    const m = (r.headers.get('content-range') || '').match(/\/(\d+)/);
    return m ? +m[1] : null;
  };
  const both = async (table, col = 'created_at', extra = '') => ({ total: await count(table, extra), yesterday: await count(table, `&${col}=gte.${since}&${col}=lt.${until}${extra}`) });
  try {
    let users = { total: 0, yesterday: 0 };
    for (let page = 1; page < 50; page++) {
      const r = await fetch(`${site.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: { apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${KEY}` }) } });
      if (!r.ok) throw new Error(`auth users HTTP ${r.status}`);
      const { users: u = [] } = await r.json();
      users.total += u.length; users.yesterday += u.filter((x) => x.created_at >= since && x.created_at < until).length;
      if (u.length < 1000) break;
    }
    out.product = {
      users,
      groups: { nfl: await both('bgroups', 'created_at', '&sport=eq.nfl'), nba: await both('bgroups', 'created_at', '&sport=eq.nba') },
      groupMembers: await both('group_members', 'joined_at'),
      brackets: { nfl: await both('brackets', 'created_at', '&sport=eq.nfl'), nba: await both('brackets', 'created_at', '&sport=eq.nba') },
      savedScenarios: await both('scenarios'),
      chatMessages: await both('group_messages'),
      emailsSent: await both('notify_log', 'sent_at'),
    };
  } catch (e) { out.notes.push(`Supabase: ${e.message}`); }
} else out.notes.push('No Supabase key: product numbers skipped.');

fs.mkdirSync('stats', { recursive: true });
fs.writeFileSync(`stats/${day}.json`, JSON.stringify(out, null, 2) + '\n');
const hist = 'stats/history.csv';
if (!fs.existsSync(hist)) fs.writeFileSync(hist, 'day,visits,pageviews,users_total,users_new,groups_new,brackets_new,chat_new\n');
const P = out.product, T = out.traffic && out.traffic.yesterday;
const row = [day, T ? T.visits : '', T ? T.pageviews : '', P ? P.users.total : '', P ? P.users.yesterday : '',
  P ? (P.groups.nfl.yesterday || 0) + (P.groups.nba.yesterday || 0) : '', P ? (P.brackets.nfl.yesterday || 0) + (P.brackets.nba.yesterday || 0) : '', P ? P.chatMessages.yesterday : ''].join(',');
const lines = fs.readFileSync(hist, 'utf8').trim().split('\n').filter((l) => !l.startsWith(day + ','));
fs.writeFileSync(hist, [...lines, row].join('\n') + '\n');
console.log(JSON.stringify({ day, visits: T && T.visits, pageviews: T && T.pageviews, users: P && P.users, notes: out.notes }));
