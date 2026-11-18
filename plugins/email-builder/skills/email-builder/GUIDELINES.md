# GetGround email guidelines (v0.1, 18 Nov 2026)

Source of truth for every GetGround marketing and notification email built by Claude or by hand.
Owned by: Growth (Beth) until handed to Design. Design team: edit this file (or the Figma
library once it exists); the email skill reads it on every run, so changes go live company-wide.

Baseline: the house-style emails built Oct–Nov 2026 plus all reviewer feedback on them.
Reference builds:
- Marketing: [Rent anniversary Complete upsell](https://app-eu1.hubspot.com/email/25516403/edit/501489227985/content), [RRA webinar follow-up (video)](https://app-eu1.hubspot.com/email/25516403/edit/517533297888/content)
- Notification: [Complete next steps](https://app-eu1.hubspot.com/email/25516403/edit/512786315491/content), [Complete insurance](https://app-eu1.hubspot.com/email/25516403/edit/512987964611/content)

---

## 0. Pick the email type first

| Type | Use for | Look | From / reply-to | Subscription |
|---|---|---|---|---|
| **Marketing** | Campaigns, offers, webinars, seminars, newsletters, nurture | Dark teal gradient hero, bold, visual | The GetGround Team / gethelp@ | Product Marketing |
| **Personal** | Upsell, invites, sales follow-ups sent "from a person" | Light or no hero, conversational, photo sign-off | The contact owner (majority owner for a list), replies to them | Product Marketing |
| **Notification** | Receipts, next steps, form confirmations, service changes, feature updates | Light hero panel, calm, instructional, no selling | The sending team (e.g. GetGround Lettings / lettings@) or The GetGround Team / gethelp@ | Transactional where legally appropriate, otherwise Product Marketing |

Never send from hello@, info@ or team@.

---

## 1. How emails are built in HubSpot

- Template: `@hubspot/email/dnd/Start_from_scratch.html`. Always created as a **draft**. Never published or sent without a human.
- **Hybrid build:**
  - Layout and decoration in HTML: hero, cards, spacing, dividers, dark mode.
  - Copy and buttons in **native rich-text and button modules** wherever the layout allows, so anyone can edit wording or links in HubSpot without code.
  - Use raw HTML for copy only when a native module can't hold the layout (numbered step rows, coupon, details table).
- Module order: body → disclaimer rich text `module_17603721630922` (section `section_1760372163121`) → `@hubspot/email_footer`.
- Don't rely on the HubSpot account style settings (they're defaults). Set all styling inline.
- When editing via API, PATCH full `content` incl. all widgets; partial PATCHes wipe emails.

## 2. Layout

- 600px canvas, **single column**. Never put text blocks side by side. Stack cards (3-up grids stack vertically).
- Mobile-first: small inline padding (16–22px), wider desktop padding (24–40px) only inside `@media (min-width:600px)`, because Gmail can drop style blocks.
- Body text runs **full width**. No `max-width:480px`, no `text-wrap:balance`.
- Group related points (e.g. "in the webinar") in **one** card with numbered rows, not one box each.
- Secondary offers sit below the main content behind a divider, **above** the sign-off.
- Keep it short. Cut any section that doesn't earn its space; push detail to a guide or page.

### Spacing
| Where | Size |
|---|---|
| Between sections | 48px |
| Inside a group | 24–28px |
| Card padding | 32px 24px |
| Either side of a divider | 40px |
| Before "Any questions? Just reply…" | extra 16px |
| Below sign-off | **≥64px**, then a **32px** spacer before the footer |

Spacer row: `<td style="height:Npx;line-height:Npx;font-size:1px" class="dm-bg">&nbsp;</td>`

### Radii
Hero 24 · card/panel 20 · video thumbnail 16 · button 12 · step badge 10 · pill 999.

## 3. Typography

- Headlines: **Rethink Sans SemiBold 600**, sentence case. Stack: `'Rethink Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`
- Body: **Inter**, `'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`. Always use the brand fonts.
- Few sizes and weights. Clear hierarchy.

| Element | Marketing | Notification |
|---|---|---|
| H1 (hero) | 30px mobile / 34–38px desktop, white, line-height 1.15–1.2, letter-spacing -0.02em | 32 / 36px, #1F1F33 |
| Hero subline (optional) | — | 24px #0E666B |
| H2 | 28px #06363A | 22–26px #1F1F33 |
| Card H3 | 24px | 20–22px |
| Body | 18px / 1.6, #1A2530 | 18px / 1.7, #1F1F33 |
| Secondary | 16px #4A5F5E | 17px #4B4B5C |
| Small print | 14px | 14px #6B6B7B |

- Text inside cards is never smaller than 16px.
- Bold a few key phrases in body copy to aid scanning. Don't overdo it.
- The closing uses the same font and copy style as the opening.

## 4. Colour

| Token | Hex | Use |
|---|---|---|
| Dark teal | #06363A | Marketing hero, headings, dark buttons, badges |
| Teal gradient end | #0E666B | Hero gradient, notification subline |
| Brand teal | #18B8BC / #159FA2 | Pills, accents |
| Deep teal | #094C51 | Notification button text |
| Cyan | #A3ECEE | Marketing hero CTA, eyebrow text |
| Cyan button | #6EDDE1 | Notification CTA |
| Panel tint | #F0FAFA / #EBFEFE | Panels, notification hero |
| Card border | #D7EDED (marketing) / #E4E4EA (notification) | |
| Ink | #1A2530 / #1F1F33 | Body text |

Marketing hero: `background:#06363A; background-image:linear-gradient(160deg,#06363A 0%,#0E666B 100%)`.
Any text section has an **explicit white background**.

## 5. Dark mode (mandatory)

Every email must work in light and dark. Include:
- `:root{color-scheme:light dark;supported-color-schemes:light dark}`
- `dm-*` classes, each repeated under `@media (prefers-color-scheme: dark)`, `[data-ogsc]` and `[data-ogsb]`:

| Class | Dark value |
|---|---|
| `.dm-bg` (+ `.hse-body-background`, `.hse-section`) | #0B2124 |
| `.dm-panel` / `.dm-card` | #12383B, border #1E4E52 |
| `.dm-text` | #E4ECEC |
| `.dm-head` | #FFFFFF |
| `.dm-muted` | #A3ECEE |
| `.dm-line` | #1E4E52 |
| `.dm-keep-*` | pins buttons, badges and hero so they don't invert |

QA: check at 375px, with `<style>` stripped, in light and dark, before handing over.

## 6. Hero

- **Headline + one button.** An optional short subline (≤6 words, e.g. "Here's what happens next") only when it adds meaning. Never a paragraph of subtext.
- Control line breaks so the key phrase sits together on one line.
- No logo. No side images or extra cards in the hero (too busy on mobile). Optional eyebrow (12–13px caps, 0.08em tracking).
- Marketing: dark gradient hero, cyan button (#A3ECEE bg, #06363A text).
- Notification: #EBFEFE panel, #6EDDE1 button with #094C51 text.
- Personal: simple header or none; it should feel like a letter.
- Events/webinars: show date, time and place as a small calendar-style details block, and repeat it in the final CTA panel.

## 7. Buttons & CTAs

- Primary actions are **buttons**, never text links.
- Bulletproof button: VML `v:roundrect` (50px, arcsize 20%) for Outlook plus `<a style="display:inline-block;padding:15px 28px;border-radius:12px;font-size:16–18px;font-weight:700">`. Labels end in `&nbsp;&nbsp;&rarr;`.
- Variants: dark (#06363A / white), cyan (#A3ECEE / #06363A), ghost secondary (transparent, 2px solid border, 14px 24px padding).
- One main CTA (it may repeat at the bottom). An optional ghost secondary for "Read the full guide".
- Labels describe the action ("Book a call", not "Claim my £500").
- **Book-a-meeting CTAs link to the relevant person's HubSpot meeting/calendar link.** Use "Request a call" or a pre-written reply email when the ask is lighter than a booked meeting.
- Webinar registration buttons → generic `/webinar-confirmation` page (a click = registration).
- Marketing campaigns that drive calls need a workflow branch: clicked → call task with the `power_dialler__*` fields set.

## 8. Images & video

- Graphics are on-brand (UX-imagery style), minimal or no text, readable at phone size, with an obvious meaning. Nothing "AI-looking".
- Host in HubSpot Files `/email-images`. `width="600" style="width:100%;max-width:600px"`.
- **Video:** the thumbnail with a play button is its own full-width block **outside the hero**, radius 16, with the CTA button 20px underneath.
- Offers are styled like a **coupon**, not a giant number.
- Personal sends: the sender's real photo (64px round) in the sign-off.

## 9. Copy

- Subject + preview text: emotional pull, about the reader, not about GetGround.
- Open naturally (written intro paragraph). No generic openers, no jumping straight into jargon.
- Lead with real audience pain points. Fear-led hooks stay vague: no specific scare stats ("most", not "96%").
- Nurture, don't hard-sell: give value first (guides, AI analyser).
- Lists: snappy, one takeaway per point.
- No filler ("Join X and Y for…", "bring your questions to the Q&A"). No generic trust lines. No emojis. No em dashes.
- Don't use product names the audience may not know (explain "Complete" or avoid it).
- Only claim what's true. Rent figures = actual wallet rent, never the onboarding estimate.
- Greeting: `Hi {{ contact.firstname }}` with fallback "Hi there". Use other personalisation tokens only when the data is reliably populated.
- Sign-off: "Got a question? Just reply to this email." then **The GetGround team** (or the team name, e.g. The GetGround Lettings team). Personal: name, title on the next line, photo. Never "Happy landlording".
- Webinar reminders: "Can't make it? Register anyway and we'll send you the recording."
- Webinar follow-ups send the recording only, never the deck.
- No content that constitutes financial, mortgage, tax or investment advice.

### Notification specifics
- Calm, human, instructional, **no upsell**.
- Receipt = receipt plus "next steps will follow". The next-steps email follows separately.
- One task CTA, an optional ghost "Read the full guide", and the detail on the page.
- After the sign-off and a divider: a "Need a hand?" block with mailto links (team inbox / gethelp@).

## 10. Links & UTMs (applied automatically)

Every http(s) link except GOV.UK/legal links, mailto and tel:

```
utm_source=email&utm_medium=gg_hubspot&utm_campaign=<team>_<initiative>_<MMYY>&utm_content=<unique_link_id>
```
- `utm_medium=ba_hubspot` for BuyAssociation.
- Lowercase, spaces/hyphens → `_`, collapse repeats. Matches the [team UTM builder](https://elizabethprendergast-lab.github.io/getground-tools/utm-builder.html).
- `utm_content` is unique per link (`hero_button`, `card2_link`, `bottom_button`…).
- Notification links get UTMs too (campaign = the flow, e.g. `onboarding_complete_next_steps`).
- AI analyser links pre-fill and auto-submit a question.

## 11. Footer disclaimers (applied automatically)

- The disclaimers and the HubSpot footer (address + unsubscribe) sit in a full-width **light blue band `#D0E0E3`**, 36px padding top and bottom.

- Disclaimers go **only** in footer module `module_17603721630922` as 12px `<h2 style="font-size:12px;line-height:175%;font-weight:normal">` paragraphs. Never put a T&Cs block in the body.
- Wording: exact text from the Notion [Required disclaimers](https://app.notion.com/p/2701ded8cfd2801ca104d4999890931d) page.
- Offer/partner T&Cs are appended to the footer.
- Include every disclaimer that applies and **remove** any that don't (watch for lines cloned from older emails):

| Disclaimer | Include when the email mentions… | Review |
|---|---|---|
| General | Always | — |
| Mortgages (Fiducia FRN 917537, Stonebridge FRN 454811, commissions/repossession, fraud warning) | Mortgages, remortgaging, brokers, finance | **Compliance** unless a recurring approved mortgage email |
| Insurance (Superscript / Enro Ltd FRN 656459) | Insurance, incl. any Complete plan email | — |
| Financial Account (Modulr FRN 900573) | The GetGround financial/business account | — |
| Open Banking (Yapily FRN 827001) | Bank feeds, connecting bank accounts | — |
| Investment Pots (RiskSave FRN 775330, capital at risk) | Investment Pots | **Compliance + RiskSave every time** |
| AI Property Analyser | Any link to the analyser | — |
| Forms | Any embedded form | — |
| BuyAssociation entity / capital at risk / not FCA regulated | BuyAssociation investment emails | Compliance |

Every draft is flagged "requires human review before sending". Anything touching mortgages, investments or financial promotions goes to Compliance.

## 12. Hand-over checklist (the skill runs this every time)

- [ ] Draft created, not published. Editor link given: `https://app-eu1.hubspot.com/email/25516403/edit/<ID>/content`
- [ ] Correct type, sender, reply-to, subscription
- [ ] Hero rule, single column, spacing, ≥64px + 32px at the end
- [ ] Brand fonts, dark mode classes, 375px check
- [ ] All buttons native/bulletproof; every link has UTMs with a unique `utm_content`
- [ ] Footer disclaimers: all that apply, none that don't
- [ ] Compliance flag stated where required
- [ ] Test email offered before any send
