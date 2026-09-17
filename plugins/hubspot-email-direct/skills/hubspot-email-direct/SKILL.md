# HubSpot email direct (build/edit inside HubSpot)

Use this skill when a marketing email already exists in HubSpot as a **custom-coded
template**, or should be built as one, and needs editing/building directly in the
platform — as opposed to `email-builder`, which drafts a brand-new email in the hosted
visual builder and hands back a link.

Read `LEARNINGS.md` (in this plugin folder) before starting. It holds lessons from past
runs — check it for anything relevant to the task at hand.

## 1. Find out what you're actually editing, first

Before changing anything, get the email's record via the Marketing Email API
(`GET /marketing/v3/emails/{id}`) and check `content.templatePath`.

- **If `templatePath` points to a custom-coded template** (a `.html` file under
  `custom/...` in Design Manager): the REAL send-time content lives in that CMS file,
  not in `content.widgets[x].body.html` on the email object. Go to step 2.
- **If it's a drag-and-drop / default HubSpot template** (no custom templatePath, or a
  standard HubSpot module-based one): normal widget/module edits via the Marketing Email
  API or the UI work as expected — no special handling needed.

Don't assume which one you're looking at. Check `templatePath` every time.

## 2. Editing a custom-coded template's structure/design

**Do not** rely on `PATCH content.widgets[x].body.html` for a custom-coded template. It
can appear to succeed (a follow-up GET echoes your change) but has no effect on what
actually sends, and has an undocumented side effect of soft-deleting the widget
(`deleted_at` gets set to the PATCH timestamp, even though GET keeps echoing the old
content). See `LEARNINGS.md` for how this was found.

The real edit surface is the **CMS Source Code API**:

```
GET  /cms/v3/source-code/{draft|published}/content/{templatePath}
PUT  /cms/v3/source-code/{draft|published}/content/{templatePath}
```

- GET returns raw HTML text, not JSON.
- PUT requires **multipart/form-data** with the file in a `file` field. A plain
  `text/plain` or `text/html` Content-Type PUT returns `415 Unsupported Media Type`.
  Example: `curl -X PUT ".../cms/v3/source-code/draft/content/{templatePath}" -F "file=@fixed.html;type=text/html"`
- **Update BOTH `draft` and `published`** environments — a fix only applied to one leaves
  the other environment stale (draft edits alone won't reach a live/already-published
  email; published-only won't reach the next draft edit cycle).
- **Never trust GET alone as proof the fix worked.** Always finish by using HubSpot's
  "Send test email" (or triggering an actual test send) and visually confirm the change
  landed in the delivered email, not just in the API response.

## 3. Hybrid build approach — code the design, leave text/buttons native

When building or restructuring a custom-coded template, split the work:

- **Structure and decoration** (layout grid, background colours/gradients, dividers,
  card shapes, spacing, brand chrome) → custom HTML/CSS in the template file.
- **Text content and buttons/CTAs** → native HubSpot rich-text and button modules
  (`{{ module "..." }}` / drag-and-drop editable regions), NOT hardcoded raw HTML text
  or `<a>` tags baked into the template.

Why: a marketer needs to edit copy, swap a CTA link, or update a fee/date directly in
HubSpot afterward, without anyone touching code or redeploying a template file. Baking
text/links into raw HTML defeats that — it routes every future copy tweak back through
an engineer.

If you're unsure whether a HubSpot theme/template supports native modules inside a
custom-coded section, check the existing template's module definitions
(`module.html`/`fields.json` under the theme) before assuming raw HTML is the only
option — most custom templates can mix hardcoded structure with `{{ module }}` calls
for the swappable parts.

## 4. Unsubscribe + compliance — always on, never optional

Every email must include:
- The correct **unsubscribe link/module** — HubSpot's native unsubscribe token/module
  for the relevant subscription type, not a hardcoded mailto or dead link.
- The correct **brand-appropriate legal/compliance disclaimer** for whichever brand the
  email is for (GetGround vs BuyAssociation have different regulatory footers — see the
  `email-builder` skill's brand tokens for the current GetGround Fiducia/Stonebridge FRN
  lines and fraud warning, and BuyAssociation's Direct Marketplace Limited / capital-at-
  risk wording). Don't duplicate those tokens here — defer to `email-builder`'s SKILL.md
  as the source of truth for brand voice/compliance copy, since they change over time and
  should only be maintained in one place.

Never ship a build/edit that drops or weakens either of these, even if the brief doesn't
mention them.

## 5. Compliance review — always flag

These are regulated communications. Always tell the person the change must be reviewed
by Compliance before sending, and never present a build/edit as final — this applies
even for a "small" fix like a fee percentage or a link.

## 6. Keep this skill general — project specifics don't belong here

Don't add one-off details from a specific job (a specific email ID, a specific client's
copy/colours/fee, a specific meeting link) into this file. Those live in the
conversation/ticket. Only add something here if it would change how you'd approach ANY
future HubSpot email.

## 7. Self-teach

When you learn something general from a run — a new HubSpot API quirk, a template
gotcha, a verification step that caught a silent failure — append one dated bullet to
`LEARNINGS.md` (with the "why"), then commit and push immediately. Do this before moving
on to the next task, not at the end of a long session. That's what makes this skill
smarter for both of us, not just you.
