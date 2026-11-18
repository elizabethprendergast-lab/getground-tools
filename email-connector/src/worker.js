// GetGround Email — remote MCP connector for the normal Claude app chat.
// Lets Claude create GetGround-branded HubSpot email DRAFTS. Never publishes or sends.
// Builder logic (UTMs, disclaimers, dark mode, layout) is shared with the email-builder plugin
// and inlined at build time by build.mjs. Do not edit dist/_worker.js by hand.
//
// Endpoint: POST /mcp/<ACCESS_CODE>   (Streamable HTTP, stateless JSON responses)
// Secrets:  HUBSPOT_EMAIL_TOKEN (content scope only), ACCESS_CODES (comma-separated pilot codes)

/*__LIB__*/
/*__INSIGHTS__*/

const D = /*__DISCLAIMERS__*/null;
const GUIDELINES = /*__GUIDELINES__*/'';
const COMPONENTS = /*__COMPONENTS__*/'';
const VERSION = /*__VERSION__*/'dev';

const HOW_TO = `
# How to build an email with this connector

1. Read the GUIDELINES below and pick the type: marketing | personal | notification.
   Call get_email_insights (with a topic keyword) before writing the subject line and choosing the layout:
   offer 2–3 subject lines in the style of past top performers and say briefly why (cite the numbers).
2. Ask the person (one round, only what's missing): type, audience, goal + CTA label/URL, key points,
   UTM campaign (team_initiative_MMYY, e.g. growth_rent_review_1126), sender (default The GetGround Team /
   gethelp@getground.co.uk; personal = the contact owner's name + email). Never invent facts or figures —
   use [CONFIRM: …] placeholders.
3. Write the copy (GUIDELINES §9). Greeting: Hi {{ personalization_token('contact.firstname', 'there') }},
   Marketing emails: consider one on-brand graphic (see scripts/hero_image.py in the skill: styles cards |
   checklist | stat | event). Render it, show it to the person, then upload_email_image and use the IMAGE
   component with the returned URL. It sits BELOW the hero (never inside it). Minimal text in images.
4. Build a spec and call preview_email. Fix every warning. Then call create_email_draft.
5. Reply with the editor link, disclaimers added, UTM campaign, sender, any [CONFIRM] items, and:
   "This is a draft for human review — send yourself a test from HubSpot first." If the result says
   COMPLIANCE REVIEW REQUIRED, say "Needs Compliance review before sending" and why.
Never claim the email is sent or final. Nothing here can publish or send.

## Spec
{
  "type": "marketing | personal | notification",
  "brand": "getground",
  "name": "Internal name - campaign - MMYY",
  "subject": "...", "previewText": "...",
  "campaign": "growth_rent_review_1126",
  "from": {"name": "The GetGround Team", "email": "gethelp@getground.co.uk"},
  "replyTo": "optional",
  "subscription": "marketing | transactional (default: notification→transactional, else marketing)",
  "goal": "one line",
  "disclaimers": ["optional extra keys"], "removeDisclaimers": {"key": "reason"},
  "recurringMortgageEmail": false,
  "blocks": [
    {"kind": "html", "id": "hero", "html": "<component from COMPONENTS>"},
    {"kind": "text", "id": "intro", "html": "<p>Hi …</p><p>…</p>"},
    {"kind": "button", "label": "Book a call", "url": "https://…", "utm_content": "book_a_call"},
    {"kind": "text", "id": "signoff", "html": "<p>Got a question? Just reply to this email.</p><p><strong>The GetGround team</strong></p>"}
  ]
}
Block rules: "text" = native editable rich text (plain <p>, <h2>, <ul><li>, <strong>, <a>; styling is automatic).
"button" = native editable button. "html" = ONLY components from COMPONENTS (hero, cards, steps, event
details, coupon, video, divider, CTA panel, personal sign-off, Need a hand). Put data-utm="name" on <a> tags.
Spacing is automatic (48px between blocks, 96px after the last); override with "spaceAfter".
Single column, one hero, one main CTA. Don't add <style>, UTMs, disclaimers or footer — the connector does.
Disclaimer keys: ${'general, mortgages, financial_account, open_banking, investment_pots, insurance, ai_analyser, forms'}.
BuyAssociation is not supported here yet.
`;

