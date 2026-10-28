const assert=require('node:assert/strict');const {repairText}=require('../scripts/repair-subtitle-controls.cjs');
const original='WEBVTT\n\n1\n00:00:00.100 --> 00:00:02.500\nHello.\n\n2\n00:00:02.501 --> 00:00:15.000\n[caption_out@\n\n3\n00:00:15.001 --> 00:00:18.000\nGoodbye.\n';const r=repairText(original);assert.equal(r.removed,1);assert(!r.text.includes('caption_out'));assert(r.text.includes('00:00:00.100 --> 00:00:02.500\nHello.'));assert(r.text.includes('00:00:15.001 --> 00:00:18.000\nGoodbye.'));assert.equal(repairText(r.text).removed,0);assert.equal(repairText(r.text).text,r.text);console.log('PASS: remove non-speech clear commands, preserve all speech text/times, idempotent');

assert.equal(require('../scripts/import-recent-xet-vtt.cjs').clean('[caption_out@'),'');
