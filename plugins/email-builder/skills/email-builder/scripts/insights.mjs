// Email performance insights: what subject lines and layouts have worked for GetGround.
// Shared by the CLI and the GetGround Email connector. Read-only (marketing email API, content scope).

const API = 'https://api.hubapi.com';
const PORTAL_ID = '25516403';

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x) => (x == null ? '–' : `${x.toFixed(1)}%`);
const strip = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&[a-z]+;/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();

export async function fetchEmailsWithStats(token, { days = 400 } = {}) {
  const since = Date.now() - days * 864e5;
  const out = []; let after; let pages = 0;
  do {
    const u = `${API}/marketing/v3/emails?limit=100&includeStats=true&archived=false&sort=-publishDate${after ? `&after=${after}` : ''}`;
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error(`HubSpot emails list -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json(); pages++;
    let older = false;
    for (const e of d.results || []) {
      const t = Date.parse(e.publishDate || e.updatedAt || 0);
      if (e.publishDate && t < since) { older = true; continue; }
      out.push(e);
    }
    after = d.paging?.next?.after;
    if (older && pages > 3) break; // sorted newest first; stop once we're past the window
  } while (after && pages < 30);
  return out;
}

function features(e) {
  const w = e.content?.widgets || {};
  let html = ''; let buttons = 0; let images = 0;
  for (const x of Object.values(w)) {
    const b = x.body || {};
    if (b.path === '@hubspot/button_email') buttons++;
    if (b.path === '@hubspot/image_email' || b.img?.src) images++;
    if (b.html && !/opted in via our website/i.test(b.html)) html += ' ' + b.html;
  }
  const htmlNoStyle = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  buttons += (htmlNoStyle.match(/<a\b[^>]*(btn|display:\s*inline-block)[^>]*>/gi) || []).length;
  images += (htmlNoStyle.match(/<img\b/gi) || []).length;
  const words = strip(htmlNoStyle).split(' ').filter(Boolean).length;
  const subject = e.subject || '';
  return {
    words, buttons: Math.round(buttons / (/v:roundrect/.test(htmlNoStyle) ? 1 : 1)), images,
    subjLen: subject.length,
    question: /\?/.test(subject),
    number: /\d/.test(subject),
    personal: /firstname|personalization_token|\{\{/.test(subject),
    youYour: /\byou(r)?\b/i.test(subject),
    darkHero: /linear-gradient\(160deg,#06363A/i.test(htmlNoStyle),
  };
}

export function analyse(emails, { topic = '', type = 'marketing', minDelivered = 100 } = {}) {
  const rows = [];
  for (const e of emails) {
    const c = e.stats?.counters || {}; const r = e.stats?.ratios || {};
    const delivered = c.delivered || 0;
    if (delivered < minDelivered) continue;
    const transactional = e.subscriptionDetails?.subscriptionId === '-1' || /transactional/i.test(e.subscriptionDetails?.subscriptionName || '');
    if (type === 'marketing' && transactional) continue;
    if (type === 'notification' && !transactional) continue;
    const hay = `${e.name} ${e.subject}`.toLowerCase();
    if (topic && !topic.toLowerCase().split(/[\s,]+/).filter(Boolean).some((k) => hay.includes(k))) continue;
    const open = r.openratio ?? (c.open / delivered * 100);
    const click = r.clickratio ?? (c.click / delivered * 100);
    const ctor = c.open ? (c.click / c.open * 100) : 0;
    rows.push({ id: e.id, kind: /AUTOMATED/.test(e.type || '') ? 'workflow' : 'one-off', name: e.name, subject: e.subject, date: (e.publishDate || '').slice(0, 10), delivered, open, click, ctor, f: features(e) });
  }
  return rows;
}

export function insightsText(rows, { topic = '', type = 'marketing' } = {}) {
  if (rows.length < 5) return `Not enough sent ${type} emails${topic ? ` about "${topic}"` : ''} with 100+ deliveries to learn from (found ${rows.length}). Try without a topic.`;
  const L = [];
  const mo = median(rows.map((x) => x.open)); const mc = median(rows.map((x) => x.click)); const mct = median(rows.map((x) => x.ctor));
  L.push(`EMAIL PERFORMANCE INSIGHTS — ${rows.length} ${type} emails${topic ? ` matching "${topic}"` : ''} (last ~13 months, 100+ delivered each)`);
  L.push(`Benchmarks (median): open ${pct(mo)} · click ${pct(mc)} · click-to-open ${pct(mct)}`);
  L.push('Note: open rates are inflated by Apple Mail privacy, so judge layouts on CLICK rate; use open rate only to compare subject lines.');

  L.push('\nTOP SUBJECT LINES (by open rate):');
  [...rows].sort((a, b) => b.open - a.open).slice(0, 8).forEach((x) => L.push(`  ${pct(x.open)} open · ${pct(x.click)} click · [${x.kind}] "${x.subject}"  (${x.date}, ${x.delivered} delivered)`));

  L.push('("workflow" = triggered emails to small, warm audiences; they naturally score higher than "one-off" sends to big lists. Compare like with like.)');
  L.push('\nTOP EMAILS BY CLICK RATE (study their layout):');
  [...rows].sort((a, b) => b.click - a.click).slice(0, 8).forEach((x) => L.push(`  ${pct(x.click)} click · ${pct(x.ctor)} CTOR · [${x.kind}] ${x.name} — ${x.f.words} words, ${x.f.buttons} buttons, ${x.f.images} images${x.f.darkHero ? ', dark hero' : ''}\n      https://app-eu1.hubspot.com/email/${PORTAL_ID}/edit/${x.id}/content`));

  L.push('\nWHAT CORRELATES WITH PERFORMANCE (median, with vs without; n in brackets):');
  const cmp = (label, test, metric) => {
    const a = rows.filter(test); const b = rows.filter((x) => !test(x));
    if (a.length < 3 || b.length < 3) return;
    const ma = median(a.map(metric)); const mb = median(b.map(metric));
    L.push(`  ${label}: ${pct(ma)} (${a.length}) vs ${pct(mb)} (${b.length})`);
  };
  const O = (x) => x.open; const C = (x) => x.click;
  cmp('Subject is a question → open', (x) => x.f.question, O);
  cmp('Subject has a number → open', (x) => x.f.number, O);
  cmp('Subject says "you/your" → open', (x) => x.f.youYour, O);
  cmp('First name in subject → open', (x) => x.f.personal, O);
  cmp('Subject ≤ 45 characters → open', (x) => x.f.subjLen <= 45, O);
  cmp('One-off send (vs workflow) → click', (x) => x.kind === 'one-off', C);
  cmp('Under 150 words → click', (x) => x.f.words < 150, C);
  cmp('Over 300 words → click', (x) => x.f.words > 300, C);
  cmp('One button only → click', (x) => x.f.buttons <= 1, C);
  cmp('Has images → click', (x) => x.f.images > 0, C);
  cmp('Dark gradient hero (house style) → click', (x) => x.f.darkHero, C);
  L.push('\nUse this to suggest 2–3 subject lines and a layout in the style of the top performers. Treat small samples (n<10) as hints, not rules, and say so.');
  return L.join('\n');
}
