"""Pure scheduling regressions, executable without rendering dependencies."""
import ast
import datetime as dt
from pathlib import Path
import re
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "ig" / "autopost.py"
NAMES = {"audience", "style_key", "style_colours", "record_post", "display_name",
         "grouped_items", "pick", "active_drop", "caption", "sizes_line", "naira", "clean_description", "hashtags"}
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
functions = ast.Module(body=[node for node in tree.body
                            if isinstance(node, ast.FunctionDef) and node.name in NAMES],
                       type_ignores=[])
scope = {"dt": dt, "re": re, "eligible_items": lambda items, drop: items, "IG_AUDIENCE": None}
exec(compile(functions, str(SOURCE), "exec"), scope)
DAY = dt.date(2026, 11, 3)

def item(ref, **extra):
    return dict(ref=ref, brand="A", model="2172 Luxter cross slide", colour=ref,
                g="M", price=35000, **extra)

class StyleTests(unittest.TestCase):
    def pick(self, rows, state):
        return scope["pick"](rows, state, DAY, {"refs": [r["ref"] for r in rows]})

    def test_group_colours_and_legacy_history(self):
        rows = [item("black", grp="slide"), item("tan", grp="slide"), item("other")]
        chosen = self.pick(rows, {})
        grouped = next(i for i in scope["grouped_items"](rows, {}) if i.get("grp") == "slide")
        self.assertEqual(len(grouped["colours"]), 2)
        chosen = self.pick(rows, {"posted": {"tan": DAY.isoformat()}})
        self.assertEqual(chosen["ref"], "other")

    def test_record_all_colours_and_style(self):
        rows = [item("black", grp="slide"), item("tan", grp="slide")]
        state = {}
        scope["record_post"](state, self.pick(rows, state), DAY.isoformat())
        self.assertEqual(set(state["posted"]), {"black", "tan"})
        self.assertEqual(state["posted_styles"], {"grp:slide": DAY.isoformat()})
        self.assertIsNone(self.pick(rows, state))

    def test_alternation_during_drop(self):
        self.assertEqual(self.pick([item("m"), item("w", **{}) | {"g": "W"}],
                                   {"last_aud": "M"})["ref"], "w")

    def test_value_and_brand_spacing(self):
        expensive = item("premium") | {"price": 72500}
        other = item("other") | {"brand": "B"}
        self.assertEqual(self.pick([expensive, item("value")], {})["ref"], "value")
        self.assertEqual(self.pick([item("same"), other], {"last_brand": "A"})["ref"], "other")

    def test_caption_and_sparse_sizes(self):
        chosen = item("black", grp="slide") | {"sizes": ["40", "43"]}
        chosen["colours"] = [dict(chosen), item("tan", grp="slide")]
        text = scope["caption"](chosen)
        self.assertTrue(text.startswith("Luxter cross slide"))
        self.assertIn("Sizes 40, 43", text)
        self.assertIn("tan", text)
        self.assertNotIn("Other colours", text)
        self.assertNotIn("41", text)

if __name__ == "__main__":
    unittest.main()
