// SPDX-License-Identifier: AGPL-3.0-only
const assert = require('node:assert/strict');
const {createDuloProvider, mediaUrl} = require('../source-lab/dulo-provider.cjs');
const p = {id:'dulo',name:'Dulo · 主资源',kind:'dulo'};
const source = 'https://zcdn.bluevelvet.space/play/test_token/master.m3u8';
for (const bad of ['https://evil.test/play/a/master.m3u8','http://zcdn.bluevelvet.space/play/a/master.m3u8','https://user@zcdn.bluevelvet.space/play/a/master.m3u8','https://zcdn.bluevelvet.space:444/play/a/master.m3u8','https://zcdn.bluevelvet.space/other/a/master.m3u8','https://zcdn.bluevelvet.space/play/a/master.m3u8?url=https://evil.test']) assert.equal(mediaUrl(bad),'');
const current=require('../source-lab/core.js').duloMediaUrl(source);
assert.equal(mediaUrl(source),current);
const opaque='https://zcdn2.6azt0hwr-cf9.workers.dev/play/test_token/~opaque_file-123';
assert.equal(mediaUrl(opaque),opaque.replace('zcdn2.','zcdn1.'));
for(const bad of ['https://evil.test/play/test_token/~opaque','https://zcdn1.6azt0hwr-cf9.workers.dev/play/a/~opaque?url=https://evil.test','https://zcdn1.6azt0hwr-cf9.workers.dev/play/a/~opaque#fragment','https://zcdn1.6azt0hwr-cf9.workers.dev/play/a/unknown.php'])assert.equal(mediaUrl(bad),'');
(async()=>{
 let ready = true, invalidUrl = false, useOpaque = false, cdnCalls = 0, calls=[];
 const adapter = createDuloProvider(async r=>{assert(r.ok);return r.text();},async (raw,options)=>{
  const u=new URL(raw);calls.push(u);
  assert.equal(options.redirect,'error');
  if(u.origin==='https://zcdn1.6azt0hwr-cf9.workers.dev'){
   assert.equal(u.pathname,'/cdn');cdnCalls++;
   if(u.searchParams.get('type')==='tv') {assert.equal(u.searchParams.get('season'),'1');assert.equal(u.searchParams.get('episode'),'1');}
   return new Response(JSON.stringify({ready,url:invalidUrl?'https://evil.test/video.m3u8':useOpaque?opaque:source}));
  }
  assert.equal(u.origin,'https://v3-cinemeta.strem.io');
  const tv=u.pathname.includes('/series/');
  const meta={id:tv?'tt1234568':'tt1234567',imdb_id:tv?'tt1234568':'tt1234567',name:tv?'Frozen Show':'Frozen',type:tv?'series':'movie',releaseInfo:'2013',year:2013,poster:'https://images.test/frozen.jpg',moviedb_id:tv?'234':'123'};
  if(u.pathname.includes('/catalog/')) {assert(u.pathname.includes('search=Frozen')); return new Response(JSON.stringify({metas:[meta]}));}
  return new Response(JSON.stringify({meta}));
 });
 const rows=await adapter.search(p,'冰雪奇缘');
 assert.equal(rows.length,2);assert.equal(rows[0].providerId,'dulo');
 assert.equal(rows[0].language,'unknown','Do not infer audio language from a title');
 assert.equal(rows[0].websiteUrl,'https://dulo.mov/watch/movie/123');
 assert.equal(rows[0].poster,'https://images.test/frozen.jpg');
 assert.equal(rows[0].episodes.length,0,'Resolve links fresh when the user selects a result');
 assert.equal(cdnCalls,0,'Searching must not require a ready playback line');
 const before=cdnCalls;
 const detail=await adapter.detail(p,rows[0].id);
 assert.equal(cdnCalls,before+1);assert.equal(detail.episodes[0].url,current);
 useOpaque=true;assert.equal((await adapter.detail(p,rows[0].id)).episodes[0].url,opaque.replace('zcdn2.','zcdn1.'));useOpaque=false;
 const tv=await adapter.detail(p,rows[1].id);assert.equal(tv.episodes[0].label,'S01E01');assert(tv.remarks.includes('第1季第1集'));
 const count=calls.length;
 for(const id of ['https://evil.test','movie:123:tt1234567/../../x','movie:abc:tt1234567','tv:1:evil']) await assert.rejects(adapter.detail(p,id),/编号无效/);
 assert.equal(calls.length,count,'Reject client-controlled URLs before any request');
 await assert.rejects(adapter.detail(p,'movie:999:tt1234567'),/不匹配/);
 ready=false;assert.equal((await adapter.detail(p,rows[0].id)).episodes.length,0);
 ready=true;invalidUrl=true;assert.equal((await adapter.detail(p,rows[0].id)).episodes.length,0);
 // Reproduce non-aliased Chinese titles, partial Chinese franchise queries,
 // translated English titles, and a failed parallel TV catalogue.
 for (const [query, english] of [['夏日友晴天','Luca'],['寻梦环游记','Coco'],['哈利波特',"Harry Potter and the Sorcerer's Stone"]]) {
  let streamRequests = 0;
  const translated = createDuloProvider(r=>r.text(), async (raw, options)=>{
   const u=new URL(raw);
   if(u.origin==='https://www.wikidata.org') throw Error('Translation unavailable');
   if(u.origin==='https://zcdn1.6azt0hwr-cf9.workers.dev') {streamRequests++;throw Error('CDN unavailable');}
   if(u.pathname.includes('/catalog/series/')) throw Error('TV search timed out');
   const m={id:'tt1234567',imdb_id:'tt1234567',type:'movie',name:english,year:2021,moviedb_id:123};
   if(u.pathname.includes('/catalog/')) return new Response(JSON.stringify({metas:[m]}));
   assert.equal(options.signal.aborted,false,'Metadata must have its own timeout budget');
   return new Response(JSON.stringify({meta:m}));
  });
  const found=await translated.search(p,query);
  assert.equal(found.length,1,query+' should survive translation and TV failure');
  assert.equal(found[0].title,english);
  assert(found[0].remarks.includes('点击试播'));
  assert.equal(streamRequests,0);
 }
 const localized = createDuloProvider(r=>r.text(), async raw=>{
  const u=new URL(raw);
  if(u.hostname==='www.wikidata.org') return new Response(JSON.stringify({search:[{label:'Luca',description:'2021 animated film',display:{label:{value:'Luca'}}}]}));
  if(u.pathname.includes('/catalog/series/')) return new Response(JSON.stringify({metas:[]}));
  if(u.pathname.includes('/catalog/')) {
   assert(u.pathname.includes('search=Luca'),'Resolve the Chinese title before catalogue lookup');
   return new Response(JSON.stringify({metas:[{id:'tt1234567',type:'movie',name:'Luca'}]}));
  }
  return new Response(JSON.stringify({meta:{id:'tt1234567',name:'Luca',year:2021,moviedb_id:508943}}));
 });
 assert.equal((await localized.search(p,'夏日友晴天'))[0].title,'Luca');
 ready=false;
 assert.equal((await adapter.search(p,'冰雪奇缘')).length,2,'Unready CDN must not remove catalogue matches');
 console.log('PASS: Dulo aliases, movie/TV matching, public fixed-host lookup, honest language, S01E01 labels, fresh links, unready sources, hostile URLs and ID binding');
})().catch(e=>{console.error(e);process.exitCode=1;});
