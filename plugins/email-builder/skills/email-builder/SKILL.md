---
name: email-builder
description: >-
  Build a branded GetGround marketing or notification email directly in HubSpot as a draft
  and hand back the HubSpot editor link, with brand design, dark mode, UTMs and the right
  footer disclaimers applied automatically. Use whenever anyone wants to create, draft,
  write, design, rebuild or edit an email, newsletter, nurture, campaign, webinar invite,
  upsell, receipt, onboarding or notification email for GetGround (or BuyAssociation).
  Triggers include "build me an email", "draft a GetGround email", "make an email in HubSpot",
  "write a nurture email", "create an email for landlords", "email for this webinar".
---

# GetGround email builder (HubSpot direct)

You write and design the email. `scripts/gg_email.mjs` does the deterministic parts: it
builds the HubSpot drag-and-drop draft, adds the dark-mode styles, applies UTMs to every
link, picks the footer disclaimers from the copy, and returns the editor link. **It never
publishes or sends. Nor do you.**

Files in this folder (read as needed, don't paste them to the person):
- `GUIDELINES.md` — the design + copy rules. **Read it at the start of every run.** It is
  owned by the design team; it wins over anything in this file.
- `components.html` — approved HTML snippets (heroes, cards, steps, event details, video,
  coupon, divider, CTA panel, sign-offs). Build from these; don't invent new styles.
- `disclaimers.json` — exact regulatory wording (from Notion "Required disclaimers").
- `LEARNINGS.md` — HubSpot API gotchas. Skim before editing an existing email.
- `legacy-hosted-builder.md` — old hosted-builder flow, only for BuyAssociation (below).

## 0. Setup check (first run per machine)
Run `node "<this folder>/scripts/gg_email.mjs" check`.
If it says there's no token: tell the person to get the "Claude email drafts" HubSpot token
from Beth Prendergast (via the password manager, never Slack/email) and save it with
`! mkdir -p ~/.secrets && pbpaste > ~/.secrets/hubspot_email_token` after copying it.
Never print, echo or paste a token.

BuyAssociation emails: not yet supported in HubSpot direct. Follow `legacy-hosted-builder.md`.

## 1. Brief — ask only what's missing (one AskUserQuestion round)
Required: **type** (marketing / personal / notification — see GUIDELINES §0), **audience**,
**goal + primary CTA (label + URL)**, **key points**, **campaign** for UTMs
(`team_initiative_MMYY`, e.g. `growth_rent_review_1126`), **sender** (default The GetGround
Team / gethelp@; personal = the contact owner's name + email).
Optional: send type (one-off vs workflow), offer/deadline, images/video, length.
If the person gave enough, don't ask — state your assumptions in the hand-over.

## 2. Facts
One Notion search on the topic for real facts, figures and proof points. Never invent
numbers, claims or features. Quote actual figures only (e.g. actual rent, not estimates).
If facts are missing, leave a clear `[CONFIRM: …]` placeholder rather than guessing.

## 3. Write the copy (GUIDELINES §9)
Subject + preview with emotional pull, about the reader. Natural opener, snappy lists,
no filler, no emojis, no em dashes, no "Happy landlording". Greeting:
`Hi {{ personalization_token('contact.firstname', 'there') }},`. Nothing that could read as
financial, mortgage, tax or investment advice.

## 4. Lay it out as blocks → spec JSON
Write a spec file in the scratchpad (not Downloads):

```json
{
  "type": "marketing | personal | notification",
  "brand": "getground",
  "name": "<Internal name - campaign - MMYY>",
  "subject": "…", "previewText": "…",
  "campaign": "growth_rent_review_1126",
  "from": {"name": "The GetGround Team", "email": "gethelp@getground.co.uk"},
  "replyTo": "optional, if different from from.email",
  "subscription": "marketing | transactional (defaults: notification→transactional, else marketing)",
  "goal": "one line, for the usage log",
  "disclaimers": ["optional extra keys from disclaimers.json"],
  "removeDisclaimers": {"key": "reason — only if a detected one is genuinely wrong"},
  "recurringMortgageEmail": false,
  "blocks": [
    {"kind": "html",   "id": "hero",    "html": "<from components.html>"},
    {"kind": "text",   "id": "intro",   "html": "<p>Hi …</p><p>…</p>"},
    {"kind": "button", "label": "Book a call", "url": "https://…", "utm_content": "book_a_call", "align": "left"},
    {"kind": "html",   "id": "steps",   "html": "<numbered card from components.html>", "spaceAfter": 40},
    {"kind": "text",   "id": "signoff", "html": "<p>Got a question? Just reply to this email.</p><p><strong>The GetGround team</strong></p>"}
  ]
}
```

Block rules (this is the hybrid build):
- **`text`** = native HubSpot rich text, editable by anyone. Use for all running copy:
  intro, paragraphs, simple bullet lists, sign-off. Write plain `<p>`, `<h2>`, `<ul><li>`,
  `<strong>`, `<a>`; the script applies brand fonts, sizes and dark mode.
- **`button`** = native HubSpot button. Use for standalone CTAs in the body.
- **`html`** = designed components from `components.html` only: hero, cards, numbered
  steps, event details, coupon, video thumbnail, divider, CTA panel, personal sign-off,
  "Need a hand?". Put `data-utm="name"` on `<a>` tags to name their utm_content.
- **`spacer`** rarely needed: spacing is automatic (48px between blocks, 96px after the last
  block). Override with `spaceAfter` (e.g. 24 between a paragraph and its button, 40 around
  a divider).
- Single column always. One hero. One main CTA (may repeat at the end).
- Don't add `<style>`, UTMs, disclaimers, footer or unsubscribe: the script does that.

## 5. Preview and self-check
`node "<this folder>/scripts/gg_email.mjs" preview spec.json` → writes `spec.preview.html`
and prints type, sender, disclaimers (with why), every link with its UTM, warnings and any
**COMPLIANCE REVIEW REQUIRED** line. Fix every warning. If you can, screenshot the preview
at mobile width in light and dark mode (headless Chrome:
`--force-dark-mode --blink-settings=preferredColorScheme=0`) and look at it before creating.
Run the GUIDELINES §12 checklist.

## 6. Create the draft
`node "<this folder>/scripts/gg_email.mjs" create spec.json` → prints the editor link.
Changing an existing draft: `… update <emailId> spec.json` (backs up the current draft to
`~/Downloads/email-builder-backups/` first). Never PATCH a published email's live version
and never call publish/send endpoints yourself.

## 7. Hand over (short)
- Editor link as a plain clickable URL: `https://app-eu1.hubspot.com/email/25516403/edit/<ID>/content`
- One line each: disclaimers added, UTM campaign, sender, subscription type, any assumptions
  or `[CONFIRM]` placeholders.
- Always: "This is a draft for human review. Send yourself a test from HubSpot before it goes anywhere."
- If the script flagged compliance: "**Needs Compliance review before sending**" plus the reason
  (mortgages/brokerage, Investment Pots + RiskSave).
- Images: if the email needs images you couldn't supply, say which slots to fill in HubSpot
  (upload to Files → `/email-images`).
- For campaigns that drive calls, remind them a workflow branch (clicked → call task with
  `power_dialler__*` fields) is needed; offer to help.

## 8. Feedback loop
- When the person corrects the design or copy in a way that would apply to ANY future email,
  suggest adding it to `GUIDELINES.md` (design team owns it; open a PR or tell Beth).
- When you hit a HubSpot API quirk, add a dated bullet to `LEARNINGS.md`.
- The script logs each create/update (metadata only) to the usage table so the owner can
  see adoption. Never put customer personal data in a spec.
