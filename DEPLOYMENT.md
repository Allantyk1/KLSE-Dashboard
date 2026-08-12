# Deploying the KLSE Dashboard: GitHub + Cloudflare Pages + Access

Three layers, each doing a distinct job:
- **GitHub** — where the dashboard's code and data live (source of truth, version history).
- **Cloudflare Pages** — actually serves the site to your phone/laptop, rebuilding automatically
  every time you push to GitHub. Free, no server to manage.
- **Cloudflare Access** — a login gate in front of the site, so it isn't just sitting on the
  open internet for anyone with the URL. You'll get a "check your email for a code" prompt.

No custom domain purchase needed — Cloudflare Pages gives you a free `*.pages.dev` URL, and
Access can gate that directly.

## Folder structure — two separate places, one job each

- **Your existing screener folder** (with `config.py`, `klse_screener.py`, etc.) — this is
  where `generate_dashboard_data.py` goes. It needs `config.py` and your screener's CSV/xlsx
  outputs sitting right next to it to work.
- **A new `dashboard/` subfolder inside that same screener folder** — this is where
  `index.html`, `manifest.json`, `icon-192.png`, `icon-512.png`, `.gitignore`,
  `sample-dashboard-data.json`, and this `DEPLOYMENT.md` go. **This subfolder is the actual
  GitHub repo** — `git init` happens inside `dashboard/`, not in the screener folder itself.

`generate_dashboard_data.py` writes `dashboard-data.json` directly into `dashboard/` for you —
you never need to manually copy that one file between folders. You only copy the *other* six
files into `dashboard/` once, as initial setup.

```
klse_screener/                       <- your existing folder
├── config.py
├── klse_screener.py
├── ...(everything else you already have)
├── generate_dashboard_data.py       <- NEW, goes here
└── dashboard/                       <- NEW subfolder = the git repo
    ├── index.html
    ├── manifest.json
    ├── icon-192.png
    ├── icon-512.png
    ├── .gitignore
    ├── sample-dashboard-data.json
    ├── DEPLOYMENT.md
    └── dashboard-data.json          <- written here automatically each run
```

## Part 1 — GitHub

1. Go to [github.com/new](https://github.com/new) and create a repository, e.g. `klse-dashboard`.
   Private or public both work — Access will gate it either way, but private is the more
   sensible default for something showing your holdings.
2. Copy `index.html`, `manifest.json`, `icon-192.png`, `icon-512.png`, `.gitignore`,
   `sample-dashboard-data.json`, and this file into the `dashboard/` subfolder described above
   (one-time step — `generate_dashboard_data.py` will also tell you if you forget this).
3. Open a terminal **inside that `dashboard/` subfolder** (not the screener folder) and run:
   ```
   git init
   git add .
   git commit -m "Initial dashboard"
   git branch -M main
   git remote add origin https://github.com/<your-username>/klse-dashboard.git
   git push -u origin main
   ```
   (Replace `<your-username>` with your actual GitHub username. If `git` isn't installed,
   grab it from [git-scm.com](https://git-scm.com/downloads) first.)
4. **Note**: since `dashboard/` is its own separate folder from your screener code,
   `klse_screener_results.csv`, the various `.xlsx` outputs, etc. never end up in this repo at
   all — they physically live one level up, outside `dashboard/`. `.gitignore` here is just
   an extra safety net in case any of those ever land inside `dashboard/` by mistake.

## Part 2 — Cloudflare Pages

1. Sign in (or sign up, free) at [dash.cloudflare.com](https://dash.cloudflare.com).
2. In the sidebar: **Compute (Workers)** → **Create** → **Pages**.
3. Click **Connect to Git**, authorize Cloudflare to access your GitHub account (you can
   restrict it to just this one repo during authorization), then select your `klse-dashboard`
   repo.
4. Build settings: this is a plain static site, no build step needed.
   - **Framework preset**: None
   - **Build command**: leave blank
   - **Build output directory**: `/` (the repo root, since `index.html` sits there directly)
5. Click **Save and Deploy**. Cloudflare clones the repo, and within about a minute gives you
   a live URL like `https://klse-dashboard.pages.dev`.
6. Open it on your phone. You should see the "No data yet" empty state — that's correct, since
   `dashboard-data.json` hasn't been pushed yet (Part 4 below).

**Updating the site going forward**: just `git push` to `main`. Cloudflare Pages watches the
repo and rebuilds/redeploys automatically on every push — no extra step.

## Part 3 — Cloudflare Access (the login gate)

1. In the Cloudflare dashboard, go to your Pages project → **Settings** → **General**.
2. Find **Enable access policy** and turn it on. This creates an Access application covering
   your `*.pages.dev` domain automatically.
3. Go to **Zero Trust** (in the main Cloudflare dashboard sidebar) → **Access controls** →
   **Applications**. You should see the application Cloudflare just created for your Pages
   project — open it.
4. Under its policy, set who's allowed in. Simplest setup: **Include** → **Emails** → enter
   your own email address. This means only you can log in — anyone else hitting the URL gets
   an Access login page but can't get past it.
5. Set a **Session Duration** you're comfortable with (e.g. 24 hours or 7 days) — this is how
   often you'll need to re-enter the emailed code.
6. Save. Now when you (or anyone) visits your `*.pages.dev` URL, Cloudflare shows a login
   page first — enter your email, get a one-time code, enter it, then you're through to the
   dashboard.

## Part 3.5 — Previewing before you deploy anything

`sample-dashboard-data.json` is included so you can see the dashboard fully populated before
touching GitHub or Cloudflare at all — just double-click `index.html` (or open it in a
browser). If `dashboard-data.json` isn't there yet, it automatically falls back to the sample
file and shows an amber banner saying so. Once real data exists, that banner disappears and
the real numbers take over — no code change needed either way.

## Part 4 — Getting real data onto the dashboard

The dashboard is live but empty until you push actual data. Each time you want to refresh it,
run these from your **screener folder** (same place as always):

```
python klse_screener.py
python generate_excel_report.py
python build_portfolio_tracker.py
python generate_dashboard_data.py
```
(The last one is new — it reads your screener CSV and portfolio xlsx, and writes
`dashboard/dashboard-data.json` automatically.)

Then move into the `dashboard/` subfolder to push:
```
cd dashboard
git add dashboard-data.json
git commit -m "Update data"
git push
```
Cloudflare Pages picks up the push and redeploys within a minute or two — refresh the page on
your phone and the new numbers are there.

**If you want this fully automatic** (no manual `git push` each time), that's a GitHub Actions
workflow that runs your screener on a schedule and commits the result — a reasonable next step
once the manual flow is working, but adds its own moving parts (Actions runners can't easily
run on your specific local Windows machine with your Python setup, so it'd need adjusting to
run in GitHub's cloud runners instead). Worth doing as a phase 2, not phase 1.

## Quick troubleshooting

- **"No data yet" never goes away after pushing**: check the file actually landed at the repo
  root (not a subfolder) and is named exactly `dashboard-data.json`. Check the Cloudflare
  Pages deployment log for errors.
- **Access login email never arrives**: check spam, and double check the email address in the
  Access policy matches exactly what you're logging in with.
- **Changes not showing after push**: Cloudflare Pages deployments take a minute or so; check
  the **Deployments** tab in your Pages project to confirm a new deploy actually triggered.
