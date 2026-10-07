// Cloudflare Pages advanced-mode worker for Beth Reports.
//   GET /api/stats     -> live call-task completion stats for the active report (no PII), token from secret
//   GET /api/outcomes  -> live call-outcome breakdown, matched task -> contact -> call
//   everything else    -> static assets (the reports page); /campaign/* rewrites to index.html (SPA)

const REPORTS = {
  "mrr-nov-sprint": {
    name: "MRR Nov Sprint",
    ownerIds: ["76256251", "1297173186"], // Asya Wu, Chey Pienaar
    ownerNames: { "76256251": "Asya Wu", "1297173186": "Chey Pienaar" },
    // Each rep's saved HubSpot task view (Assigned to <rep> AND Task stage is none of "All
    // closed") — the "not completed, assigned to me" queue Chey/Asya each built themselves.
    // The button links here with ?query=<campaign token> layered on top (HubSpot's saved-view
    // filters live server-side on the view id; only free-text query is settable via the URL).
    // Deliberately NOT adding owner IDs here to ownerIds/ownerNames (those drive the Active-Lead
    // owner filter and the pre-seeded rep list) — this is just button-link data for whoever
    // shows up dynamically in the reps breakdown (see fetchOwnerNames/stats in code below).
    ownerViews: { "76256251": "160475825", "1297173186": "160475731", "29178925": "160648025" }, // Asya, Chey, Yoana Chung
    // The only reps whose calls/meetings/notes count as campaign outcomes for projects with
    // campaignRepsOnly: true (see outcomeForEnrollmentTask). The property, mortgage and
    // Investment Consultant teams work many of the same contacts in parallel, and their calls
    // were being credited to these queues (2 Oct audit: 6 of 52 done BA/LTD tasks, e.g. David
    // Paradis's positive call on a Chey BA task). Activity by anyone else is ignored, not shown.
    campaignRepIds: ["76256251", "1297173186", "29178925"], // Asya, Chey, Yoana
    hubspotSubdomain: "app-eu1.hubspot.com",
    // "Created at is after 02/09/2026 (BST)" in the reference HubSpot report — HubSpot's
    // "is after [date]" is exclusive of that date, so this is 3 Sep 00:00 BST = 2 Sep 23:00 UTC.
    sprintStart: "2026-09-02T23:00:00.000Z",
    // Split by title so unrelated call sequences aren't reported as one meaningless combined
    // queue. First match wins; anything matching none falls into an "other" bucket (surfaced,
    // not silently dropped). NOTE: "Reengage" alone appears in more than one project's title
    // (both the LTD and Pack companies sequences) — match on the more specific full phrase
    // in each, not the shared word, or they'll collide.
    // Ordered by priority (highest first) — drives both the nav bar and the landing grid.
    projects: [
      {
        key: "active-lead",
        closed: true, // Moved under "Closed" on the dashboard (5 Oct) — data still computed/shown.
        label: "Active Lead — Ltd Company Set-up",
        match: (s) => s.includes("Active Lead"),
        // Real naming convention (verified live against actual task subjects, not guessed):
        // "#N | Call | Active Lead | <subcategory>" — subcategory varies (A&T, BA Website
        // Enquiry, BA Property Forms Backlog | ..., etc.), so the fixed/searchable part
        // excluding the call number is "Call | Active Lead".
        namePattern: "Call | Active Lead",
        searchTerm: "Call | Active Lead",
        context: "Active, in-funnel leads for LTD company set-up (and related Accounting & Tax / Lettings & Management add-ons) — still warm, highest priority of the four.",
        // Deal attribution (see searchTasksForAttribution below) is meant to count a contact
        // regardless of which rep's name ended up on the task — but "Active"/"Lead"/"Call" are
        // too generic to isolate this project portal-wide: tested every AND combination
        // (including restricting to workflow-automated tasks) and it stayed stuck at 50,000+
        // results, almost all unrelated tasks from other workflows using the same common words.
        // No other task property (pipeline, source, etc.) distinguishes it either — every task
        // in this portal shares the same default task pipeline. So attribution for this one
        // project still uses the narrower owner-filtered search as a stopgap; a proper fix
        // would pull enrollment directly from the "Calls only Growth Loops" workflow
        // (4344179957) instead of matching on task text at all.
        attributionSearch: { tokens: ["Active Lead"], ownerFiltered: true },
      },
      {
        key: "reengage-pack",
        closed: true, // Moved under "Closed" on the dashboard (5 Oct) — data still computed/shown.
        label: "Reengage — Pack companies",
        match: (s) => s.includes("Pack companies"),
        // Real subject: "#N | Call | Reengage | Pack companies". "Pack" alone collides with
        // lots of unrelated tasks elsewhere in the portal (furniture pack, starter pack,
        // Pro Pack...) — use the full fixed phrase so a HubSpot search actually isolates
        // these, not just anything with "pack" in it.
        namePattern: "Call | Reengage | Pack companies",
        searchTerm: "Call | Reengage | Pack companies",
        context: "Customers who bought one of our previous company-formation packs, now outdated, who need to be moved onto a current plan.",
        // Verified against real data: "Pack" AND "companies" (CONTAINS_TOKEN has no phrase
        // matching, so these are ANDed as separate filters, not a literal substring) returns
        // 73 tasks, all real matches for this project — clean enough to search without an
        // owner filter, so attribution counts a contact regardless of which rep worked them.
        attributionSearch: { tokens: ["Pack", "companies"], ownerFiltered: false },
      },
      {
        key: "reengage-unmigrated",
        label: "Reengage — Unmigrated customers",
        match: (s) => s.includes("unmigrated customers"),
        // Real subject: "#N | Call | Reengage | unmigrated customers".
        namePattern: "Call | Reengage | unmigrated customers",
        searchTerm: "Call | Reengage | unmigrated customers",
        context: "Customers still on the old paywall-off pricing who haven't migrated to a current subscription. Companies flagged by Companies House as dissolved or struck off have already been removed from this queue and excluded via a HubSpot list.",
        // Verified against real data: "unmigrated" alone returns 175 tasks, all real matches
        // for this project (a genuinely rare word in this portal) — clean without an owner filter.
        attributionSearch: { tokens: ["unmigrated"], ownerFiltered: false },
      },
      {
        key: "reengage-ltd",
        label: "Reengage — LTD missed leads",
        match: (s) => s.includes("LTD missed leads"),
        // Real subject: "#N | Call | Reengage | LTD missed leads". "LTD" alone collides
        // heavily with dozens of unrelated LTD-setup/mortgage tasks — use the full phrase.
        namePattern: "Call | Reengage | LTD missed leads",
        searchTerm: "Call | Reengage | LTD missed leads",
        context: "Landlords who inquired about an LTD company and had a closed-lost deal — a second pass to re-engage them before writing them off.",
        // Verified against real data: "Reengage" AND "LTD" AND "missed" returns 165 tasks, all
        // real matches for this project ("LTD" + "missed" alone isn't enough — collides with
        // unrelated meeting-followup tasks — the third token is needed) — clean without an
        // owner filter.
        attributionSearch: { tokens: ["Reengage", "LTD", "missed"], ownerFiltered: false },
        // Enrollment-window rules (see outcomeForEnrollmentTask), restricted to campaignRepIds —
        // these leads overlap heavily with live property/mortgage pipelines.
        outcomeMatching: "enrollment",
        campaignRepsOnly: true,
        // Call tasks only — no campaign email. A contact self-booking (e.g. Sunny Idahosa, via
        // the follow-up email Asya sent after speaking to her) is the rep's doing, so every
        // meeting here counts as "by rep" — see outcomeForEnrollmentTask.
        noCampaignEmail: true,
      },
      {
        key: "reengage-nonpaying",
        closed: true, // Moved under "Closed" on the dashboard (5 Oct) — data still computed/shown.
        label: "Re-engagement — Non-paying customers (old partner leads)",
        match: (s) => s.includes("Non paying customers - old partner leads"),
        // Real subject: "#N | Call | Re-engagement | Non paying customers - old partner leads".
        // These are customers who used GetGround services for free via a now-deprecated
        // partner portal (Signature Finance Group Ltd, Titanium PF, etc.) and need to move to
        // a paid plan or offboard. Task creation/assignment is handled by a HubSpot workflow
        // (not tied to a fixed owner list) — this project exists purely for attribution
        // tracking, so it's owner-agnostic from the start rather than needing a later fix.
        namePattern: "Call | Re-engagement | Non paying customers - old partner leads",
        searchTerm: "Call | Re-engagement | Non paying customers - old partner leads",
        context: "Customers using GetGround services for free via a deprecated partner portal (Signature Finance Group Ltd, Titanium PF, and similar) who need to move to a paid plan before losing access.",
        // Verified against real data before shipping: "old" AND "partner" AND "leads" returns 0
        // existing tasks (a brand-new naming convention, not previously used in this portal) —
        // clean without an owner filter.
        attributionSearch: { tokens: ["old", "partner", "leads"], ownerFiltered: false },
      },
      {
        key: "ba-closed-won-reengage",
        closed: true, // Moved under "Closed" on the dashboard (5 Oct) — data still computed/shown.
        label: "Experiment — BA closed won deal reengage",
        match: (s) => s.includes("Experiment | BA closed won deal reengage"),
        // Real subject: "#N | Call | Experiment | BA closed won deal reengage". First wave:
        // old BuyAssociation leads with a Closed Won deal who bought 2+ properties via BA -
        // each gets an email plus this call task. Task creation/assignment mechanism not yet
        // confirmed to be owner-tied, so this starts owner-agnostic like the other experiments.
        namePattern: "Call | Experiment | BA closed won deal reengage",
        searchTerm: "Call | Experiment | BA closed won deal reengage",
        context: "First wave of old BuyAssociation leads with a Closed Won deal, starting with those who bought 2+ properties via BA - re-engagement experiment (email + call).",
        // Verified against real data before shipping: "BA" AND "closed" AND "won" returns 0
        // existing tasks (brand-new naming convention) - clean without an owner filter.
        attributionSearch: { tokens: ["BA", "closed", "won"], ownerFiltered: false },
        // Email + call, so enrollment-window rules apply; restricted to campaignRepIds since
        // David Paradis (Investment Consultants) works this BA base in parallel.
        outcomeMatching: "enrollment",
        campaignRepsOnly: true,
      },
      {
        key: "upsell-complete",
        label: "Upsell — Complete plan upsell",
        // Two naming conventions land here: the original "Complete upsell - <suffix>" batches
        // and, from 2026-09-28, "Complete plan mrr - core users" / "- free users". Matched as
        // two explicit fixed phrases (not a shared prefix) so a future unrelated "Complete ..."
        // task doesn't silently start counting here too.
        match: (s) => s.includes("Call | Upsell | Complete upsell") || s.includes("Call | Upsell | Complete plan mrr"),
        // Real subjects: "#1 |  Call | Upsell | Complete upsell - <suffix>" (suffix varies:
        // "positive in last campaign", then later "batch 1", "batch 2", …) and "#1 | Call |
        // Upsell | Complete plan mrr - core users" / "- free users". Match the fixed middle
        // phrase so every batch is captured regardless of suffix or call number.
        namePattern: "Call | Upsell | Complete upsell / Call | Upsell | Complete plan mrr",
        searchTerm: "Call | Upsell | Complete",
        context: "Core-plan customers called to upsell to Complete — starting with those who were positive in a previous campaign, then further batches (including the MRR-targeted core-users/free-users batches).",
        // Originally verified against real data (2026-09-28): "Upsell" AND "Complete" alone
        // collided with the older "#2 Call Task | Complete Plan Upsell | Reengagement" campaign
        // (1,000+ tasks) and free-text "complete plan upsell" tasks, so that first version
        // excluded "Plan" and "Reengagement" (17 tasks back: 16 real + 1 stray, "other"-bucketed).
        //
        // UPDATE (2026-09-28): all real tasks for this project (the original 16, renamed, plus
        // the new core-users/free-users batches) now share "Complete plan mrr" in the subject —
        // so require "mrr" as a positive AND token instead of trying to exclude the older
        // campaign by word. This is more direct than the notTokens approach it replaces: CONTAINS
        // _TOKEN has no phrase matching (confirmed elsewhere in this file — a multi-word filter
        // value is treated as an OR of its words, not a phrase, so "complete plan mrr" as a
        // single value would broaden the search, not narrow it) — but the file's usual pattern
        // of one word per filter, ANDed, works fine here: "mrr" is distinctive enough that the
        // older Reengagement campaign (no "mrr" in its title) should fall out on its own, without
        // depending on excluding "Plan" (which the new tasks legitimately contain) or guessing at
        // every stray free-text collision. Kept "Reengagement" as a second, redundant guard.
        // NOT independently re-verified against live HubSpot data (couldn't reach the API to test
        // this when writing it) — before relying on this campaign's numbers, check the
        // "other"/unmatched count on the dashboard for a jump, or re-run the token combination
        // against the real Tasks Search API the way the other projects above were verified.
        attributionSearch: { tokens: ["Upsell", "Complete", "mrr"], notTokens: ["Reengagement"], ownerFiltered: false },
        // This queue runs alongside the complete_0926 email, and reps often tick the task off
        // before/after the actual call (or a colleague covers it), so the live -2h/+15min
        // completion anchor mis-attributed 7 of the first 34 done tasks vs a manual audit.
        // See outcomeForEnrollmentTask() for the enrollment-window rules used instead.
        outcomeMatching: "enrollment",
      },
      {
        key: "reengage-ltd-freemium",
        label: "Reengage — LTD freemium",
        // Real subjects: "#1 |  Call | Reengage | LTD freemium mrr" and "#2 | Call | Reengage |
        // LTD freemium mrr (Nurture)" — match the fixed phrase so later call numbers/suffixes
        // land here too. Doesn't collide with "LTD missed leads" (matched on its full phrase).
        match: (s) => s.includes("Call | Reengage | LTD freemium mrr"),
        namePattern: "Call | Reengage | LTD freemium mrr",
        searchTerm: "Call | Reengage | LTD freemium mrr",
        context: "LTD customers on the free plan, called to move them onto a paid plan — run alongside an email that lets them book a meeting directly.",
        // Verified against real data (2026-10-01): "freemium" alone returns 83 tasks portal-wide
        // (no date filter), every one of them this campaign (82 × #1, 1 × #2 Nurture). "LTD" is
        // a redundant second guard.
        attributionSearch: { tokens: ["LTD", "freemium"], ownerFiltered: false },
        // Email can book a meeting directly, same as Upsell-Complete — see outcomeForEnrollmentTask.
        outcomeMatching: "enrollment",
      },
      {
        key: "reengage-nonpaying-master",
        label: "Re-engagement — Non-paying master list",
        // Real subject: "#1 | Call | Re-engagement | Non paying customers (master list) mrr".
        // Doesn't collide with the closed "reengage-nonpaying" project (matched on its full
        // "- old partner leads" phrase).
        match: (s) => s.includes("Non paying customers (master list) mrr"),
        namePattern: "Call | Re-engagement | Non paying customers (master list) mrr",
        searchTerm: "Call | Re-engagement | Non paying customers (master list) mrr",
        context: "Master list of non-paying customers, called to move them onto a paid plan.",
        // Verified against real data (2026-10-06): "master" AND "list" returns 22 tasks
        // portal-wide, every one of them this campaign (all #1, created 6 Oct) — clean without
        // an owner filter.
        attributionSearch: { tokens: ["master", "list"], ownerFiltered: false },
        // Same attribution rules as Upsell-Complete — see outcomeForEnrollmentTask.
        outcomeMatching: "enrollment",
      },
    ],
  },
};

