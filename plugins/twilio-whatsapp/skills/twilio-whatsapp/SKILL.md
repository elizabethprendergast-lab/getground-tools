---
name: twilio-whatsapp
description: >-
  Send a one-off bulk WhatsApp message (webinar or seminar invite, reminder, "last chance",
  campaign launch, Black Friday) from GetGround's Twilio marketing number +44 7863 781489.
  Builds and cleans the audience from HubSpot, ALWAYS removes WhatsApp unsubscribes and DNC
  contacts, gets the Meta template approved, sends a test, shows count + cost, and only sends
  after an explicit OK. Use whenever anyone wants to send, schedule, cost up or report on a
  WhatsApp via Twilio, or a big WhatsApp send that shouldn't use HubSpot's WhatsApp allowance.
  Triggers include "send a WhatsApp via Twilio", "WhatsApp blast", "WhatsApp my list",
  "how much would a WhatsApp to X people cost", "WhatsApp the webinar list".
---

# GetGround Twilio WhatsApp sends

Process page (the source of truth, re-read if unsure):
https://app.notion.com/p/41a1ded8cfd28172912dfa09757380be

**Twilio** is for one-off, large WhatsApp sends. **HubSpot WhatsApp** is for always-on
workflows (missed-call WhatsApp etc.). Never raise the HubSpot WhatsApp allowance for a
one-off send.

`scripts/wa.py` does the Twilio parts deterministically (setup check, cost estimate,
template submit/status, test, send, results). Run it with `python3 -I`.

Fixed setup (don't change):
- Sub-account "GetGround Marketing WhatsApp" (its SID is on the Notion page; the script finds it from the key)
- Number +44 7863 781489. **Always send via the Messaging Service "GetGround Marketing WhatsApp"**
  (sending straight from the number fails with 63007). The script does this.
- Replies get an automatic reply pointing to the main WhatsApp +44 7407 837450 (HubSpot help
  desk). Every sent message and reply is logged on the HubSpot contact timeline automatically.
  You don't need to do either.

## 0. Setup check
`python3 -I scripts/wa.py check` (default key file `~/.secrets/twilio_whatsapp.txt`: SID on
line 1, secret on line 2; or set `TWILIO_WA_KEY_FILE`). If it fails, walk the person through
"Get your own Twilio API key" on the Notion page. **Never ask them to paste the secret into
chat**; they give you the file path only. Never print or echo key values.

## 1. Brief
Ask (only what's missing): purpose, link, language, who it's for, when, and whether to
send to everyone or tiers. One message per person per campaign day.

## 2. Build the audience (from HubSpot)
Use the HubSpot connector or API. Follow the Notion "Who to send to" tiers:

**Must have, remove anyone who fails:**
- Valid mobile in E.164 (UK +44 7…, HK +852 5/6/9…). Fix numbers missing a country code,
  drop landlines/junk, de-duplicate by number.
- **STANDING RULE, every list, every send:** remove anyone with ANY value in
  `hs_whatsapp_communication_subscriptions_opted_out` ("WhatsApp subscription types:
  unsubscribed") and anyone on a Do Not Contact list or restricted for the campaign
  (lettings-restricted / restricted-partner / BPDR for Complete). Do NOT use
  `hs_whatsapp_consent_status`: it doesn't exist, so it silently filters nobody.
- Already converted (registered / booked / bought): use the enrolment workflow or
  registration list, not just the form.
- Previously failed as "not on WhatsApp": `python3 -I scripts/wa.py not-on-whatsapp > off.txt`
  and drop those numbers.

**Tier the rest and show counts per tier:**
1. Engaged with the related emails (opened/clicked), or signs they use WhatsApp with us
   (WhatsApp number on record, Last WhatsApp received date, Aircall WhatsApp, read a past
   Twilio WhatsApp). Right language/market, recent.
2. Non-openers / older leads: ~4x worse (0.7% vs ~3% sign-up on 16 Nov) and more blocks.
   Only as a second, smaller batch after tier 1 results, newest first.

Report: "Started with N. Removed: X unsubscribed, Y DNC/restricted, Z converted, W invalid,
V not on WhatsApp, U duplicates. Tier 1: A, tier 2: B." Save the final CSV (columns `phone`
in E.164, `first_name`, optional `tier`, `hubspot_id`) to `~/Downloads/`.

## 3. Cost
`python3 -I scripts/wa.py cost send.csv`. Charged per **delivered** message (UK ≈ $0.062,
HK ≈ $0.073; measured 16 Nov 2026), no monthly fee. Remind them to check the Twilio balance.

## 4. Template
WhatsApp marketing messages need a Meta-approved template. Draft it in the right language:
`{{1}}` = first name, one URL button, UTMs
`utm_source=whatsapp&utm_medium=twilio_whatsapp&utm_campaign=<campaign>&utm_content=<msg name>`.
Compliance: mortgages, insurance, investments or the financial account need the usual
disclaimer and Compliance review. Get the person to approve the wording, then
`python3 -I scripts/wa.py template-create --name <snake_name> --lang <en|zh_HK> --body-file body.txt --button-text "..." --url "..."`
and `python3 -I scripts/wa.py template-status <HX…>`. Approval is usually minutes, sometimes
hours: submit at least a day before time-sensitive sends.

## 5. Test
`python3 -I scripts/wa.py send send_test.csv --content-sid HX… --confirm` with only the
sender's own number in the CSV. They check copy, name, button and link on their phone.

## 6. Confirm, then send
Show: final count per tier, estimated cost, template preview, send time. **Wait for an
explicit "yes, send"**: never send on assumption. Then
`python3 -I scripts/wa.py send send.csv --content-sid HX… --confirm` (one at a time through
the Messaging Service; writes a log CSV to Downloads). Suggest the first 100 first if they
want to test the waters: once started, the whole list goes in about a minute.

## 7. Results
`python3 -I scripts/wa.py results --since <ISO time of send>`: delivered / read / failed /
cost, top error codes (63024 = not on WhatsApp; 63049/63032 = Meta did not deliver: marketing limits or the user blocked us). Check
sign-ups by tier a few minutes later and again later in the day. Report in chat, briefly.

## Never
- Send without the unsubscribe + DNC check, or without an explicit OK on the final count.
- Use bought or cold lists.
- Paste or print API secrets.
- Send from the HubSpot-connected number +44 7407 837450 via Twilio.
