'use strict';
const assert=require('node:assert/strict');
const {expandTvSeries}=require('../scripts/v2-tv-catalog.cjs');
const details={
 id:123,name:'Example Show',original_name:'Example Show',first_air_date:'2020-01-01',
 episode_run_time:[42],
 seasons:[
  {season_number:0,episode_count:1},
  {season_number:1,episode_count:2}
 ]
};
const season0={id:123,season_number:0,episodes:[{episode_number:1,name:'Special'}]};
const season1={id:123,season_number:1,episodes:[
 {episode_number:1,name:'Pilot',air_date:'2020-01-01',runtime:40},
 {episode_number:2,name:'The Next Day',air_date:'2020-01-08',runtime:43}
]};
const fetcher=async raw=>{
 const u=new URL(raw);
 const body=u.pathname.endsWith('/tv/123')?details:u.pathname.endsWith('/season/0')?season0:season1;
 return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
};
(async()=>{
 const result=await expandTvSeries({tmdbId:123,title:'Example Show',year:2020,apiKey:'test',fetcher});
 assert.equal(result.seasonCount,2);
 assert.equal(result.episodeCount,3);
 assert.equal(result.episodes[0].key,'tv:123:s0:e1');
 assert.equal(result.episodes[2].episodeTitle,'The Next Day');
 await assert.rejects(()=>expandTvSeries({tmdbId:123,title:'Different Show',apiKey:'test',fetcher}),/title does not match/);
 console.log('V2 TV catalogue expansion tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
