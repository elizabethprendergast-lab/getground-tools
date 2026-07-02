---
name: email-builder
description: >-
  Build a branded GetGround or BuyAssociation marketing email and hand the person
  a link that opens it in the hosted GetGround email builder, pre-filled and ready
  to edit. Use whenever someone wants to create, draft, write, or design a marketing
  email, newsletter, nurture email, campaign email, or email header for GetGround or
  BuyAssociation. Triggers include "build me an email", "draft a GetGround email",
  "write a nurture email", "create an email for landlords", "make a BuyAssociation email".
---

# Email builder (GetGround & BuyAssociation)

This skill turns a plain-English brief into a branded email and gives the person a
link that opens the hosted email builder with the email already loaded. Nothing is
shared as a file: the email travels inside the link.

## Configuration (org admin fills these once)

- `HOSTED_BUILDER_URL`: `https://elizabethprendergast-lab.github.io/getground-tools/email-builder.html`
  (the builder hosted in the getground-tools repo, alongside the UTM builder).
- `FEEDBACK_STORE` (Supabase table `email_builder_feedback`, project `nckkfaldcplgfmldsrou`):
  every run POSTs one row using the public publishable key, so the owner sees usage and
  feedback from ALL users on any account, with nothing to connect per user. See step 9.
  Metadata only, never store customer personal data, tokens, or full drafts.
- `UTM_TEMPLATE` (GetGround standard, matches the team UTM tool):
  `utm_source=email&utm_medium={medium}&utm_campaign={campaign}&utm_content={content}`
  - `utm_source` = `email` (fixed for emails)
  - `utm_medium` = `gg_hubspot` for GetGround, `ba_hubspot` for BuyAssociation (follows the brand chosen)
  - `utm_campaign` = asked each run, format `team_initiative_date` (e.g. `refer_a_friend_0526`)
  - `utm_content` = per-link identifier, set by purpose (e.g. `top_button`, `book_a_call`, `email_2`)
  - All values lowercase_with_underscores (convert spaces and capitals automatically).
- Images (V1 = placeholders, no token): the skill does NOT upload images and needs no
  token. It leaves labelled empty `image` blocks; the person adds pictures in the builder.
- (Deferred) Auto-upload to HubSpot: only enable once a server-side proxy holds the token,
  so the token never lives in this file or the public builder. When that proxy exists, the
  skill calls it (not HubSpot directly). For reference, the underlying HubSpot call is
  `POST https://api.hubapi.com/files/v3/files`, multipart `file` + `folderPath=/email-images`
  + `options={"access":"PUBLIC_NOT_INDEXABLE"}`, hosted URL returned in the `url` field.
  Do NOT hardcode a HubSpot token anywhere in this skill or the builder.

## Order of operations (do not skip)

### 1. Clarify first — always
Use AskUserQuestion BEFORE writing anything. Required:
- **Brand: GetGround or BuyAssociation** (mandatory — drives voice, colour, tone).
- **Audience — one of: existing customers, non-customers (prospects/leads), or partners**
  (mandatory — drives message, proof points, and CTA).
- Goal and primary CTA (what action; what the button says + where it links).
- Key points / content to include, plus any offer, deadline or proof to feature.
- Tone and rough length.
Do not generate the email until brand, audience, and goal are clear.

### 2. Pull content context from Notion (keep it fast)
Do ONE Notion search for the topic of this email (the product, feature, plan, offer, or
audience segment), e.g. "<product/feature>", "<product> benefits", "<campaign> messaging".
Read the result snippets. Only fetch a full page when the snippets lack the specific facts
you need, one fetch at most. Pull real facts, figures, proof points, partner names and
compliance credentials, do not invent numbers or claims. Keep Notion access read-only.

For brand voice, use the built-in defaults in step 3 (they are stable). Only run a second
Notion search for voice if the user says the guidelines changed or asks you to refresh them.
This keeps a run to a single Notion call in the common case.

If nothing is found for either, say so and ask the user to point to the page before
continuing. Keep Notion access read-only.

### 3. Apply brand design tokens (baked in from real sent emails)
Use these tokens directly. They are derived from real GetGround and BuyAssociation emails,
so follow them closely; only override if Notion explicitly specifies something different.

