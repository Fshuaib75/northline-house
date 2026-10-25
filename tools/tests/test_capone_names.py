"""Capone photo file names (tools/capone/check.py): main photos without a photo number must still be tracked."""
import importlib.util, os, unittest
spec = importlib.util.spec_from_file_location("capone_check", os.path.join(os.path.dirname(__file__), "..", "capone", "check.py"))
C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)


class CaponeNames(unittest.TestCase):
    def test_numbered_and_unnumbered_names_share_a_stem(self):
        self.assertEqual(C.parts("https://x/files/530-K795-FDG-01-0000_K444_2_3f9ad683-ff81-41ae-af7a-bc38ece3794c.jpg?v=1"),
                         ("530-K795-FDG-01-0000_K444", 2))
        old = C.parts("https://www.caponeoutfitters.com.tr/cdn/shop/files/605-KB02-_C4_B0P-01-00001_N01.jpg?width=700")
        new = C.parts("https://cdn.shopify.com/s/files/1/0566/3732/5374/files/605-KB02-_C4_B0P-01-00001_N01_ef47ac76-dd64-4822-9a3f-55085cbba801.jpg")
        self.assertEqual(old, ("605-KB02-_C4_B0P-01-00001_N01", 1))
        self.assertEqual(old, new)

    def test_photo_links_keep_their_encoding(self):
        u = "https://x/files/605-KB02-%C4%B0P-01-00001_N01.jpg?v=1"
        self.assertTrue(C.width(u, 700).endswith("605-KB02-%C4%B0P-01-00001_N01.jpg?width=700"))


if __name__ == "__main__":
    unittest.main()
