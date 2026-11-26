"""Guard the root redirect while legacy patchers and the live photo guard rewrite it."""
import pathlib
import json
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'photos'))
import no_people


def check(page):
    redirect = page.index('location.replace(location.pathname.replace(')
    agents = page.index('if(s.has("agents"))return;')
    catalogue = page.index('let ALL = [')
    assert agents < redirect < catalogue
    assert 'location.search+location.hash' in page[:catalogue]
    assert re.search(r'<link rel="canonical" href="https://northlinehouse.shop/shop/">', page[:catalogue])
    assert no_people.START in page and no_people.END in page


class RootRedirectTest(unittest.TestCase):
    def test_redirect_and_catalogue_survive_writers(self):
        page = (ROOT / 'index.html').read_text()
        check(page)
        with tempfile.TemporaryDirectory() as tmp:
            target = pathlib.Path(tmp) / 'index.html'
            target.write_text(page)
            # These patchers read the existing page before writing it.
            for script, args in [('accessories-patch.py', [str(target), str(target)]),
                                 ('polish-patch.py', [str(target), 'agent']),
                                 ('ui-flow-patch.py', ['agent', str(target)])]:
                subprocess.run([sys.executable, str(ROOT / 'tools' / script), *args],
                               check=True, capture_output=True, text=True)
                check(target.read_text())
            no_people.RULES = json.loads((ROOT / "photo-rules.json").read_text())
            target.write_text(no_people.inject(target.read_text()))
            check(target.read_text())


if __name__ == '__main__':
    unittest.main()
