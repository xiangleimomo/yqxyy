#!/usr/bin/env python3
"""Promote mapped Little Fox 1080P sources while retaining both 720P routes.

Usage:
  python scripts/import-littlefox-1080.py --source "C:\\path\\littlefox_1080_final_merged.xlsx" --apply

The workbook is intentionally treated as a source of exact episode mappings.  It
never manufactures a 1080P URL by changing a 720P URL.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit
from xml.etree import ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def column_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def cell_value(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.get("t")
    if cell_type == "inlineStr":
        return "".join(cell.itertext())
    value = cell.findtext("main:v", default="", namespaces=NS)
    if cell_type == "s" and value:
        return shared[int(value)]
    return value


def workbook_rows(book: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(book) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml")) if "xl/sharedStrings.xml" in archive.namelist() else None
        shared = ["".join(item.itertext()) for item in shared_root] if shared_root is not None else []
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        first_sheet = workbook.find("main:sheets/main:sheet", NS)
        if first_sheet is None:
            raise ValueError("The workbook has no worksheet.")
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_id = first_sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = next((item.get("Target") for item in relationships.findall("pkg:Relationship", NS) if item.get("Id") == rel_id), None)
        if not target:
            raise ValueError("Could not locate the workbook worksheet.")
        sheet_path = "xl/" + target.lstrip("/")
        sheet = ET.fromstring(archive.read(sheet_path))
        raw_rows = []
        for row in sheet.findall(".//main:sheetData/main:row", NS):
            values = {}
            for cell in row.findall("main:c", NS):
                values[column_index(cell.get("r"))] = cell_value(cell, shared)
            raw_rows.append(values)
    if not raw_rows:
        return []
    headers = {index: value.strip() for index, value in raw_rows[0].items() if value.strip()}
    return [{headers[index]: value for index, value in row.items() if index in headers} for row in raw_rows[1:] if row]


def without_query(value: str) -> str:
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))


def international_720(value: str) -> str:
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, "cdn.littlefox.com", parsed.path, parsed.query, ""))


def korea_720(value: str) -> str:
    parsed = urlsplit(value)
    return urlunsplit((parsed.scheme, "cdn.littlefox.co.kr", parsed.path, "", ""))


def target_path(root: Path, source_file: str) -> Path:
    parts = PurePosixPath(source_file.replace("\\", "/")).parts
    try:
        data_at = parts.index("data")
    except ValueError as error:
        raise ValueError(f"Workbook file path does not contain data/: {source_file}") from error
    relative = Path(*parts[data_at:])
    return root / relative


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="The 1080P mapping workbook")
    parser.add_argument("--apply", action="store_true", help="Write the planned JSON updates")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    rows = workbook_rows(args.source)
    required = {"file", "episodeId", "old_url", "new_url"}
    if not rows or not required.issubset(rows[0]):
        raise ValueError(f"Workbook must include columns: {', '.join(sorted(required))}")

    grouped: dict[Path, list[dict[str, str]]] = {}
    for row in rows:
        if not row.get("new_url", "").startswith("https://cdn.littlefox.com/contents_5/hls/1080/"):
            raise ValueError(f"Invalid 1080P URL: {row.get('new_url')}")
        grouped.setdefault(target_path(root, row["file"]), []).append(row)

    changed_files = changed_episodes = already_1080 = missing_episodes = mismatched_720 = 0
    updates: list[tuple[Path, str]] = []
    for path, mappings in grouped.items():
        if not path.is_file():
            raise FileNotFoundError(path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        by_id = {str(item.get("episodeId")): item for item in payload}
        changed = False
        for mapping in mappings:
            episode = by_id.get(str(mapping["episodeId"]))
            if not episode:
                missing_episodes += 1
                continue
            video = episode.get("video") or {}
            current = str(video.get("hlsUrl") or "")
            expected_720 = international_720(mapping["old_url"])
            expected_key = without_query(expected_720)
            current_key = without_query(current)
            if current_key == without_query(mapping["new_url"]):
                already_1080 += 1
                continue
            if current_key != expected_key:
                mismatched_720 += 1
                continue
            video["hls720Url"] = current
            video["hlsUrl"] = mapping["new_url"]
            video["backupHlsUrl"] = korea_720(mapping["old_url"])
            episode["video"] = video
            changed = True
            changed_episodes += 1
        if changed:
            updates.append((path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n"))

    if missing_episodes or mismatched_720:
        raise RuntimeError(f"Mapping validation failed: {missing_episodes} missing episodes, {mismatched_720} non-720 source mismatches.")
    if args.apply:
        for path, content in updates:
            path.write_text(content, encoding="utf-8")
    changed_files = len(updates)
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "workbookRows": len(rows),
        "changedEpisodes": changed_episodes,
        "changedFiles": changed_files,
        "already1080": already_1080,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
