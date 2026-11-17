# Beth Watchlist

`https://beth-watchlist.pages.dev`: things Beth is running that Claude keeps an eye on. It's live from
HubSpot, and Claude emails Beth a summary every Monday at 9am UK.

- `cf-deploy/watchlist.json` is the list of watched items. **This repo is public**, so only put IDs here
  (list, owner and email IDs). Never put names, emails or other personal data in this file.
- `cf-deploy/_worker.js` works out, for each item, the meetings, deals, closed-won deals, calls by the
  watched owners, form fills, replies and site visits for the contacts in its lists since `start`.
- `/api/watchlist?days=7` returns the last 7 days, which is what the Monday email uses. Auth is the
  `SITE_PASSWORD` cookie, or the `x-digest-key` header for the scheduled routine.
- Deploys automatically on push to `main` (Cloudflare Pages project `beth-watchlist`, which builds only
  on changes under `beth-watchlist/`).

## Adding an item
Add an entry to `items`. Each entry needs:
- `key`, `title`, `description`
- `start` (ISO date or datetime)
- `cohorts` (`[{label, listId}]`, static HubSpot lists)
- `owners` (`[{id, name}]`)
- `links`

To stop watching something, set `"status": "archived"`.
