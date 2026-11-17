// Beth Watchlist — things Beth is running that Claude keeps an eye on.
// Each item in watchlist.json is a cohort of HubSpot contacts (static lists) plus the owners whose
// follow-up matters. For every contact we pull meetings, deals, logged calls and a few contact-level
// signals (form fills, replies, site visits, unsubscribes) since the item's start date.
//
// The repo is PUBLIC: watchlist.json must only hold list/owner/email IDs, never names or emails.
// Contact details only ever come out of this worker, behind SITE_PASSWORD.
//
// /api/watchlist            -> every item, all activity since its start date
// /api/watchlist?days=7     -> same, but activity restricted to the last N days (used by the Monday email)
// Auth: SITE_PASSWORD cookie (browser) or `x-digest-key: <DIGEST_KEY>` header (Monday email routine).

const API = "https://api.hubapi.com";
const PORTAL = "25516403";
const AUTH_COOKIE = "bw";

const CONTACT_PROPS = [
  "firstname", "lastname", "email", "partner___name", "p_p___plan_type", "hubspot_owner_id",
  "recent_conversion_date", "recent_conversion_event_name", "hs_analytics_last_visit_timestamp",
  "hs_sales_email_last_replied", "hs_email_optout", "hs_email_last_open_date", "hs_email_last_click_date",
];

