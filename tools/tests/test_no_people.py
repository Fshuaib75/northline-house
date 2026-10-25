"""Owner rule: product-only photos, never a female body (tools/photos/no_people.py)."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "photos"))
import no_people as N

REPORT = {"items": [
    {"ref": "A", "best_whole_photo": "https://x.test/a2.jpg?w=1",
     "photos": [{"url": "https://x.test/400_570/a1.jpg", "person": 0.98}, {"url": "https://x.test/a2.jpg", "person": 0.01}]},
    {"ref": "MEN", "best_whole_photo": None, "photos": [{"url": "https://x.test/m1.jpg", "person": 0.99}]},
    {"ref": "C", "best_whole_photo": "https://x.test/c1.jpg", "photos": [{"url": "https://x.test/c1.jpg", "person": 0.2}]},
]}
HTML = "<script>\nlet ALL = [{\"ref\":\"A\"}];\nlet X=1;\nfunction f(){ capPhotos(cap); brandStock(brs); }\n</script>"


class NoPeople(unittest.TestCase):
    def test_key_ignores_size_query_and_host(self):
        self.assertEqual(N.key("https://n11.test/a1/400_570/1/IMG-9.jpg?x=1"), "IMG-9.jpg")
        self.assertEqual(N.key("https://cdn.test/files/IMG-9.jpg"), "IMG-9.jpg")

    def test_build_blocks_people_photos_except_kept_styles(self):
        r = N.build(REPORT, extra=["https://y.test/legs.webp"], keep=["MEN"])
        self.assertEqual(r["photos"], ["a1.jpg", "legs.webp"])
        self.assertEqual(r["best"], {"A": "a2.jpg"})

    def test_inject_is_idempotent_and_cleans_after_capone_refresh(self):
        N.RULES = N.build(REPORT)
        once = N.inject(HTML)
        self.assertIn("ALL=ALL.map(nlClean);", once)
        self.assertIn("capPhotos(cap); ALL=ALL.map(nlClean);", once)
        self.assertEqual(N.inject(once), once)   # re-running replaces the block, never duplicates it
        self.assertEqual(once.count(N.START), 1)


if __name__ == "__main__":
    unittest.main()
