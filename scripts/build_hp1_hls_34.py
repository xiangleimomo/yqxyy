#!/usr/bin/env python3
"""Generate episode-local HLS VOD playlists without downloading or transcoding video."""
import json
import math
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data/movie-harry-potter-1"
SOURCE = "https://api.obj2.top/hls/movie/671/master.m3u8"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=35) as response:
        return response.read().decode("utf-8-sig")


def abs_uri(base, uri):
    return urllib.parse.urljoin(base, uri.strip())


def make_attr_absolute(tag, base):
    return re.sub(r'URI="([^"]+)"', lambda m: 'URI="' + abs_uri(base, m.group(1)) + '"', tag)


def get_media(url, depth=0):
    if depth > 5:
        raise ValueError("HLS master depth exceeded")
    lines = [l.strip() for l in fetch(url).splitlines() if l.strip()]
    if any(x.startswith("#EXT-X-STREAM-INF:") for x in lines):
        variants = []
        for i, line in enumerate(lines):
            if line.startswith("#EXT-X-STREAM-INF:"):
                match = re.search(r'BANDWIDTH=(\d+)', line)
                target = next((x for x in lines[i + 1:] if not x.startswith("#")), None)
                if target:
                    variants.append((int(match.group(1)) if match else 0, abs_uri(url, target), line))
        if not variants:
            raise ValueError("No HLS variants")
        renditions = []
        for line in lines:
            if line.startswith("#EXT-X-MEDIA:") and "TYPE=AUDIO" in line and "URI=" in line:
                group = re.search(r'GROUP-ID="([^"]+)"', line)
                target = re.search(r'URI="([^"]+)"', line)
                language = re.search(r'LANGUAGE="([^"]+)"', line)
                if target:
                    renditions.append((group.group(1) if group else None, abs_uri(url, target.group(1)), language.group(1) if language else ""))
        bandwidth, target, variant = max(variants, key=lambda x: x[0])
        _, _, video_lines, _, _, _ = get_media(target, depth + 1)
        print(f"Master variants={len(variants)}, external audio tracks={len(renditions)}, selected bandwidth={bandwidth}")
        group_match = re.search(r'AUDIO="([^"]+)"', variant)
        wanted_group = group_match.group(1) if group_match else None
        compatible = [x for x in renditions if not wanted_group or x[0] == wanted_group]
        if wanted_group and not compatible:
            raise ValueError(f"Audio group {wanted_group} not available")
        if compatible:
            # Prefer an English track if available, otherwise the first track.
            chosen = next((x for x in compatible if x[2].lower().startswith("en")), compatible[0])
            _, _, audio_lines, _, _, _ = get_media(chosen[1], depth + 1)
            return target, lines, video_lines, chosen[1], audio_lines, variant
        return target, lines, video_lines, None, None, variant
    if not any(x.startswith("#EXTINF:") for x in lines):
        raise ValueError("No playable EXTINF segments")
    return url, None, lines, None, None, None

def segments(url, lines):
    if "#EXT-X-ENDLIST" not in lines:
        raise ValueError("Not a finite video playlist")
    result = []
    duration = 0.0
    media_seq = 0
    disc_seq = 0
    key, init_map = None, None
    pending_duration = None
    pending_range = None
    pending_disc = False
    range_next = {}
    for line in lines:
        if line.startswith("#EXT-X-MEDIA-SEQUENCE:"):
            media_seq = int(line.split(":", 1)[1])
        elif line.startswith("#EXT-X-DISCONTINUITY-SEQUENCE:"):
            disc_seq = int(line.split(":", 1)[1])
        elif line.startswith("#EXT-X-KEY:"):
            key = make_attr_absolute(line, url)
        elif line.startswith("#EXT-X-MAP:"):
            init_map = make_attr_absolute(line, url)
        elif line == "#EXT-X-DISCONTINUITY":
            pending_disc = True
        elif line.startswith("#EXT-X-BYTERANGE:"):
            pending_range = line.split(":", 1)[1]
        elif line.startswith("#EXTINF:"):
            pending_duration = float(line.split(":", 1)[1].split(",")[0])
        elif not line.startswith("#") and pending_duration is not None:
            uri = abs_uri(url, line)
            rng = None
            if pending_range:
                size, _, start = pending_range.partition("@")
                offset = int(start) if start else range_next.get(uri, 0)
                rng = f"#EXT-X-BYTERANGE:{size}@{offset}"
                range_next[uri] = offset + int(size)
            result.append({
                "start": duration, "end": duration + pending_duration,
                "duration": pending_duration, "uri": uri, "key": key,
                "map": init_map, "discontinuity": pending_disc, "byterange": rng,
            })
            duration += pending_duration
            pending_duration = pending_range = None
            pending_disc = False
    if not result:
        raise ValueError("Empty segment list")
    print(f"Source media: segments={len(result)}, seconds={duration:.3f}, encrypted={any(s['key'] for s in result)}, fmp4={any(s['map'] for s in result)}, byterange={any(s['byterange'] for s in result)}")
    return media_seq, disc_seq, result, duration


