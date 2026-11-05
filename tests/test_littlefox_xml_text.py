#!/usr/bin/env python3
"""XML transcription checks do not require an internet connection or WhisperX."""
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("littlefox_xml_text",ROOT/"scripts/lib/littlefox_xml_text.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def fixture(lines,wrong_times=False):
    parts=["<?xml version='1.0' encoding='utf-8'?><Subtitle>"]
    for index,line in enumerate(lines,1):
        # Do not look at any of these timestamps; they are deliberately nonsense.
        start=987654321 if wrong_times else index*10000
        from xml.sax.saxutils import escape
        parts.append(f"<Paragraph><Number>{index}</Number><StartMilliseconds>{start}</StartMilliseconds>"
                     f"<EndMilliseconds>{start-5000}</EndMilliseconds><Text>{escape(line)}</Text></Paragraph>")
    parts.append("</Subtitle>")
    return "".join(parts).encode("utf-8")

TEXT=["The old farmer said, 'Please come in!' It is safe here.",
      "Wukong smiled. 'Are you ready?' he asked the traveler.",
      "The next morning, the two friends rode away together."]

class OfficialXmlTextTests(unittest.TestCase):
    def test_punctuation_from_official_xml_only(self):
        result=mod.parse_text_only(fixture(TEXT,wrong_times=True))
        self.assertIn("'Please",result["words"])
        self.assertIn("in!'",result["words"])
        self.assertEqual(result["paragraphs"],3)

    def test_xml_time_values_do_not_affect_text(self):
        a=mod.parse_text_only(fixture(TEXT,False))
        b=mod.parse_text_only(fixture(TEXT,True))
        self.assertEqual(a["words"],b["words"])
        self.assertEqual(a["sha256"],b["sha256"])

    def test_g_i_formatting_tags_are_not_spoken_words(self):
        self.assertEqual(mod.spoken_tokens("[g@He ate a peach.@g] [i@Hello!@i]"),
                         ["He","ate","a","peach.","Hello!"])

    def test_wrong_content_or_incomplete_transcript_is_rejected(self):
        with self.assertRaises(ValueError):
            mod.parse_text_only(b"<html><body>Not captions</body></html>")
        with self.assertRaises(ValueError):
            mod.parse_text_only(b"<!DOCTYPE foo><Subtitle/>")

    def test_nonspoken_scene_marker_and_n_break_code_are_removed(self):
        sample=mod.spoken_tokens("The[n@monkey spoke. *** And[n@]then ran! — ")
        self.assertEqual(sample,["The","monkey","spoke.","And","then","ran!"])
        source=fixture(["The[n@monkey spoke. *** "+TEXT[0],"And[n@]then ran! "+TEXT[1],TEXT[2]])
        actual=mod.parse_text_only(source)["words"]
        self.assertNotIn("[n@",' '.join(actual))
        self.assertNotIn("***",actual)

if __name__=="__main__":
    unittest.main()
