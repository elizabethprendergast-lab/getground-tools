// Builds a format-2 outcomes/deals snapshot for one campaign by running the worker locally
// (no Cloudflare subrequest cap) and stripping every contact name, email and call note, since
// this repo is public. The live worker puts names back from HubSpot when serving (hydrateSnapshot).
//
//   node beth-reports/scripts/build-snapshot.mjs <campaign-key> [report-key]
//
// Writes cf-deploy/<campaign-key>/{outcomes,deals}-snapshot.v2.json. Needs HUBSPOT_TOKEN in the
// env (or ~/.secrets/hubspot_token). Point the project's outcomesSnapshot / dealsSnapshot at them.
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "cf-deploy");
const [key, report = "mrr-nov-sprint"] = process.argv.slice(2);
if (!key) { console.error("usage: build-snapshot.mjs <campaign-key> [report-key]"); process.exit(1); }
const token = process.env.HUBSPOT_TOKEN || fs.readFileSync(path.join(os.homedir(), ".secrets/hubspot_token"), "utf8").trim();
const tmp = path.join(os.tmpdir(), `br-worker-${process.pid}.mjs`);
fs.copyFileSync(path.join(root, "_worker.js"), tmp);
const { default: worker } = await import(pathToFileURL(tmp).href);
const env = { HUBSPOT_TOKEN: token, SNAPSHOT_BUILD: "1",
  ASSETS: { fetch: async (req) => new Response(fs.readFileSync(path.join(root, new URL(req.url).pathname.slice(1)))) } };

const names = new Set();
const PH = "{{name}}";
const swap = (x, n) => {
  if (!n) return x;
  if (Array.isArray(x)) return x.map((v) => swap(v, n));
  if (x && typeof x === "object") { for (const k of Object.keys(x)) x[k] = swap(x[k], n); return x; }
  // Whitespace/case-insensitive: hand-typed deal names like "Advice | Clement  Che" (double space)
  // slipped past an exact match and leaked a name into the public repo (19 Nov).
  const re = new RegExp(n.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "gi");
  if (typeof x !== "string") return x;
  // Then each name part on its own (whole words, 3+ letters): HubSpot "Wai Ngai Clement" + "Che"
  // was typed into a deal name as "Clement Che".
  let y = x.replace(re, PH);
  for (const w of n.trim().split(/\s+/)) if (w.length >= 3) y = y.replace(new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu"), PH);
  return y.replace(/\{\{name\}\}(?:\s+\{\{name\}\})+/g, PH);
};
function strip(o) {
  if (Array.isArray(o)) { o.forEach(strip); return o; }
  if (!o || typeof o !== "object") return o;
  if (Array.isArray(o.contacts)) o.contacts = o.contacts.map((c) => {
    if (c && c.name) names.add(c.name.trim());
    const { name, note, email, ...rest } = c || {};
    return rest;
  });
  if (o.contactId) {
    const n = (o.contactName || o.name || "").trim();
    if (n) names.add(n);
    delete o.contactName;
    if (o.name && o.name.trim() === n) delete o.name;
    for (const k of Object.keys(o)) if (k !== "contacts") o[k] = swap(o[k], n);
  }
  for (const v of Object.values(o)) if (v && typeof v === "object") strip(v);
  return o;
}

fs.mkdirSync(path.join(root, key), { recursive: true });
const snapshotAt = new Date().toISOString().slice(0, 16) + ":00Z";
for (const kind of ["outcomes", "deals"]) {
  const res = await worker.fetch(new Request(`https://local/api/${kind}?report=${report}&campaign=${key}&live=1`), env, { waitUntil() {} });
  const body = await res.json();
  const p = body.projects && body.projects[0];
  if (!res.ok || !p) throw new Error(`${kind}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  const project = strip(p);
  delete project.snapshotAt; delete project.snapshotSource;
  const out = JSON.stringify({ snapshotAt, source: `Live /api/${kind} computed locally ${snapshotAt.slice(0, 10)} (no Cloudflare subrequest cap), same rules as the live report. Names are looked up from HubSpot when the page loads.`, project }, null, 1);
  // Leak check: no contact name (4+ chars) or email address may survive.
  const flat = out.replace(/\s+/g, " ").toLowerCase();
  const leaks = [...names].filter((n) => n.length >= 4 && flat.includes(n.replace(/\s+/g, " ").toLowerCase()));
  if (leaks.length || /[\w.+-]+@[\w-]+\.[\w.]+/.test(out)) throw new Error(`${kind}: personal data left in snapshot (${leaks.slice(0, 3).join(", ")}…)`);
  fs.writeFileSync(path.join(root, key, `${kind}-snapshot.v2.json`), out + "\n");
  console.log(`${kind}: written (${(out.length / 1024).toFixed(0)} KB)`);
}
fs.unlinkSync(tmp);
