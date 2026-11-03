"""Regressions for real reference grouping, men-only picks and photo masking."""
import datetime as dt
from pathlib import Path
import sys
import os
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ig'))
import autopost as A

def product(ref, **extra):
    return {'ref':ref, 'brand':'Sivarro', 'g':'M', 'cat':'shoes', 'model':'Slide',
            'desc':'double-strap cork footbed', 'colour':'Black', 'price':35000, **extra}

class RevisionTests(unittest.TestCase):
    def test_real_refs_group_by_brand_audience_and_supplier_model(self):
        rows = [product('SIV-BOSTON-BLK-M'), product('SIV-BOSTON-BRN-M', colour='Brown'),
                product('SIV-FUGA-BLK-M'), product('SIV-BOSTON-BLK', g='W')]
        with patch.object(A, 'eligible_items', side_effect=lambda items, drop: items):
            groups = A.grouped_items(rows, {})
        self.assertEqual(len(groups), 3)
        self.assertEqual([i['ref'] for i in groups[0]['colours']], ['SIV-BOSTON-BLK-M','SIV-BOSTON-BRN-M'])
        self.assertNotEqual(A.style_key(product('397-N08', brand='Capone')), A.style_key(product('398-N08', brand='Capone')))
        self.assertEqual(A.style_key(product('397-N08', brand='Capone')), A.style_key(product('397-N01', brand='Capone')))
        self.assertEqual(A.style_key(product('2914-WHT-2')), A.style_key(product('2914-BLK')))
        self.assertEqual(A.style_key(product('SLZ-SA11SE009-300N',brand='Slazenger')), A.style_key(product('SLZ-SA11SE009-000',brand='Slazenger')))
        self.assertEqual(A.style_key(product('DF-D8070AXBG437',brand='DeFacto')), A.style_key(product('DF-D8070AXNV44',brand='DeFacto')))

    def test_legacy_colour_suppresses_whole_style(self):
        rows = [product('SIV-BOSTON-BLK-M'), product('SIV-BOSTON-BRN-M', colour='Brown')]
        with patch.object(A, 'eligible_items', side_effect=lambda items, drop: items):
            self.assertIsNone(A.pick(rows, {'posted':{'SIV-BOSTON-BRN-M':'2026-11-03'}}, dt.date(2026,11,4), {}))

    def test_mens_accessories_are_eligible_and_women_are_excluded(self):
        rows = [product('W',g='W'),product('WALLET',g='AC',cat='accessories',**{'for':'Men'})]
        with patch.object(A, 'eligible_items', side_effect=lambda items, drop: items):
            item = A.pick(rows, {'last_aud':'M'},dt.date(2026,11,4),{})
            self.assertEqual(item['ref'],'WALLET')
            self.assertIsNone(A.pick(rows[:1],{},dt.date(2026,11,4),{}))

    def test_names_and_caption_types(self):
        item=product('X',desc='genuine leather, confirm size before payment')
        self.assertEqual(A.display_name(item),'Genuine leather slide')
        self.assertTrue(A.clean_description(item).startswith('Genuine'))
        self.assertNotIn('confirm size before payment',A.caption(item).lower())
        item['colours']=[dict(item),product('Y',colour='Brown')]
        text=A.caption(item)
        self.assertNotIn('Other colours',text)
        self.assertIn('Brown',text)
        for cat, model in [('accessories','Wallet'),('bags','Crossbody')]:
            tags=A.hashtags(product('A',cat=cat,model=model))
            self.assertNotIn('#palms',tags)
            self.assertNotIn('#slides',tags)

    def test_enclosed_white_gap_removed_and_pale_surface_preserved(self):
        photo=Image.new('RGB',(200,200),'white')
        d=ImageDraw.Draw(photo)
        d.rectangle((30,50,170,150),fill=(25,25,25))
        d.rectangle((80,80,120,120),fill='white')
        output=A.photo_box(photo,200,200,product('X'))
        self.assertEqual(output.getpixel((100,100)),A.PHOTO)
        d.rectangle((80,80,120,120),fill=(227,220,205))
        output=A.photo_box(photo,200,200,product('X'))
        self.assertEqual(output.getpixel((100,100)),(227,220,205))

    def test_white_product_and_product_at_corner_survive(self):
        photo=Image.new('RGB',(200,200),'white')
        d=ImageDraw.Draw(photo)
        d.rectangle((30,50,170,150),fill=(50,50,50))
        d.rectangle((80,80,120,120),fill=(251,251,251))
        output=A.photo_box(photo,200,200,product('X',colour='White'))
        self.assertEqual(output.getpixel((100,100)),(251,251,251))
        d.rectangle((0,0,100,100),fill=(30,30,30))
        output=A.photo_box(photo,200,200,product('X'))
        self.assertGreater(sum(1 for rgb in output.getdata() if max(rgb)<60),1000)

    def test_white_straps_on_grey_keep_white_and_clear_matching_gaps(self):
        photo=Image.new('RGB',(200,200),(236,236,236))
        d=ImageDraw.Draw(photo)
        d.rectangle((30,50,170,150),fill=(251,251,251))
        d.rectangle((80,80,120,120),fill=(236,236,236))
        output=A.photo_box(photo,200,200,product('X',colour='White'))
        self.assertEqual(output.getpixel((100,100)),A.PHOTO)
        self.assertGreater(sum(1 for rgb in output.getdata() if min(rgb)>245),1000)

    def test_carousel_publishes_one_feed_with_all_children(self):
        calls = []
        def graph(path, params):
            calls.append((path, params))
            return {'id': str(len(calls))}
        with patch.dict(os.environ, {'IG_USER_ID':'test', 'FB_PAGE_ID':''}), patch.object(A,'graph',side_effect=graph), patch.object(A,'graph_get',return_value={'status_code':'FINISHED'}):
            result=A.publish(['https://example.test/black.jpg','https://example.test/brown.jpg'], 'caption')
        self.assertEqual(len([p for _,p in calls if p.get('is_carousel_item')=='true']),2)
        parent=next(p for _,p in calls if p.get('media_type')=='CAROUSEL')
        self.assertEqual(parent['children'],'1,2')
        self.assertEqual(len([path for path,_ in calls if path.endswith('media_publish')]),1)
        self.assertIn('feed',result)

    def test_failed_colour_processing_prevents_feed_publish(self):
        with patch.dict(os.environ, {'IG_USER_ID':'test', 'FB_PAGE_ID':''}), patch.object(A,'graph',return_value={'id':'child'}) as graph, patch.object(A,'graph_get',return_value={'status_code':'ERROR'}):
            with self.assertRaisesRegex(RuntimeError,'processing failed'):
                A.publish(['https://example.test/a.jpg','https://example.test/b.jpg'],'caption')
        self.assertFalse(any(call.args[0].endswith('media_publish') for call in graph.call_args_list))

if __name__ == '__main__': unittest.main()
