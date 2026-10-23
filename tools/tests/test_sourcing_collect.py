import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('collect', Path(__file__).parents[1] / 'sourcing/collect.py')
collect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect)

class CollectSafety(unittest.TestCase):
    def scan(self, responses):
        with tempfile.TemporaryDirectory() as directory:
            def reply(*args, **kwargs):
                value = next(responses)
                if isinstance(value, Exception): raise value
                return io.BytesIO(json.dumps(value).encode())
            with patch.object(collect.urllib.request, 'urlopen', side_effect=reply), patch.object(collect.time, 'sleep'):
                result = collect.collect('marjin', Path(directory), 4)
                snapshot = json.loads((Path(directory) / 'marjin.json').read_text())
            return result, snapshot

    def test_currency_must_be_verified_before_catalogue(self):
        for currency in ['USD', None]:
            result, snapshot = self.scan(iter([{'currency': currency}]))
            self.assertEqual(result['products'], 0)
            self.assertTrue(result['errors'])
            self.assertEqual(snapshot['currency'], currency)

    def test_repeated_page_stops_without_claiming_complete(self):
        result, snapshot = self.scan(iter([{'currency':'TRY'}, {'products':[{'id':1}]}, {'products':[{'id':1}]}]))
        self.assertEqual(result['products'], 1)
        self.assertFalse(result['complete'])
        self.assertIn('Repeated page', result['errors'][0])

    def test_end_of_catalogue_and_partial_failure(self):
        for last, complete in [({'products':[]}, True), (OSError('unavailable'), False)]:
            result, snapshot = self.scan(iter([{'currency':'TRY'}, {'products':[{'id':1}]}, last]))
            self.assertEqual(result['products'], 1)
            self.assertEqual(result['complete'], complete)
            self.assertEqual(snapshot['currency'], 'TRY')

if __name__ == '__main__': unittest.main()
