"""Tests for the model-free parts of tools/sourcing/vision.py (no torch needed)."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sourcing"))
import vision as V


class VisionHelpers(unittest.TestCase):
    def test_calm_probability_favours_closer_prompts(self):
        self.assertGreater(V.calm_probability([0.30, 0.29], [0.20, 0.21]), 0.99)
        self.assertLess(V.calm_probability([0.20], [0.30, 0.22]), 0.01)

    def test_photo_type_picks_best_label(self):
        label, probs = V.photo_type({"whole": [0.31, 0.25], "closeup": [0.27], "worn": [0.20]})
        self.assertEqual(label, "whole")
        self.assertAlmostEqual(sum(probs.values()), 1.0, places=6)

    def test_item_score_ignores_worn_shots_when_product_shots_exist(self):
        imgs = [{"type": "whole", "calm": 0.9}, {"type": "closeup", "calm": 0.7}, {"type": "worn", "calm": 0.1}]
        self.assertAlmostEqual(V.item_score(imgs), 0.8)
        self.assertAlmostEqual(V.item_score([{"type": "worn", "calm": 0.4}]), 0.4)
        self.assertIsNone(V.item_score([]))

    def test_auc_and_comparison(self):
        self.assertEqual(V.auc([0.1, 0.2], [0.8, 0.9]), 1.0)
        self.assertEqual(V.auc([0.5], [0.5]), 0.5)
        items = [{"ref": r, "score": s} for r, s in [("a", .1), ("b", .2), ("c", .3), ("d", .9)]]
        kw = {"a": {"ok": False}, "b": {"ok": True}, "c": {"ok": False}, "d": {"ok": True}}
        c = V.compare(items, kw)
        self.assertEqual(c["keyword_flagged"], 2)
        self.assertEqual(c["caught_in_top_k"], 1)
        self.assertEqual(c["photo_only_flags"], ["b"])
        self.assertEqual(c["keyword_only_flags"], ["c"])

    def test_photo_verdict_thresholds(self):
        self.assertEqual(V.photo_verdict(None), "unchecked")
        self.assertEqual(V.photo_verdict(0.19), "leave_out")
        self.assertEqual(V.photo_verdict(0.2), "check")
        self.assertEqual(V.photo_verdict(0.34), "check")
        self.assertEqual(V.photo_verdict(0.35), "calm")

    def test_person_probability_and_person_free(self):
        self.assertGreater(V.person_probability([0.20, 0.21], [0.30, 0.22]), 0.99)
        self.assertLess(V.person_probability([0.30], [0.20, 0.21]), 0.01)
        imgs = [{"url": "a", "person": 0.9}, {"url": "b", "person": 0.1}, {"url": "c"}]
        self.assertEqual([i["url"] for i in V.person_free(imgs)], ["b", "c"])

    def test_blocked_server_is_skipped_after_repeated_refusals(self):
        k = V.server_key("https://cdn.shopify.com/s/files/1/0566/3732/5374/files/a.jpg?v=1")
        self.assertEqual(k, "cdn.shopify.com/s/files/1/0566/3732/5374")
        self.assertNotEqual(k, V.server_key("https://cdn.shopify.com/s/files/1/0799/4225/4626/files/b.jpg"))
        for _ in range(8):
            V._note(k, False)
        self.assertTrue(V.blocked(k))
        other = V.server_key("https://example.test/x.jpg")
        V._note(other, True)
        for _ in range(20):
            V._note(other, False)
        self.assertFalse(V.blocked(other))   # a server that worked once keeps being tried


if __name__ == "__main__":
    unittest.main()
