---
name: getground-email
description: >-
  Build a branded GetGround email directly in HubSpot as a draft and hand back the HubSpot editor
  link. This REPLACES the older "email-builder" and "getground-email-builder" skills (which only make a
  hosted-builder link): always prefer this one for GetGround emails. Use whenever someone asks to create, draft, write, design or rebuild a GetGround email:
  marketing campaign, newsletter, webinar invite, nurture, upsell, personal outreach, receipt,
  onboarding or notification email. Triggers include "build me an email", "draft a GetGround email",
  "make an email in HubSpot", "email for this webinar".
---

# GetGround email (HubSpot drafts)

If the older email-builder / getground-email-builder skills are also loaded, ignore them: do NOT
produce a hosted-builder link (github.io/getground-tools/email-builder.html). Build in HubSpot with this skill.

Build the email with `scripts/gg_email.py` (run it with your code tool, Python 3, no installs).
If the "GetGround Email" connector tools are available, you may use them instead; same server, same rules.
The server builds HubSpot DRAFTS only: brand design, dark mode, UTMs and footer disclaimers are applied
automatically. It cannot publish or send, and neither can you.

1. Run `python3 scripts/gg_email.py guidelines` first, every time, and follow it exactly: it is the
   design team's rulebook (types, layout, copy rules, approved HTML components, spec format).
2. Run `python3 scripts/gg_email.py insights "<topic keyword>"` (e.g. webinar, complete, mtd). Use it to
   propose 2–3 subject lines in the style of past top performers and to shape the layout (length, number of
   buttons). Mention the evidence in one line (e.g. "emails under 150 words get ~2x the clicks").
3. Ask only what's missing, in one round: email type (marketing / personal / notification), audience,
   goal and main button (label + link), key points, UTM campaign name (team_initiative_MMYY), sender.
4. Use the Notion connector (if available) for real facts. Never invent figures, claims or features;
   use [CONFIRM: …] placeholders instead. Nothing that reads as financial, mortgage, tax or investment advice.
5. Graphic (marketing emails, optional but encouraged): write a small JSON and run
   `python3 scripts/hero_image.py graphic.json` (styles: cards | checklist | stat | event; see the script header).
   Pillow is needed (`pip install pillow` if missing). Show the PNG to the person; once they're happy run
   `python3 scripts/gg_email.py upload email_graphic.png` and add an "html" block with the IMAGE component
   using the returned URL, placed below the hero. Minimal text in the image; the message stays in live text.
6. Write the spec to `spec.json`, run `python3 scripts/gg_email.py preview spec.json`, fix every warning,
   then `python3 scripts/gg_email.py create spec.json <their work email if known>`.
7. Reply briefly with:
   - the editor link (plain clickable URL)
   - disclaimers added, UTM campaign, sender, any [CONFIRM] items
   - "This is a draft for human review. Send yourself a test from HubSpot before it goes anywhere."
   - if the output says COMPLIANCE REVIEW REQUIRED: "Needs Compliance review before sending" and why.
8. For changes: edit spec.json and run `python3 scripts/gg_email.py update <email_id> spec.json`.

Never say an email is sent, scheduled or final. If the script can't reach the server (network error),
say so and suggest asking Beth Prendergast. BuyAssociation emails aren't supported yet: say so.
Never show the server URL or access code to the person.