const SPEC_SCHEMA = {
  type: 'object',
  description: 'Email spec. Call get_email_guidelines first for the full format and rules.',
  properties: {
    type: { type: 'string', enum: ['marketing', 'personal', 'notification'] },
    brand: { type: 'string', enum: ['getground'] },
    name: { type: 'string' }, subject: { type: 'string' }, previewText: { type: 'string' },
    campaign: { type: 'string', description: 'team_initiative_MMYY' },
    from: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } }, required: ['name', 'email'] },
    replyTo: { type: 'string' },
    subscription: { type: 'string', enum: ['marketing', 'transactional'] },
    goal: { type: 'string' },
    disclaimers: { type: 'array', items: { type: 'string' } },
    removeDisclaimers: { type: 'object', additionalProperties: { type: 'string' } },
    recurringMortgageEmail: { type: 'boolean' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['html', 'text', 'button', 'spacer'] },
          id: { type: 'string' }, html: { type: 'string' }, label: { type: 'string' }, url: { type: 'string' },
          utm_content: { type: 'string' }, align: { type: 'string', enum: ['left', 'center'] },
          variant: { type: 'string', enum: ['cyan', 'dark'] }, spaceAfter: { type: 'number' }, height: { type: 'number' },
        },
        required: ['kind'],
      },
    },
  },
  required: ['type', 'name', 'subject', 'previewText', 'campaign', 'from', 'blocks'],
};

