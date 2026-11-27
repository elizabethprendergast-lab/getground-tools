#!/usr/bin/env python3
"""GetGround Twilio WhatsApp helper. Never prints API secrets.

Commands:
  check                         verify the key works on the marketing sub-account
  cost FILE.csv                 estimate cost for a send file (column: phone)
  not-on-whatsapp               numbers that previously failed with 63024 (one per line)
  template-create --name N --lang L --body-file F [--button-text T --url U]
  template-status HX...         approval status of a template
  send FILE.csv --content-sid HX... --confirm [--limit N]
                                send via the Messaging Service; {{1}} = first_name column
  results --since ISO           delivered/read/failed/cost since a time
"""
import argparse, base64, csv, collections, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

SERVICE_NAME = "GetGround Marketing WhatsApp"   # Messaging Service + sub-account name
AC = MG = None   # looked up at runtime (account from the key, service by name), never hard-coded
PRICE = {"+44": 0.0623, "+852": 0.0729}   # $ per delivered message, measured 16 Nov 2026
DEFAULT_PRICE = 0.077


def creds():
    path = os.path.expanduser(os.environ.get("TWILIO_WA_KEY_FILE", "~/.secrets/twilio_whatsapp.txt"))
    if not os.path.exists(path):
        sys.exit(f"Key file not found: {path}. See 'Get your own Twilio API key' on the Notion page.")
    text = open(path).read()
    m = re.search(r"SK[0-9a-fA-F]{32}", text)
    if not m:
        sys.exit("No API key SID (starts with SK) found in the key file.")
    secret = None
    for line in text.splitlines():
        tok = line.strip().split()[-1] if line.strip() else ""
        if tok and not tok.startswith(("SK", "AC")) and re.fullmatch(r"[A-Za-z0-9]{32}", tok):
            secret = tok
            break
    if not secret:
        sys.exit("No API secret found in the key file (line 2 should be the 32-character secret).")
    return m.group(0), secret


def call(method, url, data=None, json_body=None):
    sk, sec = creds()
    headers = {"Authorization": "Basic " + base64.b64encode(f"{sk}:{sec}".encode()).decode()}
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode(); headers["Content-Type"] = "application/json"
    elif data is not None:
        body = urllib.parse.urlencode(data).encode(); headers["Content-Type"] = "application/x-www-form-urlencoded"
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, body, headers, method=method)) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 * (attempt + 1)); continue
            return {"_error": e.code, "_body": e.read().decode()[:400]}


def resolve():
    """Find the sub-account SID (from the key file, else the API) and the Messaging Service by name."""
    global AC, MG
    if AC and MG:
        return
    path = os.path.expanduser(os.environ.get("TWILIO_WA_KEY_FILE", "~/.secrets/twilio_whatsapp.txt"))
    m = re.search(r"AC[0-9a-fA-F]{32}", open(path).read()) if os.path.exists(path) else None
    if m:
        AC = m.group(0)
    else:
        d = call("GET", "https://api.twilio.com/2010-04-01/Accounts.json?PageSize=5")
        accts = [a for a in d.get("accounts", []) if a.get("friendly_name") == SERVICE_NAME] or d.get("accounts", [])
        if not accts:
            sys.exit("Couldn't find the Twilio sub-account. Add its SID (starts with AC, on the Notion page) as line 3 of your key file.")
        AC = accts[0]["sid"]
    s = call("GET", "https://messaging.twilio.com/v1/Services?PageSize=50")
    svc = [x for x in s.get("services", []) if x.get("friendly_name") == SERVICE_NAME]
    if not svc:
        sys.exit(f"Messaging Service '{SERVICE_NAME}' not found with this key. Was the key created in the {SERVICE_NAME} sub-account?")
    MG = svc[0]["sid"]


def messages(since=None):
    q = {"PageSize": "1000"}
    if since:
        q["DateSent>"] = since[:10]
    url = f"https://api.twilio.com/2010-04-01/Accounts/{AC}/Messages.json?" + urllib.parse.urlencode(q)
    out = []
    while url:
        d = call("GET", url)
        if "_error" in d:
            sys.exit(f"Twilio error {d['_error']}: {d['_body']}")
        out += d["messages"]
        url = ("https://api.twilio.com" + d["next_page_uri"]) if d.get("next_page_uri") else None
    return out


def norm(p):
    p = re.sub(r"[^\d+]", "", str(p or ""))
    return p if re.fullmatch(r"\+\d{8,15}", p) else None