// ---------- auth ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function isAuthed(request, env) {
  if (env.DIGEST_KEY && request.headers.get("x-digest-key") === env.DIGEST_KEY) return true;
  if (!env.SITE_PASSWORD) return true; // fails open until the secret exists, like Beth Reports
  const m = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]+)`).exec(request.headers.get("Cookie") || "");
  return !!m && decodeURIComponent(m[1]) === env.SITE_PASSWORD;
}
function loginPage(redirectTo, wrong) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beth Watchlist</title><style>
:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:light-dark(#f7f8f7,#0e1112);color:light-dark(#0b0b0b,#f2f2f2);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
form{display:flex;flex-direction:column;gap:12px;width:260px;padding:28px;border-radius:14px;border:1px solid light-dark(#e3e6e5,#262b2d);background:light-dark(#fff,#161a1b)}
h1{font-size:16px;margin:0 0 4px}input,button{font:inherit;font-size:14px;padding:9px 10px;border-radius:8px}
input{border:1px solid light-dark(#cfd5d4,#333a3c);background:transparent;color:inherit}
button{border:0;background:#094C51;color:#fff;font-weight:600;cursor:pointer}.e{color:#c0392b;font-size:12px;margin:0}
</style></head><body><form method="POST" action="/__login"><h1>Beth Watchlist</h1>
<input type="hidden" name="redirect" value="${esc(redirectTo)}"><input type="password" name="password" placeholder="Password" autofocus required>
${wrong ? '<p class="e">Wrong password.</p>' : ""}<button>Enter</button></form></body></html>`;
}
async function handleLogin(request, env) {
  const f = await request.formData();
  const pw = String(f.get("password") || ""), to = String(f.get("redirect") || "/");
  if (env.SITE_PASSWORD && pw === env.SITE_PASSWORD) {
    return new Response(null, { status: 302, headers: { Location: to.startsWith("/") ? to : "/",
      "Set-Cookie": `${AUTH_COOKIE}=${encodeURIComponent(pw)}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax` } });
  }
  return new Response(loginPage(to, true), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}

// ---------- HubSpot helpers ----------
async function hs(env, path, opts = {}, attempt = 0) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" } });
  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    await new Promise((res) => setTimeout(res, (Number(r.headers.get("Retry-After")) || 1) * 1000 * (attempt + 1)));
    return hs(env, path, opts, attempt + 1);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HubSpot ${r.status} on ${path}: ${j.message || JSON.stringify(j)}`);
  return j;
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function listMembers(env, listId) {
  const ids = []; let after = null;
  do {
    const j = await hs(env, `/crm/v3/lists/${listId}/memberships?limit=250${after ? `&after=${after}` : ""}`);
    for (const r of j.results || []) ids.push(String(r.recordId));
    after = j.paging?.next?.after || null;
  } while (after);
  return ids;
}
async function assoc(env, from, to, ids) {
  const map = {};
  for (const c of chunk(ids, 100)) {
    const j = await hs(env, `/crm/v4/associations/${from}/${to}/batch/read`, { method: "POST", body: JSON.stringify({ inputs: c.map((id) => ({ id })) }) });
    for (const r of j.results || []) map[r.from.id] = (r.to || []).map((t) => String(t.toObjectId));
  }
  return map;
}
async function batchRead(env, type, ids, properties) {
  const map = {};
  for (const c of chunk([...new Set(ids)], 100)) {
    const j = await hs(env, `/crm/v3/objects/${type}/batch/read`, { method: "POST", body: JSON.stringify({ properties, inputs: c.map((id) => ({ id })) }) });
    for (const r of j.results || []) map[r.id] = r.properties || {};
  }
  return map;
}
let ownersCache = null, stagesCache = null;
async function owners(env) {
  if (ownersCache) return ownersCache;
  const j = await hs(env, `/crm/v3/owners?limit=500`);
  ownersCache = Object.fromEntries((j.results || []).map((o) => [String(o.id), `${o.firstName || ""} ${o.lastName || ""}`.trim()]));
  return ownersCache;
}
async function dealStages(env) {
  if (stagesCache) return stagesCache;
  const j = await hs(env, `/crm/v3/pipelines/deals`);
  const s = {};
  for (const p of j.results || []) for (const st of p.stages || []) {
    s[st.id] = { pipeline: p.label, stage: st.label, closed: st.metadata?.isClosed === "true", won: Number(st.metadata?.probability) === 1 };
  }
  stagesCache = s;
  return s;
}
const ms = (v) => { if (!v) return null; const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v); return Number.isFinite(n) ? n : null; };
const contactUrl = (id) => `https://app-eu1.hubspot.com/contacts/${PORTAL}/record/0-1/${id}`;
const dealUrl = (id) => `https://app-eu1.hubspot.com/contacts/${PORTAL}/record/0-3/${id}`;
const name = (p) => `${p.firstname || ""} ${p.lastname || ""}`.trim() || p.email || "(no name)";

// ---------- one watch item ----------
async function evaluate(env, item, sinceOverrideMs) {
  const startMs = Date.parse(item.start.length > 10 ? item.start : item.start + "T00:00:00Z");
  const sinceMs = Math.max(startMs, sinceOverrideMs || 0);
  const ownerIds = new Set((item.owners || []).map((o) => String(o.id)));

  const cohortMembers = {};
  for (const c of item.cohorts) cohortMembers[c.label] = await listMembers(env, c.listId);
  const all = [...new Set(Object.values(cohortMembers).flat())];
  const inCohorts = (cid) => item.cohorts.filter((c) => cohortMembers[c.label].includes(cid)).map((c) => c.label);

  const [contacts, own, stages] = await Promise.all([batchRead(env, "contacts", all, CONTACT_PROPS), owners(env), dealStages(env)]);
  const [cMeet, cDeal, cCall] = await Promise.all([
    assoc(env, "contacts", "meetings", all), assoc(env, "contacts", "deals", all), assoc(env, "contacts", "calls", all),
  ]);
  const [meetings, deals, calls] = await Promise.all([
    batchRead(env, "meetings", Object.values(cMeet).flat(), ["hs_createdate", "hs_meeting_start_time", "hs_meeting_outcome", "hubspot_owner_id", "hs_meeting_title"]),
    batchRead(env, "deals", Object.values(cDeal).flat(), ["dealname", "createdate", "closedate", "dealstage", "pipeline", "amount", "hubspot_owner_id"]),
    batchRead(env, "calls", Object.values(cCall).flat(), ["hs_timestamp", "hubspot_owner_id", "hs_call_title", "hs_call_disposition"]),
  ]);

  const events = [];
  const add = (cid, type, at, text, extra = {}) => {
    if (at == null || at < sinceMs) return;
    const p = contacts[cid] || {};
    events.push({ type, at, contactId: cid, contact: name(p), contactUrl: contactUrl(cid), partner: (p.partner___name || "").trim(),
      plan: p.p_p___plan_type || "", cohorts: inCohorts(cid), text, ...extra });
  };
  const seenDeal = new Set(), seenMeet = new Set();
  for (const cid of all) {
    const p = contacts[cid] || {};
    for (const mid of cMeet[cid] || []) {
      if (seenMeet.has(mid)) continue; seenMeet.add(mid);
      const m = meetings[mid]; if (!m) continue;
      const o = String(m.hubspot_owner_id || "");
      add(cid, "meeting", ms(m.hs_createdate), `Meeting booked with ${own[o] || "unknown owner"}${m.hs_meeting_start_time ? ` for ${new Date(ms(m.hs_meeting_start_time)).toISOString().slice(0, 10)}` : ""}${m.hs_meeting_outcome ? ` (${m.hs_meeting_outcome.toLowerCase()})` : ""}`,
        { owner: own[o] || "", ownerMatch: ownerIds.has(o) });
    }
    for (const did of cDeal[cid] || []) {
      if (seenDeal.has(did)) continue; seenDeal.add(did);
      const d = deals[did]; if (!d) continue;
      const st = stages[d.dealstage] || {}; const o = String(d.hubspot_owner_id || "");
      add(cid, "deal", ms(d.createdate), `Deal opened: ${d.dealname || "(unnamed)"} · ${st.pipeline || ""} / ${st.stage || d.dealstage}${d.amount ? ` · £${Number(d.amount).toLocaleString("en-GB")}` : ""}`,
        { owner: own[o] || "", ownerMatch: ownerIds.has(o), url: dealUrl(did) });
      if (st.won) add(cid, "won", ms(d.closedate), `Closed won: ${d.dealname || "(unnamed)"} (${st.pipeline || ""})`, { owner: own[o] || "", ownerMatch: ownerIds.has(o), url: dealUrl(did) });
    }
    for (const kid of cCall[cid] || []) {
      const c = calls[kid]; if (!c) continue;
      const o = String(c.hubspot_owner_id || "");
      if (!ownerIds.has(o)) continue; // only calls by the watched owners
      add(cid, "call", ms(c.hs_timestamp), `Call logged by ${own[o] || ""}${c.hs_call_title ? `: ${c.hs_call_title}` : ""}`, { owner: own[o] || "", ownerMatch: true });
    }
    add(cid, "form", ms(p.recent_conversion_date), `Form fill: ${p.recent_conversion_event_name || "unknown form"}`);
    add(cid, "reply", ms(p.hs_sales_email_last_replied), "Replied to a sales email");
    add(cid, "visit", ms(p.hs_analytics_last_visit_timestamp), "Visited the website");
  }
  events.sort((a, b) => b.at - a.at);

  const count = (t, pred = () => true) => events.filter((e) => e.type === t && pred(e)).length;
  const uniq = (t) => new Set(events.filter((e) => e.type === t).map((e) => e.contactId)).size;
  const plans = {};
  for (const cid of all) { const pl = contacts[cid]?.p_p___plan_type || "None"; plans[pl] = (plans[pl] || 0) + 1; }

  // Emails: HubSpot's own all-time stats per email (not range-filtered).
  const emailStats = [];
  for (const e of item.emails || []) {
    try {
      const j = await hs(env, `/marketing/v3/emails/${e.id}?includeStats=true`);
      const c = j.stats?.counters || {};
      emailStats.push({ label: e.label, id: e.id, sent: c.sent || 0, delivered: c.delivered || 0, opens: c.open || 0, clicks: c.click || 0,
        unsubscribed: c.unsubscribed || 0, url: `https://app-eu1.hubspot.com/email/${PORTAL}/details/${e.id}/performance` });
    } catch (err) { emailStats.push({ label: e.label, id: e.id, error: String(err.message || err) }); }
  }

  // Call tasks: matched on subject text, created since start. Null until the tasks exist.
  let callTasks = null;
  if (item.callTasks?.subjectContains) {
    const tasks = []; let after = null;
    do {
      const j = await hs(env, `/crm/v3/objects/tasks/search`, { method: "POST", body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: "hs_task_subject", operator: "CONTAINS_TOKEN", value: item.callTasks.subjectContains },
          { propertyName: "hs_createdate", operator: "GTE", value: String(startMs) }] }],
        properties: ["hs_task_status", "hubspot_owner_id"], limit: 200, ...(after ? { after } : {}) }) });
      tasks.push(...(j.results || []));
      after = j.paging?.next?.after || null;
    } while (after && tasks.length < 2000);
    const byOwner = {};
    for (const t of tasks) {
      const o = own[String(t.properties.hubspot_owner_id || "")] || "Unassigned";
      byOwner[o] = byOwner[o] || { done: 0, open: 0 };
      t.properties.hs_task_status === "COMPLETED" ? byOwner[o].done++ : byOwner[o].open++;
    }
    callTasks = { total: tasks.length, done: tasks.filter((t) => t.properties.hs_task_status === "COMPLETED").length,
      byOwner: Object.entries(byOwner).map(([name, c]) => ({ name, ...c })) };
  }

  return {
    ...item,
    sinceMs, generatedAt: Date.now(),
    emailStats, callTasks: item.callTasks ? callTasks : undefined, callTasksNote: item.callTasks?.note || null,
    cohortSizes: Object.fromEntries(item.cohorts.map((c) => [c.label, cohortMembers[c.label].length])),
    totalContacts: all.length,
    plans,
    unsubscribed: all.filter((cid) => contacts[cid]?.hs_email_optout === "true").length,
    summary: {
      meetings: count("meeting"), meetingsWithOwners: count("meeting", (e) => e.ownerMatch),
      deals: count("deal"), won: count("won"), calls: count("call"),
      formFills: uniq("form"), replies: uniq("reply"), visitors: uniq("visit"),
    },
    events,
  };
}

