#!/usr/bin/env python3
"""GetGround Email client for Claude chat (no connector needed).
Calls the GetGround Email server, which builds HubSpot DRAFTS only (never publishes or sends).

  python3 gg_email.py guidelines                      # rules, components, spec format (read first)
  python3 gg_email.py insights [topic] [marketing|notification]   # what worked before (subject lines, layouts)
  python3 gg_email.py upload image.png                # upload a graphic to HubSpot Files -> URL
  python3 gg_email.py preview spec.json               # check: disclaimers, UTMs, warnings, compliance
  python3 gg_email.py create  spec.json [work_email]  # create draft -> editor link
  python3 gg_email.py update  <email_id> spec.json [work_email]
"""
import base64, json, os, sys, urllib.request

URL = "https://gg-email.pages.dev/mcp/__ACCESS_CODE__"  # pilot access code: don't share outside the pilot

def call(name, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(URL, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "gg-email-skill/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.load(r)
    if "error" in res:
        sys.exit("ERROR: " + res["error"]["message"])
    out = res["result"]
    print(out["content"][0]["text"])
    if out.get("isError"):
        sys.exit(1)

def spec(p):
    with open(p) as f:
        return json.load(f)

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == "guidelines": call("get_email_guidelines", {})
    elif a[0] == "insights": call("get_email_insights", {"topic": a[1] if len(a) > 1 else "", **({"type": a[2]} if len(a) > 2 else {})})
    elif a[0] == "upload":
        with open(a[1], "rb") as f:
            call("upload_email_image", {"filename": os.path.basename(a[1]), "image_base64": base64.b64encode(f.read()).decode()})
    elif a[0] == "preview": call("preview_email", {"spec": spec(a[1])})
    elif a[0] == "create": call("create_email_draft", {"spec": spec(a[1]), **({"requester_email": a[2]} if len(a) > 2 else {})})
    elif a[0] == "update": call("update_email_draft", {"email_id": a[1], "spec": spec(a[2]), **({"requester_email": a[3]} if len(a) > 3 else {})})
    else: sys.exit(__doc__)
