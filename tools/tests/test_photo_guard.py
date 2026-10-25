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

    def test_unchecked_photo_waits(self):
        _, hide, notes = G.decide([W], {"w1.jpg": 0.99}, {"photos": [], "best": {}})   # w2 not scored yet
        self.assertEqual((hide, notes), ([], []))

    def test_hide_in_prices(self):
        p = G.hide_in_prices({"prices": {"W1": [1, 2], "X": [1, 2]}, "hidden": ["Y"]}, ["W1"])
        self.assertEqual(p, {"prices": {"X": [1, 2]}, "hidden": ["Y", "W1"]})


if __name__ == "__main__":
    unittest.main()
