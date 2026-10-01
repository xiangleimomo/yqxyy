"""Translate missing Little Fox vocabulary meanings and example sentences to Chinese.

Existing imported Chinese meanings are retained. Only generated placeholders and
missing example translations are filled. Run with the bundled Python runtime.
"""
from __future__ import annotations

import json
from pathlib import Path

import argostranslate.translate


ROOT = Path(__file__).resolve().parents[1]
SEPARATOR = "\ue000"
MAX_BATCH_CHARS = 16000
CACHE_PATH = ROOT / "data" / ".vocabulary-translation-cache.json"
TRANSLATION = None


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def batches(items: list[str]):
    batch: list[str] = []
    size = 0
    for item in items:
        next_size = size + len(item) + len(SEPARATOR) + 2
        if batch and next_size > MAX_BATCH_CHARS:
            yield batch
            batch, size = [], 0
        batch.append(item)
        size += len(item) + len(SEPARATOR) + 2
    if batch:
        yield batch


def translate_batch(items: list[str]) -> dict[str, str]:
    global TRANSLATION
    if TRANSLATION is None:
        TRANSLATION = argostranslate.translate.get_translation_from_codes("en", "zh").underlying
        # Initialize the model once before feeding it a large token batch.
        TRANSLATION.hypotheses("warm", 1)
    tokenized = [TRANSLATION.pkg.tokenizer.encode(item) for item in items]
    prefix = [[TRANSLATION.pkg.target_prefix]] * len(tokenized) if TRANSLATION.pkg.target_prefix else None
    translated = TRANSLATION.translator.translate_batch(
        tokenized,
        target_prefix=prefix,
        replace_unknowns=True,
        max_batch_size=16384,
        batch_type="tokens",
        beam_size=1,
        num_hypotheses=1,
        length_penalty=0.2,
        return_scores=True,
    )
    values = []
    for batch in translated:
        value = TRANSLATION.pkg.tokenizer.decode(batch.hypotheses[0]).lstrip()
        if TRANSLATION.pkg.target_prefix and value.startswith(TRANSLATION.pkg.target_prefix):
            value = value[len(TRANSLATION.pkg.target_prefix):]
        values.append(value)
    return dict(zip(items, values))


def translate_all(items: set[str], label: str, cache: dict[str, str]) -> dict[str, str]:
    pending = sorted(item for item in items if item not in cache)
    jobs = list(batches(pending))
    result = {item: cache[item] for item in items if item in cache}
    print(f"{label}: {len(items)} entries; {len(result)} cached; {len(jobs)} batches remaining", flush=True)
    for index, batch in enumerate(jobs, 1):
        translated = translate_batch(batch)
        result.update(translated)
        cache.update(translated)
        if index % 25 == 0 or index == len(jobs):
            dump(CACHE_PATH, cache)
            print(f"{label}: {index}/{len(jobs)} batches", flush=True)
    return result


def main() -> None:
    files = sorted(ROOT.glob("data/*/vocabulary.json"))
    vocabularies = {path: load(path) for path in files}
    missing_words: set[str] = set()
    missing_examples: set[str] = set()
    for vocabulary in vocabularies.values():
        for words in vocabulary.values():
            for word in words:
                if word.get("meaningZh") == "待补充" and word.get("word"):
                    missing_words.add(word["word"])
                if not word.get("exampleZh") and word.get("example"):
                    missing_examples.add(word["example"])

    cache = load(CACHE_PATH) if CACHE_PATH.exists() else {}
    word_translations = translate_all(missing_words, "Words", cache)
    example_translations = translate_all(missing_examples, "Examples", cache)
    filled_words = filled_examples = 0
    for path, vocabulary in vocabularies.items():
        changed = False
        for words in vocabulary.values():
            for word in words:
                if word.get("meaningZh") == "待补充" and word.get("word") in word_translations:
                    word["meaningZh"] = word_translations[word["word"]]
                    word["source"] = "machine-translated-from-reading"
                    filled_words += 1
                    changed = True
                if not word.get("exampleZh") and word.get("example") in example_translations:
                    word["exampleZh"] = example_translations[word["example"]]
                    filled_examples += 1
                    changed = True
        if changed:
            dump(path, vocabulary)
    print(json.dumps({"filledWords": filled_words, "filledExamples": filled_examples}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
