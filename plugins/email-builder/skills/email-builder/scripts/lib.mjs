// Shared, side-effect-free builder logic. Used by the CLI (gg_email.mjs) and the GetGround Email connector.
export const PORTAL = '25516403';
const SUBS = {
  marketing: { subscriptionId: '148117546', officeLocationId: '46069906905' },     // Product Marketing
  transactional: { subscriptionId: '-1', officeLocationId: '46069906905' },        // Transactional
};
const BANNED_FROM = /^(hello|info|team)@/i;
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
const HFONT = "'Rethink Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
const NO_UTM = /(^mailto:|^tel:|^#|\{\{|gov\.uk|help\.getground\.co\.uk\/(privacy|ai-property-analyser-terms)|unsubscribe)/i;

const PALETTE = {
  marketing:    { ink: '#1A2530', head: '#06363A', muted: '#4A5F5E', btnBg: '#A3ECEE', btnFg: '#06363A', lh: '1.65' },
  personal:     { ink: '#1A2530', head: '#06363A', muted: '#4A5F5E', btnBg: '#A3ECEE', btnFg: '#06363A', lh: '1.65' },
  notification: { ink: '#1F1F33', head: '#1F1F33', muted: '#4B4B5C', btnBg: '#6EDDE1', btnFg: '#094C51', lh: '1.7' },
};

// ---------- helpers ----------
const die = (m) => { throw new Error(m); };
const fmt = (v) => String(v || '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- styles ----------
function styleBlock() {
  const dark = {
    '.dm-bg': 'background:#0B2124!important;background-color:#0B2124!important',
    '.dm-panel,.dm-card': 'background:#12383B!important;background-color:#12383B!important;border-color:#1E4E52!important',
    '.dm-line': 'background:#1E4E52!important;border-color:#1E4E52!important',
    '.dm-text': 'color:#E4ECEC!important',
    '.dm-head': 'color:#FFFFFF!important',
    '.dm-muted': 'color:#A3ECEE!important',
    '.dm-pill': 'background:#0B2124!important;color:#A3ECEE!important',
    '.dm-keep-badge': 'background:#A3ECEE!important;color:#06363A!important',
    '.dm-keep-darkbtn,.dm-keep-cyanbtn': 'background:#A3ECEE!important;background-color:#A3ECEE!important;color:#06363A!important',
    '.dm-keep-white': 'color:#FFFFFF!important',
    '.dm-keep-soft': 'color:#CFE6E6!important',
    '.hse-body-background,.hse-body-wrapper-table,.hse-column-container,.hse-section,.hse-column': 'background:#0B2124!important;background-color:#0B2124!important',
    '.gg-text p,.gg-text li,.gg-text td': 'color:#E4ECEC!important',
    '.gg-text h2,.gg-text h3,.gg-text strong': 'color:#FFFFFF!important',
    '.gg-text a': 'color:#A3ECEE!important',
    '.gg-foot h2,.gg-foot p': 'color:#B5C7C6!important',
  };
  const rules = (prefix) => Object.entries(dark).map(([sel, css]) =>
    sel.split(',').map((s) => prefix + s.trim()).join(',') + '{' + css + '}').join('');
  return '<style>:root{color-scheme:light dark;supported-color-schemes:light dark}' +
    '@media (prefers-color-scheme: dark){' + rules('') + '}' +
    rules('[data-ogsc] ') + rules('[data-ogsb] ') +
    '@media only screen and (min-width:600px){.gg-hero{padding:56px 40px 52px 40px!important}.gg-hero h1{font-size:36px!important}.gg-pxc{padding-left:24px!important;padding-right:24px!important}.gg-in{padding:36px 32px!important}}' +
    '@media only screen and (max-width:599px){.hse-body-wrapper-td,.hse-section,.hse-column-container,.hse-column,.hse-body-background,.hse-body-wrapper-table{padding-left:0!important;padding-right:0!important;max-width:100%!important;width:100%!important}}' +
    '</style>';
}

// Inline-style bare tags in native rich-text blocks so editors only write plain HTML.
function styleText(html, kind) {
  const p = PALETTE[kind];
  const S = {
    p: `font-family:${FONT};font-size:18px;line-height:${p.lh};color:${p.ink};margin:0 0 20px 0;`,
    h2: `font-family:${HFONT};font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:${p.head};margin:0 0 16px 0;`,
    h3: `font-family:${HFONT};font-size:21px;line-height:1.3;font-weight:600;color:${p.head};margin:0 0 12px 0;`,
    ul: `margin:0 0 20px 0;padding-left:22px;`,
    ol: `margin:0 0 20px 0;padding-left:22px;`,
    li: `font-family:${FONT};font-size:18px;line-height:${p.lh};color:${p.ink};margin:0 0 10px 0;`,
    a: `color:#0E666B;text-decoration:underline;font-weight:600;`,
  };
  html = html.replace(/<(p|h2|h3|ul|ol|li|a)(\s[^>]*)?>/gi, (m, tag, attrs = '') => {
    if (/\sstyle=/i.test(attrs)) return m;
    return `<${tag}${attrs} style="${S[tag.toLowerCase()]}">`;
  });
  // last paragraph: no bottom margin (spacing comes from the section)
  const last = html.lastIndexOf('margin:0 0 20px 0;');
  if (last >= 0 && !/<(p|li|ul|ol|h2|h3)\b/i.test(html.slice(html.indexOf('>', last)))) {
    html = html.slice(0, last) + 'margin:0;' + html.slice(last + 'margin:0 0 20px 0;'.length);
  }
  return `<div class="gg-text">${html}</div>`;
}

// ---------- UTMs ----------
function makeUtm(spec) {
  const used = new Set();
  const medium = spec.brand === 'buyassociation' ? 'ba_hubspot' : 'gg_hubspot';
  const campaign = fmt(spec.campaign);
  const links = [];
  const tag = (url, content) => {
    if (!url || NO_UTM.test(url)) { links.push({ url, utm: 'skipped' }); return url; }
    let c = fmt(content) || 'link';
    let n = 2; const base = c;
    while (used.has(c)) c = `${base}_${n++}`;
    used.add(c);
    const [noHash, hash] = url.split('#');
    const u = new URL(noHash);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k);
    u.searchParams.set('utm_source', 'email');
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    u.searchParams.set('utm_content', c);
    const out = u.toString() + (hash ? '#' + hash : '');
    links.push({ url: out, utm: c });
    return out;
  };
  const html = (h, blockName) => {
    let i = 0;
    const seen = new Map(); // original href -> tagged href (so Outlook VML buttons match their <a> twin)
    const out = h.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>/gi, (m, pre, href, post) => {
      i++;
      const all = pre + post;
      const dm = all.match(/\sdata-utm="([^"]+)"/i);
      const content = dm ? dm[1] : `${blockName}_link${i}`;
      const clean = (s) => s.replace(/\sdata-utm="[^"]*"/i, '');
      const orig = href.replace(/&amp;/g, '&');
      const tagged = tag(orig, content);
      if (!seen.has(orig)) seen.set(orig, tagged);
      return `<a${clean(pre)}href="${tagged.replace(/&/g, '&amp;')}"${clean(post)}>`;
    });
    // Outlook VML buttons (<v:roundrect href="…">): reuse the matching <a>'s UTMs, or tag on their own.
    return out.replace(/<v:roundrect\b([^>]*?)href="([^"]+)"/gi, (m, pre, href) => {
      const orig = href.replace(/&amp;/g, '&');
      const t = seen.get(orig) || tag(orig, `${blockName}_outlook_button`);
      return `<v:roundrect${pre}href="${t.replace(/&/g, '&amp;')}"`;
    });
  };
  return { tag, html, links };
}

