"""Import verified public PDF links without changing unrelated books.

Usage: python scripts/update-book-links.py --apply [--pdf-directory PATH]
       python scripts/update-book-links.py --check
Thumbnail generation optionally requires PyMuPDF; the site has no build step.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--pdf-directory', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    updates = json.loads((root / 'scripts/book-link-updates.json').read_text(encoding='utf-8'))
    target = root / 'data/books.json'
    books = json.loads(target.read_text(encoding='utf-8'))
    assert len({book['id'] for book in books}) == len(books), 'Duplicate existing book IDs'
    assert len({book['id'] for book in updates}) == len(updates), 'Duplicate imported book IDs'
    for item in updates:
        assert re.fullmatch(r'[a-z0-9-]+', item['id']), 'Invalid book ID'
        url = urlsplit(item['sourceUrl'])
        assert url.scheme == 'https' and url.netloc == 'u.pone.rs', 'Expected public Pone PDF'
        assert re.fullmatch(r'/[a-z]+\.pdf', url.path) and not url.query and not url.fragment
        assert item['coverUrl'] == f"assets/covers/books/{item['id']}.jpg"
        expected = {key: value for key, value in item.items() if key != 'pdfFile'}
        existing = next((book for book in books if book['id'] == item['id']), None)
        if args.check:
            assert existing and all(existing.get(k) == v for k, v in expected.items()), item['id']
            assert (root / item['coverUrl']).is_file(), item['coverUrl']
        elif existing:
            existing.update(expected)
        else:
            books.append(expected)
        if args.apply and args.pdf_directory:
            import fitz
            source = args.pdf_directory / item['pdfFile']
            cover = root / item['coverUrl']
            cover.parent.mkdir(parents=True, exist_ok=True)
            with fitz.open(source) as pdf:
                page = pdf[0]
                pix = page.get_pixmap(matrix=fitz.Matrix(480 / page.rect.width, 480 / page.rect.width), alpha=False)
                pix.save(cover, jpg_quality=85)
    proxy_path = root / 'netlify/edge-functions/book-download.js'
    proxy = proxy_path.read_text(encoding='utf-8')
    sources = {book['id']: book['sourceUrl'] for book in books
               if book.get('format') == 'pdf' and book.get('sourceUrl')}
    source_line = 'const SOURCES = ' + json.dumps(sources, ensure_ascii=False) + ';'
    updated_proxy, count = re.subn(r'^const SOURCES = .*;$', lambda _: source_line, proxy, flags=re.MULTILINE)
    assert count == 1, 'Expected one fixed PDF source map'
    if args.check:
        assert updated_proxy == proxy, 'PDF proxy sources are out of sync'
    if args.apply:
        proxy_path.write_text(updated_proxy, encoding='utf-8')
        target.write_text(json.dumps(books, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"{'Checked' if args.check else 'Imported' if args.apply else 'Previewed'} {len(updates)} links; {len(books)} books total.")


if __name__ == '__main__':
    main()
