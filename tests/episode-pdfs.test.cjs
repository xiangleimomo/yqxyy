const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
(async () => {
  const rows = JSON.parse(fs.readFileSync('data/littlefox-episode-pdfs.json'));
  assert(rows.length > 6000);
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.seriesId}:${row.episodeId}`;
    assert(!seen.has(key)); seen.add(key);
    const episodes = JSON.parse(fs.readFileSync(`data/${row.seriesId}/episodes.json`));
    const episode = episodes.find(item => item.episodeId === row.episodeId);
    assert.equal(episode.sourceContentId, row.contentId);
    assert.equal(episode.storyBook.contentId, row.contentId);
    assert.equal(episode.storyBook.pdfUrl, `https://res.littlefox.com/en/supplement/load_pdf/${row.contentId}`);
    assert.equal(episode.storyBook.bookId, 'littlefox-' + row.contentId.toLowerCase());
  }
  const context = {window:{}};
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/books.js','utf8'),context);
  const app = {getJSON:async file=>JSON.parse(fs.readFileSync(file,'utf8'))};
  const books = await context.window.BookReader.library(app);
  const ids = new Set(books.map(book=>book.id));
  assert.equal(ids.size, books.length);
  for (const row of rows) {
    const book = books.find(book=>book.id==='littlefox-'+row.contentId.toLowerCase());
    if (row.availability !== 'pdf') { assert(!book); continue; }
    assert(book.seriesIds.includes(row.seriesId));
    assert.equal(book.sourceUrl,row.pdfUrl);
    assert.equal(book.downloadUrl,`/book-download/${book.id}.pdf`);
  }
  const download = (await import(pathToFileURL(path.resolve('netlify/edge-functions/book-download.js')))).default;
  const originalFetch = global.fetch;
  try {
    let calls = [];
    global.fetch = async (url,options)=>{
      calls.push({url,options});
      return new Response('%PDF-test',{headers:{'content-type':'application/pdf'}});
    };
    const response=await download(new Request('https://site.test/book-download/littlefox-c0006421.pdf',{headers:{cookie:'private',authorization:'Bearer private'}}));
    assert.equal(response.status,200); assert.equal(await response.text(),'%PDF-test');
    assert.equal(calls.length,1);assert.equal(calls[0].url,'https://res.littlefox.com/en/supplement/load_pdf/C0006421');
    assert.equal(calls[0].options.headers,undefined);
    assert.equal((await download(new Request('https://site.test/book-download/littlefox-c0006421.pdf',{method:'POST'}))).status,405);
    global.fetch=async()=>new Response('<html>not a PDF</html>',{headers:{'content-type':'text/html'}});
    assert.equal((await download(new Request('https://site.test/book-download/littlefox-c0006421.pdf'))).status,502);
  } finally { global.fetch=originalFetch; }
  console.log(`PASS: ${rows.length} episode/content-ID mappings, verified-only library, deduplication, and fixed-origin PDF relay`);
})().catch(error=>{console.error(error);process.exitCode=1;});
