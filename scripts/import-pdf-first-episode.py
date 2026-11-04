"""Import one Little Fox episode whose official PDF appears before its video.

Example:
  python scripts/import-pdf-first-episode.py --series three-kingdoms --episode 14 --content-id C0013410 --apply
"""
import argparse
import io
import json
import re
from collections import Counter
from pathlib import Path

import requests
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
CONTENT_ID = re.compile(r'^C\d{7}$')
STOP_WORDS = set('about after again also and are been but can come could did does for from have into just like more not now out over said some that the their then there they this was were what when which will with would your you our all one two who its her his she him them has had is a an of to in on at by as it or if than'.split())


def clean_page(text):
    text = text.replace('\u00ad', '').replace('\n', ' ')
    text = re.sub(r'\s+\*\s+\*\s+\*\s+', ' ', text)
    text = re.sub(r'\s+\d+(?:\s+\d+)?\s*$', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.replace('asked W for help', 'asked for help')
    return 'W' + text if text.startswith('ith ') else text


def vocabulary(text):
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text.lower())
    ranked = [word for word, _ in Counter(word for word in words if word not in STOP_WORDS).most_common(28)]
    sentences = re.findall(r'[^.!?]+[.!?]+|[^.!?]+$', text)
    return [{
        'id': f'v{index}', 'word': word, 'meaningZh': '请结合本集 Read 上下文理解',
        'definitionEn': '', 'example': next((sentence.strip() for sentence in sentences if re.search(rf'\b{re.escape(word)}\b', sentence, re.I)), ''),
        'exampleZh': '', 'source': 'generated-from-official-pdf-read',
    } for index, word in enumerate(ranked, 1)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--series', required=True)
    parser.add_argument('--episode', type=int, required=True)
    parser.add_argument('--content-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]+', args.series) or args.episode < 1 or not CONTENT_ID.fullmatch(args.content_id):
        raise SystemExit('Invalid series, episode, or content ID')

    directory = ROOT / 'data' / args.series
    episodes_path, read_path, vocab_path = (directory / 'episodes.json', directory / 'reading-lessons.json', directory / 'vocabulary.json')
    episodes, readings, words = (json.loads(path.read_text(encoding='utf-8')) for path in (episodes_path, read_path, vocab_path))
    pdf_url = 'https://res.littlefox.com/en/supplement/load_pdf/' + args.content_id
    response = requests.get(pdf_url, timeout=60)
    if response.status_code != 200 or not response.content.startswith(b'%PDF-'):
        raise SystemExit('Official PDF is unavailable')
    raw_pages = [page.extract_text() or '' for page in PdfReader(io.BytesIO(response.content)).pages]
    pages = [clean_page(page) for page in raw_pages]
    title = raw_pages[0].split('Copyright', 1)[0].strip().split('\n')[0].strip()
    midpoint = len(title) // 2
    if len(title) % 2 == 0 and title[:midpoint] == title[midpoint:]:
        title = title[:midpoint]
    paragraphs = [page for page in pages[1:] if page]
    if not title or not paragraphs:
        raise SystemExit('Official PDF does not contain extractable reading text')

    existing = next((row for row in episodes if row['episodeId'] == args.episode), None)
    if existing and existing.get('sourceContentId') not in ('', args.content_id):
        raise SystemExit('Episode number is already bound to another content ID')
    episode = {
        'episodeId': args.episode, 'sourceContentId': args.content_id, 'title': title, 'titleZh': '', 'releaseDate': '',
        'status': 'published', 'sourceType': 'official-pdf', 'unlockRequiresQuiz': False,
        'video': {'source': 'pending'},
        'modules': {'watch': False, 'read': True, 'words': True, 'vocabulary': True, 'phrases': False, 'grammar': False, 'quiz': False, 'review': False},
        'storyBook': {'contentId': args.content_id, 'bookId': 'littlefox-' + args.content_id.lower(), 'pdfUrl': pdf_url, 'availability': 'pdf'},
    }
    key = str(args.episode)
    reading = {'episodeId': args.episode, 'title': title, 'source': 'official-pdf-text', 'sourceId': args.content_id,
               'paragraphs': [{'id': f'p{index}', 'text': paragraph, 'translation': ''} for index, paragraph in enumerate(paragraphs, 1)]}
    if existing:
        episodes[episodes.index(existing)] = {**existing, **episode}
    else:
        episodes.append(episode)
        episodes.sort(key=lambda row: row['episodeId'])
    readings[key], words[key] = reading, vocabulary(' '.join(paragraphs))

    index_path = ROOT / 'data' / 'littlefox-episode-pdfs.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    series_info = json.loads((directory / 'series.json').read_text(encoding='utf-8'))
    row = {'seriesId': args.series, 'episodeId': args.episode, 'contentId': args.content_id, 'title': title, 'titleZh': '',
           'level': series_info.get('level', ''), 'coverUrl': series_info.get('coverImage', series_info.get('coverUrl', '')),
           'pdfUrl': pdf_url, 'availability': 'pdf', 'verification': 'pdf-header-v2'}
    index = [item for item in index if not (item['seriesId'] == args.series and item['episodeId'] == args.episode)] + [row]
    index.sort(key=lambda item: (item['seriesId'], item['episodeId']))

    print(json.dumps({'title': title, 'paragraphs': len(paragraphs), 'vocabulary': len(words[key]), 'pdf': pdf_url}, ensure_ascii=False))
    if not args.apply:
        return
    episodes_path.write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    read_path.write_text(json.dumps(readings, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    vocab_path.write_text(json.dumps(words, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index_path.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    series_info['totalEpisodes'] = max(int(series_info.get('totalEpisodes', 0)), args.episode)
    (directory / 'series.json').write_text(json.dumps(series_info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