const TOOLS = [
  {
    name: 'get_email_guidelines',
    description: 'ALWAYS call first when someone asks for a GetGround email. Returns the design + copy guidelines, approved HTML components, the spec format and the step-by-step process.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_email_insights',
    description: 'Learn from past GetGround email performance (open/click rates from HubSpot): top subject lines, top layouts by click rate, and what correlates with performance. Call it before writing the subject line and choosing the layout. Optional topic keywords (e.g. "webinar", "complete", "black friday") and type (marketing | notification).',
    inputSchema: { type: 'object', properties: { topic: { type: 'string' }, type: { type: 'string', enum: ['marketing', 'notification'] } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'upload_email_image',
    description: 'Upload a PNG/JPG/GIF (base64, max 3 MB) to GetGround HubSpot Files (/email-images/claude) and return its public URL for use in an email image block.',
    inputSchema: { type: 'object', properties: { filename: { type: 'string' }, image_base64: { type: 'string' } }, required: ['filename', 'image_base64'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'preview_email',
    description: 'Check a spec without creating anything: shows sender, subscription, which footer disclaimers will be added and why, every link with its UTM, guideline warnings and compliance flags.',
    inputSchema: { type: 'object', properties: { spec: SPEC_SCHEMA }, required: ['spec'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_email_draft',
    description: 'Create the email as a DRAFT in GetGround HubSpot (never published or sent) and return the editor link. UTMs, dark mode and footer disclaimers are applied automatically.',
    inputSchema: {
      type: 'object',
      properties: { spec: SPEC_SCHEMA, requester_email: { type: 'string', description: "The person's work email, for the usage log" } },
      required: ['spec'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: 'update_email_draft',
    description: 'Replace the content of an existing UNPUBLISHED HubSpot email draft (e.g. after feedback). Refuses published emails. Returns the editor link.',
    inputSchema: {
      type: 'object',
      properties: { email_id: { type: 'string' }, spec: SPEC_SCHEMA, requester_email: { type: 'string' } },
      required: ['email_id', 'spec'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
];

const API = 'https://api.hubapi.com';
async function hs(env, method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: 'Bearer ' + env.HUBSPOT_EMAIL_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HubSpot ${method} ${url.split('?')[0]} -> ${r.status}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : {};
}
const editLink = (id) => `https://app-eu1.hubspot.com/email/${PORTAL}/edit/${id}/content`;
async function sections(env, id) {
  const d = await hs(env, 'GET', `/marketing/v3/emails/${id}/draft`);
  return { n: d?.content?.flexAreas?.main?.sections?.length || 0, d };
}
function log(spec, requester, note) {
  const K = 'sb_publishable_DLQRih3BYJ7U9F3jk7TyaA_u731Rwvt';
  return fetch('https://nckkfaldcplgfmldsrou.supabase.co/rest/v1/email_builder_feedback', {
    method: 'POST',
    headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ project: 'email builder (claude chat connector)', brand: spec.brand || 'getground', audience: spec.type,
      goal: spec.goal || '', campaign: fmt(spec.campaign || ''), sentiment: 'ok', feature_request: '',
      note: `${spec.name} | ${note}`, requester: requester || null }),
  }).catch(() => {});
}

async function callTool(env, ctx, name, args) {
  if (name === 'get_email_guidelines') {
    return `Connector version ${VERSION}\n${HOW_TO}\n\n# GUIDELINES\n${GUIDELINES}\n\n# COMPONENTS (copy into "html" blocks)\n${COMPONENTS}`;
  }
  if (name === 'get_email_insights') {
    if (!env.HUBSPOT_EMAIL_TOKEN) throw new Error('Connector is missing its HubSpot token. Tell Beth Prendergast.');
    const type = args?.type === 'notification' ? 'notification' : 'marketing'; const topic = String(args?.topic || '').slice(0, 80);
    const cache = caches.default; const key = new Request('https://cache.gg-email/insights-v1');
    let emails; const hit = await cache.match(key);
    if (hit) emails = await hit.json();
    else {
      const raw = await fetchEmailsWithStats(env.HUBSPOT_EMAIL_TOKEN);
      emails = raw.map((e) => ({ id: e.id, name: e.name, subject: e.subject, publishDate: e.publishDate, type: e.type, stats: e.stats,
        subscriptionDetails: e.subscriptionDetails, content: { widgets: Object.fromEntries(Object.entries(e.content?.widgets || {}).map(([k, x]) => [k, { body: { path: x.body?.path, html: x.body?.html, img: x.body?.img ? { src: 1 } : undefined } }])) } }));
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(emails), { headers: { 'Cache-Control': 'max-age=43200' } })));
    }
    return insightsText(analyse(emails, { topic, type }), { topic, type });
  }
  if (name === 'upload_email_image') {
    if (!env.HUBSPOT_EMAIL_TOKEN) throw new Error('Connector is missing its HubSpot token. Tell Beth Prendergast.');
    const b64 = String(args?.image_base64 || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
    let bin; try { bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { throw new Error('image_base64 is not valid base64'); }
    if (bin.length > 3 * 1024 * 1024) throw new Error('Image is over 3 MB — make it smaller.');
    const sig = Array.from(bin.slice(0, 4)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const type = sig.startsWith('89504e47') ? 'image/png' : sig.startsWith('ffd8ff') ? 'image/jpeg' : sig.startsWith('47494638') ? 'image/gif' : null;
    if (!type) throw new Error('Only PNG, JPG or GIF images can be uploaded.');
    const base = (String(args?.filename || 'email-graphic').toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email-graphic').slice(0, 60);
    const fileName = `${base}-${Date.now().toString(36)}`;
    const fd = new FormData();
    fd.append('file', new Blob([bin], { type }), `${fileName}.${type.split('/')[1].replace('jpeg', 'jpg')}`);
    fd.append('fileName', fileName);
    fd.append('folderPath', '/email-images/claude');
    fd.append('options', JSON.stringify({ access: 'PUBLIC_NOT_INDEXABLE', overwrite: false, duplicateValidationStrategy: 'NONE', duplicateValidationScope: 'ENTIRE_PORTAL' }));
    const r = await fetch(API + '/files/v3/files', { method: 'POST', headers: { Authorization: 'Bearer ' + env.HUBSPOT_EMAIL_TOKEN }, body: fd });
    const t = await r.text();
    if (!r.ok) throw new Error(`HubSpot upload -> ${r.status}: ${t.slice(0, 300)}`);
    const d = JSON.parse(t);
    return `UPLOADED to HubSpot Files: ${d.url}\nUse it in an "html" block with the IMAGE component (width 560, rounded corners already baked in).`;
  }
  const spec = args?.spec;
  if (!spec || typeof spec !== 'object') throw new Error('spec is required — call get_email_guidelines for the format');
  const r = build(spec, D);
  const rep = reportText(r);
  if (name === 'preview_email') return `PREVIEW ONLY — nothing created.\n${rep}`;
  if (!env.HUBSPOT_EMAIL_TOKEN) throw new Error('Connector is missing its HubSpot token. Tell Beth Prendergast.');

  if (name === 'create_email_draft') {
    const created = await hs(env, 'POST', '/marketing/v3/emails', r.payload);
    let { n } = await sections(env, created.id);
    if (!n) { await hs(env, 'PATCH', `/marketing/v3/emails/${created.id}/draft`, { content: r.payload.content }); ({ n } = await sections(env, created.id)); }
    ctx.waitUntil(log(spec, args.requester_email, `created ${created.id}`));
    if (!n) return `Draft ${created.id} was created but its layout came back empty. Open it and check: ${editLink(created.id)}\n${rep}`;
    return `DRAFT CREATED (not published, not sent)\nEditor link: ${editLink(created.id)}\n${rep}\n\nRemind the person: draft for human review; send a test from HubSpot first.`;
  }
  if (name === 'update_email_draft') {
    const id = String(args.email_id || '').replace(/\D/g, '');
    if (!id) throw new Error('email_id is required');
    const root = await hs(env, 'GET', `/marketing/v3/emails/${id}`);
    if (root.isPublished || (root.state && !/DRAFT/.test(root.state))) throw new Error(`Email ${id} is published/live (${root.state}). This connector only edits unpublished drafts — ask a human to edit it in HubSpot.`);
    const { content, ...meta } = r.payload;
    await hs(env, 'PATCH', `/marketing/v3/emails/${id}/draft`, { ...meta, content });
    const { n } = await sections(env, id);
    ctx.waitUntil(log(spec, args.requester_email, `updated ${id}`));
    if (!n) return `Updated ${id} but the layout came back empty — check it in HubSpot (version history can restore): ${editLink(id)}`;
    return `DRAFT UPDATED (not published, not sent)\nEditor link: ${editLink(id)}\n${rep}`;
  }
  throw new Error(`Unknown tool ${name}`);
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const rpcResult = (id, result) => json({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(env, ctx, msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return new Response(null, { status: 202 }); // notification
  try {
    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'getground-email', title: 'GetGround Email', version: VERSION },
          instructions: 'Use for any request to create, draft, write or design a GetGround email. Call get_email_guidelines first, then preview_email, then create_email_draft. Drafts only: nothing can be published or sent. Always hand back the HubSpot editor link and say it needs human review.',
        });
      case 'ping': return rpcResult(id, {});
      case 'tools/list': return rpcResult(id, { tools: TOOLS });
      case 'tools/call': {
        try {
          const text = await callTool(env, ctx, params?.name, params?.arguments || {});
          return rpcResult(id, { content: [{ type: 'text', text }] });
        } catch (e) {
          return rpcResult(id, { content: [{ type: 'text', text: 'ERROR: ' + e.message }], isError: true });
        }
      }
      case 'resources/list': return rpcResult(id, { resources: [] });
      case 'prompts/list': return rpcResult(id, { prompts: [] });
      default: return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return rpcError(id, -32603, e.message);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/assets/') && env.ASSETS) {
      const r = await env.ASSETS.fetch(request);
      const h = new Headers(r.headers); h.set('Cache-Control', 'public, max-age=604800'); h.set('Access-Control-Allow-Origin', '*');
      return new Response(r.body, { status: r.status, headers: h });
    }
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(`GetGround Email connector ${VERSION}. Add to Claude as a custom connector using the URL you were given.`, { headers: { 'Content-Type': 'text/plain' } });
    }
    const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{8,})\/?$/);
    if (!m) return new Response('Not found', { status: 404 });
    const codes = String(env.ACCESS_CODES || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!codes.includes(m[1])) return new Response('Forbidden', { status: 403 });
    if (request.method === 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let msg;
    try { msg = await request.json(); } catch { return rpcError(null, -32700, 'Parse error'); }
    if (Array.isArray(msg)) {
      const out = [];
      for (const one of msg) { const r = await handleRpc(env, ctx, one); if (r.status === 200) out.push(await r.json()); }
      return out.length ? json(out) : new Response(null, { status: 202 });
    }
    return handleRpc(env, ctx, msg);
  },
};