// ---------- disclaimers ----------
function pickDisclaimers(spec, allText, D, warnings) {
  const chosen = new Map(); // key -> reason
  for (const key of D.order) {
    const it = D.items[key];
    if (it.always) { chosen.set(key, 'always'); continue; }
    let m = it.detect && allText.match(new RegExp(it.detect, 'i'));
    if (!m && it.detectCase) m = allText.match(new RegExp(it.detectCase));
    if (m) chosen.set(key, `copy mentions "${m[0]}"`);
  }
  for (const k of spec.disclaimers || []) {
    if (!D.items[k]) die(`Unknown disclaimer "${k}". Valid: ${D.order.join(', ')}`);
    if (!chosen.has(k)) chosen.set(k, 'requested in spec');
  }
  for (const [k, why] of Object.entries(spec.removeDisclaimers || {})) {
    if (k === 'general') die('The general disclaimer can never be removed.');
    if (chosen.delete(k)) warnings.push(`Removed auto-detected "${k}" disclaimer — reason given: ${why}`);
  }
  const keys = D.order.filter((k) => chosen.has(k));
  const paras = keys.flatMap((k) => D.items[k].paragraphs);
  const html = '<div class="gg-foot">' + paras.map((t) =>
    `<h2 style="font-size:12px;line-height:175%;font-weight:normal;margin:0 0 10px 0;color:#46625F;font-family:${FONT};">${t}</h2>`).join('') + '</div>';
  const compliance = keys.filter((k) => D.items[k].compliance)
    .filter((k) => !(k === 'mortgages' && spec.recurringMortgageEmail))
    .map((k) => `${D.items[k].label}: ${D.items[k].compliance}`);
  return { keys, reasons: Object.fromEntries(chosen), html, compliance };
}

