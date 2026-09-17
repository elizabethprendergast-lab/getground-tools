# HubSpot email direct (plugin)

Build and fix marketing emails directly inside HubSpot's custom-coded email templates —
structure/design as code, text and buttons left as native HubSpot modules so a marketer
can edit copy and links afterward without touching HTML.

This is the sister skill to `email-builder` (which drafts a whole new email in the
hosted visual builder and hands back a link). Use **this** one when the email already
lives in HubSpot as a custom-coded template and needs a structural/design edit, or when
a new email should be built as a proper editable HubSpot template rather than a one-off
static HTML blob.

## Install (via marketplace)
1. Add the marketplace: `/plugin marketplace add elizabethprendergast-lab/getground-tools`
2. Install: `/plugin install hubspot-email-direct@getground-tools`

## Updating
Commit changes to this repo (including to `LEARNINGS.md`) and push. Installed users pull
the latest next time the plugin refreshes — no file passing, no PR needed on this repo
(no branch protection on `main`).

## Self-improving
`LEARNINGS.md` in this folder is a shared, growing lesson log. Whenever the skill learns
something genuinely general (not specific to one client/campaign), it appends a dated
bullet there and commits + pushes immediately, so the next person to use the skill — on
either laptop — starts smarter. Project-specific one-off details never go in there.

## Working split
- Skill behaviour: edit `skills/hubspot-email-direct/SKILL.md` here.
- Shared lessons: `LEARNINGS.md` here.