def write_playlist(path, selected, seq, disc_seq, prior_discontinuities):
    lines = [
        "#EXTM3U", "#EXT-X-VERSION:6" if any(s["map"] for s in selected) else "#EXT-X-VERSION:3",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        f"#EXT-X-TARGETDURATION:{math.ceil(max(s['duration'] for s in selected))}",
        f"#EXT-X-MEDIA-SEQUENCE:{seq}",
    ]
    if disc_seq or prior_discontinuities:
        lines.append(f"#EXT-X-DISCONTINUITY-SEQUENCE:{disc_seq + prior_discontinuities}")
    prev_key = prev_map = None
    for i, seg in enumerate(selected):
        if seg["discontinuity"] and i:
            lines.append("#EXT-X-DISCONTINUITY")
        if seg["key"] and seg["key"] != prev_key:
            lines.append(seg["key"])
        elif not seg["key"] and prev_key:
            lines.append("#EXT-X-KEY:METHOD=NONE")
        if seg["map"] and seg["map"] != prev_map:
            lines.append(seg["map"])
        prev_key, prev_map = seg["key"], seg["map"]
        lines.append(f"#EXTINF:{seg['duration']:.6f},")
        if seg["byterange"]:
            lines.append(seg["byterange"])
        lines.append(seg["uri"])
    lines.append("#EXT-X-ENDLIST")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    url, _master, lines, audio_url, audio_lines, variant = get_media(SOURCE)
    seq, disc_seq, media, duration = segments(url, lines)
    if audio_url:
        audio_seq, audio_disc, audio_media, audio_duration = segments(audio_url, audio_lines)
        print(f"Audio duration={audio_duration:.2f}s vs video duration={duration:.2f}s")
        if abs(audio_duration - duration) > 90:
            raise ValueError("Audio and video duration differ by over 90 seconds")
    else:
        audio_seq = audio_disc = 0
        audio_media = None
    course = json.loads((ROOT / "data/movie-hp1-independent/course.json").read_text(encoding="utf-8"))
    chapters = course["chapters"]
    if len(chapters) != 34:
        raise ValueError("Expected exactly 34 episodes")
    if duration + 1 < chapters[-1]["end"]:
        raise ValueError(f"Media only {duration:.2f}s, expected {chapters[-1]['end']:.2f}s")
    out = DATA / "hls"
    out.mkdir(parents=True, exist_ok=True)
    current = json.loads((DATA / "episodes.json").read_text(encoding="utf-8"))
    by_id = {int(x["episodeId"]): x for x in current}
    updated = []
    cuts = []
    for chapter in chapters:
        id_ = int(chapter["episodeId"])
        start, end = float(chapter["start"]), float(chapter["end"])
        first = next((i for i, s in enumerate(media) if s["end"] > start), None)
        last = next((i for i in range(len(media) - 1, -1, -1) if media[i]["start"] < end), None)
        if first is None or last is None or first > last:
            raise ValueError(f"Episode {id_} has invalid segment range")
        selected = media[first:last + 1]
        local_name = f"{id_:03d}.m3u8"
        prior = sum(1 for s in media[:first] if s["discontinuity"])
        if audio_media:
            write_playlist(out / f"{id_:03d}.video.m3u8", selected, seq + first, disc_seq, prior)
            afirst = next((i for i, s in enumerate(audio_media) if s["end"] > start), None)
            alast = next((i for i in range(len(audio_media)-1, -1, -1) if audio_media[i]["start"] < end), None)
            if afirst is None or alast is None or afirst > alast:
                raise ValueError(f"Episode {id_}: audio segment selection failed")
            selected_audio = audio_media[afirst:alast + 1]
            aprior = sum(1 for s in audio_media[:afirst] if s["discontinuity"])
            write_playlist(out / f"{id_:03d}.audio.m3u8", selected_audio, audio_seq + afirst, audio_disc, aprior)
            stream = re.sub(r',?AUDIO=(?:"[^"]+"|[^,]+)', '', variant or "#EXT-X-STREAM-INF:BANDWIDTH=1500000")
            if stream.endswith(","):
                stream = stream[:-1]
            stream += ',AUDIO="episode-audio"'
            master = [
                "#EXTM3U", "#EXT-X-VERSION:6",
                '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="episode-audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="' + f"{id_:03d}.audio.m3u8" + '"',
                stream, f"{id_:03d}.video.m3u8",
            ]
            (out / local_name).write_text("\n".join(master) + "\n", encoding="utf-8")
        else:
            write_playlist(out / local_name, selected, seq + first, disc_seq, prior)
        ep = by_id.get(id_, {"episodeId": id_})
        ep["title"] = ep["titleZh"] = chapter["titleZh"]
        ep["summaryEn"] = chapter.get("summaryZh", "")
        ep["status"] = "published"
        ep["sourceType"] = "hls"
        ep["video"] = {
            "source": "hls",
            "hlsUrl": f"data/movie-harry-potter-1/hls/{local_name}",
            "duration": round(sum(s["duration"] for s in selected), 4),
        }
        updated.append(ep)
        cuts.append({
            "episodeId": id_, "desiredStart": start, "desiredEnd": end,
            "actualStart": selected[0]["start"], "actualEnd": selected[-1]["end"],
            "segmentCount": len(selected),
        })
    (DATA / "episodes.json").write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "hls-cuts.json").write_text(json.dumps(cuts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {len(updated)} independent HLS episode masters; separate audio={bool(audio_media)}")


if __name__ == "__main__":
    main()
