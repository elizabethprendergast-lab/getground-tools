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
      },
      {
        key: "reengage-nonpaying",
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__login") return handleLogin(request, env);
    if (!isAuthed(request, env)) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Authentication required" }, 401);
      return new Response(loginPageHtml(url.pathname + url.search, false), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/stats") return stats(url, env);
    if (url.pathname === "/api/outcomes") return outcomes(url, env);
    if (url.pathname === "/api/deals") return dealAttribution(url, env);
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

async function outcomes(url, env) {
  const [reportKey, report] = getReport(url);
  if (!report) return json({ error: `unknown report '${reportKey}'` }, 404);
  if (!env.HUBSPOT_TOKEN) return json({ error: "HUBSPOT_TOKEN secret not set" }, 500);
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const API = "https://api.hubapi.com";
  const PORTAL_ID = "25516403";

  try {
    // See stats() above for why this uses searchTasksForAttribution rather than searchTasks —
    // completed tasks from reps outside the fixed owner list (e.g. Yoana Chung) need to show up
    // in the outcomes/disposition breakdown too, not just Asya/Chey/Active-Lead's owners.
    // maxProjects: 5 pins this to the original 5 projects (see searchTasksForAttribution) so
    // this endpoint's behavior is untouched by later project additions until proven safe.
    const { results } = await searchTasksForAttribution(API, H, report, { maxProjects: 5 });
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
      let best = null, bestKey = null, bestDelta = Infinity, bestOwnerMatch = false;
      for (const cid of contactsForTask) {
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

      let outcome, category;
      if (best) {
        b.matched++;
        const label = best.hs_call_disposition ? dispLabel[best.hs_call_disposition] : null;
        outcome = label || "(no disposition set)";
        category = categoriseDisposition(label);
      } else {
        outcome = "(no matching call found)";
        category = "unmatched";
      }

      const o = (b.byOutcome[outcome] ||= { count: 0, category, contacts: [] });
      o.count++;
      // Attach contact identities for the hover-to-see-contacts UI. A task can have more than
      // one associated contact; list them all rather than guessing which one the call belongs to.
      for (const cid of contactsForTask) {
        o.contacts.push({ id: cid, name: contactLabel(contacts[cid]), taskId: p.hs_object_id });
      }
    }

    const toRows = (b) => Object.entries(b.byOutcome)
      .map(([outcome, v]) => ({ outcome, tasks: v.count, category: v.category, contacts: v.contacts }))
      .sort((a, c) => c.tasks - a.tasks);

    const projects = (report.projects || []).map((cfg) => {
      const b = buckets[cfg.key] || { totalCompleted: 0, matched: 0, byOutcome: {} };
      return { key: cfg.key, label: cfg.label, totalCompleted: b.totalCompleted, totalMatchedToCall: b.matched, dispositions: toRows(b) };
    });
    const otherB = buckets.other || { totalCompleted: 0, matched: 0, byOutcome: {} };
    const other = { totalCompleted: otherB.totalCompleted, totalMatchedToCall: otherB.matched, dispositions: toRows(otherB) };

    return json({
      generatedAt: new Date().toISOString(),
      report: reportKey,
      sprintStart: report.sprintStart,
      portalId: PORTAL_ID,
      projects,
      other,
      method: "Each completed task is matched to the nearest OUTBOUND call on the same contact, within -2h/+15min of the task's completion time, preferring same-owner calls (this account has no direct task<->call association, and no task is bulk/admin-completed here — verified against real data — so the doc's general-SDR completion anchor applies to all projects, per hubspot_task_call_matching_logic.md §3).",
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

async function dealAttribution(url, env) {
  const [reportKey, report] = getReport(url);
  if (!report) return json({ error: `unknown report '${reportKey}'` }, 404);
  if (!env.HUBSPOT_TOKEN) return json({ error: "HUBSPOT_TOKEN secret not set" }, 500);
  const H = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  const API = "https://api.hubapi.com";
  const PORTAL_ID = "25516403";

  try {
    // Every contact ever put into a sequence, any task status — not just completed tasks —
    // since the question is "did this contact convert," not "did the call happen." Uses
    // searchTasksForAttribution (not searchTasks) so a contact counts regardless of which rep's
    // name is on the task — see that function's comment for why and what was tested.
    // maxProjects: 5 pins this to the original 5 projects, same reasoning as outcomes() above.
    const { results } = await searchTasksForAttribution(API, H, report, { maxProjects: 5 });
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

    const isClosedPlansDeal = (d) => d && d.pipeline === PLANS_PIPELINE_ID && d.dealstage === PLANS_CLOSED_WON_STAGE_ID && d.closedate;

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
      return { key: cfg.key, label: cfg.label, ...buildProject(contactMap) };
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

function json(o, s) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
