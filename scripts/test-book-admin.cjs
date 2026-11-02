const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
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
    const context = { window: { STORYFOX_SUPABASE: { url: 'https://project.supabase.co', publishableKey: 'public' } }, AbortSignal, console, fetch: async () => Response.json([{ id: 'existing', title: 'Updated', source_url: 'https://u.pone.rs/newbook.pdf' }, { id: 'bad', source_url: 'javascript:alert(1)' }]) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('js/books.js', 'utf8'), context);
    const books = await context.window.BookReader.library({ getJSON: async () => [{ id: 'existing', title: 'Old' }, { id: 'other', title: 'Retained' }] });
    assert.equal(books.length, 2); assert.equal(books[0].title, 'Updated'); assert.equal(books[1].title, 'Retained');
    console.log('PASS: administrator enforcement, untrusted metadata rejection, upload forwarding, token isolation, Pone errors, dynamic PDF lookup, URL restrictions, and catalogue merge.');
  } finally { global.fetch = nativeFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
