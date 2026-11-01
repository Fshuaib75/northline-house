"""Synthetic editorial checks; never call Meta, fetch suppliers, or change real posting history."""
import copy
import datetime as dt
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ig"))
import autopost as A
import preview_week as W


def item(ref, **extra):
    return {"ref": ref, "brand": "Test", "model": "Plain slide", "colour": "Black", "fam": "Black", "cat": "shoes", "g": "M", "price": 35000, "sizes": ["40", "42"], "imgs": [f"https://example.test/{ref}.jpg"], "img": f"https://example.test/{ref}.jpg", "added": "2026-10-30", **extra}


class IGPreviewTests(unittest.TestCase):
    def setUp(self):
        self.policy = patch.object(A, "photo_policy", return_value=({}, {}))
        self.policy.start()
        self.addCleanup(self.policy.stop)

    def test_photo_labels_guard_scores_and_url_fallback(self):
        self.assertFalse(A.product_photo("file:///tmp/image.jpg", {}, {}))
        self.assertFalse(A.product_photo("data:image/png;base64,abc", {}, {}))
        for word in ["olcu", "beden", "size", "chart", "%C3%B6l%C3%A7%C3%BC"]:
            self.assertFalse(A.product_photo("https://example.test/" + word + ".jpg", {}, {}))
        for label in ["chart", "infographic", "person", "worn", "diagram"]:
            self.assertFalse(A.product_photo("https://example.test/plain.jpg", {}, {"labels": {"plain.jpg": label}}))
        self.assertTrue(A.product_photo("https://example.test/size-name.jpg", {}, {"labels": {"size-name.jpg": "whole"}}))
        self.assertFalse(A.product_photo("https://example.test/plain.jpg", {}, {"scores": {"plain.jpg": .9}}))
        self.assertFalse(A.product_photo("https://example.test/plain.jpg", {"photos": ["plain.jpg"]}, {}))
        self.assertTrue(A.product_photo("https://example.test/plain.jpg", {"photos": ["plain.jpg"], "allowed": ["plain.jpg"]}, {"scores": {"plain.jpg": .9}}))

    def test_sivarro_first_chart_is_never_downloaded(self):
        buf = io.BytesIO(); Image.new("RGB", (20, 20), "white").save(buf, format="PNG")
        calls = []
        def get(request, timeout):
            calls.append(request.full_url)
            return io.BytesIO(buf.getvalue())
        with patch.object(A.urllib.request, "urlopen", side_effect=get):
            image = A.fetch_photo(item("SIV-MODERNO-MNK", imgs=["https://example.test/olcu-chart.jpg", "https://example.test/product.jpg"]))
        self.assertEqual(image.size, (20, 20))
        self.assertEqual(calls, ["https://example.test/product.jpg"])

    def test_canonical_minimal_rules_and_70k_drop_exception(self):
        rows = [item("plain"), item("loud", model="Rhinestone slide"), item("pink", colour="Pink", fam="Pink & purple"), item("expensive", price=70001), item("boundary", price=70000), item("diagram", imgs=["https://example.test/chart.jpg"], img="", full="")]
        self.assertEqual([r["ref"] for r in A.eligible_items(rows, {"refs": []})], ["plain", "boundary"])
        self.assertEqual([r["ref"] for r in A.eligible_items(rows, {"refs": ["expensive", "loud"]})], ["plain", "expensive", "boundary"])

    def test_real_pick_order_is_simulated_on_a_copy(self):
        items = [item(str(n), g="W" if n % 2 else "M") for n in range(9)]
        state = {"posted": {"old": "2026-10-30"}, "last_aud": "M"}
        original = copy.deepcopy(state); drop = {"refs": ["3", "0"]}; start = dt.date(2026, 10, 31)
        days = W.plan(items, state, drop, start, lambda i, d: {"feed": "f.jpg", "story": "s.jpg"})
        simulated = copy.deepcopy(state); expected = []
        for offset in range(7):
            day = start + dt.timedelta(days=offset)
            selected = A.pick(items, simulated, today=day, drop=drop); expected.append(selected["ref"])
            simulated["posted"][selected["ref"]] = day.isoformat(); simulated["last_aud"] = A.audience(selected)
        self.assertEqual([r["ref"] for r in days], expected)
        self.assertEqual(len(set(expected)), 7); self.assertEqual(state, original)
        self.assertTrue(days[0]["story_link"].endswith("?i=3&a=IG"))
        self.assertTrue(days[0]["facebook_link"].endswith("?i=3&a=FB"))

    def test_failed_render_does_not_advance_history_and_shortfall_is_explicit(self):
        def fail(*args): raise RuntimeError("photo failed")
        days = W.plan([item("one")], {}, {}, dt.date(2026, 10, 31), fail)
        self.assertEqual([r["ref"] for r in days], ["one"] * 7)
        self.assertFalse(any(r["ready"] for r in days))
        days = W.plan([item("one")], {}, {}, dt.date(2026, 10, 31), lambda *args: {})
        self.assertEqual(sum(r["ready"] for r in days), 1)
        self.assertIn("No eligible style", days[1]["warning"])

    def test_next_schedule_date_and_drop_expiry(self):
        self.assertEqual(A.next_post_day(dt.datetime(2026, 10, 31, 17, 29, tzinfo=dt.timezone.utc)), dt.date(2026, 10, 31))
        self.assertEqual(A.next_post_day(dt.datetime(2026, 10, 31, 17, 30, tzinfo=dt.timezone.utc)), dt.date(2026, 11, 1))
        drop = {"week": "2026-10-20", "refs": ["expensive"]}
        self.assertEqual(A.active_drop(drop, dt.date(2026, 10, 31))["refs"], [])

    def test_exact_sizes_are_not_invented(self):
        self.assertEqual(A.sizes_line(item("one")), "Sizes 40, 42")
        self.assertEqual(A.sizes_line(item("one", sizes=[])), "")
        self.assertEqual(A.sizes_line(item("one", sizes=["00"])), "")
        self.assertEqual(A.sizes_line(item("bag", cat="bags", sizes=["One size"])), "")

    def test_catalogue_filters_charts_people_hidden_and_sold_out_and_uses_current_stock(self):
        with tempfile.TemporaryDirectory() as root:
            rows = [item("safe", imgs=["https://example.test/chart.jpg", "https://example.test/safe.jpg"]), item("hidden"), item("sold"), item("person")]
            Path(root, "index.html").write_text("let ALL = " + json.dumps(rows) + ";\n")
            Path(root, "prices.json").write_text(json.dumps({"prices": {r["ref"]: [35000, 4000] for r in rows}, "hidden": ["hidden"]}))
            Path(root, "brands.json").write_text(json.dumps({"styles": {"sold": {"on": False}, "safe": {"on": True, "stock": ["42"]}}}))
            with patch.object(A, "ROOT", root), patch.object(A, "photo_policy", return_value=({}, {"scores": {"person.jpg": .9}})):
                current = A.catalogue()
            self.assertEqual([i["ref"] for i in current], ["safe"])
            self.assertEqual(current[0]["sizes"], ["42"])
            self.assertEqual(current[0]["imgs"], ["https://example.test/safe.jpg"])

    def test_preview_failure_is_cached_and_html_escapes_supplier_text(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(A, "fetch_photo", side_effect=RuntimeError("unreachable")) as fetch:
                result = W.generate(items=[item("one", model="Plain <script>oops</script>")], state={}, drop={}, start=dt.date(2026, 10, 31), out=root)
            self.assertEqual(fetch.call_count, 1)
            self.assertFalse(any(r["ready"] for r in result["days"]))
            self.assertFalse(result["pins"][2]["ready"])
            page = Path(root, "index.html").read_text()
            self.assertNotIn("<script>oops</script>", page)
            self.assertIn("&lt;script&gt;oops&lt;/script&gt;", page)
            self.assertIn("0/7 ready", page)

    def test_pins_and_week_render_sizes_copy_buttons_noindex_and_no_post_side_effects(self):
        rows = [item(str(n)) for n in range(8)]
        with tempfile.TemporaryDirectory() as temp:
            statefile = Path(temp) / "posted.json"; statefile.write_text('{"posted":{}}')
            out = Path(temp) / "preview"
            with patch.object(A, "STATE", str(statefile)), patch.object(A, "fetch_photo", return_value=Image.new("RGB", (320, 320), "white")), patch.object(A, "graph", side_effect=AssertionError("no Meta")):
                result = W.generate(items=rows, drop={"refs": [str(n) for n in range(8)]}, start=dt.date(2026, 10, 31), out=out)
            self.assertEqual(statefile.read_text(), '{"posted":{}}')
            self.assertEqual(len(result["pins"]), 3)
            for day in result["days"]:
                with Image.open(out / day["feed"]) as image: self.assertEqual(image.size, (1080, 1350))
                with Image.open(out / day["story"]) as image: self.assertEqual(image.size, (1080, 1920))
            for pin in result["pins"]:
                for asset in pin["images"]:
                    with Image.open(out / asset) as image: self.assertEqual(image.size, (1080, 1350))
                for banned in ["türkiye", "istanbul", "turkey"]: self.assertNotIn(banned, pin["caption"].lower())
            self.assertEqual(len(result["pins"][2]["images"]), 2)
            page = (out / "index.html").read_text()
            self.assertIn('content="noindex,nofollow,noarchive"', page)
            self.assertEqual(page.count('Instagram story link<textarea'), 7)
            self.assertIn("navigator.clipboard.writeText", page)
            self.assertIn("API does not add stickers", page)
            self.assertIn("Preview next 7 days", page)

    def test_facebook_posts_link_to_product_and_publish_gate_stays_closed(self):
        calls = []
        def graph(path, params): calls.append((path, params)); return {"id": "test-id"}
        with patch.dict(os.environ, {"IG_USER_ID": "test-user", "FB_PAGE_ID": "test-page"}), patch.object(A, "graph", side_effect=graph), patch.object(A, "graph_get", return_value={"status_code": "FINISHED"}):
            A.publish("https://example.test/feed.jpg", "caption", product_url=A.product_link("DRM/1", "FB"))
        self.assertIn("/shop/?i=DRM%2F1&a=FB", calls[-1][1]["caption"])
        with patch.dict(os.environ, {"IG_POSTING_ENABLED": "false"}):
            with self.assertRaisesRegex(RuntimeError, "disabled"): A.publish_step()
        workflow = (Path(A.HERE).parents[1] / ".github/workflows/ig-autopost.yml").read_text()
        self.assertIn('default: "Preview next 7 days"', workflow)
        self.assertIn('vars.IG_POSTING_ENABLED', workflow)
        self.assertIn("github.ref == 'refs/heads/main'", workflow)
        self.assertNotIn("git push origin HEAD:main", workflow)

    def test_missing_facebook_product_link_fails_before_any_publish(self):
        with patch.dict(os.environ, {"FB_PAGE_ID": "test-page"}), patch.object(A, "graph") as graph:
            with self.assertRaisesRegex(ValueError, "product link"): A.publish("https://example.test/feed.jpg", "caption")
            graph.assert_not_called()


if __name__ == "__main__": unittest.main()
