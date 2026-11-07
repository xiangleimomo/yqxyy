'use strict';
// Rebuild the 34 reviewed lessons without copying upstream movie media or keys.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../data/movie-harry-potter-1');
const round = n => Math.round(n * 1000000) / 1000000;
async function load(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const text = await response.text();
  assert(text.startsWith('#EXTM3U'), `Not HLS: ${url}`);
  return text;
}
function parse(text, url) {
  assert(text.includes('#EXT-X-ENDLIST'), 'Only complete VOD playlists are supported');
  assert(!/#EXT-X-(MAP|BYTERANGE|DISCONTINUITY)/.test(text), 'Review unsupported stream layout');
  let time = 0, duration, key;
  const sequence = Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] || 0);
  const rows = [];
  for (const line of text.split(/\r?\n/).map(s => s.trim())) {
    if (line.startsWith('#EXT-X-KEY:')) key = line.replace(/URI="([^"]+)"/, (_, uri) => `URI="${new URL(uri, url).href}"`);
    else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#')) {
      assert(duration > 0, 'Missing segment duration');
      rows.push({start: time, end: time + duration, duration, key, uri: new URL(line, url).href, sequence: sequence + rows.length});
      time += duration;
      duration = undefined;
    }
  }
  return rows;
}
function playlist(rows, startOffset) {
  assert(rows.length, 'Empty lesson');
  const out = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...rows.map(r => r.duration)))}`,
    `#EXT-X-MEDIA-SEQUENCE:${rows[0].sequence}`,
    `#EXT-X-START:TIME-OFFSET=${round(startOffset)},PRECISE=YES`];
  let key;
  for (const row of rows) {
    if (row.key !== key) {
      if (row.key) out.push(row.key);
      key = row.key;
    }
    out.push(`#EXTINF:${round(row.duration)},`, row.uri);
  }
  return out.concat('#EXT-X-ENDLIST', '').join('\n');
}
const seconds = value => value.split(':').reduce((a, b) => a * 60 + Number(b), 0);
function timestamp(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
async function main() {
  const file = path.join(dir, 'episodes.json');
  const episodes = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(episodes.length, 34);
  const source = episodes[0].video.originalHlsUrl || episodes[0].video.hlsUrl;
  const master = await load(source);
  const videoLine = master.split(/\r?\n/).find(line => line && !line.startsWith('#'));
  const audioLine = master.split(/\r?\n/).find(line => line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO') && line.includes('DEFAULT=YES'));
  assert(videoLine && audioLine, 'Expected separate default audio and video');
  const videoUrl = new URL(videoLine, source).href;
  const audioUrl = new URL(audioLine.match(/URI="([^"]+)"/)[1], source).href;
  const [videoText, audioText] = await Promise.all([load(videoUrl), load(audioUrl)]);
  const video = parse(videoText, videoUrl), audio = parse(audioText, audioUrl);
  const stream = master.split(/\r?\n/).find(line => line.startsWith('#EXT-X-STREAM-INF:')).replace(/,SUBTITLES="[^"]+"/, '');
  const fullVtt = fs.readFileSync(path.join(dir, 'subtitles/full-film.en.vtt'), 'utf8');
  const cues = fullVtt.replace(/^\uFEFF/, '').split(/\r?\n\s*\r?\n/).flatMap(block => {
    const lines = block.split(/\r?\n/);
    const index = lines.findIndex(line => line.includes(' --> '));
    if (index < 0) return [];
    const match = lines[index].match(/^(\d+:\d+:\d+\.\d+) --> (\d+:\d+:\d+\.\d+)(.*)$/);
    assert(match, 'Unsupported VTT timestamp');
    return [{start: seconds(match[1]), end: seconds(match[2]), settings: match[3], text: lines.slice(index + 1).join('\n')}];
  });
  fs.mkdirSync(path.join(dir, 'hls'), {recursive: true});
  const chapters = [];
  for (const episode of episodes) {
    const v = episode.video;
    const start = v.originalStart ?? v.clipStart, end = v.originalEnd ?? v.clipEnd;
    assert(end > start && end <= video.at(-1).end, 'Invalid chapter bounds');
    const videoRows = video.filter(r => r.end > start + 0.000001 && r.start < end - 0.000001);
    const base = videoRows[0].start;
    // Both renditions retain their original sequence numbers and MPEG-TS PTS.
    // Include the audio covering the complete selected video segment range.
    const audioRows = audio.filter(r => r.end > base + 0.000001 && r.start < videoRows.at(-1).end - 0.000001);
    const id = String(episode.episodeId).padStart(3, '0');
    fs.writeFileSync(path.join(dir, `hls/${id}.video.m3u8`), playlist(videoRows, start - base));
    fs.writeFileSync(path.join(dir, `hls/${id}.audio.m3u8`), playlist(audioRows, start - audioRows[0].start));
    fs.writeFileSync(path.join(dir, `hls/${id}.m3u8`), ['#EXTM3U', '#EXT-X-VERSION:3',
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="${id}.audio.m3u8"`,
      stream, `${id}.video.m3u8`, ''].join('\n'));
    const selected = cues.filter(c => c.end > start && c.start < end);
    assert(selected.length, `No subtitles for chapter ${id}`);
    fs.writeFileSync(path.join(dir, `subtitles/${id}.vtt`), 'WEBVTT\n\n' + selected.map(c =>
      `${timestamp(Math.max(c.start, start) - base)} --> ${timestamp(Math.min(c.end, end) - base)}${c.settings}\n${c.text}\n`).join('\n'));
    Object.assign(v, {hlsUrl: `/data/movie-harry-potter-1/hls/${id}.m3u8`, originalHlsUrl: source,
      originalStart: start, originalEnd: end, timelineOrigin: round(base),
      clipStart: round(start - base), clipEnd: round(end - base), duration: round(end - start)});
    chapters.push({episodeId: episode.episodeId, start, end, timelineOrigin: round(base), firstVideoSegment: videoRows[0].sequence, videoSegments: videoRows.length, firstAudioSegment: audioRows[0].sequence, audioSegments: audioRows.length});
  }
  fs.writeFileSync(file, JSON.stringify(episodes, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'hls/manifest.json'), JSON.stringify({source, chapters}, null, 2) + '\n');
  console.log('Generated 34 independent lesson masters, 68 media playlists and 34 local-timeline VTT files.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
