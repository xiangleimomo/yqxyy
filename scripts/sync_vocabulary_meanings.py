"""Fill generated vocabulary meanings from matching locally imported word entries.

The script never invents translations: it copies the most common existing Chinese
meaning for the exact same English word across the course catalog.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def key(value: object) -> str:
    return str(value or "").strip().lower()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    files = sorted(ROOT.glob("data/*/vocabulary.json"))
    meanings: dict[str, Counter[str]] = defaultdict(Counter)
    for path in files:
        for words in load(path).values():
            for word in words:
                meaning = word.get("meaningZh") or word.get("meaning")
                if meaning and meaning != "待补充":
                    meanings[key(word.get("word"))][meaning] += 1

    updated = 0
    remaining = 0
    for path in files:
        vocabulary = load(path)
        changed = False
        for words in vocabulary.values():
            for word in words:
                if word.get("meaningZh") != "待补充":
                    continue
                candidates = meanings.get(key(word.get("word")))
                if candidates:
                    word["meaningZh"] = candidates.most_common(1)[0][0]
                    word["source"] = "synced-local-vocabulary"
                    updated += 1
                    changed = True
                else:
                    remaining += 1
        if changed:
            dump(path, vocabulary)
    print(json.dumps({"updated": updated, "remaining": remaining}, ensure_ascii=False))


if __name__ == "__main__":
    main()
