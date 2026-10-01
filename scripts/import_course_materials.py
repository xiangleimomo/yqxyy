"""Import Little Fox vocabulary and quiz PDFs into the site's JSON course packs.

Usage: python scripts/import_course_materials.py "C:/path/to/little fox"
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "been", "but", "can", "come", "could", "did", "does", "from", "have", "into", "just", "like", "more", "not", "now", "out", "over", "said", "some", "that", "the", "their", "then", "there", "they", "this", "was", "were", "what", "when", "which", "will", "with", "would", "your",
}
HEADER = re.compile(r"^(.+?)\s+(\d+)\s*:\s*(.+)$")
ITEM = re.compile(r"^\d+\.$")
OPTION = re.compile(r"^([ABC])\.\s*(.*)$")
FOOTER = re.compile(r"^\d+\s*/\s*\d+$")


def dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def lines_from_page(page) -> list[str]:
    raw = page.extract_text() or ""
    return [re.sub(r"\s+", " ", line).strip() for line in raw.splitlines() if line.strip()]


def pdf_kind_and_title(path: Path) -> tuple[str | None, str]:
    stem = re.sub(r"^\d+\.*\s*", "", path.stem)
    match = re.search(r"-(words|vocab|quiz)(?:\s*\d+)?$", stem, re.I)
    if not match:
        return None, stem
    kind = "quiz" if match.group(1).lower() == "quiz" else "words"
    return kind, stem[:match.start()].strip(" -.")


def level_from_path(path: Path) -> int | None:
    match = re.search(r"Level0*(\d+)", str(path), re.I)
    return int(match.group(1)) if match else None


def parse_words(path: Path) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = defaultdict(list)
    current_episode: str | None = None
    blocks: list[list[str]] = []
    current: list[str] | None = None

    def flush() -> None:
        nonlocal current
        if current_episode and current:
            blocks.append(current)
        current = None

    def flush_blocks() -> None:
        nonlocal blocks
        if not current_episode:
            blocks = []
            return
        for block in blocks:
            chinese_at = next((i for i, text in enumerate(block) if re.search(r"[\u3400-\u9fff]", text)), None)
            if chinese_at is None:
                continue
            word = " ".join(block[:chinese_at]).strip(" -")
            meaning_parts, example_parts = [], []
            after_chinese = False
            for text in block[chinese_at:]:
                if re.search(r"[\u3400-\u9fff]", text) and not after_chinese:
                    meaning_parts.append(text)
                else:
                    after_chinese = True
                    example_parts.append(text)
            word = re.sub(r"\s+", " ", word)
            if re.search(r"[A-Za-z]", word) and len(word) <= 90:
                result[current_episode].append({
                    "word": word,
                    "meaningZh": " ".join(meaning_parts),
                    "example": " ".join(example_parts),
                    "source": "local-pdf",
                })
        blocks = []

    for page in PdfReader(str(path)).pages:
        for line in lines_from_page(page):
            header = HEADER.match(line)
            if header:
                flush()
                flush_blocks()
                current_episode = header.group(2)
                continue
            if FOOTER.match(line):
                continue
            if ITEM.match(line):
                flush()
                current = []
            elif current is not None:
                current.append(line)
    flush()
    flush_blocks()
    return {key: value for key, value in result.items() if value}


def parse_quiz(path: Path) -> dict[str, dict]:
    result: dict[str, dict] = {}
    current_episode: str | None = None
    current_title = ""
    blocks: list[list[str]] = []
    current: list[str] | None = None

    def flush() -> None:
        nonlocal current
        if current_episode and current:
            blocks.append(current)
        current = None

    def flush_blocks() -> None:
        nonlocal blocks
        if not current_episode:
            blocks = []
            return
        questions = []
        for index, block in enumerate(blocks, 1):
            markers = [i for i, value in enumerate(block) if OPTION.match(value)]
            if len(markers) < 3:
                continue
            question = " ".join(block[:markers[0]]).strip()
            options = []
            for marker_index, marker in enumerate(markers[:3]):
                end = markers[marker_index + 1] if marker_index + 1 < len(markers) else len(block)
                option_match = OPTION.match(block[marker])
                text = " ".join([option_match.group(2), *block[marker + 1:end]]).strip()
                options.append({"key": option_match.group(1), "text": text})
            if question and all(option["text"] for option in options):
                questions.append({
                    "id": f"q{index}", "type": "single-choice", "category": "reading",
                    "question": question, "options": options, "answer": "A",
                    "explanation": "根据本集故事内容选择正确答案。", "source": "local-pdf",
                })
        if questions:
            result[current_episode] = {"episodeId": int(current_episode), "title": f"{current_title} Quiz", "questions": questions}
        blocks = []

    for page in PdfReader(str(path)).pages:
        for line in lines_from_page(page):
            header = HEADER.match(line)
            if header:
                flush()
                flush_blocks()
                current_episode, current_title = header.group(2), header.group(3).strip()
                continue
            if FOOTER.match(line):
                continue
            if ITEM.match(line):
                flush()
                current = []
            elif current is not None:
                current.append(line)
    flush()
    flush_blocks()
    return result


def text_for_episode(reading: object) -> str:
    if not isinstance(reading, dict):
        return ""
    paragraphs = reading.get("paragraphs", [])
    return " ".join((part.get("text", "") if isinstance(part, dict) else str(part)) for part in paragraphs)


def generated_words(reading: object) -> list[dict]:
    text = text_for_episode(reading)
    tokens = [word.lower() for word in re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text)]
    ranked = [word for word, _ in Counter(word for word in tokens if word not in STOP_WORDS).most_common(10)]
    result = []
    for word in ranked:
        sentence = next((value.strip() for value in re.split(r"(?<=[.!?])\s+", text) if re.search(rf"\b{re.escape(word)}\b", value, re.I)), "")
        result.append({"word": word, "meaningZh": "待补充", "example": sentence, "source": "generated-from-reading"})
    return result


def generated_quiz(episode_id: int, title: str, reading: object, words: list[dict]) -> dict | None:
    candidates = [item["word"] for item in words if item.get("word")]
    if len(candidates) < 3 or not text_for_episode(reading):
        return None
    questions = []
    for index, word in enumerate(candidates[:3], 1):
        distractors = [item for item in candidates if item != word][:2]
        questions.append({
            "id": f"q{index}", "type": "single-choice", "category": "reading",
            "question": "Which word appears in this lesson?",
            "options": [{"key": "A", "text": word}, {"key": "B", "text": distractors[0]}, {"key": "C", "text": distractors[1]}],
            "answer": "A", "explanation": "请根据本集阅读内容作答。", "source": "generated-from-reading",
        })
    return {"episodeId": episode_id, "title": f"{title} Quiz", "questions": questions}


def main() -> None:
    source_root = Path(sys.argv[1]).resolve()
    series_list = json.loads((ROOT / "data" / "series-list.json").read_text(encoding="utf-8"))
    lookup = {(int(item.get("level", 0)), norm(item["title"])): item for item in series_list}
    imported_words: dict[str, dict] = defaultdict(dict)
    imported_quizzes: dict[str, dict] = defaultdict(dict)
    unmatched = []

    for pdf in sorted(source_root.rglob("*.pdf")):
        kind, title = pdf_kind_and_title(pdf)
        level = level_from_path(pdf)
        if not kind or level is None:
            continue
        series = lookup.get((level, norm(title)))
        if not series:
            unmatched.append(str(pdf.relative_to(source_root)))
            continue
        parsed = parse_words(pdf) if kind == "words" else parse_quiz(pdf)
        if kind == "words":
            for episode_id, entries in parsed.items():
                target = imported_words[series["seriesId"]].setdefault(episode_id, [])
                seen = {norm(item["word"]) for item in target}
                target.extend(item for item in entries if norm(item["word"]) not in seen and not seen.add(norm(item["word"])))
        elif level >= 3:
            for episode_id, quiz in parsed.items():
                imported_quizzes[series["seriesId"]].setdefault(episode_id, quiz)

    report = {"pdfWords": 0, "pdfQuizzes": 0, "generatedWords": 0, "generatedQuizzes": 0, "level0to2QuizCleared": 0, "unmatchedPdfs": unmatched}
    for series in series_list:
        series_id, level = series["seriesId"], int(series.get("level", 0))
        directory = ROOT / "data" / series_id
        episodes_path, reading_path = directory / "episodes.json", directory / "reading-lessons.json"
        if not episodes_path.exists() or not reading_path.exists():
            continue
        episodes = json.loads(episodes_path.read_text(encoding="utf-8"))
        reading = json.loads(reading_path.read_text(encoding="utf-8"))
        vocab_path, quiz_path = directory / "vocabulary.json", directory / "quiz.json"
        vocab = json.loads(vocab_path.read_text(encoding="utf-8")) if vocab_path.exists() else {}
        quiz = json.loads(quiz_path.read_text(encoding="utf-8")) if quiz_path.exists() else {}

        for ep in episodes:
            key, episode_id = str(ep["episodeId"]), int(ep["episodeId"])
            if key in imported_words[series_id]:
                vocab[key] = imported_words[series_id][key]
                report["pdfWords"] += 1
            elif not vocab.get(key):
                generated = generated_words(reading.get(key))
                if generated:
                    vocab[key] = generated
                    report["generatedWords"] += 1
            if len(vocab.get(key, [])) < 3:
                supplements = generated_words(reading.get(key))
                seen_words = {norm(item.get("word", "")) for item in vocab.get(key, [])}
                additions = [item for item in supplements if norm(item["word"]) not in seen_words]
                if additions:
                    vocab.setdefault(key, []).extend(additions)
                    report["generatedWords"] += 1
            if level <= 2:
                if key in quiz: report["level0to2QuizCleared"] += 1
                quiz.pop(key, None)
                ep.setdefault("modules", {})["quiz"] = False
                ep["unlockRequiresQuiz"] = False
            elif key in imported_quizzes[series_id]:
                quiz[key] = imported_quizzes[series_id][key]
                report["pdfQuizzes"] += 1
            elif not quiz.get(key):
                generated = generated_quiz(episode_id, ep.get("title", f"Episode {episode_id}"), reading.get(key), vocab.get(key, []))
                if generated:
                    quiz[key] = generated
                    report["generatedQuizzes"] += 1
                ep.setdefault("modules", {})["quiz"] = bool(generated)
                ep["unlockRequiresQuiz"] = False
        dump(vocab_path, vocab)
        dump(quiz_path, quiz)
        dump(episodes_path, episodes)

    dump(ROOT / "data" / "material-import-report.json", report)
    print(json.dumps({key: (len(value) if isinstance(value, list) else value) for key, value in report.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
