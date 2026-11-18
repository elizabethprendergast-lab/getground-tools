# Email builder (plugin) — v0.2.0

Ask Claude for an email; it builds a **draft directly in HubSpot** and gives you the editor link.
Brand design, dark mode, UTMs and the correct footer disclaimers are applied automatically.
It never publishes or sends.

## Install (Claude Code — desktop app Code tab or terminal)
1. `/plugin marketplace add elizabethprendergast-lab/getground-tools`
2. `/plugin install email-builder@getground-tools`
3. Get the "Claude email drafts" HubSpot token from Beth (password manager), copy it, then run
   `mkdir -p ~/.secrets && pbpaste > ~/.secrets/hubspot_email_token && chmod 600 ~/.secrets/hubspot_email_token`
4. Ask: "build me an email for …"

Requires Node 18+.

## Who edits what
- **Design rules:** `skills/email-builder/GUIDELINES.md` (design team).
- **Components (HTML snippets):** `skills/email-builder/components.html` (design team).
- **Disclaimer wording:** Notion "Required disclaimers" first, then `disclaimers.json`.
- **Skill behaviour:** `skills/email-builder/SKILL.md`. **Builder script:** `scripts/gg_email.mjs`.
Commit to `main`; installed users get the update on their next plugin update.

## HubSpot token
Use a dedicated private app ("Claude email drafts") with only the marketing email scopes
(`content` / marketing-email). No CRM write access. The script has no publish/send command.

BuyAssociation emails still use the hosted builder (`legacy-hosted-builder.md`).
