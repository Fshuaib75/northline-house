"""New supplier coverage must preserve colour, size and uncertainty."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('expanded_stock', ROOT / 'tools/brands/check.py')
brands = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brands)


class ExpandedStock(unittest.TestCase):
    def setUp(self):
        brands.SHOPIFY_PAGES.clear()
        self.product = {'id':123, 'handle':'test', 'vendor':'Basic&Co.',
            'options':[{'name':'Renk','position':1},{'name':'Beden','position':2}],
            'images':[{'id':10,'src':'https://cdn.example/black.jpg','variant_ids':[1]}],
            'variants':[
                {'id':1,'option1':'Siyah','option2':'S','available':True},
                {'id':2,'option1':'Siyah','option2':'M','available':False},
                {'id':3,'option1':'Bej','option2':'M','available':True}]}
        self.item = {'ref':'BASIC-123-'+hashlib.sha256(b'Siyah').hexdigest()[:8].upper(),
            'brand':'Basic&Co.','cat':'clothing','model':'Test','page':'https://basicand.co/products/test'}

    def test_all_new_discovery_brands_have_weekly_coverage(self):
        for brand in ['Derimod','Marjin','Basic&Co.','Les Benjamins','Ippocampo','Rene Derhy','New Balance']:
            self.assertIn(brand, brands.SITES)

    def test_direct_product_reads_are_cached_and_colour_specific(self):
        with patch.object(brands, 'get', return_value=(200,json.dumps({'product':self.product}))) as get:
            url, stock=brands.shopify_check(self.item,'https://basicand.co')
            brands.shopify_check(self.item,'https://basicand.co')
        self.assertEqual(stock,['S']);self.assertEqual(url,self.item['page'])
        get.assert_called_once_with('https://basicand.co/products/test.json')

    def test_unavailable_colour_is_not_replaced_by_available_other_colour(self):
        self.product['variants'][0]['available']=False
        self.assertEqual(brands.shopify_stock(self.item,self.product),[])

    def test_ajax_availability_is_joined_by_variant_id_not_position(self):
        raw={**self.product,'variants':[{k:v for k,v in row.items() if k!='available'} for row in self.product['variants']]}
        ajax={'id':123,'variants':list(reversed(self.product['variants']))}
        with patch.object(brands,'get',side_effect=[(200,json.dumps({'product':raw})),(200,json.dumps(ajax))]) as get:
            self.assertEqual(brands.shopify_check(self.item,'https://basicand.co')[1],['S'])
        self.assertEqual(get.call_args_list[-1].args[0],'https://basicand.co/products/test.js')

    def test_wrong_ajax_product_is_not_accepted(self):
        raw={**self.product,'variants':[{'id':1,'option1':'Siyah','option2':'S'}]}
        with patch.object(brands,'get',side_effect=[(200,json.dumps({'product':raw})),(200,json.dumps({'id':999,'variants':[]}))]):
            with self.assertRaises(ValueError):brands.shopify_check(self.item,'https://basicand.co')

    def test_ambiguous_colour_never_becomes_sold_out(self):
        self.assertIsNone(brands.shopify_stock({**self.item,'ref':'CUSTOM'},self.product))

    def test_photo_links_can_identify_colour_without_digest(self):
        self.assertEqual(brands.shopify_stock({**self.item,'ref':'CUSTOM','img':'https://cdn.example/black.jpg'},self.product),['S'])

    def test_missing_stock_or_size_evidence_remains_unknown(self):
        del self.product['variants'][0]['available']
        self.assertIsNone(brands.shopify_stock(self.item,self.product))
        self.product['variants'][0]['available']=True
        self.product['options']=[self.product['options'][0]]
        self.assertIsNone(brands.shopify_stock(self.item,self.product))

    def test_one_size_bags_require_available_variant(self):
        self.product['options']=[self.product['options'][0]]
        item={**self.item,'cat':'bags'}
        self.assertEqual(brands.shopify_stock(item,self.product),['One size'])
        self.product['variants'][0]['available']=False
        self.assertEqual(brands.shopify_stock(item,self.product),[])

    def test_bad_direct_identity_does_not_fall_back_to_other_product(self):
        for field,value in [('vendor','Other Brand'),('id',456),('handle','different')]:
            product={**self.product,field:value};brands.SHOPIFY_PAGES.clear()
            with patch.object(brands,'get',return_value=(200,json.dumps({'product':product}))):
                self.assertEqual(brands.shopify_check(self.item,'https://basicand.co'),(None,None))

    def test_failed_direct_read_preserves_last_known_stock(self):
        old={'on':1,'stock':['M'],'checked_at':'2026-10-01T00:00Z'}
        with patch.object(brands,'get',return_value=(503,'')):
            records,failed=brands.check([self.item],{'styles':{self.item['ref']:old}})
        self.assertTrue(records[self.item['ref']]['stale'])
        self.assertEqual(records[self.item['ref']]['stock'],['M'])
        self.assertEqual(failed['Basic&Co.'],1)

    def test_direct_url_only_allows_known_origin_product_path(self):
        for url in ['http://basicand.co/products/test','https://evil.example/products/test','https://basicand.co@evil.example/products/test','https://basicand.co/other/test']:
            self.assertIsNone(brands.product_link(url,'https://basicand.co'))
        self.assertEqual(brands.product_link('https://basicand.co/products/test?variant=1','https://basicand.co'),'https://basicand.co/products/test')

    def test_common_sizes_preserve_clothing_and_numeric_labels(self):
        for value,want in [('s','S'),('Small','S'),('Medium','M'),('Large','L'),('XXL','XXL'),('42,5','42.5'),('Standart','One size'),('O/S','One size')]:
            self.assertEqual(brands.stock_size(value),want)
        self.assertIsNone(brands.stock_size('Default Title'))

    def test_named_supplier_sizes_keep_existing_catalogue_spelling(self):
        self.product['variants'][0]['option2']='Small'
        self.assertEqual(brands.shopify_stock({**self.item,'sizes':['Small','Medium']},self.product),['Small'])
        self.assertEqual(brands.shopify_stock({**self.item,'sizes':['S','M']},self.product),['S'])

if __name__=='__main__':unittest.main()
