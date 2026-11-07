const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, channel: 'msedge'});
 try {
 const page = await browser.newPage();
 const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello classroom\n';
 const requests = [];
 await page.route('https://classroom.test/**', async route => {
  const body = route.request().postDataJSON();
  if (!body) return route.fulfill({contentType:'text/html',body:'<html></html>'});
  requests.push(body);
  await route.fulfill({json: body.action === 'subtitles' ? {list:[{id:'123',label:'Test release',provider:'stremio',imdbId:'tt1234567'}]} : {text:srt}});
 });
 await page.goto('https://classroom.test/').catch(()=>{});
 await page.setViewportSize({width:390,height:844});
 await page.setContent('<div id="root"><div class="movie-watch-frame"><video controls playsinline></video></div></div>');
 await page.addStyleTag({content:fs.readFileSync('css/movies.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('source-lab/core.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('js/movie-subtitles.js','utf8')});
 await page.evaluate(() => { window.dispose = MovieSubtitles.mount(document.querySelector('#root'),document.querySelector('video'),{title:'Luca',year:2021},()=>null); });
 assert.equal(await page.locator('[name=query]').inputValue(),'Luca');
 assert.equal(await page.locator('.movie-cc-button').evaluate(el=>getComputedStyle(el).display),'inline-flex');
 await page.getByRole('button',{name:'查找英文字幕'}).click();
 await page.getByRole('button',{name:'Test release'}).click();
 await page.waitForFunction(()=>document.querySelector('video').textTracks[0]?.cues?.length===1);
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].cues[0].text),'Hello classroom');
 await page.getByRole('button',{name:'字幕 CC'}).click();
 await page.getByRole('menuitemradio',{name:'Test release'}).click();
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].mode),'showing');
 assert.equal(await page.locator('.movie-cc-button').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'字幕 CC'}).click();
 await page.getByRole('menuitemradio',{name:'关闭字幕 / Off'}).click();
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].mode),'disabled');
 assert.equal(requests[0].year,'2021');
 await page.locator('[name=offset]').fill('2');
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].cues[0].startTime),3);
 await page.locator('[name=offset]').fill('-0.5');
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].cues[0].startTime),0.5);
 await page.locator('[name=track]').selectOption('off');
 assert.equal(await page.evaluate(()=>document.querySelector('video').textTracks[0].mode),'disabled');
 await page.locator('[name=file]').setInputFiles({name:'local.srt',mimeType:'application/x-subrip',buffer:Buffer.from(srt)});
 await page.waitForFunction(()=>document.querySelector('video').textTracks.length===1 && document.querySelector('video').textTracks[0].label==='local.srt' && document.querySelector('video').textTracks[0].cues?.length===1);
 let release;
 const pending = new Promise(resolve=>{release=resolve;});
 await page.unroute('https://classroom.test/**');
 await page.route('**/.netlify/functions/source-explorer-api', async route=>{await pending; await route.fulfill({json:{list:[{id:'late',label:'Late result'}]}}).catch(()=>{});});
 await page.getByRole('button',{name:'查找英文字幕'}).click();
 await page.evaluate(()=>window.dispose());
 release();
 assert.equal(await page.locator('track').count(),0);
 assert.equal(await page.locator('.movie-subtitles').count(),0);
 console.log('PASS: mobile CC visibility/menu, subtitle lookup/download, VTT cues, offset, off, local import and disposal');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