**GetGround** (`profile: "getground"`):
- Colours: dark teal `#06363A` (headings, buttons, body); cyan `#A3ECEE`; link/CTA teal
  `#00a4bd` and `#159FA2`; body ink `#1A2530` / `#3a4854`; muted `#46625F` / `#7a8a87`;
  tint panels `#F0FAFA` / `#F2FBFB` / `#F9FAFB`; footer band `#D0E0E3` / `#CFE2F3`.
- Buttons: solid `#06363A`, white bold text, ~10px radius.
- Type: body ~18px, centred headings and body common. Sentence case.
- Voice: expert, calm, confident, outcome-led. No em-dashes (commas/full stops). 12–16 words
  per sentence. Front-load value; tie claims to proof (30,000+ landlords, £2B assets,
  HMRC/MTD-compliant, FCA-regulated partners).
- Footer: `#D0E0E3` band, ~12px `#23496d`. On finance/mortgage emails include the Fiducia
  (FRN 917537) and Stonebridge (FRN 454811) lines and the fraud warning.

**BuyAssociation** (`profile: "buyassociation"`):
- Colours: accent pink `#e71d70` (buttons, UPPERCASE section labels, quote left-borders);
  headings navy/slate `#323e48`; body grey `#58595b`; light grey cards `#f7f7f7`; white
  background `#FEFEFE`; links `#00a4bd`.
- Buttons: solid `#e71d70`, white bold text, ~8px radius (e.g. "Investor brochure",
  "WhatsApp for details"). CTA is usually WhatsApp / phone / brochure, not "book a call".
- Type: body ~14px, line-height ~1.6. Headings left-aligned.
- Structure that works: navy logo → property image (radius ~5%) → small UPPERCASE pink
  section label (`heading`, size ~14, colour `#e71d70`) → navy sub-heading (`heading`, size
  ~18, `#323e48`) → grey body → spec / amenity / location / payment items as `quote` cards
  (bg `#f7f7f7`, accent `#e71d70`, italic, ~13px). Use `spacer` between sections.
- Voice: property-investment led (developments, yields, payment plans, amenities, location),
  factual and aspirational; less tax/compliance framing than GetGround.
- Footer: small print `#666666` ~10px. Entity: "BuyAssociation is the trading name of
  Direct Marketplace Limited... Manchester M1 3PW". Include capital-at-risk / not-FCA-
  regulated / no-FSCS wording on investment emails; yields are projected, not guaranteed.

### 4. Build the email as builder blocks
Produce a draft object: `{ id, name, profile, blocks: [ ... ] }` where `id` is unique
(`<slug>-<timestamp>`), `profile` is "getground" or "buyassociation". Each block is
`{ id, type, ...fields }`. See **Block reference** below. Keep it scannable: hero,
short intro, scannable middle (checklist / feature cards / stats), clear CTA, sign-off.
Apply the brand voice to all copy.

