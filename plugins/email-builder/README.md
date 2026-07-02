# Email builder (plugin)

Turns a plain-English brief into a branded GetGround or BuyAssociation marketing email and
hands back a short link that opens it, pre-filled, in the hosted email builder.

- Builder (design/UX + output): https://elizabethprendergast-lab.github.io/getground-tools/email-builder.html
- Drafts + feedback store: Supabase (public publishable key; no secrets in this repo).
- Brand voice + content: pulled fresh from Notion each run.

## Install (via marketplace)
1. Add the marketplace: `/plugin marketplace add elizabethprendergast-lab/getground-tools`
2. Install: `/plugin install email-builder@getground-tools`

## Updating
Commit changes to this repo. Installed users pull the latest, no file passing.

## Working split
- Builder design/UX: edit `email-builder.html` in the repo root (GitHub Pages auto-deploys).
- Skill behaviour: edit `skills/email-builder/SKILL.md` here.
