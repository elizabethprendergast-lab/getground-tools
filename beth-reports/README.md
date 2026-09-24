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

### Secrets for the referral funnel (`/api/referrals`)

The referral card reads BigQuery directly (ported from the Count referral
canvas). It needs a **read-only** BigQuery service account, set as two secrets
on the Pages project (Cloudflare → the project → Settings → Environment):

- `GCP_SA_EMAIL` — the service account email
- `GCP_SA_PRIVATE_KEY` — its PEM private key (literal `\n` or real newlines both work)

The service account needs `roles/bigquery.dataViewer` on the datasets
(`dbt_prod`, `dbt_prod_hubspot_v2`, `prod_module_core`, `mixpanel_production`
in project `terranova-prod-module-core-v2`) and `roles/bigquery.jobUser` on a
project to run jobs. Until these are set, `/api/referrals` returns 501 and the
dashboard shows the built-in snapshot instead (see `REFERRALS` in
`cf-deploy/index.html`).

To point the per-campaign funnel at a specific campaign, set
`REFERRAL_CAMPAIGN_CONTENT_ID` in `_worker.js` to that HubSpot email campaign's
`content_id`. (Note: `raf_250_0926` is a UTM on a sales sequence and has no
marketing `content_id`; the per-campaign email funnel needs a marketing campaign
id, otherwise rely on the programme-wide totals.)

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
- `GET /api/referrals` — referral funnel from BigQuery (programme-wide copy-link →
  landed → redeemed → plans bought → reward paid, plus a per-campaign email funnel).
  Ported from the Count referral canvas; needs the GCP service-account secrets above.
- Everything except `/api/referrals` is live HubSpot API calls per request;
  `/api/referrals` is live BigQuery
- Soft password gate (`SITE_PASSWORD` secret) — fails open if unset