// ---------- tools: tickets via the Gmail add-on vs the manual Ops Request Form ----------
// The add-on (n8n "Create Ticket") submits the same HubSpot form through the API, so its
// submissions have no pageUrl and ticket_requested_by is the consultant's verified email.
// Manual fills come from the share-eu1 form link and have a typed name.
function consultantName(v) {
  const s = String(v || "").trim().toLowerCase().split("@")[0].split(/[.\s]/)[0];
  return s ? s[0].toUpperCase() + s.slice(1) : "Unknown";
}
async function evaluateTool(env, tool, sinceOverrideMs) {
  const startMs = Date.parse(tool.start.length > 10 ? tool.start : tool.start + "T00:00:00Z");
  const sinceMs = Math.max(startMs, sinceOverrideMs || 0);
  const subs = []; let after = null;
  do {
    const j = await hs(env, `/form-integrations/v1/submissions/forms/${tool.formId}?limit=50${after ? `&after=${after}` : ""}`);
    const page = j.results || [];
    subs.push(...page);
    after = j.paging?.next?.after || null;
    if (page.length && page[page.length - 1].submittedAt < sinceMs) break; // newest first
  } while (after);
  const byPerson = {};
  let viaTool = 0, manual = 0;
  const toolSubs = [];
  for (const s of subs) {
    if (s.submittedAt < sinceMs) continue;
    const v = Object.fromEntries((s.values || []).map((x) => [x.name, x.value]));
    const isTool = !s.pageUrl;
    const who = consultantName(v.ticket_requested_by);
    byPerson[who] = byPerson[who] || { tool: 0, manual: 0 };
    if (isTool) { viaTool++; byPerson[who].tool++; toolSubs.push({ at: s.submittedAt, who, subject: v.subject || "(no subject)", email: (v.email || "").toLowerCase(), urgency: v.urgency_level || "", type: v.ops_request__request_type || "" }); }
    else { manual++; byPerson[who].manual++; }
  }
  // Link each tool submission to its ticket: contact (by email) -> associated tickets. The token can't read
  // ticket properties, so pick the newest associated ticket id (ids increase over time) as the one created.
  const tickets = [];
  if (toolSubs.length) {
    const emails = [...new Set(toolSubs.map((t) => t.email).filter(Boolean))];
    const byEmail = {};
    for (const c of chunk(emails, 100)) {
      const j = await hs(env, `/crm/v3/objects/contacts/batch/read`, { method: "POST", body: JSON.stringify({ idProperty: "email", properties: ["email", "firstname", "lastname"], inputs: c.map((id) => ({ id })) }) });
      for (const r of j.results || []) byEmail[(r.properties.email || "").toLowerCase()] = { id: r.id, name: name(r.properties) };
    }
    const cT = await assoc(env, "contacts", "tickets", Object.values(byEmail).map((c) => c.id)).catch(() => ({}));
    for (const t of toolSubs) {
      const c = byEmail[t.email];
      const tids = (c && cT[c.id]) || [];
      const tid = tids.length ? tids.map(Number).sort((x, y) => y - x)[0] : null;
      tickets.push({ at: t.at, who: t.who, subject: t.subject, type: t.type, urgency: t.urgency, customer: c ? c.name : t.email,
        contactUrl: c ? contactUrl(c.id) : null, ticketUrl: tid ? `https://app-eu1.hubspot.com/contacts/${PORTAL}/record/0-5/${tid}` : null });
    }
  }
  return {
    ...tool, sinceMs, viaTool, manual, tickets,
    adoption: viaTool + manual ? Math.round((100 * viaTool) / (viaTool + manual)) : 0,
    people: Object.entries(byPerson).map(([name, c]) => ({ name, ...c })).sort((a, b) => b.tool - a.tool || b.manual - a.manual),
  };
}