// Leading "#N |" (or "Call Task #N |") in the task title is the call-attempt number in this
// naming convention.
function callNumber(subject) {
  const m = /#(\d+)\s*\|/.exec(subject || "");
  return m ? m[1] : null;
}

function classifyProject(report, subject) {
  const p = (report.projects || []).find((p) => p.match(subject || ""));
  return p ? p.key : "other";
}

// ---- Call-outcome matching --------------------------------------------------------------
// This account has no direct task<->call association (confirmed by testing
// /crm/v4/associations/tasks/calls/batch/read on real completed tasks — always
// NO_ASSOCIATIONS_FOUND). We reconstruct the link via the shared contact, per the method in
// hubspot_task_call_matching_logic.md:
//   - contact-mediated join (only usable edge)
//   - OUTBOUND calls only
//   - time-bounded around an anchor
//   - same owner is a *preference* (ranking), not a hard gate
//
// Anchor choice: doc §8 flags the general-population completion anchor as UNRELIABLE for
// auto-generated bulk/admin-completed campaign tasks (its example: nearest real call lands
// ~10 days before completion), prescribing creation+14 days for that cohort instead. All four
// projects here share that same "#N | Call | ..." naming convention, so an earlier version of
// this worker applied that override to the three "Reengage" projects.
//
// That assumption was tested against this account's real data and disproven: sampling every
// completed task in every project and checking both anchors directly against logged calls,
// the creation+14d/±7d anchor matched ZERO calls in ANY project (including Active Lead) — while
// the completion-time anchor matched the large majority in every project (75% of reengage-ltd,
// 45% of reengage-pack, 51% of reengage-unmigrated, 88% of active-lead). Concretely: reengage-ltd
// task 517484336353 (created 7 Sep, completed 9 Sep) has a real OUTBOUND call at 9 Sep 11:45:29
// — 19 seconds before its 11:45:48 completion timestamp, i.e. worked live, not bulk-completed
// weeks later. So in this account, unlike the doc's example, these tasks are completed by reps
// in real time when they make the call — the general-SDR pattern (doc §3), not the bulk pattern
// (§8). All four projects use the doc §3 completion anchor; the creation+14d constants are kept
// below (unused) for reference — don't reapply that override without re-running this same check.
const LIVE_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000; // doc §3: completion - 2h
const LIVE_WINDOW_AFTER_MS = 15 * 60 * 1000; // doc §3: completion + 15min
const CALL_MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // unused bulk-cohort window, kept for reference
const CAMPAIGN_ANCHOR_OFFSET_MS = 14 * 24 * 60 * 60 * 1000; // unused bulk-cohort anchor, kept for reference

// Disposition categorisation (doc §6). Matched on label since this account's custom
// dispositions aren't guaranteed to share the doc's example GUIDs; labels are pulled live
// from /calling/v1/dispositions, not hardcoded.
const CONNECTED_ANSWERED = new Set(["Progress to deal", "Positive", "Thinking about it", "Ring back later", "Not a fit", "Uninterested"]);
const NO_CONTACT = new Set(["No answer", "Busy", "Left voicemail"]);
const INVALID = new Set(["Wrong number"]);
// Legacy/generic Aircall dispositions that mean "someone picked up" but carry no real
// outcome — doc is explicit these are NOT "answered" under the strict definition.
const GENERIC_CONNECTED = new Set(["Connected", "Left live message"]);

function categoriseDisposition(label) {
  if (!label) return "no_disposition";
  if (CONNECTED_ANSWERED.has(label)) return "answered";
  if (NO_CONTACT.has(label)) return "no_contact";
  if (INVALID.has(label)) return "invalid";
  if (GENERIC_CONNECTED.has(label)) return "unclassified_connected";
  return "unclassified_connected"; // unknown/legacy label — treat as connected-but-unclear rather than silently dropping
}

// Soft gate: a single shared password, password-only (no username field) — a small custom
// login page + cookie, not HTTP Basic Auth (whose browser-native prompt always shows a
// username field alongside the password, which isn't removable) and not a full Cloudflare
// Access/Zero Trust setup. Enter the password once, get a long-lived cookie, done — no
// per-user accounts. If the secret isn't set yet, this fails OPEN (site stays reachable)
// rather than locking everyone out before the secret exists — set SITE_PASSWORD to turn it on.
const AUTH_COOKIE = "bp";

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function isAuthed(request, env) {
  if (!env.SITE_PASSWORD) return true;
  const cookie = request.headers.get("Cookie") || "";
  const m = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`).exec(cookie);
  return !!m && decodeURIComponent(m[1]) === env.SITE_PASSWORD;
}

function loginPageHtml(redirectTo, wrongPassword) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Beth Reports</title>
<style>
  :root { color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; } }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: light-dark(#f9f9f7, #0d0d0d); color: light-dark(#0b0b0b, #fff);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  form { display: flex; flex-direction: column; gap: 12px; width: 260px; padding: 28px;
    border: 1px solid light-dark(rgba(11,11,11,0.10), rgba(255,255,255,0.10)); border-radius: 10px;
    background: light-dark(#fcfcfb, #1a1a19); }
  h1 { font-size: 16px; margin: 0 0 4px; font-weight: 600; }
  input { font-size: 14px; padding: 8px 10px; border-radius: 6px;
    border: 1px solid light-dark(rgba(11,11,11,0.20), rgba(255,255,255,0.20));
    background: light-dark(#fff, #0d0d0d); color: inherit; }
  button { font-size: 14px; padding: 8px 10px; border-radius: 6px; border: none; cursor: pointer;
    background: #2a78d6; color: #fff; font-weight: 600; }
  .error { color: #d03b3b; font-size: 12px; margin: 0; }
</style></head>
<body>
  <form method="POST" action="/__login">
    <h1>Beth Reports</h1>
    <input type="hidden" name="redirect" value="${escapeAttr(redirectTo)}" />
    <input type="password" name="password" placeholder="Password" autofocus required />
    ${wrongPassword ? `<p class="error">Wrong password.</p>` : ""}
    <button type="submit">Enter</button>
  </form>
</body></html>`;
}

