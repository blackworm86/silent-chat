#!/usr/bin/env python3
"""Validate content/content.json. Usage: python tools/validate_content.py [path]"""
import json, sys
from collections import Counter

path = sys.argv[1] if len(sys.argv) > 1 else "content/content.json"
c = json.load(open(path, encoding="utf-8"))
errors = []

KNOWN_EFFECTS = {"holder", "prepareMessage", "sendWhen", "draw", "delay", "lightsOut", "unlock",
                 "drawFromRevealed", "giveCard", "muteSelf", "atClock", "becomeAlice", "lockChat", "preface"}
KNOWN_ATCLOCK = {"coinFlip", "outOfCharacterMessage", "drawTopUntilNot", "captured"}

# 1. totals
total = (len(c["clueCards"]) + len(c["characters"]) + len(c["drives"])
         + sum(l["copies"] for l in c["locations"]) + sum(s["copies"] for s in c["suspects"])
         + len(c["searchCards"]) + 3)
if total != 72: errors.append("total cards %d != 72" % total)

# 2. clue structure
per_ts = Counter(x["timestamp"] for x in c["clueCards"])
for ts in c["settings"]["clueSchedule"]:
    expect = 1 if ts == 90 else 3
    if per_ts.get(ts) != expect: errors.append("clue %s has %s cards, expected %s" % (ts, per_ts.get(ts), expect))
if len(c["clueCards"]) != 31: errors.append("clue cards != 31")

# 3. both languages everywhere
def walk(o, p=""):
    if isinstance(o, dict):
        if set(o.keys()) == {"it", "en"}:
            if not str(o["it"]).strip() or not str(o["en"]).strip():
                errors.append("empty translation at " + p)
        for k, v in o.items(): walk(v, p + "/" + k)
    elif isinstance(o, list):
        for i, v in enumerate(o): walk(v, "%s[%d]" % (p, i))
walk(c)

# 4. effects known
for card in c["clueCards"]:
    for e in card.get("effects", []):
        if e["type"] not in KNOWN_EFFECTS: errors.append("%s unknown effect %s" % (card["id"], e["type"]))
        if e["type"] == "atClock" and e["action"] not in KNOWN_ATCLOCK:
            errors.append("%s unknown atClock action %s" % (card["id"], e["action"]))

# 5. posters + files
for p in c["posters"]["items"]:
    import os
    if not os.path.exists(os.path.join(os.path.dirname(os.path.dirname(path)), p["image"])):
        errors.append("missing poster image " + p["image"])
if len(c["posters"]["items"]) != 10: errors.append("posters != 10")

if errors:
    print("FAILED:"); [print(" -", e) for e in errors]; sys.exit(1)
print("OK: 72 cards, 31 clue cards, 10 posters, both languages complete, effects valid.")
