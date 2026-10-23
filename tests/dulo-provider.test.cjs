// SPDX-License-Identifier: AGPL-3.0-only
const assert = require('node:assert/strict');
const {createDuloProvider, mediaUrl} = require('../source-lab/dulo-provider.cjs');
const p = {id:'dulo',name:'Dulo · 主资源',kind:'dulo'};
const source = 'https://zcdn.bluevelvet.space/play/test_token/master.m3u8';
for (const bad of ['https://evil.test/play/a/master.m3u8','http://zcdn.bluevelvet.space/play/a/master.m3u8','https://user@zcdn.bluevelvet.space/play/a/master.m3u8','https://zcdn.bluevelvet.space:444/play/a/master.m3u8','https://zcdn.bluevelvet.space/other/a/master.m3u8','https://zcdn.bluevelvet.space/play/a/master.m3u8?url=https://evil.test']) assert.equal(mediaUrl(bad),'');
assert.equal(mediaUrl(source),source);
(async()=>{
 let ready = true, invalidUrl = false, cdnCalls = 0, calls=[];
 const adapter = createDuloProvider(async r=>{assert(r.ok);return r.text();},async (raw,options)=>{
  const u=new URL(raw);calls.push(u);
  assert.equal(options.redirect,'error');
  if(u.origin==='https://zcdn.bluevelvet.space'){
   assert.equal(u.pathname,'/cdn');cdnCalls++;
   if(u.searchParams.get('type')==='tv') {assert.equal(u.searchParams.get('season'),'1');assert.equal(u.searchParams.get('episode'),'1');}
   return new Response(JSON.stringify({ready,url:invalidUrl?'https://evil.test/video.m3u8':source}));
  }
  assert.equal(u.origin,'https://v3-cinemeta.strem.io');
  const tv=u.pathname.includes('/series/');
  const meta={id:tv?'tt1234568':'tt1234567',imdb_id:tv?'tt1234568':'tt1234567',name:tv?'Frozen Show':'Frozen',type:tv?'series':'movie',releaseInfo:'2013',year:2013,moviedb_id:tv?'234':'123'};
  if(u.pathname.includes('/catalog/')) {assert(u.pathname.includes('search=Frozen')); return new Response(JSON.stringify({metas:[meta]}));}
  return new Response(JSON.stringify({meta}));
 });
 const rows=await adapter.search(p,'冰雪奇缘');
 assert.equal(rows.length,2);assert.equal(rows[0].providerId,'dulo');
 assert.equal(rows[0].language,'unknown','Do not infer audio language from a title');
 assert.equal(rows[0].websiteUrl,'https://dulo.mov/watch/movie/123');
 assert.equal(rows[0].episodes.length,0,'Resolve links fresh when the user selects a result');
 const before=cdnCalls;
 const detail=await adapter.detail(p,rows[0].id);
 assert.equal(cdnCalls,before+1);assert.equal(detail.episodes[0].url,source);
 const tv=await adapter.detail(p,rows[1].id);assert.equal(tv.episodes[0].label,'S01E01');assert(tv.remarks.includes('第1季第1集'));
 const count=calls.length;
 for(const id of ['https://evil.test','movie:123:tt1234567/../../x','movie:abc:tt1234567','tv:1:evil']) await assert.rejects(adapter.detail(p,id),/编号无效/);
 assert.equal(calls.length,count,'Reject client-controlled URLs before any request');
 await assert.rejects(adapter.detail(p,'movie:999:tt1234567'),/不匹配/);
 ready=false;assert.equal((await adapter.detail(p,rows[0].id)).episodes.length,0);
 ready=true;invalidUrl=true;assert.equal((await adapter.detail(p,rows[0].id)).episodes.length,0);
 console.log('PASS: Dulo aliases, movie/TV matching, public fixed-host lookup, honest language, S01E01 labels, fresh links, unready sources, hostile URLs and ID binding');
})().catch(e=>{console.error(e);process.exitCode=1;});
