"""Photo guard decisions (tools/photos/guard.py): block, hide, and send to the review inbox."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "photos"))
import guard as G

W = {"ref": "W1", "g": "W", "img": "https://x/w1.jpg", "imgs": ["https://x/w1.jpg", "https://x/w2.jpg"], "page": "https://s/w"}
M = {"ref": "M1", "g": "M", "img": "https://x/m1.jpg", "imgs": ["https://x/m1.jpg"]}
OK = {"ref": "OK", "g": "W", "img": "https://x/a.jpg", "imgs": ["https://x/a.jpg", "https://x/b.jpg"]}
GIRL = {"ref": "G1", "g": "B", "for": "Girl", "img": "https://x/g.jpg"}


class Guard(unittest.TestCase):
    def test_plan_scores_only_new_photos(self):
        todo = G.plan([OK], {"a.jpg": 0.0})
        self.assertEqual(todo[0]["imgs"], ["https://x/b.jpg"])

    def test_female_style_without_clean_photo_is_hidden_and_reported(self):
        checked = {"w1.jpg": 0.99, "w2.jpg": 0.9, "m1.jpg": 0.95, "a.jpg": 0.97, "b.jpg": 0.01, "g.jpg": 0.99}
        rules, hide, notes = G.decide([W, M, OK, GIRL], checked, {"photos": [], "best": {}})
        self.assertEqual(sorted(hide), ["G1", "W1"])
        self.assertEqual(sorted(n["ref"] for n in notes), ["G1", "M1", "W1"])   # men's: reported, not hidden
        self.assertTrue(all(n["t"] == "gone" for n in notes))
        self.assertIn("a.jpg", rules["photos"])                                 # OK keeps b.jpg, loses a.jpg
        self.assertNotIn("b.jpg", rules["photos"])
        self.assertEqual(sorted(rules["reported"]), ["G1", "M1", "W1"])
        _, hide2, notes2 = G.decide([W, M, OK, GIRL], checked, rules)           # next day: nothing sent twice
        self.assertEqual((hide2, notes2), ([], []))

    def test_allowed_photos_are_never_blocked(self):
        rules, hide, notes = G.decide([W], {"w1.jpg": 0.99, "w2.jpg": 0.9}, {"photos": ["w2.jpg"], "best": {}, "allowed": ["w2.jpg"]})
        self.assertNotIn("w2.jpg", rules["photos"])
        self.assertEqual((hide, notes), ([], []))

    def test_unchecked_photo_waits(self):
        _, hide, notes = G.decide([W], {"w1.jpg": 0.99}, {"photos": [], "best": {}})   # w2 not scored yet
        self.assertEqual((hide, notes), ([], []))

    def test_blank_and_unchecked_styles_reach_the_inbox_once_after_two_runs(self):
        a = {"ref": "A", "brand": "B", "model": "Slide", "colour": "Black", "img": "https://x/a1.jpg", "imgs": ["https://x/a1.jpg"]}
        c = {"ref": "C", "brand": "B", "model": "Sandal", "colour": "Tan", "img": "https://x/c1.jpg", "imgs": ["https://x/c1.jpg", "https://x/c2.jpg"]}
        ok = {"https://x/c1.jpg": True}
        fetch = lambda u: ok.get(u, False)
        checked = {"a1.jpg": 0.0, "c1.jpg": 0.0}                # c2 never downloaded for checking
        rules = {"photos": [], "best": {}}
        s1, n1 = G.health([a, c], checked, rules, {}, "2026-10-25", fetch)
        self.assertEqual(n1, [])                                   # first sighting: wait a day
        self.assertEqual((s1["blank"], s1["unchecked"]), ({"A": "2026-10-25"}, {"C": "2026-10-25"}))
        s2, n2 = G.health([a, c], checked, rules, s1, "2026-10-26", fetch)
        self.assertEqual(sorted(n["ref"] for n in n2), ["A", "C"])
        self.assertIn("blank card", n2[0]["why"] if n2[0]["ref"] == "A" else n2[1]["why"])
        s3, n3 = G.health([a, c], checked, rules, s2, "2026-10-27", fetch)
        self.assertEqual(n3, [])                                   # never twice
        ok["https://x/a1.jpg"] = True
        s4, _ = G.health([a, c], checked, rules, s3, "2026-10-28", fetch)
        self.assertNotIn("A", s4["blank"]); self.assertNotIn("A", s4["reported"]["blank"])   # recovered: can report again later

    def test_blocked_photos_dont_count_as_loading(self):
        a = {"ref": "A", "img": "https://x/p.jpg", "imgs": ["https://x/p.jpg", "https://x/q.jpg"]}
        s, _ = G.health([a], {"p.jpg": 0.9, "q.jpg": 0.0}, {"photos": ["p.jpg"]}, {}, "2026-10-25", lambda u: u.endswith("p.jpg"))
        self.assertIn("A", s["blank"])                             # only the blocked photo loads

    def test_hide_in_prices(self):
        p = G.hide_in_prices({"prices": {"W1": [1, 2], "X": [1, 2]}, "hidden": ["Y"]}, ["W1"])
        self.assertEqual(p, {"prices": {"X": [1, 2]}, "hidden": ["Y", "W1"]})


if __name__ == "__main__":
    unittest.main()
