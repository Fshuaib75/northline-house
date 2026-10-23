"""Offline regression tests: supplier failures must not become stock removals."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

brands = load('brands_check', 'tools/brands/check.py')
capone = load('capone_check', 'tools/capone/check.py')

class StockSafety(unittest.TestCase):
    def setUp(self):
        brands.SHOPIFY.clear()
        brands.SHOPIFY_ERRORS.clear()
        self.item = {'ref': 'ZIYA-TEST', 'brand': 'Ziya', 'model': 'Slide', 'g': 'M'}
        self.old = {'on': 1, 'url': 'https://supplier.example/item', 'stock': ['42'],
                    'checked_at': '2026-10-01T00:00Z'}
        self.prev = {'styles': {'ZIYA-TEST': self.old}}

    def test_parser_failure_preserves_stock_and_timestamp(self):
        with patch.object(brands, 'get', return_value=(200, '<html>Changed layout</html>')):
            result, failed = brands.check([self.item], self.prev)
        self.assertEqual(result['ZIYA-TEST']['stock'], ['42'])
        self.assertEqual(result['ZIYA-TEST']['checked_at'], self.old['checked_at'])
        self.assertTrue(result['ZIYA-TEST']['stale'])
        self.assertEqual(failed['Ziya'], 1)
        self.assertNotIn('stale', self.old)

    def test_http_error_does_not_remove_product(self):
        with patch.object(brands, 'get', return_value=(503, '')):
            result, _ = brands.check([self.item], self.prev)
        self.assertEqual(result['ZIYA-TEST']['on'], 1)

    def test_missing_page_and_failed_rediscovery_are_uncertain(self):
        with patch.object(brands, 'get', return_value=(404, '')), patch.object(brands, 'tsoft_find', return_value=(None, None)):
            result, _ = brands.check([self.item], self.prev)
        self.assertTrue(result['ZIYA-TEST']['stale'])
        self.assertEqual(result['ZIYA-TEST']['stock'], ['42'])

    def test_confirmed_zero_stock_still_updates(self):
        page = '\"variant_stocks\":{\"10\":0}<a data-id="10"><p>42</p></a>'
        with patch.object(brands, 'get', return_value=(200, page)):
            result, failed = brands.check([self.item], self.prev)
        self.assertEqual(result['ZIYA-TEST']['stock'], [])
        self.assertNotIn('stale', result['ZIYA-TEST'])
        self.assertFalse(failed)

    def test_stock_without_size_labels_is_not_sold_out(self):
        self.assertIsNone(brands.tsoft_stock('\"variant_stocks\":{\"10\":0}'))
        self.assertIsNone(brands.quka_stock('variants: {}'))

    def test_partial_shopify_catalogue_is_not_cached(self):
        with patch.object(brands, 'get', side_effect=[(200, json.dumps({'products':[{'id':1}]})), (503, '')]) as get:
            with self.assertRaises(RuntimeError): brands.shopify_products('https://supplier.example')
            with self.assertRaises(RuntimeError): brands.shopify_products('https://supplier.example')
        self.assertEqual(get.call_count, 2)
        self.assertNotIn('https://supplier.example', brands.SHOPIFY)

    def test_complete_shopify_catalogue_is_cached(self):
        with patch.object(brands, 'get', side_effect=[(200, '{"products":[{"id":1}]}'), (200, '{"products":[]}')]) as get:
            self.assertEqual(brands.shopify_products('https://supplier.example'), [{'id':1}])
            brands.shopify_products('https://supplier.example')
        self.assertEqual(get.call_count, 2)

    def test_invalid_shopify_response_is_not_end_of_catalogue(self):
        with patch.object(brands, 'get', return_value=(200, '{"error":"maintenance"}')):
            with self.assertRaises(RuntimeError): brands.shopify_products('https://supplier.example')

    def test_capone_rejects_malformed_catalogue(self):
        with patch.object(capone, 'get', return_value=(200, b'{"error":"maintenance"}')):
            with self.assertRaises(SystemExit): capone.store_products()

    def test_capone_rejects_pagination_truncation(self):
        with patch.object(capone, 'get', return_value=(200, b'{"products":[{"id":1}]}')), patch.object(capone.time, 'sleep'):
            with self.assertRaises(SystemExit): capone.store_products()

    def test_filtered_run_preserves_other_brands(self):
        import os
        previous = {'styles': {**self.prev['styles'], 'ALDO-OTHER': {'on':1, 'stock':['40']}}}
        with tempfile.TemporaryDirectory() as tmp:
            before = os.getcwd()
            try:
                os.chdir(tmp)
                Path('brands.json').write_text(json.dumps(previous))
                with patch.object(brands, 'catalogue', return_value=([self.item], {})), \
                     patch.object(brands, 'check', return_value=({'ZIYA-TEST':self.old}, {})), \
                     patch.object(brands, 'post') as post, \
                     patch.object(brands, 'DRY', False), \
                     patch.object(brands.sys, 'argv', ['check.py', 'Ziya']):
                    brands.main()
                saved = json.loads(Path('brands.json').read_text())
                self.assertEqual(saved['styles']['ALDO-OTHER'], previous['styles']['ALDO-OTHER'])
                self.assertEqual(saved['styles']['ZIYA-TEST']['stock'], ['42'])
                post.assert_called_once()
            finally:
                os.chdir(before)

    def test_stale_record_is_not_counted_as_verified(self):
        import datetime
        stale = {**self.old, 'stale':True}
        body, _, summary = brands.report([self.item], {}, {'ZIYA-TEST':stale}, self.prev, {'Ziya':1}, datetime.datetime.now(datetime.timezone.utc))
        self.assertIn('0 checked', summary)
        self.assertIn('Not verified this run', body)

if __name__ == '__main__':
    unittest.main()
