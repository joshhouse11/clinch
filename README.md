# Clinch: NFL playoff scenarios, odds, tiebreakers and draft order

A static website that rebuilds itself. A scheduled GitHub Action pulls fresh scores and betting lines,
re-checks the tiebreaker engine against every playoff field since 2002, rebuilds the page and publishes it.
If the check fails, nothing ships and the live site stays on the last good version.

## How it updates

| What | How it gets updated |
|---|---|
| Scores, schedule, betting lines | Automatic. Every 30 min during game windows (Thu night, all day Sun, Mon night), every 6 h otherwise. Source: nflverse open data, which posts final scores shortly after games end (not live in-game). |
| Season rollover | Automatic. The build picks the latest season with a schedule (nflverse posts it in May). |
| Draft pick trades | Edit `data/pick_trades.json` on GitHub (pencil icon, then Commit). The site rebuilds within a few minutes. |
| Code changes | Push to `main` and it deploys. |
| Manual refresh | GitHub, then Actions, then "Update data and deploy", then Run workflow. |

## Project layout

```
engine/engine.js        standings, NFL tiebreakers, seeding, draft order, Monte Carlo odds (runs in browser + Node)
engine/data.js          CSV loader
scripts/fetch-data.js   downloads data/games.csv from nflverse
scripts/validate.js     replays 2002-present; fails the deploy if any playoff field doesn't match reality
scripts/build.js        writes public/ (index.html, 404.html for share links, robots.txt, sitemap.xml, CNAME)
web/template.html       the whole site: UI, styles, accounts
data/pick_trades.json   traded first-round picks
supabase/schema.sql     database for accounts, saved scenarios, share links
.github/workflows/update.yml   the schedule + deploy pipeline
```

Run locally: `npm run all`, then open `public/index.html`.

## Going live: one-time setup (about 1 hour, all in your name)

### 1. GitHub (hosting + automation, free)
1. Create a GitHub account and a **public** repository, e.g. `clinch`. GitHub Pages is free on public repos.
   If you want the code private, use Cloudflare Pages instead (free with private repos). The workflow needs a small change for that.
2. Upload this folder to the repo (drag and drop on github.com works, or `git push`).
3. In the repo, go to **Settings, Pages, Source: GitHub Actions**.
4. Go to **Settings, Secrets and variables, Actions, Variables tab** and add:
   - `SITE_NAME`: the brand, e.g. `clinch`
   - `SITE_URL`: e.g. `https://yourdomain.com` (no trailing slash)
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY`: from step 3 below. The anon key is meant to be public; security comes from the database rules.
5. Go to **Actions, Update data and deploy, Run workflow**. The site goes live at `https://<you>.github.io/<repo>` until the domain is connected.

### 2. Domain
1. Buy the domain (Cloudflare Registrar or Namecheap, about $10-12 a year for a .com).
2. DNS records:
   - `A` records for the root domain pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` pointing to `<you>.github.io`
3. In the repo, go to **Settings, Pages, Custom domain**, enter the domain and tick **Enforce HTTPS** once it appears.

### 3. Supabase (accounts + saved scenarios + share links; free tier)
1. Create a project at supabase.com.
2. Go to **SQL Editor, New query**, paste `supabase/schema.sql` and click Run.
3. Go to **Project Settings, API** and copy the Project URL and the `anon` public key into the GitHub variables above.
4. Go to **Authentication, URL Configuration**:
   - Site URL: `https://yourdomain.com`
   - Redirect URLs: `https://yourdomain.com/**` (add `https://<you>.github.io/**` too while testing)

### 4. Google sign-in (free)
1. Go to console.cloud.google.com, create a project, then **APIs & Services, OAuth consent screen**: External, app name, support email, your domain.
2. Go to **Credentials, Create credentials, OAuth client ID, Web application**.
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
3. Paste the Client ID and Client secret into Supabase under **Authentication, Providers, Google**, then Enable.

### 5. Apple sign-in (optional; needs an Apple Developer account, $99/yr)
In Apple Developer, create a **Services ID** with Sign in with Apple enabled, using return URL
`https://<your-project>.supabase.co/auth/v1/callback`. Create a **key** with Sign in with Apple, then enter the
Services ID, Team ID, Key ID and key in Supabase under **Authentication, Providers, Apple**.
Skipping this is fine. The Apple button just won't work until it's set up (or remove it from `web/template.html`).

Until Supabase is configured, the site works fully. The Sign in, Save and Share buttons simply stay hidden.

## Data and accuracy notes
- Seeding and draft order follow the NFL's tiebreaking procedures; `scripts/validate.js` checks every playoff field from 2002 on.
- Win probabilities: the betting line when one is posted, otherwise 75% market-implied team ratings plus 25% point differential (backtested 2015-2025).
- Playoff-team draft slots (picks 19-32) are projected by record.
- Not affiliated with the NFL.
