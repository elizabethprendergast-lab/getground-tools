# Beth Reports

Cloudflare Pages Worker powering `https://beth-reports.pages.dev` — live HubSpot
call-task campaign dashboard. One page, dropdown selector at the top, one entry
per tracked campaign.

## Deploying

Deploys are **manual** — pushing here does not auto-publish. To go live:

```
npx wrangler pages deploy beth-reports/cf-deploy --project-name beth-reports --branch main --commit-dirty=true
```

Requires Cloudflare access to the `beth-reports` Pages project (currently on
Beth's personal Cloudflare account) — ask her to run the deploy, or to add you
as a collaborator on the Pages project if you need to deploy independently.

The `HUBSPOT_TOKEN` secret is already configured on the live Pages project —
nothing to set up locally to deploy; you only need it if running the worker
in local dev mode (`wrangler pages dev`, via a `.dev.vars` file — gitignored,
never commit it).

## Adding your own campaign page

The whole report engine is generic over however many "projects" are configured
— adding a new campaign doesn't need a rebuild, just a new entry.

In `cf-deploy/_worker.js`, `REPORTS["mrr-nov-sprint"].projects` is an array;
each entry needs:

- `key` — short unique id (e.g. `"reengage-nonpaying"`)
- `label` — display name
- `match: (subject) => ...` — how to classify a task subject as belonging to
  this project (substring match on the fixed, non-numbered part of the task
  title)
- `context` — one sentence shown on the card, explaining what this queue is
- `attributionSearch: { tokens: [...], ownerFiltered: bool }` — **verify this
  against real data before shipping** (see comments above `searchTasksForAttribution`
  in `_worker.js` for why: `CONTAINS_TOKEN` has no phrase matching, so a
  single generic word can silently pull in thousands of unrelated tasks
  portal-wide — test your token combination against the real HubSpot Tasks
  Search API first, the same way the existing 4 projects were verified,
  before setting `ownerFiltered: false`)

See the existing project entries in `_worker.js` for the pattern — each has a
comment explaining what was tested and why its specific token combination is
safe to search without an owner filter.

## Architecture notes

- `GET /api/stats` — completion counts (done/not-done, per rep, per call-attempt
  number), owner-agnostic across all projects except Active Lead (see its
  comment in `_worker.js` — no word combination isolates it portal-wide without
  an owner filter)
- `GET /api/outcomes` — call-outcome/disposition breakdown per project
- `GET /api/deals` — deal attribution: did a contact in this sequence convert
  to a Closed Won Plans-pipeline deal (or a migration event), counted only if
  it happened on/after their enrollment date in that sequence
- No BigQuery — everything is live HubSpot API calls per request
- Soft password gate (`SITE_PASSWORD` secret) — fails open if unset
