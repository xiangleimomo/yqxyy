"""Import the supplied 20-lesson HP4 package: python scripts/import-hp4-course.py <zip>."""
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
course_id = 'movie-harry-potter-4'
dest = root / 'data' / course_id

def write_json(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

with zipfile.ZipFile(sys.argv[1]) as archive:
    files = {}
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        parts = PurePosixPath(entry.filename).parts
        if len(parts) < 2 or parts[0] != 'harry-potter-4-course' or '..' in parts or '\\' in entry.filename:
            raise ValueError('Unexpected package path: ' + entry.filename)
        name = '/'.join(parts[1:])
        if not name.endswith(('.json', '.md', '.m3u8', '.vtt')):
            raise ValueError('Unexpected asset: ' + name)
        files[name] = archive.read(entry).decode('utf-8-sig').replace('\r\n', '\n')
    episodes = json.loads(files['episodes.json'])
    vocabulary = json.loads(files['vocabulary.json'])
    quizzes = json.loads(files['quiz.json'])
    assert len(episodes) == 20
    for i, episode in enumerate(episodes, 1):
        assert episode['episodeId'] == i
        episode['status'] = 'published'
        for field in ['hlsUrl', 'subtitleUrl']:
            uri = episode['video'][field]
            assert uri.startswith('/data/' + course_id + '/')
            assert uri.split('/data/' + course_id + '/', 1)[1] in files
        for j, word in enumerate(vocabulary[str(i)], 1):
            word.setdefault('id', f'{course_id}-{i}-{j}')
        questions = quizzes[str(i)]['questions']
        assert len(questions) == 5
        for q in questions:
            assert len(q['options']) == 4
            assert sum(o['key'] == q['answer'] for o in q['options']) == 1
    for name, text in files.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding='utf-8', newline='\n')
    write_json(dest / 'episodes.json', episodes)
    write_json(dest / 'vocabulary.json', vocabulary)

movies_file = root / 'data/movies/harry-potter/movies.json'
movies = json.loads(movies_file.read_text(encoding='utf-8'))
movie = next(m for m in movies['sources'] if m['id'] == 'harry-potter-goblet-of-fire')
movie['studyCourse'] = {'seriesId': course_id, 'episodeCount': 20}
write_json(movies_file, movies)
write_json(dest / 'series.json', {
    'seriesId': course_id,
    'seriesTitle': movie['title'],
    'seriesTitleZh': movie['titleZh'] + ' · 剧情分集学习',
    'level': 5, 'language': 'en', 'status': 'completed', 'totalEpisodes': 20,
    'description': '20 个剧情章节，包含英文字幕、100 个词汇和 100 道剧情理解题。中文字幕尚未提供；媒体播放依赖上游服务。',
    'coverImage': movie['cover'], 'movieId': movie['id'],
    'subtitleStatus': 'english-ready; chinese-translation-pending'
})
config = root / 'netlify.toml'
text = config.read_text(encoding='utf-8')
if f'/data/{course_id}/hls/*' not in text:
    text += f'\n[[headers]]\n  for = "/data/{course_id}/hls/*"\n  [headers.values]\n    Content-Type = "application/vnd.apple.mpegurl"\n'
    config.write_text(text, encoding='utf-8', newline='\n')
(dest / 'PUBLICATION.md').write_text(
    '# Publication integration\n\n'
    'Imported from the user-supplied harry-potter-4-course-draft.zip. '
    '20 lessons are published with English subtitles, Words, Games and Quiz. '
    'No Chinese subtitle track is claimed. Original QA-report.md describes the package-generation stage; '
    'publication status is recorded by the repository commit and Netlify deploy. '
    'Upstream media decoding and browser playback are not certified by the package structural checks.\n',
    encoding='utf-8', newline='\n')
print('Imported 20 lessons; registered movie studyCourse; preserved original full-movie sources.')
