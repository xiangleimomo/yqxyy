"""Build episode PDF mappings from stored official Read/content IDs, never titles.

python scripts/import-episode-pdfs.py --check --apply
HEAD checks do not download the PDFs. Re-running reuses successful checks.
"""
import argparse
import concurrent.futures
import json
from pathlib import Path
import re
import threading
import requests

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'data/littlefox-episode-pdfs.json'
REPORT = ROOT / 'reports/episode-pdfs.json'
ID = re.compile(r'^C\d{7}$')
local = threading.local()


def discover():
    rows, missing, conflicts = [], [], []
    for file in sorted((ROOT / 'data').glob('*/episodes.json')):
        episodes = json.loads(file.read_text(encoding='utf-8-sig'))
        reading = file.with_name('reading-lessons.json')
        texts = json.loads(reading.read_text(encoding='utf-8-sig')) if reading.exists() else {}
        info_file = file.with_name('series.json')
        info = json.loads(info_file.read_text(encoding='utf-8-sig')) if info_file.exists() else {}
        for episode in episodes:
            read_id = texts.get(str(episode['episodeId']), {}).get('sourceId', '')
            episode_id = episode.get('sourceContentId', '')
            if read_id and episode_id and read_id != episode_id:
                conflicts.append([file.parent.name, episode['episodeId'], read_id, episode_id])
                continue
            content_id = read_id or episode_id
            if not ID.fullmatch(content_id):
                missing.append([file.parent.name, episode['episodeId']])
                continue
            rows.append(dict(seriesId=file.parent.name, episodeId=episode['episodeId'],
                             contentId=content_id, title=episode['title'], titleZh=episode.get('titleZh', ''),
                             level=info.get('level', ''), coverUrl=info.get('coverImage', info.get('coverUrl', '')),
                             pdfUrl='https://res.littlefox.com/en/supplement/load_pdf/' + content_id))
    return rows, missing, conflicts


def check(url):
    if not hasattr(local, 'session'):
        local.session = requests.Session()
    for attempt in range(2):
        try:
            response = local.session.head(url, timeout=20, allow_redirects=True)
            if response.status_code == 200 and 'application/pdf' in response.headers.get('Content-Type', '').lower():
                return 'pdf'
            if response.status_code in (404, 410) or (response.status_code == 200 and 'text/html' in response.headers.get('Content-Type', '')):
                return 'unavailable'
        except requests.RequestException:
            pass
    return 'unverified'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rows, missing, conflicts = discover()
    if conflicts:
        raise SystemExit('Conflicting IDs: ' + repr(conflicts))
    previous = json.loads(INDEX.read_text(encoding='utf-8')) if INDEX.exists() else []
    checked = {row['pdfUrl']: row.get('availability', 'unverified') for row in previous}
    urls = sorted({row['pdfUrl'] for row in rows} - {url for url, status in checked.items() if status == 'pdf'})
    if args.check:
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            for number, (url, result) in enumerate(zip(urls, pool.map(check, urls)), 1):
                checked[url] = result
                if number % 100 == 0:
                    print(f'Checked {number}/{len(urls)}', flush=True)
    for row in rows:
        row['availability'] = checked.get(row['pdfUrl'], 'unverified')
    summary = dict(mapped=len(rows), uniqueContentIds=len({row['contentId'] for row in rows}),
                   pdf=sum(row['availability'] == 'pdf' for row in rows),
                   unavailable=sum(row['availability'] == 'unavailable' for row in rows),
                   unverified=sum(row['availability'] == 'unverified' for row in rows), missing=missing)
    if args.apply:
        INDEX.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        REPORT.parent.mkdir(exist_ok=True)
        REPORT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        by_episode = {(row['seriesId'], row['episodeId']): row for row in rows}
        for file in sorted((ROOT / 'data').glob('*/episodes.json')):
            episodes = json.loads(file.read_text(encoding='utf-8-sig'))
            changed = False
            for episode in episodes:
                row = by_episode.get((file.parent.name, episode['episodeId']))
                if not row:
                    continue
                if not episode.get('sourceContentId'):
                    episode['sourceContentId'] = row['contentId']
                    changed = True
                value = dict(contentId=row['contentId'], bookId='littlefox-' + row['contentId'].lower(),
                             pdfUrl=row['pdfUrl'], availability=row['availability'])
                if episode.get('storyBook') != value:
                    episode['storyBook'] = value
                    changed = True
            if changed:
                file.write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            if any(row['availability'] == 'pdf' for row in rows if row['seriesId'] == file.parent.name):
                info_file = file.with_name('series.json')
                info = json.loads(info_file.read_text(encoding='utf-8-sig'))
                library = dict(title='全集绘本库', url='#/series-books/' + file.parent.name)
                if info.get('storyBookLibrary') != library:
                    info['storyBookLibrary'] = library
                    info_file.write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in summary.items() if key != 'missing'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
