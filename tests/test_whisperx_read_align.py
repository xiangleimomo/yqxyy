#!/usr/bin/env python3
"""Offline unit tests; WhisperX/audio downloads are NOT needed."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("whisperx_read_pilot",ROOT/"scripts/whisperx-read-align.py")
pilot=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


class PilotReadTests(unittest.TestCase):
    def test_read_text_removes_only_repeated_title_not_spoken_words(self):
        episode={"title":"The Scared Boy"}
        lesson={"title":"The Scared Boy","paragraphs":[
            {"text":"Wukong asked, “Where is the Tang Monk?”"},
            {"text":"The Scared Boy The Scared Boy"}]}
        self.assertEqual(pilot.words_from_read(episode,lesson)[-5:],["“Where","is","the","Tang","Monk?”"])
        actual=json.loads((ROOT/"data/journey-to-the-west/reading-lessons.json").read_text())
        ep={"title":actual["48"]["title"]}
        words=pilot.words_from_read(ep,actual["48"])
        self.assertGreater(len(words),500)
        self.assertNotEqual(words[-1].lower(),"boy")

    def test_strip_standalone_markdown_markers_from_read(self):
        episode={"title":"The Monkey"}
        lesson={"title":"The Monkey","paragraphs":[{"text":"Hello * * * Wukong said hello."}]}
        self.assertEqual(pilot.words_from_read(episode,lesson),["Hello","Wukong","said","hello."])

    def test_mapping_against_transcript_with_one_misheard_name(self):
        read=["The","monkey","Wukong","went","home.","The","boy","laughed."]
        asr=[{"start":1,"end":2.5,"text":"The monkey Wu Kong went home."},
             {"start":3,"end":4,"text":"The boy laughed."}]
        corrected,metrics=pilot.correct_segments(read,asr)
        self.assertGreater(metrics["readRecognizedFraction"],.7)
        self.assertEqual(metrics["readWordsAssigned"],8)
        self.assertEqual(len(corrected),2)
        self.assertIn("Wukong",corrected[0]["text"])

    def test_never_fabricate_full_missing_half_video(self):
        read=["Wukong","woke","up.","The","monk","slept."]+["missing"]*50
        asr=[{"start":11,"end":13,"text":"Wukong woke up."}]
        corrected,metrics=pilot.correct_segments(read,asr)
        self.assertLess(metrics["readRecognizedFraction"],.2)
        self.assertLess(metrics["readAssignedFraction"],.2)
        self.assertEqual(len(corrected),1)

    def test_alignment_preserves_real_times_and_short_gap_only(self):
        read=["Wukong","was","very","happy.","A","big","tiger","appeared."]
        aligned=[{"words":[
          {"word":"Wukong","start":10,"end":10.4,"score":.9},
          {"word":"was","start":10.5,"end":10.7,"score":.8},
          {"word":"happy.","start":11,"end":11.4,"score":.9},
          {"word":"A","start":12,"end":12.1,"score":.8},
          {"word":"big","start":12.2,"end":12.5,"score":.8},
          {"word":"tiger","start":12.6,"end":13,"score":.8},
          {"word":"appeared.","start":13.1,"end":13.5,"score":.9}]}]
        words,stats=pilot.aligned_to_read(read,aligned,18000)
        self.assertEqual(stats["forcedAlignedWords"],7)
        self.assertEqual(stats["shortGapEstimatedWords"],1)
        self.assertEqual(words[2]["source"],"estimated")
        self.assertEqual(words[2]["startMs"],10700)
        self.assertEqual(words[2]["endMs"],11000)
        self.assertEqual(pilot.split_cues(words)[0]["text"],"Wukong was very happy.")


    def test_rescue_only_a_few_short_bounded_gaps(self):
        read=["The","Monkey","is","here."]
        aligned=[
            {"text":"The","startMs":1000,"endMs":1300,"source":"speech"},
            None,
            {"text":"is","startMs":2700,"endMs":2900,"source":"speech"},
            {"text":"here.","startMs":3000,"endMs":3400,"source":"speech"}
        ]
        self.assertEqual(pilot.fill_rare_verified_gaps(aligned,read),1)
        self.assertEqual(aligned[1]["source"],"estimated")
        self.assertEqual(aligned[1]["startMs"],1300)
        self.assertEqual(aligned[1]["endMs"],2700)
        bad=[
            {"text":"The","startMs":1000,"endMs":1300,"source":"speech"},
            None,
            {"text":"is","startMs":8000,"endMs":8200,"source":"speech"},
            {"text":"here.","startMs":8400,"endMs":8600,"source":"speech"}
        ]
        self.assertEqual(pilot.fill_rare_verified_gaps(bad,read),0)
        self.assertIsNone(bad[1])


    def test_long_word_span_is_quarantined_not_counted_as_safe_alignment(self):
        words=[
            {"text":"Wukong","startMs":2600,"endMs":14600,"source":"speech"},
            {"text":"led","startMs":14700,"endMs":14900,"source":"speech"}
        ]
        issues=pilot.suspicious_word_spans(words)
        self.assertEqual(len(issues),1)
        self.assertEqual(issues[0]["word"],"Wukong")
        self.assertEqual(issues[0]["durationMs"],12000)


    def test_pilot_uses_actual_hls_and_never_reads_old_vtt(self):
        script=(ROOT/"scripts/whisperx-read-align.py").read_text()
        self.assertNotIn("parse_vtt",script)
        self.assertNotIn("subtitle_vtt",script)
        media={"video":{"hlsUrl":"https://cdn.littlefox.com/media/a.m3u8",
                        "backupHlsUrl":"https://cdn.littlefox.co.kr/media/b.m3u8",
                        "directUrl":"https://evil.example/a.m3u8"}}
        self.assertEqual(list(pilot.media_candidates(media)),[
          "https://cdn.littlefox.com/media/a.m3u8",
          "https://cdn.littlefox.co.kr/media/b.m3u8"])

    def test_candidate_output_compatible_with_web_word_sync(self):
        import tempfile
        words=[{"text":"The","startMs":1000,"endMs":1400,"source":"speech"},
               {"text":"Monkey","startMs":1401,"endMs":1800,"source":"speech"},
               {"text":"laughed.","startMs":1801,"endMs":2400,"source":"speech"}]
        with tempfile.TemporaryDirectory() as temp:
            n=pilot.write_candidate(Path(temp),"journey-to-the-west",24,[w["text"] for w in words],words,
               {"forcedAlignedWords":3,"forcedAlignedFraction":1.0},"/media.m3u8","small.en")
            self.assertEqual(n,1)
            vtt=(Path(temp)/"024.vtt").read_text()
            data=json.loads((Path(temp)/"024.words.json").read_text())
            self.assertTrue(vtt.startswith("WEBVTT"))
            self.assertIn("00:00:01.000 --> 00:00:02.400",vtt)
            self.assertEqual(data["cueCount"],1)
            self.assertEqual(data["cues"][0]["words"][0]["startMs"],1000)


if __name__=="__main__":
    unittest.main(verbosity=2)
