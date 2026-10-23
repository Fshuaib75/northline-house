"""Download bounded public supplier catalogues for review, never publish stock.
Usage: python tools/sourcing/collect.py --output /tmp/northline-catalogues --pages 4
"""
import argparse
import concurrent.futures
import datetime
import json
from pathlib import Path
import time
import urllib.request

SOURCES = json.loads(Path(__file__).with_name('sources.json').read_text(encoding='utf-8'))

def collect(key, directory, pages):
    brand, base = SOURCES[key]['brand'], SOURCES[key]['base']
    records, seen, errors = [], set(), []
    complete = False
    currency = None
    try:
        req = urllib.request.Request(base + '/cart.js', headers={'User-Agent':'NorthlineCatalogueCheck/1.0', 'Accept':'application/json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            currency = json.load(response).get('currency')
        if currency != 'TRY': raise ValueError(f'Expected TRY, observed {currency}')
    except Exception as error:
        errors.append(f'Currency check: {type(error).__name__}: {error}')
    for page in range(1, pages + 1):
        if errors: break
        url = f'{base}/products.json?limit=250&page={page}'
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'NorthlineCatalogueCheck/1.0', 'Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.load(response)
            products = data.get('products')
            if not isinstance(products, list): raise ValueError('missing products array')
            if not products:
                complete = True
                break
            before = len(records)
            for product in products:
                if not isinstance(product, dict) or not product.get('id'): raise ValueError('invalid product record')
                if product['id'] not in seen:
                    records.append(product)
                    seen.add(product['id'])
            if len(records) == before: raise ValueError('Repeated page; pagination did not advance')
            time.sleep(1.2)
        except Exception as error:
            errors.append(f'Page {page}: {type(error).__name__}: {error}')
            break  # No bypasses or unbounded retries; partial discovery never implies absence.
    snapshot = {'source':key, 'brand':brand, 'base':base, 'currency':currency,
                'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'complete':complete, 'errors':errors, 'products':records}
    path = directory / f'{key}.json'
    path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding='utf-8')
    return {'source':key, 'products':len(records), 'complete':complete, 'errors':errors}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--pages', type=int, default=8, choices=range(1, 21))
    parser.add_argument('--sources', nargs='+', choices=list(SOURCES), default=list(SOURCES))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda key:collect(key, args.output, args.pages), args.sources))
    print(json.dumps(results, indent=2))
    if not any(result['products'] for result in results): raise SystemExit(1)
