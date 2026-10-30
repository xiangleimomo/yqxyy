const assert=require('node:assert/strict'),core=require('../source-lab/core.js');
const target='https://zcdn1.6azt0hwr-cf9.workers.dev';
for(const host of ['zcdn.bluevelvet.space',...['zcdn1','zcdn2','zcdn3'].map(n=>n+'.6azt0hwr-cf9.workers.dev')]){
 assert.equal(core.duloMediaUrl(`https://${host}/play/token/index.m3u8?version=1`),target+'/play/token/index.m3u8?version=1');
 assert.equal(core.duloMediaUrl(`https://${host}/play/token/segment.m4s`),target+'/play/token/segment.m4s');
}
for(const url of ['https://zcdn.bluevelvet.space.evil.test/play/token/master.m3u8','https://evil.test/play/token/master.m3u8','http://zcdn.bluevelvet.space/play/token/master.m3u8','https://zcdn.bluevelvet.space:8443/play/token/master.m3u8','https://user@zcdn.bluevelvet.space/play/token/master.m3u8','https://zcdn1.6azt0hwr-cf9.workers.dev/cdn','https://zcdn.bluevelvet.space/play/../master.m3u8'])assert.equal(core.duloMediaUrl(url),'');
console.log('PASS: fixed public mirror allowlist, token/path/query preservation, media subpaths and hostile origin/path rejection');