// ---------- Complete post-purchase: are buyers getting set up via email/Lettings/Support, not their IC? ----------
// Buyers = Packs & Plans payment events with a Complete plan + upgrade events into Complete.
// For each buyer we look at the first `windowDays` after purchase: did their L&M deal reach Form Received,
// and who touched them (calls/meetings/emails/notes by owner group, tickets, emails they sent in).
// Baseline = buyers between baselineFrom and launch; "Since launch" = buyers after launch.
async function hsEvents(env, eventType, sinceIso) {
  const out = []; let after = null;
  do {
    const q = new URLSearchParams({ eventType, occurredAfter: sinceIso, limit: "100" });
    if (after) q.set("after", after);
    const j = await hs(env, `/events/v3/events?${q}`);
    out.push(...(j.results || []));
    after = j.paging?.next?.after || null;
  } while (after);
  return out;
}
async function evaluateCompletePP(env, t) {
  const launch = Date.parse(t.launch), from = Date.parse(t.baselineFrom), W = (t.windowDays || 14) * 86400000, now = Date.now();
  const [pays, ups, own] = await Promise.all([
    hsEvents(env, "pe25516403_packs_and_plans___payment", t.baselineFrom),
    hsEvents(env, "pe25516403_packs_and_plans___upgrade", t.baselineFrom),
    owners(env),
  ]);
  const buyers = {};
  const addBuyer = (cid, at, how) => { if (!buyers[cid] || at < buyers[cid].at) buyers[cid] = { at, how }; };
  for (const e of pays) {
    const p = e.properties || {};
    if (/complete/i.test(p.pack_plan_type || "") && (p.payment_status || "paid") === "paid" && String(p.is_migration).toLowerCase() !== "true")
      addBuyer(String(e.objectId), Date.parse(e.occurredAt), "checkout");
  }
  for (const e of ups) {
    const p = e.properties || {};
    if (/complete/i.test(p.new_plan_type || "") && !/complete/i.test(p.previous_plan_type || "")) addBuyer(String(e.objectId), Date.parse(e.occurredAt), "upgrade");
  }
  const ids = Object.keys(buyers);
  const groupOf = {};
  for (const [g, names] of Object.entries(t.groups || {})) for (const n of names) groupOf[n.toLowerCase()] = g;
  const ownerGroup = (oid) => groupOf[(own[String(oid || "")] || "").toLowerCase()] || "Other";

  const [cDeal, cCall, cMeet, cEmail, cTicket] = await Promise.all(["deals", "calls", "meetings", "emails", "tickets"].map((o) => assoc(env, "contacts", o, ids)));
  const fr = t.formReceivedStages || [];
  const [deals, calls, meets, emails, tickets] = await Promise.all([
    batchRead(env, "deals", Object.values(cDeal).flat(), ["pipeline", "createdate", ...fr.map((s) => `hs_v2_date_entered_${s}`)]),
    batchRead(env, "calls", Object.values(cCall).flat(), ["hs_timestamp", "hubspot_owner_id"]),
    batchRead(env, "meetings", Object.values(cMeet).flat(), ["hs_timestamp", "hubspot_owner_id"]),
    batchRead(env, "emails", Object.values(cEmail).flat(), ["hs_timestamp", "hubspot_owner_id", "hs_email_direction"]),
    batchRead(env, "tickets", Object.values(cTicket).flat(), ["createdate"]).catch(() => ({})), // token lacks tickets scope: fail soft
  ]);

  const rows = ids.map((cid) => {
    const b = buyers[cid], end = b.at + W;
    const inWin = (v) => { const x = ms(v); return x != null && x >= b.at && x <= end; };
    let formAt = null;
    for (const did of cDeal[cid] || []) {
      const d = deals[did]; if (!d || String(d.pipeline) !== String(t.lmPipeline)) continue;
      for (const s of fr) { const x = ms(d[`hs_v2_date_entered_${s}`]); if (x != null && x >= b.at - 86400000 && (formAt == null || x < formAt)) formAt = x; }
    }
    const touch = { IC: 0, Lettings: 0, Support: 0, Other: 0 };
    for (const id of cCall[cid] || []) if (calls[id] && inWin(calls[id].hs_timestamp)) touch[ownerGroup(calls[id].hubspot_owner_id)]++;
    for (const id of cMeet[cid] || []) if (meets[id] && inWin(meets[id].hs_timestamp)) touch[ownerGroup(meets[id].hubspot_owner_id)]++;
    let emailedIn = 0;
    for (const id of cEmail[cid] || []) {
      const e = emails[id]; if (!e || !inWin(e.hs_timestamp)) continue;
      if (e.hs_email_direction === "INCOMING_EMAIL") emailedIn++;
      else touch[ownerGroup(e.hubspot_owner_id)]++;
    }
    const tix = (cTicket[cid] || []).filter((id) => tickets[id] && inWin(tickets[id].createdate)).length;
    return { at: b.at, how: b.how, full: now >= end, form: formAt != null && formAt <= end, formDays: formAt != null ? Math.max(0, (formAt - b.at) / 86400000) : null,
      icTouch: touch.IC > 0, icTouches: touch.IC, lettingsTouch: touch.Lettings > 0, supportTouch: touch.Support > 0 || tix > 0, emailedIn: emailedIn > 0, tickets: tix };
  });

  const summarise = (rs) => {
    const n = rs.length, pct = (k) => (n ? Math.round((100 * rs.filter((r) => r[k]).length) / n) : null);
    const days = rs.map((r) => r.formDays).filter((x) => x != null).sort((a, b) => a - b);
    return { buyers: n, upgrades: rs.filter((r) => r.how === "upgrade").length, stillInWindow: rs.filter((r) => !r.full).length,
      formPct: pct("form"), medianDaysToForm: days.length ? Math.round(days[Math.floor(days.length / 2)] * 10) / 10 : null,
      icTouchPct: pct("icTouch"), icTouchesPerBuyer: n ? Math.round((10 * rs.reduce((a, r) => a + r.icTouches, 0)) / n) / 10 : null,
      lettingsTouchPct: pct("lettingsTouch"), supportTouchPct: pct("supportTouch"), emailedInPct: pct("emailedIn") };
  };
  const emailStats = [];
  for (const e of t.emails || []) {
    try {
      const j = await hs(env, `/marketing/v3/emails/${e.id}?includeStats=true`); const c = j.stats?.counters || {};
      emailStats.push({ label: e.label, sent: c.sent || 0, delivered: c.delivered || 0, opens: c.open || 0, clicks: c.click || 0 });
    } catch (err) { emailStats.push({ label: e.label, error: String(err.message || err) }); }
  }
  return { ...t, sinceMs: launch, baseline: summarise(rows.filter((r) => r.at >= from && r.at < launch)), current: summarise(rows.filter((r) => r.at >= launch)), emailStats };
}

