#!/usr/bin/env python3
"""Select only recoverable failures, never new or already-published episodes."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("primary_manifest", ROOT / "scripts/manifest-whisperx-read.py")
primary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(primary)

def recoverable(reason):
    s = reason.lower()
    return any(token in s for token in (
        "ffmpeg installation failed", "whisperx dependency installation failed",
        "whisperx environment verification failed", "handshake operation timed out",
        "remotedisconnected", "connection reset", "http error 403", "rate limit exceeded",
    ))

def select(limit=10):
    if not 1 <= limit <= 10:
        raise ValueError("Recovery batch must contain 1-10 episodes")
    failures_path = ROOT / "reports/whisperx-read-failures.json"
    failures = json.loads(failures_path.read_text(encoding="utf-8")).get("failures", []) if failures_path.is_file() else []
    attempts = {}
    history = ROOT / "reports/whisperx-recovery-batches"
    if history.is_dir():
        for report in history.glob("*.json"):
            try:
                past = json.loads(report.read_text(encoding="utf-8"))
                for row in past.get("failures", []) + past.get("success", []):
                    key = (row["seriesId"], int(row["episodeId"]))
                    attempts[key] = attempts.get(key, 0) + 1
            except (OSError, ValueError, KeyError, TypeError):
                continue
    lessons = []
    held = []
    seen = set()
    for item in failures:
        sid, eid = item.get("seriesId"), item.get("episodeId")
        try:
            eid = int(eid)
        except (TypeError, ValueError):
            continue
        key = (sid, eid)
        if key in seen:
            continue
        seen.add(key)
        if attempts.get(key, 0) >= 2 or not recoverable(str(item.get("reason", ""))):
            held.append(key)
            continue
        directory = ROOT / "data" / str(sid)
        try:
            episodes = json.loads((directory / "episodes.json").read_text(encoding="utf-8"))
            episode = next(x for x in episodes if int(x["episodeId"]) == eid)
        except (OSError, ValueError, KeyError, StopIteration, TypeError):
            held.append(key)
            continue
        if primary.existing_new_version(directory, eid, episode):
            continue
        if not primary.source_ok(episode):
            held.append(key)
            continue
        source_id = episode.get("sourceContentId")
        if not isinstance(source_id, str) or not __import__("re").fullmatch(r"C[0-9]{7}", source_id):
            held.append(key)
            continue
        lessons.append({"seriesId": sid, "episodeId": eid, "sourceContentId": source_id})
    lessons.sort(key=lambda x: (x["seriesId"], x["episodeId"]))
    return {"pipeline": "audio-whisperx-xml-text-only-forced-alignment",
            "usesExistingSiteSubtitlesAsInput": False, "batchSize": limit,
            "selected": min(len(lessons), limit), "lessons": lessons[:limit],
            "stats": {"recoverable": len(lessons), "heldForDiagnosis": len(held)}}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--output", default="whisperx-batch-targets.json")
    args = parser.parse_args()
    result = select(args.limit)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"selected": result["selected"], **result["stats"]}))
