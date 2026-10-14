#!/usr/bin/env python3
"""Add one APPROVED customer review or feedback message to reviews.json (only real ones, checked against the order).
  python3 tools/add-review.py review  REF  RATING "Text" "First name" "City" [size]
  python3 tools/add-review.py feedback RATING "Text" "First name" "City"
Then commit and push reviews.json to gh-pages and main. REF can be any colour ref of the model."""
import json, sys, datetime
a = sys.argv[1:]
j = json.load(open("reviews.json"))
today = datetime.date.today().isoformat()
if a and a[0] == "review" and len(a) >= 6:
    e = {"ref": a[1], "rating": int(a[2]), "text": a[3], "name": a[4], "city": a[5], "verified": True, "date": today}
    if len(a) > 6: e["size"] = a[6]
    j["reviews"].insert(0, e)
elif a and a[0] == "feedback" and len(a) >= 5:
    j["feedback"].insert(0, {"rating": int(a[1]), "text": a[2], "name": a[3], "city": a[4], "verified": True, "date": today})
else: sys.exit(__doc__)
json.dump(j, open("reviews.json", "w"), ensure_ascii=False, indent=1); print("ok")
