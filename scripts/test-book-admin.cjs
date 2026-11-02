const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  // Netlify treats every JS file in this directory as an edge entry point.
  for (const entry of fs.readdirSync('netlify/edge-functions', { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const module = await import(pathToFileURL(path.resolve('netlify/edge-functions', entry.name)));
    assert.ok(typeof module.default === 'function' || typeof module.default?.fetch === 'function', `${entry.name} must export an edge handler; put shared modules outside the entry directory`);
  }
  const upload = (await import(pathToFileURL(path.resolve('netlify/edge-functions/book-upload.js')))).default;
  const download = (await import(pathToFileURL(path.resolve('netlify/edge-functions/book-download.js')))).default;
  const nativeFetch = global.fetch;
  let calls = [];
  const request = (token = '') => {
    const form = new FormData(); form.append('files[]', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'test.pdf');
    return new Request('https://site.test/book-admin/upload', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form });
  };
  try {
    global.fetch = async () => { throw new Error('Unauthorized request must not reach upstream'); };
    assert.equal((await upload(request())).status, 401);
    global.fetch = async url => { calls.push(url); return Response.json({ app_metadata: { site_admin: false }, user_metadata: { site_admin: true } }); };
    assert.equal((await upload(request('ordinary-user'))).status, 403);
    assert.ok(calls.every(url => url.includes('/auth/v1/user')));
    calls = [];
    global.fetch = async (url, options) => {
      calls.push(url);
      if (url.includes('/auth/v1/user')) return Response.json({ app_metadata: { site_admin: true } });
      assert.equal(url, 'https://pone.rs/upload');
      assert.equal(options.headers.Authorization, undefined, 'Never leak login token to Pone');
      assert.ok((await new Response(options.body).text()).includes('files[]'));
      return Response.json({ success: true, files: [{ url: 'https://u.pone.rs/testbook.pdf' }] });
    };
    assert.deepEqual(await (await upload(request('administrator'))).json(), { url: 'https://u.pone.rs/testbook.pdf' });
    assert.equal(calls.length, 2);
    global.fetch = async url => url.includes('/auth/v1/user') ? Response.json({ app_metadata: { site_admin: true } }) : Response.json({ success: false });
    assert.ok((await (await upload(request('administrator'))).json()).error);
    for (const source of ['https://u.pone.rs/testbook.pdf', 'http://127.0.0.1/private']) {
      global.fetch = async url => {
        if (url.includes('/rest/v1/story_books')) return Response.json([{ source_url: source }]);
        assert.equal(url, 'https://u.pone.rs/testbook.pdf');
        return new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf' } });
      };
      const response = await download(new Request('https://site.test/book-download/new-book.pdf'));
      assert.equal(response.status, source.startsWith('https:') ? 200 : 404);
      if (response.ok) assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const context = { window: { STORYFOX_SUPABASE: { url: 'https://project.supabase.co', publishableKey: 'public' } }, AbortSignal, console, fetch: async url => Response.json(url.includes('story_book_shelf') ? [] : [{ id: 'existing', title: 'Updated', source_url: 'https://u.pone.rs/newbook.pdf' }, { id: 'bad', source_url: 'javascript:alert(1)' }]) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('js/books.js', 'utf8'), context);
    const books = await context.window.BookReader.library({ getJSON: async () => [{ id: 'existing', title: 'Old', seriesIds: ['test-series'] }, { id: 'other', title: 'Retained' }] });
    assert.equal(books.length, 2); assert.equal(books[0].title, 'Updated'); assert.equal(books[1].title, 'Retained');
    assert.equal(books[0].seriesIds[0], 'test-series', 'Cloud edits retain the animation assignment');
    context.fetch = async url => Response.json(url.includes('story_book_shelf') ? [{id:'existing',deleted:true},{id:'third',sort_order:0},{id:'other',sort_order:1}] : []);
    const managed = await context.window.BookReader.library({getJSON:async()=>[{id:'existing'},{id:'other'},{id:'third'}]});
    assert.deepEqual(Array.from(managed, book=>book.id), ['third','other'], 'Deleted bundled books stay removed and cloud order applies');
    delete context.window.STORYFOX_SUPABASE;
    const element = { innerHTML: '', querySelectorAll: () => [] };
    const app = { getJSON: async file => JSON.parse(fs.readFileSync(file, 'utf8')), el: () => element, escapeHtml: value => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])) };
    await context.window.BookReader.renderList(app);
    assert.equal((element.innerHTML.match(/class="book-card"/g) || []).length, 1);
    assert.ok(element.innerHTML.includes('狮子王'));
    const registry = await app.getJSON('data/books.json');
    for (const book of registry.filter(book => book.seriesIds?.length)) {
      for (const seriesId of book.seriesIds) {
        const series = await app.getJSON(`data/${seriesId}/series.json`);
        assert.equal(series.storyBookLibrary.url, `#/series-books/${seriesId}`);
        await context.window.BookReader.renderSeriesLibrary(app, seriesId);
        assert.ok(element.innerHTML.includes(book.sourceUrl));
        assert.ok(element.innerHTML.includes(`#/reader/${book.id}/${seriesId}`));
        assert.ok(!element.innerHTML.includes('pan.quark.cn'));
      }
    }
    console.log('PASS: administrator enforcement, untrusted metadata rejection, upload forwarding, token isolation, Pone errors, dynamic PDF lookup, URL restrictions, and catalogue merge.');
  } finally { global.fetch = nativeFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