// ---------- blocks -> HubSpot widgets ----------
const FOOTER_BAND = '#D0E0E3'; // light blue footer band used on GetGround emails
function sectionFor(id, widgetName, padBottom = 0, padTop = 0, bg = '') {
  const bp = { backgroundColor: bg, backgroundImage: null, backgroundImageType: null, backgroundType: bg ? 'FULL' : 'CONTENT',
    paddingBottom: `${padBottom}px`, paddingTop: `${padTop}px` };
  return {
    columns: [{ id: `column_${id}_0`, widgets: [widgetName], width: 12 }],
    id: `section_${id}`, path: null,
    style: { ...bp, breakpointStyles: { default: { ...bp }, mobile: { ...bp } }, stack: 'LEFT_TO_RIGHT' },
  };
}
const wrap = (pad) => ({ 'padding-bottom': '0px', 'padding-left': `${pad}px`, 'padding-right': `${pad}px`, 'padding-top': '0px' });
const rawHtml = (name, html, pad = 0) => ({ type: 'module', module_id: 3379495, name, id: name, order: 0,
  body: { html, module_id: 3379495, path: '@hubspot/raw_html_email', schema_version: 2, hs_enable_module_padding: true, hs_wrapper_css: wrap(pad) },
  child_css: {}, css: {}, styles: {} });
const richText = (name, html, pad = 20) => ({ type: 'module', module_id: 1155639, name, id: name, order: 0,
  body: { html, module_id: 1155639, path: '@hubspot/rich_text', schema_version: 2, hs_enable_module_padding: true, hs_wrapper_css: wrap(pad) },
  child_css: {}, css: {}, styles: {} });
function button(name, b, url, kind) {
  const p = PALETTE[kind];
  const v = b.variant || 'cyan';
  const bg = v === 'dark' ? '#06363A' : p.btnBg;
  const fg = v === 'dark' ? '#FFFFFF' : p.btnFg;
  const font = { color: fg, font: 'Helvetica,Arial,sans-serif', font_set: 'DEFAULT', size: { units: 'px', value: 17 },
    styles: { bold: true, 'font-weight': 'bold', italic: false, underline: false } };
  return { type: 'module', module_id: 1976948, name, id: name, order: 0,
    body: { module_id: 1976948, path: '@hubspot/button_email', schema_version: 2, text: /→\s*$/.test(b.label) ? b.label : `${b.label}  →`, link_to: 'url',
      destination: url, alignment: b.align || 'left', hs_enable_module_padding: true, hs_wrapper_css: wrap(20),
      style: { alignment: b.align || 'left', background_color: { color: bg, opacity: 100 }, border_enabled: false,
        corner_radius: 12, font_style: font, inner_horizontal_padding: 28, inner_vertical_padding: 15, make_full_width: false } },
    child_css: {}, css: {}, styles: {} };
}
// Standard GetGround email header (same image module as the IC/owner-sent emails, e.g. 478067884226).
const HEADER_IMG = 'https://25516403.fs1.hubspotusercontent-eu1.net/hubfs/25516403/GENERIC_EMAIL_HEADER-1.png';
const headerImage = (name) => ({ type: 'module', module_id: 1367093, name, id: name, order: 0,
  body: { module_id: 1367093, hs_enable_module_padding: true,
    hs_wrapper_css: { 'padding-bottom': '0px', 'padding-left': '0px', 'padding-right': '0px', 'padding-top': '0px' },
    img: { alt: 'GetGround', height: 150, width: 600, loading: 'disabled', size_type: null, src: HEADER_IMG } },
  child_css: {}, css: {}, styles: {} });
const footer = (name) => ({ type: 'module', module_id: 2869621, name, id: name, order: 0,
  body: { align: 'center', css_class: 'dnd-module', module_id: 2869621, path: '@hubspot/email_footer', schema_version: 2,
    unsubscribe_link_type: 'both', hs_enable_module_padding: false,
    font: { color: '#46625F', font: 'Arial, sans-serif', size: { units: 'px', value: 12 } },
    link_font: { color: '#0E666B', font: 'Helvetica,Arial,sans-serif', size: { units: 'px', value: 12 }, styles: { bold: false, italic: false, underline: true } } },
  child_css: {}, css: {}, styles: {} });

