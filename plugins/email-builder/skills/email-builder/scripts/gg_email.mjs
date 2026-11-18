#!/usr/bin/env node
// GetGround email builder — deterministic half of the email-builder skill.
// Builds a HubSpot drag-and-drop DRAFT from a JSON spec: brand styles, dark mode,
// UTMs on every link, footer disclaimers auto-detected from the copy.
// It NEVER publishes or sends. There is no publish command on purpose.
//
// Usage:
//   node gg_email.mjs check                       # token + access check
//   node gg_email.mjs preview spec.json [out.html] # local render + report, no network
//   node gg_email.mjs create  spec.json            # create HubSpot draft, print editor link
//   node gg_email.mjs update  <emailId> spec.json  # replace content of an existing draft
//
// Token: $HUBSPOT_EMAIL_TOKEN, else ~/.secrets/hubspot_email_token, else ~/.secrets/hubspot_token.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const API = 'https://api.hubapi.com';
import { PORTAL, fmt, build as buildWith, previewHtml, reportText } from './lib.mjs';
const die = (m) => { console.error('ERROR: ' + m); process.exit(1); };
const D = JSON.parse(fs.readFileSync(path.join(SKILL, 'disclaimers.json'), 'utf8'));
const build = (spec) => { try { return buildWith(spec, D); } catch (e) { die(e.message); } };
const report = (r) => console.log(reportText(r));

function token() {
  if (process.env.HUBSPOT_EMAIL_TOKEN) return process.env.HUBSPOT_EMAIL_TOKEN.trim();
  for (const f of ['hubspot_email_token', 'hubspot_token']) {
    const p = path.join(os.homedir(), '.secrets', f);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  die('No HubSpot token. Ask Beth/your admin for the "Claude email drafts" token and save it to ~/.secrets/hubspot_email_token');
}

async function hs(method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) die(`${method} ${url} -> ${r.status}: ${t.slice(0, 600)}`);
  return t ? JSON.parse(t) : {};
}

async function verify(id) {
  const d = await hs('GET', `/marketing/v3/emails/${id}/draft`);
  const n = d?.content?.flexAreas?.main?.sections?.length || 0;
  if (d.isPublished) console.warn('WARN: this email is published — changes stay in its draft until a human publishes.');
  return n;
}

function log(spec, extra) {
  let who = spec.requester || '';
  try { who = who || execSync('git config user.email', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  const K = 'sb_publishable_DLQRih3BYJ7U9F3jk7TyaA_u731Rwvt';
  return fetch('https://nckkfaldcplgfmldsrou.supabase.co/rest/v1/email_builder_feedback', {
    method: 'POST', headers: { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ project: 'email builder (hubspot direct)', brand: spec.brand || 'getground', audience: spec.type,
      goal: spec.goal || '', campaign: fmt(spec.campaign), sentiment: 'ok', feature_request: '', note: `${spec.name} | ${extra}`, requester: who || null }),
  }).catch(() => {});
}

// ---------- main ----------
const [cmd, a1, a2] = process.argv.slice(2);
const load = (p) => { if (!p || !fs.existsSync(p)) die(`spec file not found: ${p}`); return JSON.parse(fs.readFileSync(p, 'utf8')); };

if (cmd === 'check') {
  const r = await hs('GET', '/marketing/v3/emails?limit=1');
  console.log(`OK — HubSpot marketing email API reachable (${r.total ?? '?'} emails visible).`);
} else if (cmd === 'preview') {
  const spec = load(a1); const r = build(spec);
  const out = a2 || a1.replace(/\.json$/, '') + '.preview.html';
  fs.writeFileSync(out, previewHtml(r)); report(r); console.log(`\nPreview: ${out}`);
} else if (cmd === 'create') {
  const spec = load(a1); const r = build(spec); report(r);
  const created = await hs('POST', '/marketing/v3/emails', r.payload);
  const id = created.id;
  let n = await verify(id);
  if (!n) { // some portals ignore content on create — push it to the draft
    await hs('PATCH', `/marketing/v3/emails/${id}/draft`, { content: r.payload.content });
    n = await verify(id);
  }
  if (!n) die(`Draft ${id} created but layout is empty — check https://app-eu1.hubspot.com/email/${PORTAL}/edit/${id}/content`);
  await log(spec, `created ${id}`);
  console.log(`\nDRAFT CREATED (not published, not sent): https://app-eu1.hubspot.com/email/${PORTAL}/edit/${id}/content`);
} else if (cmd === 'update') {
  if (!/^\d+$/.test(a1 || '')) die('usage: update <emailId> spec.json');
  const spec = load(a2); const r = build(spec); report(r);
  const before = await hs('GET', `/marketing/v3/emails/${a1}/draft`);
  const bdir = path.join(os.homedir(), 'Downloads', 'email-builder-backups'); fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, `${a1}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(bfile, JSON.stringify(before, null, 1)); console.log(`Backup: ${bfile}`);
  const { content, ...meta } = r.payload;
  await hs('PATCH', `/marketing/v3/emails/${a1}/draft`, { ...meta, content });
  const n = await verify(a1);
  if (!n) die(`Layout empty after update — restore from ${bfile}`);
  await log(spec, `updated ${a1}`);
  console.log(`\nDRAFT UPDATED (not published, not sent): https://app-eu1.hubspot.com/email/${PORTAL}/edit/${a1}/content`);
} else {
  console.log('usage: node gg_email.mjs check | preview spec.json [out.html] | create spec.json | update <emailId> spec.json');
  process.exit(cmd ? 1 : 0);
}
