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