function build(spec, D) {
  // ---- validate ----
  const kind = spec.type;
  if (!PALETTE[kind]) die('spec.type must be marketing | personal | notification');
  if (spec.brand && spec.brand !== 'getground') die('Only brand "getground" is supported for direct HubSpot builds so far.');
  for (const k of ['name', 'subject', 'previewText', 'campaign', 'blocks']) if (!spec[k]) die(`spec.${k} is required`);
  const from = spec.from || {};
  if (!from.name || !from.email) die('spec.from {name, email} is required');
  if (BANNED_FROM.test(from.email)) die(`Never send from ${from.email} — use gethelp@ or a named person`);
  

  const warnings = [];
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(fmt(spec.campaign))) warnings.push('campaign should look like team_initiative_MMYY');
  const utm = makeUtm(spec);
  const widgets = {}; const sections = []; let n = 0; const stamp = Date.now();
  const nm = () => `module_${stamp}${String(n++).padStart(2, '0')}`;
  let allText = spec.subject + ' ' + spec.previewText;

  // style-only first module
  const sName = nm(); widgets[sName] = rawHtml(sName, styleBlock()); sections.push(sectionFor(sName, sName));

  // Personal (IC / contact-owner) and notification emails always open with the standard GetGround header. Opt out only with header:false.
  if ((kind === 'personal' || kind === 'notification') && spec.header !== false) {
    const hName = nm(); widgets[hName] = headerImage(hName); sections.push(sectionFor(hName, hName, 40));
  }
  if (kind === 'personal' && spec.blocks.some((b) => /HERO: MARKETING|linear-gradient\(160deg,#06363A/.test(b.html || ''))) warnings.push('Personal emails use the standard GetGround header, not a marketing hero');
  if (kind === 'notification' && spec.blocks.some((b) => /gg-hero|#EBFEFE/.test(b.html || ''))) warnings.push('Notification emails use the standard GetGround header and plain letter-style copy, not a hero panel');

  spec.blocks.forEach((b, i) => {
    const name = nm(); const label = fmt(b.id || `${b.kind}${i + 1}`);
    const space = b.spaceAfter ?? (i === spec.blocks.length - 1 ? 96 : 48);
    if (b.kind === 'html') {
      const h = utm.html(b.html, label); allText += ' ' + h;
      if (/font-size:\s*1[0-5]px/.test(h.replace(/height:\d+px;line-height:\d+px;font-size:1px/g, ''))) warnings.push(`${label}: text under 16px found — check it isn't body copy`);
      widgets[name] = rawHtml(name, h, b.pad ?? 0);
    } else if (b.kind === 'text') {
      const h = utm.html(styleText(b.html, kind), label); allText += ' ' + h;
      widgets[name] = richText(name, h, b.pad ?? 20);
    } else if (b.kind === 'button') {
      if (!b.label || !b.url) die(`button block ${i} needs label + url`);
      const url = utm.tag(b.url, b.utm_content || label); allText += ' ' + b.label + ' ' + b.url;
      widgets[name] = button(name, b, url, kind);
    } else if (b.kind === 'spacer') {
      widgets[name] = rawHtml(name, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="dm-bg" style="height:${b.height || 48}px;line-height:${b.height || 48}px;font-size:1px;">&nbsp;</td></tr></table>`);
    } else die(`Unknown block kind "${b.kind}" (html | text | button | spacer)`);
    sections.push(sectionFor(name, name, space));
  });

  // copy checks from the guidelines
  const plain = allText.replace(/<[^>]+>/g, ' ');
  if (/happy landlording/i.test(plain)) warnings.push('Never sign off "Happy landlording"');
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(plain)) warnings.push('Emoji found — guidelines say no emojis');
  if (/—/.test(plain)) warnings.push('Em dash found — use commas or full stops');
  if (/join [A-Z][a-z]+ and [A-Z][a-z]+ for/.test(plain)) warnings.push('Filler intro ("Join X and Y for…") found');
  if (!/firstname/.test(allText) && kind !== 'notification') warnings.push('No first-name greeting token found');

  const disc = pickDisclaimers(spec, allText, D, warnings);
  const dName = nm(); widgets[dName] = richText(dName, disc.html, 20); sections.push(sectionFor(dName, dName, 8, 36, FOOTER_BAND));
  const fName = nm(); widgets[fName] = footer(fName); sections.push(sectionFor(fName, fName, 36, 8, FOOTER_BAND));
  widgets.preview_text = { type: 'text', name: 'preview_text', id: 'preview_text', order: 0, body: { value: spec.previewText }, child_css: {}, css: {}, styles: {} };

  const content = {
    templatePath: '@hubspot/email/dnd/Start_from_scratch.html',
    flexAreas: { main: { boxed: false, isSingleColumnFullWidth: false, sections } },
    widgets,
    styleSettings: { backgroundColor: '#FFFFFF', bodyColor: '#FFFFFF', bodyBorderColor: '#FFFFFF', bodyBorderWidth: 0,
      primaryFont: 'Arial, sans-serif', primaryFontColor: PALETTE[kind].ink, primaryFontSize: 18,
      linksFont: { bold: false, color: '#0E666B', italic: false, underline: true } },
  };
  const subscription = SUBS[spec.subscription || (kind === 'notification' ? 'transactional' : 'marketing')];
  if (!subscription) die('spec.subscription must be marketing | transactional');
  const payload = {
    name: spec.name, subject: spec.subject, content, language: 'en', businessUnitId: spec.businessUnitId || '0',
    from: { fromName: from.name, replyTo: from.email, ...(spec.replyTo && spec.replyTo !== from.email ? { customReplyTo: spec.replyTo } : {}) },
    subscriptionDetails: subscription,
  };
  return { payload, disc, links: utm.links, warnings, kind };
}

// local preview (approximate HubSpot render) for screenshots / QA
function previewHtml({ payload }) {
  const w = payload.content.widgets;
  const body = payload.content.flexAreas.main.sections.map((s) => {
    const mod = w[s.columns[0].widgets[0]]; const pb = s.style.paddingBottom; const pt = s.style.paddingTop; const b = mod.body;
    let inner = '';
    if (b.path === '@hubspot/button_email') {
      const st = b.style;
      inner = `<div style="text-align:${st.alignment};padding:0 20px"><a href="${esc(b.destination)}" class="dm-keep-cyanbtn" style="display:inline-block;background:${st.background_color.color};color:${st.font_style.color};font:700 17px Helvetica,Arial,sans-serif;padding:15px 28px;border-radius:12px;text-decoration:none">${esc(b.text)}</a></div>`;
    } else if (b.path === '@hubspot/email_footer') {
      inner = '<p style="text-align:center;font:12px Arial;color:#46625F">GetGround · 1 Lyric Square, London · <u>Unsubscribe</u> · <u>Manage preferences</u></p>';
    } else if (b.img) {
      inner = `<img src="${esc(b.img.src)}" alt="${esc(b.img.alt || '')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;
    } else inner = `<div style="padding:0 ${b.hs_wrapper_css['padding-left']}">${b.html}</div>`;
    const bg = s.style.backgroundColor ? `background:${s.style.backgroundColor};` : '';
    return `<tr><td class="hse-section" style="${bg}padding:${pt} 0 ${pb} 0">${inner}</td></tr>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(payload.subject)}</title></head>
<body class="hse-body-background" style="margin:0;background:#FFFFFF"><div style="font:13px Arial;color:#777;padding:8px 16px">Subject: <b>${esc(payload.subject)}</b> · Preview: ${esc(payload.content.widgets.preview_text.body.value)}</div>
<table class="hse-body-wrapper-table" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto">${body}</table></body></html>`;
}

function reportText(r) {
  const out = []; const console = { log: (x) => out.push(x) };
  console.log(`\nType: ${r.kind}   From: ${r.payload.from.fromName} <${r.payload.from.replyTo}>   Subscription: ${r.payload.subscriptionDetails.subscriptionId === '-1' ? 'Transactional' : 'Product Marketing'}`);
  console.log('Disclaimers added:'); for (const k of r.disc.keys) console.log(`  - ${k} (${r.disc.reasons[k]})`);
  console.log('Links:'); for (const l of r.links) console.log(`  - [${l.utm}] ${l.url}`);
  if (r.warnings.length) { console.log('Warnings:'); r.warnings.forEach((w) => console.log('  ! ' + w)); }
  if (r.disc.compliance.length) { console.log('COMPLIANCE REVIEW REQUIRED:'); r.disc.compliance.forEach((c) => console.log('  >> ' + c)); }
  return out.join('\n');
}


export { SUBS, fmt, esc, build, previewHtml, reportText, pickDisclaimers, makeUtm };
