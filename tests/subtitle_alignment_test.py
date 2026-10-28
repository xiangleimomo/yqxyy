import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'/'lib'))
from subtitle_alignment import *
class AlignmentTest(unittest.TestCase):
 def test_actual_speech_shift_preserves_words(self):
  sentences=['The red dragon flew away.','A blue bird landed nearby.','Our little dog ran home.','Those brave children found treasure.','Her good friend opened doors.','They all lived happily afterward.']
  cues=[];words=[]
  for i,sentence in enumerate(sentences):
   cues.append(dict(startMs=i*4000,endMs=i*4000+3000,text=sentence))
   for j,word in enumerate(sentence.split()):words.append(dict(word=word,start=(i*4000+12200+j*350)/1000,end=(i*4000+12500+j*350)/1000,probability=.99))
  result,report=align_cues(cues,words,40000)
  self.assertGreater(report['offsetMs'],10000)
  self.assertEqual([r['text'] for r in result],sentences)
  for r,w in zip(result,[words[i*5] for i in range(6)]):self.assertAlmostEqual(r['startMs'],w['start']*1000-120,delta=1)
 def test_unrelated_audio_fails_closed(self):
  with self.assertRaises(ValueError):align_cues([dict(startMs=0,endMs=5000,text='A completely different story.')],[dict(word='Bananas',start=1,end=2,probability=.99)],5000)
 def test_vtt_round_trip(self):
  cues=[dict(startMs=123,endMs=4000,text='Hello, world!')]
  self.assertEqual(parse_vtt(to_vtt(cues)),cues)
if __name__=='__main__':unittest.main()