async function watchlist(url, env) {
  try {
    const cfg = await (await env.ASSETS.fetch(new Request(new URL("/watchlist.json", url)))).json();
    if (url.searchParams.has("index")) {
      const live = (arr) => (arr || []).filter((i) => i.status !== "archived").map((i) => ({ key: i.key, title: i.title, tab: i.tab || i.title }));
      return json({ items: live(cfg.items), tools: live(cfg.tools) });
    }
    const days = Number(url.searchParams.get("days")) || 0;
    const sinceOverride = days ? Date.now() - days * 86400000 : 0;
    const only = url.searchParams.get("item");
    const items = [];
    for (const it of cfg.items.filter((i) => (!only || i.key === only) && i.status !== "archived")) {
      try { items.push(await evaluate(env, it, sinceOverride)); }
      catch (e) { items.push({ ...it, error: String(e.message || e) }); }
    }
    const tools = [];
    for (const t of (cfg.tools || []).filter((i) => (!only || i.key === only) && i.status !== "archived")) {
      try { tools.push(t.type === "complete-post-purchase" ? await evaluateCompletePP(env, t) : await evaluateTool(env, t, sinceOverride)); }
      catch (e) { tools.push({ ...t, error: String(e.message || e) }); }
    }
    return json({ generatedAt: Date.now(), days: days || null, items, tools });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__login") return handleLogin(request, env);
    if (!isAuthed(request, env)) {
      if (url.pathname.startsWith("/api/")) return json({ error: "Authentication required" }, 401);
      return new Response(loginPage(url.pathname + url.search, false), { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/watchlist") return watchlist(url, env);
    if (url.pathname === "/watchlist.json") return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