async function handleLogin(request, env) {
  const form = await request.formData();
  const password = String(form.get("password") || "");
  const redirectTo = String(form.get("redirect") || "/");
  if (env.SITE_PASSWORD && password === env.SITE_PASSWORD) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectTo,
        "Set-Cookie": `${AUTH_COOKIE}=${encodeURIComponent(password)}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }
  return new Response(loginPageHtml(redirectTo, true), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__login") return handleLogin(request, env);
    if (!isAuthed(request, env)) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Authentication required" }, 401);
      return new Response(loginPageHtml(url.pathname + url.search, false), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/stats") return stats(url, env);
    if (url.pathname === "/api/outcomes") return outcomes(url, env);
    if (url.pathname === "/api/deals") return dealAttribution(url, env);
    if (url.pathname === "/api/referrals") return referrals(url, env);
    if (url.pathname === "/api/meetings") return meetingsBooked(url, env);
    if (url.pathname === "/api/btl-calc") return btlCalcReport(url, env, ctx);
    // Per-campaign pages are query-string routed (/?campaign=key) rather than path-routed
    // (/campaign/key) — tried path-routing first, but it needs a server-side rewrite to the
    // SPA shell for a path with no matching static file, and that rewrite hit an asset-server
    // redirect-to-"/" quirk in local dev (untested whether it also affects production; not
    // worth the risk). Query-string avoids the rewrite entirely: "/" already serves
    // index.html with no custom logic, so this needs none either.
    return env.ASSETS.fetch(request);
  },
};

function getReport(url) {
  const reportKey = url.searchParams.get("report") || "mrr-nov-sprint";
  return [reportKey, REPORTS[reportKey]];
}

// HubSpot's Search API rate-limits concurrent requests more aggressively than other CRM
// endpoints. /api/stats and /api/outcomes each run their own searchTasksForAttribution() pass
// and the client fires both at once (Promise.all), so a 429 here is expected, not exceptional.
// Every HubSpot call in this file MUST go through this helper: a naive `fetch(...).then(r =>
// r.json())` treats a rate-limit error body (no `.results` field) as "0 results, no more
// pages" and silently truncates counts instead of failing loudly — verified this happening
// (Pack companies read as 3 total instead of 73, Unmigrated as 0 instead of 175) before this
// fix, with no error surfaced anywhere.
async function hsFetch(url, opts, attempt = 0) {
  const r = await fetch(url, opts);
  if (r.status === 429 && attempt < 5) {
    const retryAfterS = Number(r.headers.get("Retry-After")) || 1;
    await new Promise((res) => setTimeout(res, Math.max(retryAfterS * 1000, 500 * (attempt + 1))));
    return hsFetch(url, opts, attempt + 1);
  }
  if (r.status >= 500 && attempt < 3) {
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    return hsFetch(url, opts, attempt + 1);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HubSpot API ${r.status} on ${url}: ${j.message || JSON.stringify(j)}`);
  return j;
}

async function runTaskSearch(API, H, filterGroups) {
  let after = null, page = 0, total = 0;
  const results = [];
  do {
    const body = {
      filterGroups,
      properties: ["hs_task_subject", "hs_task_status", "hubspot_owner_id", "hs_createdate", "hs_task_completion_date", "hs_task_priority"],
      limit: 100,
    };
    if (after) body.after = after;
    const j = await hsFetch(`${API}/crm/v3/objects/tasks/search`, { method: "POST", headers: H, body: JSON.stringify(body) });
    total = j.total ?? total;
    results.push(...(j.results || []));
    after = j.paging && j.paging.next && j.paging.next.after;
    page++;
  } while (after && page < 10);
  return { total, results };
}

// Deal attribution (see dealAttribution below) is meant to answer "did this contact convert,"
// not "did rep X convert them" — a contact should count whether Asya, Chey, or an SDR working
// the same queue made the call. Per-project ownerIds filtering was silently dropping real
// conversions whose qualifying task landed on an untracked owner (e.g. Kerry Wilton's Active
// Lead task was assigned to SDR Billy Hunt, not Asya/Chey, so she never entered the tracked
// contact set even though her resulting Plans deal was real and Asya-owned).
// CONTAINS_TOKEN has no phrase matching (a single filter value like "Call | Active Lead" is
// treated as an OR of its words, confirmed against real data: 51k+ results, barely narrower
// than "LTD" alone), so each project here searches on its own AND-combination of distinctive
// words instead of an owner filter — verified against real data per project (see each
// project's attributionSearch comment in REPORTS above). One project ("Active Lead") has no
// word combination distinctive enough to isolate portal-wide and keeps the owner filter as a
// stopgap (attributionSearch.ownerFiltered: true) — see its comment above for what was tried.
async function searchTasksForAttribution(API, H, report, opts = {}) {
  const sprintStartMs = Date.parse(report.sprintStart);
  // outcomes() and dealAttribution() pin to the original 5 projects (maxProjects: 5) so their
  // exact pre-6th-project behavior (single filterGroups batch, no extra HubSpot round-trip) is
  // untouched — new projects beyond 5 land in stats() first (already verified working batched)
  // until outcomes/deals attribution's batching is proven safe under real concurrent load, not
  // just in isolated testing.
  const projects = opts.maxProjects ? (report.projects || []).slice(0, opts.maxProjects) : (report.projects || []);
  const filterGroups = projects.map((p) => {
    const cfg = p.attributionSearch;
    const filters = cfg.tokens.map((token) => ({ propertyName: "hs_task_subject", operator: "CONTAINS_TOKEN", value: token }));
    // Optional exclusions (NOT_CONTAINS_TOKEN) for when the positive tokens collide with another
    // campaign — e.g. "Upsell"+"Complete" also matches the older "Complete Plan Upsell" tasks,
    // so that project excludes "Plan"/"Reengagement".
    (cfg.notTokens || []).forEach((token) => filters.push({ propertyName: "hs_task_subject", operator: "NOT_CONTAINS_TOKEN", value: token }));
    if (cfg.ownerFiltered) filters.push({ propertyName: "hubspot_owner_id", operator: "IN", values: report.ownerIds });
    filters.push({ propertyName: "hs_createdate", operator: "GTE", value: String(sprintStartMs) });
    return { filters };
  });
  // HubSpot's Search API hard-caps filterGroups at 5 per request ("too many filterGroups")
  // — one group per project here, so a 6th project broke every endpoint at once (blank page,
  // no graceful fallback client-side). Batch into groups of <=5 and merge instead of assuming
  // the project count stays under the cap forever.
  const MAX_FILTER_GROUPS = 5;
  let total = 0;
  const results = [];
  for (let i = 0; i < filterGroups.length; i += MAX_FILTER_GROUPS) {
    const batch = filterGroups.slice(i, i + MAX_FILTER_GROUPS);
    const r = await runTaskSearch(API, H, batch);
    total += r.total;
    results.push(...r.results);
  }
  return { total, results };
}

// Live owner-name lookup, used so the per-rep breakdown shows whoever actually owns a task
// (e.g. Yoana Chung) rather than only the names hardcoded in report.ownerNames. Portal has
// ~117 owners total, so one paginated fetch is cheap and avoids N+1 lookups per distinct owner.
async function fetchOwnerNames(API, H) {
  const map = {};
  let after;
  do {
    const params = new URLSearchParams({ limit: "500" });
    if (after) params.set("after", after);
    const j = await hsFetch(`${API}/crm/v3/owners?${params}`, { headers: H });
    for (const o of j.results || []) {
      map[String(o.id)] = [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || String(o.id);
    }
    after = j.paging && j.paging.next && j.paging.next.after;
  } while (after);
  return map;
}

async function stats(url, env) {
  const [reportKey, report] = getReport(url);
  if (!report) return json({ error: `unknown report '${reportKey}'` }, 404);
  if (!env.HUBSPOT_TOKEN) return json({ error: "HUBSPOT_TOKEN secret not set" }, 500);
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const API = "https://api.hubapi.com";
  const PORTAL_ID = "25516403";

  try {
    // Uses searchTasksForAttribution (not searchTasks) for the same reason as deal attribution:
    // other reps genuinely work these queues too (e.g. Yoana Chung had 68 of 175 unmigrated-
    // customers tasks, 27 not-done, completely invisible here before this fix — the old
    // owner-filtered search never even fetched her tasks, not just excluded her from the rep
    // breakdown). Active Lead still stays owner-filtered per its attributionSearch config.
    const { results } = await searchTasksForAttribution(API, H, report);
    // Rep names are resolved live from HubSpot rather than a fixed list, so whoever actually
    // owns a task shows up correctly instead of being lumped in as unnamed/invisible.
    const ownerNameMap = await fetchOwnerNames(API, H);

    const buckets = {}; // project key -> { total, done, reps: {name:{created,done}}, callNumbers: {n:{total,done}}, priority: {level:n} }
    const emptyBucket = () => ({
      total: 0, done: 0,
      reps: Object.fromEntries(Object.values(report.ownerNames).map((n) => [n, { created: 0, done: 0 }])),
      callNumbers: {},
      priority: {},
    });

    const seenOwnerIds = new Set(Object.keys(report.ownerNames)); // for the button-link export below

    for (const t of results) {
      const p = t.properties || {};
      const key = classifyProject(report, p.hs_task_subject);
      const b = (buckets[key] ||= emptyBucket());
      const done = p.hs_task_status === "COMPLETED";
      b.total++;
      if (done) b.done++;
      if (p.hubspot_owner_id) {
        seenOwnerIds.add(p.hubspot_owner_id);
        const name = report.ownerNames[p.hubspot_owner_id] || ownerNameMap[p.hubspot_owner_id] || `Owner ${p.hubspot_owner_id}`;
        const rep = (b.reps[name] ||= { created: 0, done: 0 });
        rep.created++; if (done) rep.done++;
      }
      const num = callNumber(p.hs_task_subject) || "?";
      const cn = (b.callNumbers[num] ||= { total: 0, done: 0 });
      cn.total++; if (done) cn.done++;
      const pri = p.hs_task_priority || "NONE";
      b.priority[pri] = (b.priority[pri] || 0) + 1;
    }

    const projects = (report.projects || []).map((cfg) => {
      const b = buckets[cfg.key] || emptyBucket();
      const byCallNumber = Object.entries(b.callNumbers)
        .map(([number, v]) => ({ number, ...v, notDone: v.total - v.done }))
        .sort((a, b2) => (a.number === "?" ? 1 : b2.number === "?" ? -1 : Number(a.number) - Number(b2.number)));
      const priorityBreakdown = Object.entries(b.priority)
        .map(([level, count]) => ({ level, count }))
        .sort((a, b2) => b2.count - a.count);
      return {
        key: cfg.key,
        label: cfg.label,
        context: cfg.context || "",
        closed: !!cfg.closed,
        taskViewQuery: cfg.searchTerm || "",
        taskNamePattern: cfg.namePattern || "",
        tasks: { total: b.total, done: b.done, notDone: b.total - b.done, reps: b.reps, byCallNumber, priorityBreakdown },
      };
    });

    const other = buckets.other
      ? { total: buckets.other.total, done: buckets.other.done, notDone: buckets.other.total - buckets.other.done }
      : { total: 0, done: 0, notDone: 0 };

    return json({
      generatedAt: new Date().toISOString(),
      report: reportKey,
      name: report.name,
      sprintStart: report.sprintStart,
      projects,
      other,
      hubspot: {
        subdomain: report.hubspotSubdomain || "app.hubspot.com",
        portalId: PORTAL_ID,
        objectTypeId: "0-27", // tasks
        // rep name -> their saved "assigned to me, not completed" task view id. Built from
        // every owner actually seen in this report's tasks (not just the static Asya/Chey
        // list), same reasoning as the reps breakdown above — someone like Yoana still gets
        // listed even with no saved view of her own (button just won't render for her, same
        // graceful fallback already used for Florence), rather than being left out entirely.
        ownerViews: Object.fromEntries(
          [...seenOwnerIds].map((id) => [
            report.ownerNames[id] || ownerNameMap[id] || `Owner ${id}`,
            (report.ownerViews || {})[id] || null,
          ])
        ),
      },
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function batchAssociations(API, H, fromType, toType, ids) {
  const map = {};
  for (const c of chunk(ids, 100)) {
    if (!c.length) continue;
    const j = await hsFetch(`${API}/crm/v4/associations/${fromType}/${toType}/batch/read`, {
      method: "POST", headers: H, body: JSON.stringify({ inputs: c.map((id) => ({ id })) }),
    });
    for (const row of j.results || []) {
      map[row.from.id] = (row.to || []).map((t) => String(t.toObjectId));
    }
  }
  return map;
}

async function batchRead(API, H, objectType, ids, properties) {
  const map = {};
  for (const c of chunk(ids, 100)) {
    if (!c.length) continue;
    const j = await hsFetch(`${API}/crm/v3/objects/${objectType}/batch/read`, {
      method: "POST", headers: H, body: JSON.stringify({ properties, inputs: c.map((id) => ({ id })) }),
    });
    for (const row of j.results || []) map[row.id] = row.properties || {};
  }
  return map;
}

// The real source of truth for a Packs & Plans migration, per Jack: this custom behavioral
// event fires with a genuine occurredAt timestamp (unlike the is_migration_p_p contact
// property, which has no associated date anywhere in this account). One portal-wide call
// covers every contact — no need to check per-contact. Confirmed against contact 150791
// (Helen Shaw): event at 2026-09-16T13:22:15.754Z, is_migration=true, pack_plan_type="Core
// Restricted" — matches the Slack report and HubSpot's own timeline UI exactly.
const PACKS_AND_PLANS_EVENT_TYPE = "pe25516403_packs_and_plans___payment";

async function fetchMigrationEvents(API, H, sinceIso) {
  // contactId -> earliest is_migration=true event {occurredAt (ms), planType}
  const byContact = {};
  let after;
  do {
    const params = new URLSearchParams({ eventType: PACKS_AND_PLANS_EVENT_TYPE, occurredAfter: sinceIso, limit: "100" });
    if (after) params.set("after", after);
    const j = await hsFetch(`${API}/events/v3/events?${params}`, { headers: H });
    for (const e of j.results || []) {
      if (e.properties?.is_migration !== "true") continue; // this event also fires for non-migration plan purchases
      const cid = String(e.objectId);
      const ms = Date.parse(e.occurredAt);
      const prev = byContact[cid];
      if (!prev || ms < prev.occurredMs) byContact[cid] = { occurredMs: ms, planType: e.properties.pack_plan_type || "plan" };
    }
    after = j.paging?.next?.after;
  } while (after);
  return byContact;
}

function contactLabel(props) {
  if (!props) return "(unknown contact)";
  const name = [props.firstname, props.lastname].filter(Boolean).join(" ");
  return name || props.email || "(unnamed contact)";
}

// ---- Non-call outreach (WhatsApp / email / note) ----------------------------------------
// Reps also work these tasks by WhatsApp, email, or by just leaving a note — none of which is
// a Call object, so without this a task worked that way was mislabelled "(no matching call
// found)". WhatsApp/SMS/LinkedIn live on the "communications" object (hs_communication_channel_type).
// These channels are async (a note/WhatsApp is logged around when the task is closed, not
// during a live call), so they use a wider window than the live-call anchor above.
const ASYNC_WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000; // completion - 3h
const ASYNC_WINDOW_AFTER_MS = 3 * 60 * 60 * 1000;  // completion + 3h

// ---- Enrollment-window outcomes (projects with outcomeMatching: "enrollment") ------------
// For queues worked alongside an email campaign, where the completion anchor above doesn't
// hold. Verified against a manual audit of the first 34 done Upsell-Complete tasks (30 Sep):
// every one landed in the audited bucket. Precedence, first hit wins:
//   1. Closed won — same rule as the Deals card (Closed Won Plans deal, closed on/after the
//      contact's enrollment), so the two cards never disagree.
//   2. Meeting booked — a meeting on the contact created on/after the task was created. Split
//      by hs_meeting_source: MEETINGS_PUBLIC means the contact booked it themselves via the
//      booking link (e.g. from the email — Julia Moulton, Alex O'Neill), so the call gets no
//      credit even if one was logged later (Carlos's reschedule call for Julia; Asya's
//      confirmation call for Alex). Anything else was created by a rep.
//   3. Call — the LATEST outbound or direction-less call (manually logged calls have no
//      hs_call_direction — Tareq Abuasbeh's positive call) between task creation and
//      completion + 48h. Calls by the task owner win if there are any; otherwise any rep's call
//      counts, since colleagues cover each other's tasks (Alex McCarthy, Maggie Leung). Inbound
//      calls are excluded — they're usually about something else (Gurpreet Bharaj's unrelated
//      inbound callback must not override Chey's no-answer).
//   4. Otherwise fall through to the note/WhatsApp/email reclassification used everywhere.
// Projects with campaignRepsOnly: true additionally ignore any meeting, call (and, in the
// fallback, note/WhatsApp/email) not owned by one of the report's campaignRepIds — so another
// team's work on the same contact never lands in the queue's outcomes. Closed won is unchanged.
// Projects with noCampaignEmail: true have no email for a contact to book from, so a self-booked
// meeting (booking link sent by the rep after a call) is labelled "by rep" too.
const ENROLLMENT_CALL_AFTER_MS = 48 * 60 * 60 * 1000; // completion + 48h

function outcomeForEnrollmentTask(p, ctx) {
  const { contactsForTask, enrolledMs, contactToCalls, calls, contactToMeetings, meetings, contactToDeals, deals, isClosedPlansDeal, dispLabel, repOk, noCampaignEmail } = ctx;
  const createdMs = Date.parse(p.hs_createdate);

  for (const cid of contactsForTask) {
    const won = (contactToDeals[cid] || []).map((id) => deals[id])
      .filter((d) => isClosedPlansDeal(d) && Date.parse(d.closedate) >= (enrolledMs[cid] ?? createdMs));
    if (won.length) {
      const d = won[0];
      return { outcome: `Closed won — ${d.plans___product_type || "plan"} ${d.p_p___upsell === "true" ? "upsell" : "new"}`, category: "converted" };
    }
  }

  let meeting = null;
  for (const cid of contactsForTask) {
    for (const id of contactToMeetings[cid] || []) {
      const m = meetings[id];
      if (!m || !m.hs_createdate || Date.parse(m.hs_createdate) < createdMs) continue;
      if (!repOk(m)) continue;
      if (!meeting || m.hs_meeting_source === "MEETINGS_PUBLIC") meeting = m; // self-booked wins: the call didn't cause it
    }
  }
  if (meeting) {
    return meeting.hs_meeting_source === "MEETINGS_PUBLIC" && !noCampaignEmail
      ? { outcome: "Meeting booked — from email", category: "meeting" }
      : { outcome: "Meeting booked — by rep", category: "meeting" };
  }

  const hi = Date.parse(p.hs_task_completion_date) + ENROLLMENT_CALL_AFTER_MS;
  const candidates = [];
  for (const cid of contactsForTask) {
    for (const id of contactToCalls[cid] || []) {
      const c = calls[id];
      if (!c || !c.hs_timestamp) continue;
      const dir = (c.hs_call_direction || "").toUpperCase();
      if (dir && dir !== "OUTBOUND") continue;
      if (!repOk(c)) continue;
      const ts = Date.parse(c.hs_timestamp);
      if (ts < createdMs || ts > hi) continue;
      candidates.push({ c, ts });
    }
  }
  const own = candidates.filter(({ c }) => c.hubspot_owner_id && c.hubspot_owner_id === p.hubspot_owner_id);
  const pool = own.length ? own : candidates;
  if (!pool.length) return null;
  const best = pool.reduce((a, b) => (b.ts > a.ts ? b : a)).c;
  const label = best.hs_call_disposition ? dispLabel[best.hs_call_disposition] : null;
  return { outcome: label || "(no disposition set)", category: categoriseDisposition(label), call: true };
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

// Light keyword classifier for free-text rep notes. Wording varies by rep, so this only
// catches a few high-signal outcomes; anything it doesn't recognise returns null and the raw
// note is surfaced in the UI instead of being forced into a bucket. First hit wins — order
// matters (e.g. "already paying" before the generic contacted fallback).
function classifyNote(text) {
  const t = (text || "").toLowerCase();
  if (!t) return null;
  if (/\bmigrat/.test(t)) return "Migrated / migrating";
  if (/already pay|paying already|active subscription|active core|already on a? ?plan/.test(t)) return "Already paying";
  if (/dissolv|offboard|struck off|no longer a director|closed the compan/.test(t)) return "Company dissolved / offboarded";
  if (/not interest|uninterested|not a fit|declin/.test(t)) return "Not interested";
  if (/no answer|voicemail|didn'?t pick|no response|left a message/.test(t)) return "No answer";
  return null; // unknown wording — keep the raw note, don't guess a bucket
}

// Nearest activity (of whatever is in `acts`) on any of the task's contacts, within
// [anchor-before, anchor+after]. `filterFn` optionally restricts by type (e.g. WhatsApp only).
function nearestActivity(contactsForTask, contactToActs, acts, anchorMs, before, after, filterFn) {
  let best = null, bestDelta = Infinity;
  for (const cid of contactsForTask) {
    for (const id of contactToActs[cid] || []) {
      const a = acts[id];
      if (!a || !a.hs_timestamp) continue;
      if (filterFn && !filterFn(a)) continue;
      const ts = Date.parse(a.hs_timestamp);
      if (ts < anchorMs - before || ts > anchorMs + after) continue;
      const d = Math.abs(ts - anchorMs);
      if (d < bestDelta) { best = a; bestDelta = d; }
    }
  }
  return best;
}

async function outcomes(url, env) {
  const [reportKey, reportConfig] = getReport(url);
  if (!reportConfig) return json({ error: `unknown report '${reportKey}'` }, 404);
  if (!env.HUBSPOT_TOKEN) return json({ error: "HUBSPOT_TOKEN secret not set" }, 500);
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const API = "https://api.hubapi.com";
  const PORTAL_ID = "25516403";

  // See stats() above for why this uses searchTasksForAttribution rather than searchTasks —
  // completed tasks from reps outside the fixed owner list (e.g. Yoana Chung) need to show up
  // in the outcomes/disposition breakdown too, not just Asya/Chey/Active-Lead's owners.
  // outcomes() does heavy per-task work — contact + call + WhatsApp + email + note association
  // reads for every completed task — so spanning every project in one request exceeded
  // Cloudflare's per-request subrequest/CPU limit and blanked EVERY campaign's outcomes.
  // Without ?campaign=, stay pinned to the first 5 projects (maxProjects: 5) as before —
  // projects beyond the 5th show completion stats only. With ?campaign=<project key>, scope
  // the whole request to that one project instead: a single project's per-task work is well
  // under the limit, so it needs neither the cap nor a slot among the first 5, which is what
  // lets a campaign like ba-closed-won-reengage (6th in the list) get real outcomes data.
  const campaignKey = url.searchParams.get("campaign");
  let report = reportConfig;
  let searchOpts = { maxProjects: 5 };
  let computedKeys = new Set((reportConfig.projects || []).slice(0, 5).map((p) => p.key));
  if (campaignKey) {
    const proj = (reportConfig.projects || []).find((p) => p.key === campaignKey);
    if (!proj) return json({ error: `unknown campaign '${campaignKey}'` }, 404);
    report = { ...reportConfig, projects: [proj] };
    searchOpts = {};
    computedKeys = new Set([proj.key]);
  }

  try {
    const { results } = await searchTasksForAttribution(API, H, report, searchOpts);
    const completedTasks = results
      .map((t) => t.properties || {})
      .filter((p) => p.hs_task_status === "COMPLETED" && p.hs_task_completion_date && p.hs_createdate);

    // Disposition GUID -> human label, straight from this account's configured list.
    const dispositions = await hsFetch(`${API}/calling/v1/dispositions`, { headers: H });
    const dispLabel = {};
    for (const d of dispositions) dispLabel[d.id] = d.label;

    const taskIds = completedTasks.map((p) => p.hs_object_id);
    const taskToContacts = await batchAssociations(API, H, "tasks", "contacts", taskIds);
    const contactIds = [...new Set(Object.values(taskToContacts).flat())];
    const contactToCalls = await batchAssociations(API, H, "contacts", "calls", contactIds);
    const callIds = [...new Set(Object.values(contactToCalls).flat())];
    const calls = await batchRead(API, H, "calls", callIds, ["hs_timestamp", "hs_call_disposition", "hs_call_direction", "hubspot_owner_id"]);
    const contacts = await batchRead(API, H, "contacts", contactIds, ["firstname", "lastname", "email"]);

    // Meetings + deals are only needed for enrollment-matched projects (see
    // outcomeForEnrollmentTask), so skip the extra reads when none is in this request. Fetched
    // BEFORE the note/WhatsApp/email reads so those (the expensive, fail-soft part) can only ever
    // lose the fallback rows, never these. Wrapped the same way, so a failure here degrades to
    // call-only matching instead of 502-ing the whole endpoint (which the UI shows as "no tasks").
    // Per-project owner gate for campaignRepsOnly projects (see outcomeForEnrollmentTask);
    // a pass-through everywhere else.
    const campaignReps = new Set(report.campaignRepIds || []);
    const repsOnlyKeys = new Set((report.projects || []).filter((p) => p.campaignRepsOnly).map((p) => p.key));
    const repFilterFor = (key) => (repsOnlyKeys.has(key) ? (a) => campaignReps.has(a.hubspot_owner_id) : () => true);
    const enrollmentKeys = new Set((report.projects || []).filter((p) => p.outcomeMatching === "enrollment").map((p) => p.key));
    const enrolledByTask = new Map(); // task id -> outcomeForEnrollmentTask result (null = unresolved)
    if (enrollmentKeys.size) {
      const enrollTasks = completedTasks.filter((p) => enrollmentKeys.has(classifyProject(report, p.hs_task_subject)));
      const enrollContactIds = [...new Set(enrollTasks.flatMap((p) => taskToContacts[p.hs_object_id] || []))];
      let contactToMeetings = {}, meetings = {}, contactToDeals = {}, deals = {};
      try {
        contactToMeetings = await batchAssociations(API, H, "contacts", "meetings", enrollContactIds);
        meetings = await batchRead(API, H, "meetings", [...new Set(Object.values(contactToMeetings).flat())], ["hs_createdate", "hs_meeting_source", "hubspot_owner_id"]);
        contactToDeals = await batchAssociations(API, H, "contacts", "deals", enrollContactIds);
        deals = await batchRead(API, H, "deals", [...new Set(Object.values(contactToDeals).flat())], ["pipeline", "dealstage", "plans___product_type", "p_p___upsell", "closedate"]);
      } catch (e) {
        console.log(`outcomes: meetings/deals fetch skipped (${e})`);
      }
      // Enrollment = contact's earliest task in the project, same as the Deals card. Only done
      // tasks are fetched here, which is the same date in practice (#1 is the first created).
      const enrolledMs = {};
      for (const p of enrollTasks) {
        const ms = Date.parse(p.hs_createdate);
        for (const cid of taskToContacts[p.hs_object_id] || []) if (!(enrolledMs[cid] <= ms)) enrolledMs[cid] = ms;
      }
      const ctx = { enrolledMs, contactToCalls, calls, contactToMeetings, meetings, contactToDeals, deals, isClosedPlansDeal, dispLabel };
      for (const p of enrollTasks) {
        const key = classifyProject(report, p.hs_task_subject);
        const noCampaignEmail = !!(report.projects || []).find((c) => c.key === key)?.noCampaignEmail;
        enrolledByTask.set(p.hs_object_id, outcomeForEnrollmentTask(p, { ...ctx, repOk: repFilterFor(key), noCampaignEmail, contactsForTask: taskToContacts[p.hs_object_id] || [] }));
      }
    }

    // Non-call outreach, so a task worked by WhatsApp/email/note isn't shown as "no call found".
    // Needs the private-app token to have crm.objects.communications.read (+ notes/emails read).
    // Wrapped so a missing scope degrades to call-only rather than 502-ing the whole endpoint.
    //
    // Subrequest budget: Cloudflare caps a Worker invocation at 50 outbound requests, and
    // batchRead costs one per 100 ids. Reading every email ever logged on every contact blew
    // that (Upsell-Complete, 30 Sep: 34 contacts had 3,635 emails = ~37 reads on its own), which
    // silently emptied this fallback and then 502'd the first uncaught fetch after it. So:
    //   - only contacts whose task is still unresolved need this (enrollment-matched tasks
    //     already settled by a deal/meeting/call are skipped), and
    //   - only each contact's newest ACTIVITY_IDS_PER_CONTACT ids are read. HubSpot ids are
    //     allocated in increasing order (checked on this account's calls/emails/notes), and
    //     matching only looks within hours of a recent task completion, so older ids can't match.
    const ACTIVITY_IDS_PER_CONTACT = 25;
    const activityContactIds = [...new Set(completedTasks
      .filter((p) => !enrolledByTask.get(p.hs_object_id))
      .flatMap((p) => taskToContacts[p.hs_object_id] || []))];
    async function fetchActivity(toType, props) {
      try {
        const assoc = await batchAssociations(API, H, "contacts", toType, activityContactIds);
        for (const cid of Object.keys(assoc)) {
          assoc[cid] = assoc[cid].sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1)).slice(0, ACTIVITY_IDS_PER_CONTACT);
        }
        const ids = [...new Set(Object.values(assoc).flat())];
        const objs = await batchRead(API, H, toType, ids, props);
        return [assoc, objs];
      } catch (e) {
        console.log(`outcomes: ${toType} fetch skipped (${e}) — check token scope`);
        return [{}, {}];
      }
    }
    const [contactToComms, comms] = await fetchActivity("communications", ["hs_timestamp", "hs_communication_channel_type", "hubspot_owner_id"]);
    const [contactToEmails, emails] = await fetchActivity("emails", ["hs_timestamp", "hs_email_direction", "hubspot_owner_id"]);
    const [contactToNotes, notes] = await fetchActivity("notes", ["hs_timestamp", "hs_note_body", "hubspot_owner_id"]);

    // project key -> { totalCompleted, matched, byOutcome: { outcome: { count, category, contacts:[{id,name,taskId}] } } }
    const buckets = {};
    for (const p of completedTasks) {
      const key = classifyProject(report, p.hs_task_subject);
      const b = (buckets[key] ||= { totalCompleted: 0, matched: 0, byOutcome: {} });
      b.totalCompleted++;

      // Completion-time anchor (doc §3) — see constant comments above for why this account
      // uses it uniformly rather than the doc §8 bulk-cohort override.
      const anchorMs = Date.parse(p.hs_task_completion_date);
      const windowLo = anchorMs - LIVE_WINDOW_BEFORE_MS;
      const windowHi = anchorMs + LIVE_WINDOW_AFTER_MS;

      const contactsForTask = taskToContacts[p.hs_object_id] || [];

      const enrolled = enrolledByTask.get(p.hs_object_id) || null;
      if (enrolled) {
        if (enrolled.call) b.matched++;
        else b.reached = (b.reached || 0) + 1;
        const o = (b.byOutcome[enrolled.outcome] ||= { count: 0, category: enrolled.category, contacts: [] });
        o.count++;
        for (const cid of contactsForTask) o.contacts.push({ id: cid, name: contactLabel(contacts[cid]), taskId: p.hs_object_id, note: null });
        continue;
      }
      // Enrollment-matched task with no deal/meeting/call: fall through to the note/WhatsApp/
      // email reclassification below. Skip the live-window call search — it can only find a
      // subset of what outcomeForEnrollmentTask already rejected.
      let best = null, bestKey = null, bestDelta = Infinity, bestOwnerMatch = false;
      for (const cid of enrollmentKeys.has(key) ? [] : contactsForTask) {
        for (const callId of contactToCalls[cid] || []) {
          const call = calls[callId];
          if (!call || !call.hs_timestamp) continue;
          if ((call.hs_call_direction || "").toUpperCase() !== "OUTBOUND") continue; // doc rule: OUTBOUND only
          const ts = Date.parse(call.hs_timestamp);
          if (ts < windowLo || ts > windowHi) continue; // outside the anchor window
          const delta = Math.abs(ts - anchorMs);
          const ownerMatch = call.hubspot_owner_id && call.hubspot_owner_id === p.hubspot_owner_id;
          // Owner match is a ranking preference, not a hard gate (doc §4): prefer same-owner,
          // then nearest to the anchor.
          const better = !best || (ownerMatch && !bestOwnerMatch) || (ownerMatch === bestOwnerMatch && delta < bestDelta);
          if (better) { best = call; bestKey = callId; bestDelta = delta; bestOwnerMatch = ownerMatch; }
        }
      }

      let outcome, category, noteText = null;
      if (best) {
        b.matched++;
        const label = best.hs_call_disposition ? dispLabel[best.hs_call_disposition] : null;
        outcome = label || "(no disposition set)";
        category = categoriseDisposition(label);
      } else {
        // No matching call — was the task worked another way? Prefer a note (richest, in the
        // rep's own words), then WhatsApp, then email. Only if none of these exists is it
        // genuinely untouched. `reached` counts any-channel contact (vs matched = call only).
        const repOk = repFilterFor(key);
        const note = nearestActivity(contactsForTask, contactToNotes, notes, anchorMs, ASYNC_WINDOW_BEFORE_MS, ASYNC_WINDOW_AFTER_MS, repOk);
        const whatsapp = nearestActivity(contactsForTask, contactToComms, comms, anchorMs, ASYNC_WINDOW_BEFORE_MS, ASYNC_WINDOW_AFTER_MS,
          (a) => repOk(a) && (a.hs_communication_channel_type || "").toUpperCase() === "WHATS_APP");
        const email = nearestActivity(contactsForTask, contactToEmails, emails, anchorMs, ASYNC_WINDOW_BEFORE_MS, ASYNC_WINDOW_AFTER_MS, repOk);
        if (note) {
          noteText = stripHtml(note.hs_note_body);
          outcome = classifyNote(noteText) || "Contacted — note logged";
          category = "reached_other";
          b.reached = (b.reached || 0) + 1;
        } else if (whatsapp) {
          outcome = "Contacted via WhatsApp";
          category = "reached_other";
          b.reached = (b.reached || 0) + 1;
        } else if (email) {
          outcome = "Contacted via email";
          category = "reached_other";
          b.reached = (b.reached || 0) + 1;
        } else {
          outcome = "(no outreach found)";
          category = "unmatched";
        }
      }

      const o = (b.byOutcome[outcome] ||= { count: 0, category, contacts: [] });
      o.count++;
      // Attach contact identities for the hover-to-see-contacts UI. A task can have more than
      // one associated contact; list them all rather than guessing which one the call belongs to.
      // `note` carries the rep's note text (when that's what drove the outcome) so the UI can show it.
      for (const cid of contactsForTask) {
        o.contacts.push({ id: cid, name: contactLabel(contacts[cid]), taskId: p.hs_object_id, note: noteText });
      }
    }

    const toRows = (b) => Object.entries(b.byOutcome)
      .map(([outcome, v]) => ({ outcome, tasks: v.count, category: v.category, contacts: v.contacts }))
      .sort((a, c) => c.tasks - a.tasks);

    const projects = (report.projects || []).map((cfg) => {
      const b = buckets[cfg.key] || { totalCompleted: 0, matched: 0, byOutcome: {} };
      // `computed: false` marks a project that fell outside this request's search (only possible
      // without ?campaign=, i.e. beyond the maxProjects:5 cap) — its zeros are "not fetched yet",
      // not a real "no data", so the client knows to fetch it scoped rather than trust them.
      return { key: cfg.key, label: cfg.label, computed: computedKeys.has(cfg.key), totalCompleted: b.totalCompleted, totalMatchedToCall: b.matched, totalReached: (b.matched || 0) + (b.reached || 0), dispositions: toRows(b) };
    });
    const otherB = buckets.other || { totalCompleted: 0, matched: 0, byOutcome: {} };
    const other = { totalCompleted: otherB.totalCompleted, totalMatchedToCall: otherB.matched, totalReached: (otherB.matched || 0) + (otherB.reached || 0), dispositions: toRows(otherB) };

    return json({
      generatedAt: new Date().toISOString(),
      report: reportKey,
      sprintStart: report.sprintStart,
      portalId: PORTAL_ID,
      projects,
      other,
      method: "Each completed task is first matched to the nearest OUTBOUND call on the same contact, within -2h/+15min of completion, preferring same-owner calls (no direct task<->call association exists in this account). If no call matches, the task is reclassified by the next non-call outreach on the contact within -3h/+3h of completion, in priority order: a rep note (classified from its text where recognisable, otherwise shown verbatim), then a WhatsApp message, then an email. Only tasks with none of these show as '(no outreach found)'. totalReached counts contact by any channel; totalMatchedToCall counts calls only. EXCEPTION — the Complete plan upsell, LTD freemium, LTD missed leads and BA closed won queues use enrollment-window matching instead: Closed won (same rule as the Deals card) > meeting created since the task was created (split into from email — contact self-booked via the booking link — vs booked by a rep) > the latest outbound/manually-logged call between task creation and completion + 48h, preferring the task owner's calls > the note/WhatsApp/email fallback above. For LTD missed leads and BA closed won, only meetings/calls/notes by the campaign reps (Asya, Chey, Yoana) count — other teams' activity on the same contacts is ignored. LTD missed leads has no campaign email, so all its meetings count as booked by rep.",
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

// ---- Deal attribution -------------------------------------------------------------------
// "Did a contact we put into one of these calling sequences end up in a closed Plans deal,
// and was it Core or Complete, new business or an upsell." Verified against real data (Jamie
// Yemm, contact 150778): he has two Closed Won deals in the "Plans" pipeline — an original
// "Core Plan" deal (plans___product_type=Core, p_p___upsell unset) and a later "Complete Plan
// - Upsell" deal (plans___product_type=Complete, p_p___upsell=true, closedate matching the
// Plan Upgrade note from 18 Aug). A contact can legitimately land in more than one bucket
// (start on Core, later upsell to Complete) — both are real, separate outcomes, not double-
// counting, so bucket at the deal level rather than deduping to one row per contact.
//
// CAUSALITY FIX: a contact's closed deal only counts if it closed ON OR AFTER the date they
// were first put into that project's sequence (their earliest task's creation date there) —
// otherwise a pre-existing deal from years before gets wrongly credited to the sequence.
// Caught on contact 802869500125 (Siu Ping Wong): her Core Plan deal closed 10 Jul 04:35, but
// her "Reengage — unmigrated customers" tasks weren't created until 9 Sep and 14 Sep — the
// deal plainly predates and is unrelated to that sequence, yet the first version of this
// endpoint (no date check at all) counted it anyway.
const PLANS_PIPELINE_ID = "1882997999";
const PLANS_CLOSED_WON_STAGE_ID = "2561311959";
// Shared with outcomes() (enrollment-matched projects) so its "Closed won" rows use exactly
// the Deals card's rule.
const isClosedPlansDeal = (d) => d && d.pipeline === PLANS_PIPELINE_ID && d.dealstage === PLANS_CLOSED_WON_STAGE_ID && d.closedate;

async function dealAttribution(url, env) {
  const [reportKey, reportConfig] = getReport(url);
  if (!reportConfig) return json({ error: `unknown report '${reportKey}'` }, 404);
  if (!env.HUBSPOT_TOKEN) return json({ error: "HUBSPOT_TOKEN secret not set" }, 500);
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const API = "https://api.hubapi.com";
  const PORTAL_ID = "25516403";

  // Same scoping as outcomes() above: without ?campaign=, stay pinned to the first 5 projects
  // (maxProjects: 5) — deal attribution's per-task association reads blow Cloudflare's
  // per-request limit across all projects, so projects beyond the 5th show completion stats
  // only. With ?campaign=<project key>, scope the whole request to that one project, which
  // needs neither the cap nor a slot among the first 5.
  const campaignKey = url.searchParams.get("campaign");
  let report = reportConfig;
  let searchOpts = { maxProjects: 5 };
  let computedKeys = new Set((reportConfig.projects || []).slice(0, 5).map((p) => p.key));
  if (campaignKey) {
    const proj = (reportConfig.projects || []).find((p) => p.key === campaignKey);
    if (!proj) return json({ error: `unknown campaign '${campaignKey}'` }, 404);
    report = { ...reportConfig, projects: [proj] };
    searchOpts = {};
    computedKeys = new Set([proj.key]);
  }

  try {
    // Every contact ever put into a sequence, any task status — not just completed tasks —
    // since the question is "did this contact convert," not "did the call happen." Uses
    // searchTasksForAttribution (not searchTasks) so a contact counts regardless of which rep's
    // name is on the task — see that function's comment for why and what was tested.
    const { results } = await searchTasksForAttribution(API, H, report, searchOpts);
    const allTasks = results.map((t) => t.properties || {}).filter((p) => p.hs_object_id && p.hs_createdate);

    const taskIds = allTasks.map((p) => p.hs_object_id);
    const taskToContacts = await batchAssociations(API, H, "tasks", "contacts", taskIds);

    // key -> Map(contactId -> earliest enrollment ms in this project, i.e. earliest task hs_createdate)
    const projectContacts = {};
    for (const p of allTasks) {
      const key = classifyProject(report, p.hs_task_subject);
      const map = (projectContacts[key] ||= new Map());
      const createdMs = Date.parse(p.hs_createdate);
      for (const cid of taskToContacts[p.hs_object_id] || []) {
        const prev = map.get(cid);
        if (prev === undefined || createdMs < prev) map.set(cid, createdMs);
      }
    }

    const allContactIds = [...new Set(Object.values(projectContacts).flatMap((m) => [...m.keys()]))];
    const contactToDeals = await batchAssociations(API, H, "contacts", "deals", allContactIds);
    const dealIds = [...new Set(Object.values(contactToDeals).flat())];
    const deals = await batchRead(API, H, "deals", dealIds, ["pipeline", "dealstage", "plans___product_type", "p_p___upsell", "closedate"]);
    const contacts = await batchRead(API, H, "contacts", allContactIds, [
      "firstname", "lastname", "email", "hs_active_contracts_mrr",
    ]);
    // Migrations (old paywall-off pricing -> a current plan) never create a Plans-pipeline
    // deal — confirmed with the team: attribution for these runs off the contact owner field
    // instead, and MRR doesn't start until their trial ends (hs_active_contracts_mrr stays
    // null until then). Real source of truth per Jack: the "Packs and Plans confirmed"
    // behavioral event (see fetchMigrationEvents) — it carries a genuine timestamp, so unlike
    // the old is_migration_p_p-property approach this CAN be checked against the contact's
    // enrollment date, the same causality guard as deals.
    const migrationEvents = await fetchMigrationEvents(API, H, report.sprintStart);

    const buildProject = (contactMap) => {
      const buckets = {};
      let contactsWithDeal = 0;
      const noDealContacts = [];
      for (const [cid, enrolledMs] of contactMap) {
        const dealsForContact = (contactToDeals[cid] || [])
          .map((did) => deals[did])
          .filter(isClosedPlansDeal)
          .filter((d) => Date.parse(d.closedate) >= enrolledMs);
        const c = contacts[cid];
        const migration = migrationEvents[cid];
        const validMigration = migration && migration.occurredMs >= enrolledMs;
        if (dealsForContact.length) {
          contactsWithDeal++;
          for (const d of dealsForContact) {
            const productType = d.plans___product_type || "Unknown plan";
            const label = `${productType} — ${d.p_p___upsell === "true" ? "Upsell" : "New"}`;
            const b = (buckets[label] ||= { count: 0, contacts: [] });
            b.count++;
            b.contacts.push({ id: cid, name: contactLabel(contacts[cid]) });
          }
        } else if (validMigration) {
          contactsWithDeal++;
          const plan = migration.planType.replace(/\s*Restricted\s*/i, "").replace(/\s*Plan\s*$/i, "").trim() || "plan";
          const mrrLive = !!c.hs_active_contracts_mrr;
          const label = `Migrated to ${plan} (${mrrLive ? "MRR live" : "trial — MRR not started"})`;
          const b = (buckets[label] ||= { count: 0, contacts: [] });
          b.count++;
          b.contacts.push({ id: cid, name: contactLabel(contacts[cid]) });
        } else {
          noDealContacts.push({ id: cid, name: contactLabel(contacts[cid]) });
        }
      }
      if (noDealContacts.length) buckets["(no closed Plans deal since enrolling)"] = { count: noDealContacts.length, contacts: noDealContacts };
      const rows = Object.entries(buckets)
        .map(([label, v]) => ({ label, count: v.count, contacts: v.contacts }))
        .sort((a, b) => b.count - a.count);
      return { totalContacts: contactMap.size, contactsWithClosedDeal: contactsWithDeal, rows };
    };

    const projects = (report.projects || []).map((cfg) => {
      const contactMap = projectContacts[cfg.key] || new Map();
      // See outcomes() for what `computed: false` means (project outside this request's search).
      return { key: cfg.key, label: cfg.label, computed: computedKeys.has(cfg.key), ...buildProject(contactMap) };
    });
    const other = buildProject(projectContacts.other || new Map());

    return json({
      generatedAt: new Date().toISOString(),
      report: reportKey,
      portalId: PORTAL_ID,
      projects,
      other,
      method: "Every contact ever associated with a task in this sequence (any task status) is checked for a Closed Won deal in the \"Plans\" HubSpot pipeline that closed ON OR AFTER the date they were first enrolled in that sequence (their earliest task's creation date there) — a deal that closed before they were ever put into the sequence doesn't count. Bucketed by plan type (plans___product_type: Core/Complete) and whether it was flagged an upsell (p_p___upsell). A contact can appear in more than one bucket if they closed more than one qualifying deal (e.g. closed Core shortly after enrolling, then upsold to Complete later) — both are real outcomes. SEPARATELY, contacts with no qualifying deal are checked against the \"Packs and Plans confirmed\" behavioral event (is_migration=true) — migrations never create a Plans deal, per the team, so they'd otherwise be invisible here. This event carries a real timestamp, so — same as deals — only an event that fired ON OR AFTER enrollment counts. Migration rows show whether MRR has actually started (hs_active_contracts_mrr) since these customers are usually still on trial.",
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

// ---- Referral funnel (live, from BigQuery) ----------------------------------------------
// Ports the Count referral canvas logic so the dashboard shows the funnel without going through
// Count. Reads the same warehouse tables (prod_module_core.plan_referrals / referral_codes,
// dbt_prod_hubspot_v2.*, mixpanel_production.mp_master_event).
// Needs two Cloudflare secrets for a READ-ONLY BigQuery service account:
//   GCP_SA_EMAIL        — the service account email
//   GCP_SA_PRIVATE_KEY  — its PEM private key (literal \n or real newlines both handled)
// The SA needs roles/bigquery.dataViewer on the datasets + roles/bigquery.jobUser on the project.
const BQ_PROJECT = "terranova-prod-module-core-v2";
// HubSpot content_id whose email audience defines the per-campaign funnel. Currently the
// referral email campaign the Count dashboard uses; change to the raf_250_0926 campaign's
// content_id once it's identified (the audience/attribution logic below stays the same).
const REFERRAL_CAMPAIGN_CONTENT_ID = "421597093062";

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemToPkcs8(pem) {
  const norm = (pem || "").replace(/\\n/g, "\n");
  const body = norm.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let _gcpToken = null; // { token, exp } cached across requests in a warm worker
async function gcpAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_gcpToken && _gcpToken.exp - 60 > now) return _gcpToken.token;
  const claim = {
    iss: env.GCP_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  };
  const unsigned = `${b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${b64url(new TextEncoder().encode(JSON.stringify(claim)))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(env.GCP_SA_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("GCP token error: " + JSON.stringify(j));
  _gcpToken = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return _gcpToken.token;
}

async function bqQuery(env, sql) {
  const token = await gcpAccessToken(env);
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 55000 }),
  });
  const j = await res.json();
  if (j.error) throw new Error("BQ error: " + JSON.stringify(j.error));
  const fields = (j.schema && j.schema.fields) || [];
  return (j.rows || []).map((r) => {
    const o = {};
    r.f.forEach((cell, i) => { o[fields[i].name] = cell.v; });
    return o;
  });
}

const PROGRAMME_SQL = `
WITH t AS (
  SELECT
    COUNT(DISTINCT CASE WHEN event_name='button_clicked' AND JSON_VALUE(properties,'$.button_id')='referrals_copy_link' THEN distinct_id END) AS copied,
    COUNT(DISTINCT CASE WHEN event_name='page_viewed' AND JSON_VALUE(properties,'$.page_url') LIKE '%/onboarding/create-account?referral=%' THEN distinct_id END) AS landed
  FROM \`${BQ_PROJECT}.mixpanel_production.mp_master_event\`
  WHERE event_name IN ('button_clicked','page_viewed')
),
r AS (
  SELECT COUNT(*) AS redeemed,
         COUNTIF(plan_purchase_id IS NOT NULL) AS plans_bought,
         COUNTIF(applied_at IS NOT NULL) AS reward_paid
  FROM \`${BQ_PROJECT}.prod_module_core.plan_referrals\`
)
SELECT t.copied, t.landed, r.redeemed, r.plans_bought, r.reward_paid FROM t, r`;

function campaignFunnelSql(contentId) {
  return `
WITH campaigns AS (
  SELECT id FROM \`${BQ_PROJECT}.dbt_prod_hubspot_v2.campaigns\` WHERE content_id IN (${contentId})
),
events AS (
  SELECT hee.recipient, hee.type, hc.gg_user_id
  FROM \`${BQ_PROJECT}.dbt_prod_hubspot_v2.email_events\` hee
  JOIN campaigns c ON hee.email_campaign_id = c.id
  LEFT JOIN \`${BQ_PROJECT}.dbt_prod.hubspot_contacts\` hc ON LOWER(hee.recipient)=LOWER(hc.contact_email)
  WHERE hee.type IN ('SENT','OPEN','CLICK') AND hee.filtered_event IS NOT TRUE
),
clicker_users AS (SELECT DISTINCT CAST(gg_user_id AS INT64) AS user_id FROM events WHERE type='CLICK' AND gg_user_id IS NOT NULL),
copy_link AS (
  SELECT DISTINCT CAST(user_id AS INT64) AS user_id
  FROM \`${BQ_PROJECT}.mixpanel_production.mp_master_event\`
  WHERE event_name='button_clicked' AND JSON_VALUE(properties,'$.button_id')='referrals_copy_link' AND user_id IS NOT NULL
),
target_users AS (SELECT ec.user_id FROM clicker_users ec INNER JOIN copy_link cl ON ec.user_id=cl.user_id),
user_codes AS (
  SELECT rc.id AS referral_code_id, rc.code
  FROM \`${BQ_PROJECT}.prod_module_core.referral_codes\` rc
  WHERE rc.user_id IN (SELECT user_id FROM target_users)
)
SELECT 1 AS step, 'Sent' AS stage, (SELECT COUNT(DISTINCT recipient) FROM events WHERE type='SENT') AS users
UNION ALL SELECT 2, 'Opened',  (SELECT COUNT(DISTINCT recipient) FROM events WHERE type='OPEN')
UNION ALL SELECT 3, 'Clicked', (SELECT COUNT(DISTINCT recipient) FROM events WHERE type='CLICK')
UNION ALL SELECT 4, 'Code created', (SELECT COUNT(DISTINCT rc.user_id) FROM \`${BQ_PROJECT}.prod_module_core.referral_codes\` rc WHERE rc.user_id IN (SELECT user_id FROM clicker_users))
UNION ALL SELECT 5, 'Copied link', (SELECT COUNT(DISTINCT user_id) FROM target_users)
UNION ALL SELECT 6, 'Referee landed', (SELECT COUNT(DISTINCT distinct_id) FROM \`${BQ_PROJECT}.mixpanel_production.mp_master_event\` WHERE event_name='page_viewed' AND REGEXP_EXTRACT(JSON_VALUE(properties,'$.page_url'), r'[?&]referral=([^&]+)') IN (SELECT code FROM user_codes))
UNION ALL SELECT 7, 'Referee applied code', (SELECT COUNT(DISTINCT referee_id) FROM \`${BQ_PROJECT}.prod_module_core.plan_referrals\` WHERE referral_code_id IN (SELECT referral_code_id FROM user_codes))
ORDER BY step`;
}

async function referrals(url, env) {
  if (!env.GCP_SA_EMAIL || !env.GCP_SA_PRIVATE_KEY) {
    return json({ error: "BigQuery service account not configured (set GCP_SA_EMAIL + GCP_SA_PRIVATE_KEY)" }, 501);
  }
  try {
    const [prog, camp] = await Promise.all([
      bqQuery(env, PROGRAMME_SQL),
      bqQuery(env, campaignFunnelSql(REFERRAL_CAMPAIGN_CONTENT_ID)),
    ]);
    const p = prog[0] || {};
    const n = (v) => Number(v || 0);
    return json({
      generatedAt: new Date().toISOString(),
      campaignContentId: REFERRAL_CAMPAIGN_CONTENT_ID,
      campaign: camp.map((r) => ({ stage: r.stage, users: n(r.users) })),
      programme: [
        { stage: "Links copied (referrers)", users: n(p.copied) },
        { stage: "Referees landed", users: n(p.landed) },
        { stage: "Redeemed (code applied)", users: n(p.redeemed) },
        { stage: "Plans bought", users: n(p.plans_bought) },
        { stage: "Reward paid", users: n(p.reward_paid) },
      ],
      method: "Ported from the Count referral canvas: programme totals from prod_module_core.plan_referrals + mixpanel page_viewed/button_clicked; per-campaign funnel from the HubSpot email audience (content_id) through code-created → copied → referee landed/applied.",
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

function json(o, s) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// ---------------------------------------------------------------------------------------------
// Meetings Booked report (/meetings-booked/) — every meeting booked through a HubSpot meeting
// link (hs_meeting_source = MEETINGS_PUBLIC), with the link, the GetGrounder, the contact and the
// UTMs captured on the booking (utm_*_of_meeting meeting properties, added to the portal Jun 2026).
//
// Paged on purpose: the client calls this repeatedly with ?after=<cursor> until `next` is null.
// Each call is ~5 HubSpot subrequests (1 search page of 200 + 2 assoc batches + 2 contact
// batches, owners cached per isolate), so no single request can hit the Workers subrequest cap
// regardless of date range — the same failure mode fixed for /api/outcomes in 3935a90.
//
// Link slug: this token has no scheduler scope, so meeting-link IDs can't be looked up live.
// MEETING_LINK_SLUGS was built 5 Oct 2026 by matching each booking to the contact's
// "Meetings Link: <slug>" form submission (1,306/1,307 matched, no ID mapped to two slugs).
// For links created after that, fall back to the contact's recent_conversion_event_name when its
// timestamp is within 10 min of the booking — then to "Link #<id>" so nothing is dropped.
// Search API caps any one query at 10k results (~2 years of bookings at current volume).
const MEETING_LINK_SLUGS = {
  "16906496": "florence-chan",
  "17459534": "scott-dixon",
  "17834907": "ecarpenter",
  "17948915": "chey",
  "18252443": "luke-worrell",
  "18315607": "talha-abbasi",
  "18526925": "luke-worrell/quick-chat-with-luke",
  "19015255": "tristan-webel",
  "19042292": "alis-ilgaz",
  "19260980": "jayden-burns/introduction-to-getground",
  "19261577": "jhigueras/mortgages",
  "19261604": "jhigueras/sm-property-strategy-session",
  "19261610": "jhigueras/intro-to-getground",
  "19264499": "jhigueras/account-managers",
  "19558770": "florence-chan/smallfishba",
  "19880012": "asya-wu",
  "20171235": "ryan-welby",
  "20295615": "yoana-chung",
  "20295786": "yoana-chung/yoana-external-meeting-link",
  "20297517": "tristan-webel/tristan-external",
  "20297574": "ryan-welby/ryan-internal",
  "20969297": "deepinder",
  "21065298": "carlos-lam",
  "21065422": "carlos-lam/carlos-investment-consultants",
  "21128572": "carlos-lam/carlos-yoana",
  "21273179": "iglesias-ang",
  "21279056": "iglesias-ang/iglesias-investment-consultants",
  "22113907": "danica-villegas",
  "22272929": "henry-shaw",
  "22573679": "jhigueras/sm-sdr-intro",
  "22598364": "esther-grant/certification-calls",
  "23074395": "billy-hunt",
  "23078722": "billy-hunt/billy-investment-consultants",
  "23114844": "yoana-chung/quick-chat",
  "23405258": "srobson/15-minute-client-call",
  "23453598": "carlos-lam/carlos-platform-referral",
  "23453609": "billy-hunt/billy-platform-referral",
  "23453613": "iglesias-ang/iglesias-platform-referral",
  "23453673": "carlos-lam/carlos-property-referral",
  "23453677": "billy-hunt/billy-property-referral",
  "23453682": "iglesias-ang/iglesias-property-referral",
  "23531545": "elizabeth-prendergast/plan-ics",
  "23558613": "khalid-soueidan/property-platform-referral",
  "23558620": "khalid-soueidan/platform-property-referral"
};
const MEETING_PROPS = ["hs_createdate", "hs_meeting_start_time", "hs_meeting_outcome", "hubspot_owner_id",
  "hs_meeting_created_from_link_id", "utm_source_of_meeting", "utm_medium_of_meeting", "utm_campaign_of_meeting"];
const MEETING_CONTACT_PROPS = ["firstname", "lastname", "email", "recent_conversion_event_name", "recent_conversion_date"];
let ownerNameCache = null, ownerNameCacheAt = 0;

async function meetingsBooked(url, env) {
  try {
    const API = "https://api.hubapi.com";
    const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    const after = url.searchParams.get("after");
    if (!from || !to) return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);
    // UK dates: treat the range as whole days in Europe/London (BST offset is close enough at
    // day granularity — see the "is after" boundary gotcha documented for MRR Nov Sprint).
    const fromMs = Date.parse(`${from}T00:00:00+01:00`);
    const toMs = Date.parse(`${to}T23:59:59.999+01:00`);
    const body = {
      filterGroups: [{ filters: [
        { propertyName: "hs_meeting_source", operator: "EQ", value: "MEETINGS_PUBLIC" },
        { propertyName: "hs_createdate", operator: "BETWEEN", value: String(fromMs), highValue: String(toMs) },
      ] }],
      properties: MEETING_PROPS,
      sorts: [{ propertyName: "hs_createdate", direction: "DESCENDING" }],
      limit: 200,
    };
    if (after) body.after = after;
    const search = await hsFetch(`${API}/crm/v3/objects/meetings/search`, { method: "POST", headers: H, body: JSON.stringify(body) });
    const meetings = search.results || [];

    if (!ownerNameCache || Date.now() - ownerNameCacheAt > 3600e3) {
      ownerNameCache = await fetchOwnerNames(API, H);
      ownerNameCacheAt = Date.now();
    }
    const m2c = await batchAssociations(API, H, "meetings", "contacts", meetings.map((m) => m.id));
    const contactIds = [...new Set(Object.values(m2c).flat())];
    const contacts = await batchRead(API, H, "contacts", contactIds, MEETING_CONTACT_PROPS);

    const rows = meetings.map((m) => {
      const p = m.properties || {};
      const bookedMs = Date.parse(p.hs_createdate);
      const cids = m2c[m.id] || [];
      const linkId = p.hs_meeting_created_from_link_id || null;
      let slug = linkId ? MEETING_LINK_SLUGS[linkId] : null;
      if (!slug) {
        for (const cid of cids) {
          const c = contacts[cid] || {};
          const ev = c.recent_conversion_event_name || "";
          if (ev.startsWith("Meetings Link: ") && Math.abs(Date.parse(c.recent_conversion_date) - bookedMs) < 10 * 60e3) {
            slug = ev.slice("Meetings Link: ".length); break;
          }
        }
      }
      if (!slug) slug = linkId ? `Link #${linkId}` : "(no link recorded)";
      const people = cids.map((cid) => {
        const c = contacts[cid] || {};
        return { id: cid, name: [c.firstname, c.lastname].filter(Boolean).join(" ").trim() || c.email || `Contact ${cid}`, email: c.email || "" };
      });
      return {
        id: m.id,
        booked: p.hs_createdate,
        start: p.hs_meeting_start_time || null,
        outcome: p.hs_meeting_outcome || null,
        link: slug,
        linkId,
        owner: ownerNameCache[p.hubspot_owner_id] || (p.hubspot_owner_id ? `Owner ${p.hubspot_owner_id}` : "(unassigned)"),
        contacts: people,
        utmSource: p.utm_source_of_meeting || null,
        utmMedium: p.utm_medium_of_meeting || null,
        utmCampaign: p.utm_campaign_of_meeting || null,
      };
    });
    const next = search.paging && search.paging.next && search.paging.next.after;
    return json({ total: search.total ?? rows.length, rows, next: next || null }, 200);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

// ---------------------------------------------------------------------------------------------
// BTL calculator landing page report (/btl-calculator-page/) — www.getground.co.uk/
// btl-limited-company-calculator, the Company Google Ads landing page. Relaunched 6 Oct 2026
// (monorepo PR #1623: free-setup hero, instant tax calculator, Set up today -> checkout), then
// 7 Oct Set up today switched to app sign-up first (#1629). Compares the 4 weeks before the
// relaunch with the days since. Aggregates only — no contact-level data leaves the worker.
//
// Sources:
//   - Visits, clicks, calculator use, app sign-up landings and sign-ups: Mixpanel via BigQuery
//     (mixpanel_production.mp_master_event; may lag Mixpanel itself by up to a day).
//   - Form leads: HubSpot form submissions on this page (both forms the page has used).
//   - Plans bought: Core/Complete Plans deals (closed won) for form leads after they submitted,
//     and for app accounts created from this page's sign-up link (matched by contact user_id).
const BTL = {
  pagePath: "/btl-limited-company-calculator",
  launchIso: "2026-10-06T13:02:00Z",      // #1623 merged (14:02 BST)
  signupFirstIso: "2026-10-07T08:32:00Z", // #1629 merged (09:32 BST)
  baselineStartIso: "2026-09-07T23:00:00Z", // 8 Sep 00:00 BST — 4 weeks before launch day
  // Both forms this page has embedded, so the old and new versions are counted alike.
  forms: {
    "e2ab0d60-3478-495c-bd6a-8ac066202cc2": "Set Up / Learn more form",
    "01c695d9-e896-4391-bcdf-1621b23e873d": "Old Calculate form",
  },
  plansPipeline: "1882997999",
  // The sign-up link Set up today sends people to (app login page with the Core Plan checkout as
  // the redirect). Matched both URL-encoded and decoded, since page_url may be stored either way.
  appLandingLikes: [
    "%app.getground.co.uk/%redirect=packs-and-plans%2Fcheckout%3Fplan_short_id%3DPL0000002%",
    "%app.getground.co.uk/%redirect=packs-and-plans/checkout?plan_short_id=PL0000002%",
  ],
};

// Button ids -> readable groups. Old ids are kept so the "before" period reads correctly.
function btlButtonGroup(id) {
  if (!id) return "Other";
  if (id.startsWith("btl_calc_landing_setup_today")) return "Set up today";
  if (id.startsWith("btl_calc_landing_learn_more")) return "Learn more (form)";
  if (id.startsWith("btl_calc_landing_calculator")) return "Calculate my tax savings (scroll)";
  if (id.startsWith("btl_calc_landing_cta1")) return "Old: Set Up My Limited Company (form)";
  if (id.startsWith("btl_calc_landing_cta2")) return "Old: Calculate My Tax Savings (form)";
  if (id.startsWith("btl_calc_quiz") || id.startsWith("btl_calculator_quiz") || id.includes("see_my_tax")) return "Old: See My Tax Savings (quiz)";
  return "Header / footer / other";
}

const BTL_CACHE_VERSION = "v7-mixpanel-live";

let _mpTimeCol = null; // detected once per warm worker
async function mpTimeExpr(env) {
  if (_mpTimeCol) return _mpTimeCol;
  const cols = await bqQuery(env, `SELECT column_name, data_type FROM \`${BQ_PROJECT}.mixpanel_production.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = 'mp_master_event'`);
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));
  const pick = ["time", "event_time", "timestamp", "mp_time"].find((n) => byName[n]);
  if (!pick) throw new Error(`mp_master_event: no time column found (columns: ${Object.keys(byName).join(", ")})`);
  const t = byName[pick];
  // Mixpanel exports time as TIMESTAMP, or as epoch seconds/millis in INT64 depending on the export.
  _mpTimeCol = t === "TIMESTAMP" ? `\`${pick}\``
    : t === "INT64" ? `IF(\`${pick}\` > 100000000000, TIMESTAMP_MILLIS(\`${pick}\`), TIMESTAMP_SECONDS(\`${pick}\`))`
    : `TIMESTAMP(\`${pick}\`)`;
  return _mpTimeCol;
}

function btlMixpanelSql(T) {
  const url = `COALESCE(JSON_VALUE(properties,'$.page_url'), JSON_VALUE(properties,'$."$current_url"'))`;
  const landing = BTL.appLandingLikes.map((l) => `${url} LIKE '${l}'`).join(" OR ");
  return `
WITH ev AS (
  SELECT ${T} AS ts, event_name, distinct_id, CAST(user_id AS STRING) AS user_id,
         ${url} AS url,
         JSON_VALUE(properties,'$.button_id') AS button_id,
         JSON_VALUE(properties,'$.page_section') AS section,
         JSON_VALUE(properties,'$.option_group') AS option_group,
         JSON_VALUE(properties,'$."$device_id"') AS device_id
  FROM \`${BQ_PROJECT}.mixpanel_production.mp_master_event\`
  WHERE ${T} >= TIMESTAMP('${BTL.baselineStartIso}')
),
page AS (SELECT * FROM ev WHERE url LIKE '%getground.co.uk${BTL.pagePath}%'),
landings AS (SELECT ts, distinct_id, device_id, user_id FROM ev WHERE ts >= TIMESTAMP('${BTL.launchIso}') AND (${landing})),
signups AS (
  SELECT DISTINCT e.ts, COALESCE(e.user_id, e.distinct_id) AS uid
  FROM (SELECT * FROM ev WHERE event_name IN ('user_creation_succeeded','web_session_user_creation_succeeded') AND ts >= TIMESTAMP('${BTL.launchIso}')) e
  JOIN landings l ON (e.distinct_id = l.distinct_id OR (e.device_id IS NOT NULL AND e.device_id = l.device_id))
  WHERE e.ts >= l.ts
)
SELECT 'daily' AS kind, CAST(DATE(ts,'Europe/London') AS STRING) AS d, CAST(NULL AS STRING) AS bucket, CAST(NULL AS STRING) AS section,
  COUNT(DISTINCT distinct_id) AS users, COUNTIF(event_name='page_viewed') AS events,
  COUNT(DISTINCT IF(event_name='option_selected' AND option_group='btl_tax_savings_calculator', distinct_id, NULL)) AS extra
FROM page GROUP BY d
UNION ALL
SELECT 'click', IF(ts >= TIMESTAMP('${BTL.launchIso}'),'after','before'), button_id, section,
  COUNT(DISTINCT distinct_id), COUNT(*), NULL
FROM page WHERE event_name='button_clicked' GROUP BY 2,3,4
UNION ALL
SELECT 'clickday', CAST(DATE(ts,'Europe/London') AS STRING), button_id, NULL, COUNT(DISTINCT distinct_id), COUNT(*), NULL
FROM page WHERE event_name='button_clicked' GROUP BY 2,3
UNION ALL
SELECT 'landing', CAST(DATE(ts,'Europe/London') AS STRING), NULL, NULL, COUNT(DISTINCT distinct_id), COUNT(*), NULL
FROM landings GROUP BY 2
UNION ALL
SELECT 'signup', CAST(DATE(ts,'Europe/London') AS STRING), uid, NULL, 1, 1, NULL FROM signups
UNION ALL
SELECT DISTINCT 'landinguid', NULL, user_id, NULL, 1, 1, NULL FROM landings WHERE user_id IS NOT NULL`;
}

async function btlWonStages(API, H) {
  const p = await hsFetch(`${API}/crm/v3/pipelines/deals/${BTL.plansPipeline}`, { headers: H });
  return new Set((p.stages || []).filter((s) => s.metadata && s.metadata.isClosed === "true" && Number(s.metadata.probability) === 1).map((s) => s.id));
}

async function btlPlansForContacts(API, H, contactSince, won) {
  // contactSince: { contactId: sinceMs } -> number of won Plans deals created after sinceMs
  const ids = Object.keys(contactSince);
  if (!ids.length) return [];
  const c2d = await batchAssociations(API, H, "contacts", "deals", ids);
  const dealIds = [...new Set(Object.values(c2d).flat())];
  const deals = await batchRead(API, H, "deals", dealIds, ["pipeline", "dealstage", "createdate", "amount"]);
  const out = [];
  for (const cid of ids) {
    for (const did of c2d[cid] || []) {
      const d = deals[did];
      if (!d || d.pipeline !== BTL.plansPipeline || !won.has(d.dealstage)) continue;
      const ms = Date.parse(d.createdate);
      if (ms >= contactSince[cid] - 3600e3) out.push({ ms, amount: Number(d.amount) || 0 });
    }
  }
  return out;
}

async function btlFormLeads(API, H) {
  const since = Date.parse(BTL.baselineStartIso);
  const subs = [];
  for (const [formId, name] of Object.entries(BTL.forms)) {
    let after = null;
    do {
      const j = await hsFetch(`${API}/form-integrations/v1/submissions/forms/${formId}?limit=50${after ? `&after=${after}` : ""}`, { headers: H });
      for (const r of j.results || []) {
        if (r.submittedAt < since) continue;
        if (!(r.pageUrl || "").includes(BTL.pagePath)) continue;
        const email = ((r.values || []).find((v) => v.name === "email") || {}).value;
        if (email) subs.push({ formId, form: name, ms: r.submittedAt, email: email.toLowerCase().trim() });
      }
      after = j.paging && j.paging.next && j.paging.next.after;
      // Results come newest first; stop paging once a whole page is older than the window.
      if ((j.results || []).length && j.results[j.results.length - 1].submittedAt < since) after = null;
    } while (after);
  }
  return subs;
}

function londonDay(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

// Live Mixpanel via the Raw Event Export API (EU residency), authenticated with a read-only
// service account (MIXPANEL_SA_USERNAME / MIXPANEL_SA_SECRET Pages secrets). Three small exports
// per refresh; with the 10-minute cache that stays well inside the export rate limit.
const MP_PROJECT_ID = "3987900"; // New Production
async function mpExport(env, { from, to, events, where }) {
  const q = new URLSearchParams({ project_id: MP_PROJECT_ID, from_date: from, to_date: to });
  if (events) q.set("event", JSON.stringify(events));
  if (where) q.set("where", where);
  const r = await fetch(`https://data-eu.mixpanel.com/api/2.0/export?${q}`, {
    headers: { Authorization: "Basic " + btoa(`${env.MIXPANEL_SA_USERNAME}:${env.MIXPANEL_SA_SECRET}`), Accept: "text/plain" },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Mixpanel export ${r.status}: ${text.slice(0, 200)}`);
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function btlMixpanelLive(env, out, launchMs) {
  const today = londonDay(Date.now());
  const page = await mpExport(env, {
    from: londonDay(Date.parse(BTL.baselineStartIso) + 3600e3), to: today,
    where: `defined(properties["$current_url"]) and "getground.co.uk${BTL.pagePath}" in properties["$current_url"]`,
  });
  const launchDay = londonDay(launchMs);
  const landingEvents = await mpExport(env, {
    from: launchDay, to: today, events: ["page_viewed"],
    where: `defined(properties["$current_url"]) and "app.getground.co.uk/" in properties["$current_url"] and "plan_short_id" in properties["$current_url"] and "redirect=packs-and-plans" in properties["$current_url"]`,
  });
  const creations = await mpExport(env, { from: launchDay, to: today, events: ["user_creation_succeeded", "web_session_user_creation_succeeded"] });

  const ms = (e) => (e.properties.time || 0) * 1000;
  const days = {};
  const uniq = (d, k) => (days[d][k] = days[d][k] || new Set());
  const clicks = {};
  for (const e of page) {
    const p = e.properties, t = ms(e), d = londonDay(t);
    days[d] = days[d] || { pageViews: 0 };
    uniq(d, "visitors").add(p.distinct_id);
    if (e.event === "page_viewed") days[d].pageViews++;
    if (e.event === "option_selected" && p.option_group === "btl_tax_savings_calculator") uniq(d, "calc").add(p.distinct_id);
    if (e.event === "button_clicked") {
      const period = t >= launchMs ? "after" : "before";
      const k = `${btlButtonGroup(p.button_id)}|${p.page_section || "—"}`;
      clicks[k] = clicks[k] || { group: btlButtonGroup(p.button_id), section: p.page_section || "—", beforeSet: new Set(), afterSet: new Set(), beforeClicks: 0, afterClicks: 0 };
      clicks[k][`${period}Set`].add(p.distinct_id);
      clicks[k][`${period}Clicks`]++;
    }
  }
  out.daily = Object.keys(days).sort().map((d) => ({ date: d, visitors: days[d].visitors.size, pageViews: days[d].pageViews, calculatorUsers: days[d].calc ? days[d].calc.size : 0 }));
  out.clicks = Object.values(clicks).map((c) => ({ group: c.group, section: c.section, before: c.beforeSet.size, after: c.afterSet.size, beforeClicks: c.beforeClicks, afterClicks: c.afterClicks }))
    .sort((a, b) => (b.after + b.before) - (a.after + a.before));

  // Sign-ups: an account created (normal or web-session upgrade) by a device/user that landed
  // on this page's sign-up link, after that landing.
  const firstLanding = {};
  const landDays = {}, landUids = new Set();
  for (const e of landingEvents) {
    const p = e.properties, t = ms(e);
    if (t < launchMs) continue;
    for (const id of [p.$device_id, p.$user_id].filter(Boolean)) firstLanding[id] = Math.min(firstLanding[id] ?? Infinity, t);
    const d = londonDay(t);
    (landDays[d] = landDays[d] || new Set()).add(p.$device_id || p.distinct_id);
    if (p.$user_id) landUids.add(String(p.$user_id));
  }
  out.signupLandings = Object.keys(landDays).sort().map((d) => ({ date: d, users: landDays[d].size, userIds: [] }));
  if (out.signupLandings.length) out.signupLandings[0].userIds = [...landUids];
  const signed = {}, signDaily = {};
  for (const e of creations) {
    const p = e.properties, t = ms(e);
    const first = Math.min(firstLanding[p.$device_id] ?? Infinity, firstLanding[p.$user_id] ?? Infinity);
    if (!(t >= first)) continue;
    const uid = String(p.$user_id || p.distinct_id);
    if (!signed[uid]) { signed[uid] = t; const d = londonDay(t); signDaily[d] = (signDaily[d] || 0) + 1; }
  }
  out.signups = { total: Object.keys(signed).length, daily: signDaily, userIds: Object.keys(signed).filter((u) => /^\d+$/.test(u)), plans: 0 };
  out.mixpanelLive = true;
}

async function btlCalcReport(url, env, ctx) {
  const cache = caches.default;
  // Versioned so a deploy that changes the response shape never serves a stale cached copy —
  // bump BTL_CACHE_VERSION whenever btlCalcReport's output changes.
  const cacheKey = new Request(`${url.origin}/__cache/btl-calc-${BTL_CACHE_VERSION}`);
  if (url.searchParams.get("refresh") !== "1") {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const API = "https://api.hubapi.com";
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const nowMs = Date.now();
  const launchMs = Date.parse(BTL.launchIso), baseMs = Date.parse(BTL.baselineStartIso);
  const out = {
    page: `https://www.getground.co.uk${BTL.pagePath}`,
    launchIso: BTL.launchIso, signupFirstIso: BTL.signupFirstIso, baselineStartIso: BTL.baselineStartIso,
    generatedAt: new Date(nowMs).toISOString(),
    days: { before: (launchMs - baseMs) / 864e5, after: (nowMs - launchMs) / 864e5 },
    errors: {},
  };

  let won = null;
  try { won = await btlWonStages(API, H); } catch (e) { out.errors.plans = String(e); }

  // --- HubSpot: form leads and the plans they went on to buy
  try {
    const subs = await btlFormLeads(API, H);
    const firstByEmail = {};
    for (const s of subs.sort((a, b) => a.ms - b.ms)) if (!firstByEmail[s.email]) firstByEmail[s.email] = s;
    const daily = {};
    for (const s of subs) {
      const d = londonDay(s.ms);
      daily[d] = daily[d] || { submissions: 0 };
      daily[d].submissions++;
    }
    out.formLeads = {
      daily,
      byForm: Object.values(BTL.forms).map((f) => ({
        form: f,
        before: subs.filter((s) => s.form === f && s.ms < launchMs).length,
        after: subs.filter((s) => s.form === f && s.ms >= launchMs).length,
      })),
      people: {
        before: Object.values(firstByEmail).filter((s) => s.ms < launchMs).length,
        after: Object.values(firstByEmail).filter((s) => s.ms >= launchMs).length,
      },
    };
    if (won) {
      const emails = Object.keys(firstByEmail);
      const contactSince = {};
      for (const c of chunk(emails, 100)) {
        const j = await hsFetch(`${API}/crm/v3/objects/contacts/batch/read`, {
          method: "POST", headers: H,
          body: JSON.stringify({ idProperty: "email", inputs: c.map((id) => ({ id })), properties: ["email"] }),
        });
        for (const r of j.results || []) contactSince[r.id] = firstByEmail[(r.properties.email || "").toLowerCase()].ms;
      }
      const plans = await btlPlansForContacts(API, H, contactSince, won);
      out.formLeads.plans = {
        before: plans.filter((p) => p.ms < launchMs).length,
        after: plans.filter((p) => p.ms >= launchMs).length,
      };
    }
  } catch (e) { out.errors.formLeads = String(e); }

  // --- Mixpanel: live via service account if configured, else BigQuery, else the snapshot
  if (env.MIXPANEL_SA_USERNAME && env.MIXPANEL_SA_SECRET) {
    try { await btlMixpanelLive(env, out, launchMs); } catch (e) { out.errors.mixpanel = String(e); }
  } else if (!env.GCP_SA_EMAIL || !env.GCP_SA_PRIVATE_KEY) {
    // No warehouse access on this Pages project yet: fall back to a Mixpanel snapshot pulled by
    // hand (btl-calculator-page/mixpanel-snapshot.json), clearly labelled as such on the page.
    try {
      const r = await env.ASSETS.fetch(new Request(`${url.origin}/btl-calculator-page/mixpanel-snapshot.json`));
      if (!r.ok) throw new Error(`snapshot ${r.status}`);
      const snap = await r.json();
      out.mixpanelSnapshotAt = snap.snapshotAt;
      out.daily = snap.daily;
      const clicks = {};
      for (const c of snap.clicks) {
        const g = btlButtonGroup(c.buttonId);
        const k = `${g}|${c.section || "—"}`;
        clicks[k] = clicks[k] || { group: g, section: c.section || "—", before: 0, after: 0, beforeClicks: 0, afterClicks: 0 };
        clicks[k][c.period] += c.users;
        clicks[k][`${c.period}Clicks`] += c.clicks;
      }
      out.clicks = Object.values(clicks).sort((a, b) => (b.after + b.before) - (a.after + a.before));
      // Snapshot click ranges are whole London days, so rate them over those days.
      const [bFrom, bTo] = snap.beforeRange.split("..");
      const aFrom = snap.afterRange.split("..")[0];
      out.clickDays = {
        before: (Date.parse(bTo) - Date.parse(bFrom)) / 864e5 + 1,
        after: (Date.parse(snap.snapshotAt) - Date.parse(`${aFrom}T00:00:00+01:00`)) / 864e5,
      };
      out.signupLandings = snap.signupLandings;
      out.signups = snap.signups;
    } catch (e) {
      out.errors.mixpanel = `BigQuery service account not configured, and no snapshot available (${e})`;
    }
  } else {
    try {
      const rows = await bqQuery(env, btlMixpanelSql(await mpTimeExpr(env)));
      const num = (v) => Number(v) || 0;
      out.daily = rows.filter((r) => r.kind === "daily").map((r) => ({ date: r.d, visitors: num(r.users), pageViews: num(r.events), calculatorUsers: num(r.extra) })).sort((a, b) => a.date.localeCompare(b.date));
      const clicks = {};
      for (const r of rows.filter((x) => x.kind === "click")) {
        const k = `${btlButtonGroup(r.bucket)}|${r.section || "—"}`;
        clicks[k] = clicks[k] || { group: btlButtonGroup(r.bucket), section: r.section || "—", before: 0, after: 0, beforeClicks: 0, afterClicks: 0 };
        clicks[k][r.d] += num(r.users);
        clicks[k][`${r.d}Clicks`] += num(r.events);
      }
      out.clicks = Object.values(clicks).sort((a, b) => (b.after + b.before) - (a.after + a.before));
      const clickDaily = {};
      for (const r of rows.filter((x) => x.kind === "clickday")) {
        const g = btlButtonGroup(r.bucket);
        clickDaily[r.d] = clickDaily[r.d] || {};
        clickDaily[r.d][g] = (clickDaily[r.d][g] || 0) + num(r.users);
      }
      out.clickDaily = clickDaily;
      out.signupLandings = rows.filter((r) => r.kind === "landing").map((r) => ({ date: r.d, users: num(r.users) }));
      const signupRows = rows.filter((r) => r.kind === "signup");
      const signupUids = [...new Set(signupRows.map((r) => r.bucket).filter((u) => /^\d+$/.test(u || "")))];
      const signupDaily = {};
      for (const r of signupRows) signupDaily[r.d] = (signupDaily[r.d] || 0) + 1;
      out.signups = { total: new Set(signupRows.map((r) => r.bucket)).size, daily: signupDaily, userIds: signupUids };
      out.signupLandings.push({ date: null, users: 0, userIds: rows.filter((r) => r.kind === "landinguid").map((r) => r.bucket) });
    } catch (e) { out.errors.mixpanel = String(e); }
  }

  // Funnel people: app user ids -> HubSpot contact ids, so the page can link each step to the
  // records (ids/links only, no names/emails — this site is behind a shared password, not SSO).
  try {
    const landedUids = [...new Set((out.signupLandings || []).flatMap((l) => l.userIds || []))];
    const signedUids = (out.signups && out.signups.userIds) || [];
    const allUids = [...new Set([...landedUids, ...signedUids])];
    const uidToContact = {};
    for (const c of chunk(allUids, 100)) {
      const j = await hsFetch(`${API}/crm/v3/objects/contacts/search`, {
        method: "POST", headers: H,
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "user_id", operator: "IN", values: c }] }], properties: ["user_id"], limit: 100 }),
      });
      for (const r of j.results || []) uidToContact[r.properties.user_id] = r.id;
    }
    const person = (uid) => ({ userId: uid, contactId: uidToContact[uid] || null });
    out.funnelPeople = { landed: landedUids.map(person), signedUp: signedUids.map(person), boughtPlan: [] };
    if (won && out.signups) {
      const since = {};
      for (const p of out.funnelPeople.signedUp) if (p.contactId) since[p.contactId] = launchMs;
      const c2d = Object.keys(since).length ? await batchAssociations(API, H, "contacts", "deals", Object.keys(since)) : {};
      const deals = await batchRead(API, H, "deals", [...new Set(Object.values(c2d).flat())], ["pipeline", "dealstage", "createdate"]);
      for (const p of out.funnelPeople.signedUp) {
        const bought = (c2d[p.contactId] || []).some((did) => { const d = deals[did]; return d && d.pipeline === BTL.plansPipeline && won.has(d.dealstage) && Date.parse(d.createdate) >= launchMs - 3600e3; });
        if (bought) out.funnelPeople.boughtPlan.push(p);
      }
      out.signups.plans = out.funnelPeople.boughtPlan.length;
    }
  } catch (e) { out.errors.funnelPeople = String(e); }

  const res = json(out, 200);
  res.headers.set("Cache-Control", "max-age=600");
  if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
