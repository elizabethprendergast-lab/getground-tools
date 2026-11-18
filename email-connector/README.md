# GetGround Email connector (Claude app chat)

Remote MCP connector so anyone can build GetGround HubSpot email **drafts** from normal Claude chat.
Shares all builder logic with `plugins/email-builder` (inlined at build time). Never publishes or sends.

- Live: Cloudflare Pages project `gg-email` (Beth's personal Cloudflare account, pilot) → `https://gg-email.pages.dev/mcp/<ACCESS_CODE>`
- Secrets (Pages, production): `HUBSPOT_EMAIL_TOKEN` (HubSpot private app "Claude email builder", `content` scope only), `ACCESS_CODES` (comma-separated)
- Tools: `get_email_guidelines`, `preview_email`, `create_email_draft`, `update_email_draft` (unpublished drafts only)
- Usage log: Supabase `email_builder_feedback` (project = "email builder (claude chat connector)")

## Deploy (after changing guidelines, components, disclaimers or lib.mjs)
```
node email-connector/build.mjs
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=5bb20de7016e6a1f0f732895a6adb37d \
  npx wrangler@3.114.1 pages deploy email-connector/dist --project-name gg-email --branch main
```

## Add for one person (pilot)
1. Claude → Settings → Connectors → Add custom connector → name "GetGround Email", URL = the /mcp/<code> link.
2. Claude → Settings → Capabilities → Skills → Upload `chat-skill/getground-email` as a zip.
For company-wide: org owner adds the connector under Admin settings → Connectors and provisions the skill.
Move to a company Cloudflare account before org-wide rollout.

## Skill-only route (no connector, no admin)
The Claude chat sandbox can reach gg-email.pages.dev, so `chat-skill/getground-email/scripts/gg_email.py`
calls the server directly. Build the zip with the real code injected (never commit the code — public repo):
```
rm -rf /tmp/gge && mkdir /tmp/gge && cp -r email-connector/chat-skill/getground-email /tmp/gge/ \
  && sed -i '' "s/__ACCESS_CODE__/$(cat ~/.secrets/gg_email_access_code)/" /tmp/gge/getground-email/scripts/gg_email.py \
  && rm -f ~/Downloads/getground-email-skill.zip && (cd /tmp/gge && zip -qr ~/Downloads/getground-email-skill.zip getground-email)
```
Upload via Claude → Settings → Customize → Skills → Add → Upload skill; share with pilot users via the skill's Share button.