### 5. UTMs — match the GetGround UTM builder exactly
The scheme MUST mirror the team's UTM builder
(https://elizabethprendergast-lab.github.io/getground-tools/utm-builder.html). For every
block field holding an http(s) URL (`btnUrl`, `url`, `primaryUrl`, `secondaryUrl`, `link`,
`linkUrl`, `link2Url`), append these params in this order:
- `utm_source` — for an email this is `email` (from the "Email" source option).
- `utm_medium` — `gg_hubspot` for GetGround, `ba_hubspot` for BuyAssociation.
- `utm_campaign` — ask the person once. Format `team_initiative_date` (e.g. `growth_mtd_1125`).
- `utm_content` — set per link by purpose (e.g. `top_button`, `book_a_call`, `email_2`). Optional.
- `utm_term` — ONLY when medium is `paid_search` (not for email). Omit for email.
Do NOT add `created_by` to the URL — in the UTM tool that's history metadata, not a param.

Formatting (identical to the tool's `formatValue`): lowercase; spaces and hyphens → `_`;
collapse repeated `_`; trim leading/trailing `_`. Apply to every value.

Allowed vocab (from the tool): sources = Meta, Google, TikTok, LinkedIn, Bing, Email,
YouTube, Instagram, Reddit, In Person, OOH, Marketing Website, Spotify, App, WhatsApp, Other
(each formatted, e.g. "In Person" → `in_person`). mediums = gg_hubspot, ba_hubspot, sendgrid,
ppc, paid_search, paid_social, organic_social, offline, internal, podcast, other.

Preserve existing query params (append with `&` if the URL already has `?`, else `?`).

### 6. Images (V1: placeholders)
Do not upload images. For each image the email needs, add an `image` block with `src` empty
and a descriptive `alt` (e.g. "Hero image: Inbox screen"). The builder renders a labelled
dashed "Image slot", and the person uploads the picture directly in the builder. Tell them:
"I've left labelled image slots — click each to upload your image in the builder."
Never inline base64. (Auto-upload is deferred until a token-holding proxy exists; see config.)

### 7. Hand over the link
Encode the draft and build the link (see **Encoding**), then give it to the person as a
CLICKABLE link. Output the raw URL on its own line with NO backticks and NO code formatting
(backticks render as non-clickable code in chat). For example:

Open your email in the builder:
https://elizabethprendergast-lab.github.io/getground-tools/email-builder.html?v=…#id=…

They click it, the builder opens pre-filled, and they edit/export from there.

### 8. Compliance — always flag
GetGround and BuyAssociation emails are regulated communications. Always tell the person
the draft must be reviewed by Compliance before sending, and never present it as final.
Do not write content that constitutes financial, mortgage, tax, or investment advice.

### 9. Log the run to Supabase (so the owner sees ALL users' feedback)
After handing over the link, POST ONE row to the Supabase `email_builder_feedback` table.
This captures usage and feedback from every user on any account, using only the public
publishable key (no per-user connector needed). Run:

```bash
node -e '
const K="sb_publishable_DLQRih3BYJ7U9F3jk7TyaA_u731Rwvt";
fetch("https://nckkfaldcplgfmldsrou.supabase.co/rest/v1/email_builder_feedback",{
  method:"POST",
  headers:{apikey:K,Authorization:"Bearer "+K,"Content-Type":"application/json",Prefer:"return=minimal"},
  body:JSON.stringify({
    project:"email builder", brand:"<getground|buyassociation>", audience:"<audience>",
    goal:"<goal>", campaign:"<utm_campaign>", sentiment:"<ok|unhappy>",
    feature_request:"<verbatim ask it cannot do, or empty>",
    note:"<1 line of what they built>", requester:"<session user email>"
  })
}).then(r=>console.log("logged",r.status)).catch(()=>{})'
```
Set `sentiment` to `unhappy` if they rejected several drafts or sounded frustrated, else `ok`.
Put any "it should also do X" ask in `feature_request` verbatim. Metadata only — never write
tokens, recipient personal data, or the full draft. If the POST fails, skip silently (do not
block the person's email over logging).

## Encoding (build the SHORT link)

Preferred: save the draft to Supabase and put only a short id in the link. This gives a
tiny, clickable URL and is fast to output. Write the draft to a temp file, then:

```bash
node -e '
const fs=require("fs"), zlib=require("zlib");
const SUPABASE_URL="https://nckkfaldcplgfmldsrou.supabase.co";
const SUPABASE_KEY="sb_publishable_DLQRih3BYJ7U9F3jk7TyaA_u731Rwvt"; // publishable, safe to be public
const draft = JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const base="https://elizabethprendergast-lab.github.io/getground-tools/email-builder.html";
const cb = Date.now().toString(36);
(async () => {
  const id = Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/email_drafts", {
      method:"POST",
      headers:{ apikey:SUPABASE_KEY, Authorization:"Bearer "+SUPABASE_KEY, "Content-Type":"application/json", Prefer:"return=minimal" },
      body: JSON.stringify({ id, draft, name: draft.name || null })
    });
    if (!res.ok) throw new Error(await res.text());
    console.log(base + "?v=" + cb + "#id=" + id);            // short link
  } catch (e) {
    // Fallback: inline compressed draft if the DB write fails.
    const z = zlib.deflateSync(Buffer.from(JSON.stringify(draft),"utf8"))
      .toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    console.log(base + "?v=" + cb + "#z=" + z);
  }
})();
' /path/to/draft.json
```

The builder reads `#id=` by fetching the draft row from Supabase; if the DB is unreachable
it falls back to the inline `#z=` link. `?v=` busts builder caching. Never store customer
personal data in the draft (see step 8/9).

The builder decodes `#z=` (deflate) on load, or `#d=` (plain base64) for legacy links, and
renders the email. The link takes precedence over anything baked into the builder.
Give the person the printed URL. If it still feels long, note that the length is just the
email travelling inside the link — it works fine clicked.

## Block reference (fields Claude sets)

- `header` — logo. `{ src, alt, align:"center", width:28 }`
- `hero` — `{ eyebrow, heading, sub, btnText, btnUrl, btnBg, btnColor, btnSize,
  bg, gradFrom, gradTo, gradStop, color, align, eyebrowSize, headingSize, subSize,
  radius, radiusPos, padTop, padBottom, btnGap, marginY }`. Use `\n` in heading/sub for
  line breaks. Solid `bg` (leave gradFrom/gradTo empty) renders most reliably in dark
  mode; or set the brand gradient.
- `text` — `{ text, align, fontSize, color, bg, paddingY, padTop, padBottom, radius,
  radiusPos }`. Use `**bold**`, `\n\n` for paragraphs. Set `bg`+`color` for a colour band.
- `heading` — `{ text, size, color, align, paddingY }`
- `checklist` — `{ items:[...], tickColor, color, fontSize, bg, radius, paddingY }`
- `button` — `{ text, url, bg, color, align, fontSize, padTop, padBottom }`
- `buttonrow` — `{ primaryText, primaryUrl, primaryBg, primaryColor, secondaryText,
  secondaryUrl, secondaryBg, secondaryColor, secondaryBorder, align, fontSize }`
- `stats` — `{ stats:[{num,label}], bg, numColor, labelColor, numSize, labelSize }`
- `featurecards` — `{ items:[{title,desc,emoji,link}], accent, bg, color, descColor, fontSize, gap, paddingY }`
  (left accent bar; `emoji` shows above title; `link` renders a "Book →" link)
- `iconcards` — SaaS-style bordered icon cards `{ items:[{icon,title,desc}], titleColor,
  descColor, borderColor, bg, titleSize, descSize, columns, gap, paddingY }`. Fluid: sit
  side by side when wide, stack one-per-row on mobile automatically (no media query needed).
  Good for a "what you get / why" grid. `icon` is an emoji.
- `actioncard` — numbered card `{ number, heading, body, ctaText, url, headingSize,
  bodySize, bg, border, badgeBg, accent, headingColor, bodyColor, radius, paddingY }`
- `quote` — `{ text, accent, bg, color, fontSize, paddingY }`
- `pivot` — contrast line `{ text, color, fontSize, paddingY }`
- `image` — `{ src, alt, align, width, radius, fullWidth }`. Leave `src` empty to render a
  labelled "Image slot" placeholder (uses `alt` as the label) for the person to fill in.
- `imagetext` — image beside text `{ src, alt, imgPos, imgWidth, heading, body, ... }`
  (stacks image-over-text on mobile)
- `imagegrid` — 2-up image tiles `{ items:[{src,alt,caption,emoji,link}], gap, ... }`
- `divider` — `{}` thin rule. `spacer` — `{ height }` vertical gap.
- `section` — coloured/rounded band wrapper `{ bg, color, radius, radiusPos, paddingY }`.
- `footer` — footer band; or use a `text` block with `bg:"#D0E0E3"`, small `fontSize`.
- `signoff` / signature — use a `text` block: `"Best,\n\n**Name**\nRole, GetGround"`

Layout notes: headings/text take `align` (left/center/right). The `hero` reasserts its
alignment on mobile, so a centred hero stays centred on phones. `iconcards` and the
image+text blocks stack on narrow widths automatically.

## Notes
- Keep the connector scope minimal (read-only Notion where possible).
- If a large block of personal data is pasted, work with a reduced/anonymised version.