def rows(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def price_for(phone):
    for pre, v in PRICE.items():
        if phone.startswith(pre):
            return v
    return DEFAULT_PRICE


def cmd_check(_):
    resolve()
    d = call("GET", f"https://api.twilio.com/2010-04-01/Accounts/{AC}/Messages.json?PageSize=1")
    if "_error" in d:
        sys.exit(f"Key check failed ({d['_error']}). Make sure the key was created in the 'GetGround Marketing WhatsApp' sub-account.")
    print(f"OK: key works on the marketing sub-account; Messaging Service '{SERVICE_NAME}' found.")


def cmd_cost(a):
    phones = [norm(r.get("phone")) for r in rows(a.file)]
    bad = sum(1 for p in phones if not p)
    good = [p for p in phones if p]
    by = collections.Counter("+44" if p.startswith("+44") else "+852" if p.startswith("+852") else "other" for p in good)
    total = sum(price_for(p) for p in good)
    print(f"{len(good)} valid numbers ({bad} invalid). By country: {dict(by)}")
    print(f"Estimated cost if all delivered: ${total:,.2f} (~£{total * 0.79:,.0f}). Typically 10-15% don't deliver and aren't charged.")


def cmd_not_on_whatsapp(_):
    resolve()
    seen = set()
    for m in messages():
        if m["direction"] != "inbound" and str(m.get("error_code")) == "63024":
            p = m["to"].replace("whatsapp:", "")
            if p not in seen:
                seen.add(p); print(p)


def cmd_template_create(a):
    body = open(a.body_file, encoding="utf-8").read().strip()
    types = {"twilio/text": {"body": body}}
    if a.url:
        types = {"twilio/call-to-action": {"body": body, "actions": [{"type": "URL", "title": a.button_text or "Find out more", "url": a.url}]}}
    c = call("POST", "https://content.twilio.com/v1/Content", json_body={
        "friendly_name": a.name, "language": a.lang, "variables": {"1": "there"}, "types": types})
    if "_error" in c:
        sys.exit(f"Create failed {c['_error']}: {c['_body']}")
    r = call("POST", f"https://content.twilio.com/v1/Content/{c['sid']}/ApprovalRequests/whatsapp",
             json_body={"name": a.name, "category": "MARKETING"})
    print(f"Template {c['sid']} created; approval: {r.get('status', r)}")


def cmd_template_status(a):
    r = call("GET", f"https://content.twilio.com/v1/Content/{a.sid}/ApprovalRequests")
    w = r.get("whatsapp", r)
    print(json.dumps({k: w.get(k) for k in ("name", "category", "status", "rejection_reason")} if isinstance(w, dict) else w))


def cmd_send(a):
    resolve()
    if not a.confirm:
        sys.exit("Refusing to send without --confirm (only after the person has said yes to the final count).")
    rs = rows(a.file)
    if a.limit:
        rs = rs[: a.limit]
    seen, log = set(), []
    base = f"https://api.twilio.com/2010-04-01/Accounts/{AC}/Messages.json"
    for r in rs:
        p = norm(r.get("phone"))
        if not p or p in seen:
            continue
        seen.add(p)
        first = (r.get("first_name") or "").strip() or "there"
        d = call("POST", base, data={"MessagingServiceSid": MG, "To": f"whatsapp:{p}", "ContentSid": a.content_sid,
                                     "ContentVariables": json.dumps({"1": first})})
        log.append({"phone": p, "sid": d.get("sid", ""), "status": d.get("status", ""), "error": d.get("_body", "")[:120]})
        time.sleep(0.05)
    out = os.path.expanduser(f"~/Downloads/twilio_whatsapp_send_log_{time.strftime('%Y-%m-%d_%H%M')}.csv")
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["phone", "sid", "status", "error"]); w.writeheader(); w.writerows(log)
    errs = sum(1 for l in log if not l["sid"])
    print(f"Queued {len(log) - errs}, rejected {errs}. Log: {out}")


def cmd_results(a):
    resolve()
    since = a.since
    ms = [m for m in messages(since) if m["direction"] != "inbound" and (m["date_created"] and
          time.strftime("%Y-%m-%dT%H:%M:%S", time.strptime(m["date_created"], "%a, %d %b %Y %H:%M:%S +0000")) >= since[:19])]
    st = collections.Counter(m["status"] for m in ms)
    errs = collections.Counter(str(m["error_code"]) for m in ms if m["error_code"])
    cost = sum(abs(float(m["price"])) for m in ms if m["price"])
    replies = [m for m in messages(since) if m["direction"] == "inbound"]
    print(f"{len(ms)} sent since {since}: {dict(st)}")
    print(f"Errors: {dict(errs.most_common(5))}  (63024 = not on WhatsApp; 63049/63032 = Meta didn't deliver: marketing limits or the user blocked us)")
    print(f"Cost so far: ${cost:,.2f} (prices can take a few minutes to appear). Replies: {len(replies)}")


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("check")
    p = sp.add_parser("cost"); p.add_argument("file")
    sp.add_parser("not-on-whatsapp")
    p = sp.add_parser("template-create"); p.add_argument("--name", required=True); p.add_argument("--lang", default="en")
    p.add_argument("--body-file", required=True); p.add_argument("--button-text"); p.add_argument("--url")
    p = sp.add_parser("template-status"); p.add_argument("sid")
    p = sp.add_parser("send"); p.add_argument("file"); p.add_argument("--content-sid", required=True)
    p.add_argument("--confirm", action="store_true"); p.add_argument("--limit", type=int)
    p = sp.add_parser("results"); p.add_argument("--since", required=True)
    a = ap.parse_args()
    {"check": cmd_check, "cost": cmd_cost, "not-on-whatsapp": cmd_not_on_whatsapp, "template-create": cmd_template_create,
     "template-status": cmd_template_status, "send": cmd_send, "results": cmd_results}[a.cmd](a)


if __name__ == "__main__":
    main()
