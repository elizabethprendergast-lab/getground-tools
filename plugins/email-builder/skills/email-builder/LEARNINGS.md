# Learnings

General, reusable lessons about building/editing marketing emails directly in HubSpot,
discovered while using this skill. Append here whenever a lesson would help next time,
regardless of who hit it or which account/client it came from — one bullet, dated, with
the "why" — then commit and push immediately so the other person has it at their next
session.

Do NOT put project-specific one-off details here (a specific client's fee %, a specific
draft's email ID, a specific meeting link). Those stay in the conversation/ticket they
came from. This file is only for things that would change how we'd approach ANY future
HubSpot email.

## Log

- 2026-09-17 — For a custom-coded email template, `PATCH content.widgets[x].body.html`
  via the Marketing Email API looks like it works (GET echoes the change) but has no
  effect on what actually sends, and can silently soft-delete the widget (`deleted_at`
  set to the PATCH time). Real content lives in the CMS Design Manager file at
  `content.templatePath`, edited via the CMS Source Code API. See SKILL.md.
- 2026-11-18 — Creating a marketing email via `POST /marketing/v3/emails` requires
  `businessUnitId` (portal default is `"0"`), otherwise 400 "You must specify a business unit".
  Sending full `content` (templatePath + flexAreas + widgets) on create works; no clone needed.
- 2026-11-02 — `PATCH` with `content.widgets` REPLACES the whole widgets map. Sending one widget
  wiped the body + footer. Always send the full content.
- 2026-11-04 — For DnD emails, the real layout lives at `GET/PATCH /marketing/v3/emails/{id}/draft`.
  Root GET can show `flexAreas.main` as `{}` even when the editor is fine — check `/draft`
  before "fixing" anything. Clone (`/emails/clone`) is not a reliable fix.
- 2026-11-05 — In v3, `from.replyTo` is the FROM address; `from.customReplyTo` is the reply-to.
  Preview text lives in `content.widgets.preview_text.body.value` (top-level `previewText` is ignored).
