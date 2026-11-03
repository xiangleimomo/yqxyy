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
  const {handlePoneUpload} = await import(pathToFileURL(path.resolve('supabase/functions/pone-upload/handler.mjs')));
  const upload = request => handlePoneUpload(request,{env:name=>name==='SUPABASE_URL'?'https://project.supabase.co':'public'});
  const download = (await import(pathToFileURL(path.resolve('netlify/edge-functions/book-download.js')))).default;
  const nativeFetch = global.fetch;
  let calls = [];
  const request = (token = '') => {
    const form = new FormData(); form.append('files[]', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'test.pdf');
    return new Request('https://site.test/book-admin/upload', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form });
  };
  try {
    const origin='https://yqxyy.netlify.app';
    const preflight=await upload(new Request('https://relay.test',{method:'OPTIONS',headers:{Origin:origin}}));
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
    assert.equal((await upload(new Request('https://relay.test',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}}))).status,403);
    global.fetch = async () => { throw new Error('Unauthorized request must not reach upstream'); };
    assert.equal((await upload(request())).status, 401);
    global.fetch = async url => { calls.push(url); return Response.json({ id:'ordinary',app_metadata: { site_admin: false }, user_metadata: { site_admin: true } }); };
    assert.equal((await upload(request('ordinary-user'))).status, 403);
    assert.ok(calls.every(url => url.includes('/auth/v1/user') || url.includes('/rest/v1/rpc/book_portal')));
    calls = [];
    global.fetch = async (url, options) => {
      calls.push(url);
      if (url.includes('/auth/v1/user')) return Response.json({ id:'admin',app_metadata: { site_admin: true } });
      assert.equal(url, 'https://pone.rs/upload');
      assert.equal(options.headers.Authorization, undefined, 'Never leak login token to Pone');
      assert.ok((await new Response(options.body).text()).includes('files[]'));
      return Response.json({ success: true, files: [{ url: 'https://u.pone.rs/testbook.pdf' }] });
    };
    assert.deepEqual(await (await upload(request('administrator'))).json(), { url: 'https://u.pone.rs/testbook.pdf' });
    assert.equal(calls.length, 2);
    global.fetch = async (url, options) => {
      if (url.includes('/auth/v1/user')) return Response.json({id:'parent',app_metadata:{},user_metadata:{site_admin:true}});
      if (url.includes('/rest/v1/rpc/book_portal')) return Response.json({can_upload:true});
      assert.equal(url,'https://pone.rs/upload');
      assert.equal(options.headers.Authorization,undefined);
      return Response.json({success:true,files:[{url:'https://u.pone.rs/testbook.pdf'}]});
    };
    assert.deepEqual(await (await upload(request('parent'))).json(),{url:'https://u.pone.rs/testbook.pdf'});
    let forwarded=0;
    global.fetch=async(url,options)=>{
      if(url.includes('/auth/v1/user'))return Response.json({id:'admin',app_metadata:{site_admin:true}});
      assert.equal(url,'https://pone.rs/upload');assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.apikey,undefined);
      assert.ok(options.body instanceof ReadableStream);
      for await(const chunk of options.body)forwarded+=chunk.byteLength;
      return Response.json({success:true,files:[{url:'https://u.pone.rs/testcover.jpg'}]});
    };
    const imageForm=new FormData();imageForm.append('files[]',new Blob([new Uint8Array(5*1024*1024)],{type:'image/jpeg'}),'cover.jpg');
    const imageResponse=await upload(new Request('https://relay.test?kind=image',{method:'POST',headers:{Authorization:'Bearer admin'},body:imageForm}));
    assert.deepEqual(await imageResponse.json(),{url:'https://u.pone.rs/testcover.jpg'});assert.ok(forwarded>5*1024*1024);
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
    context.window.BookCommunity = {searchForm:()=>'',bindSearch:()=>{}};
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
    let sent;
    const uploadContext={window:{STORYFOX_SUPABASE:{url:'https://project.supabase.co',publishableKey:'public'},SFCloud:{user:{id:'parent'},client:{rpc:async()=>({data:{can_upload:true}}),auth:{getSession:async()=>({data:{session:{access_token:'login-token'}}})}}}},FormData,File,fetch:nativeFetch,XMLHttpRequest:class{
      constructor(){this.upload={};this.headers={};}open(method,url){this.url=url;}setRequestHeader(key,value){this.headers[key]=value;}send(body){sent={url:this.url,headers:this.headers,body};this.status=200;this.response={url:this.url.endsWith('kind=image')?'https://u.pone.rs/cover.jpg':'https://u.pone.rs/book.pdf'};this.onload();}
    }};
    vm.createContext(uploadContext);vm.runInContext(fs.readFileSync('js/book-community.js','utf8'),uploadContext);
    const community=uploadContext.window.BookCommunity;
    assert.equal(await community.upload(new File(['%PDF-test'],'book.pdf'),'pdf',{}),'https://u.pone.rs/book.pdf');
    assert.equal(sent.url,'https://project.supabase.co/functions/v1/pone-upload?kind=pdf');
    assert.equal(sent.headers.apikey,'public');
    assert.equal(await community.publishCover('data:image/jpeg;base64,dGVzdA==',{}),'https://u.pone.rs/cover.jpg');
    assert.equal(sent.body.get('files[]').type,'image/jpeg');
    assert.equal(await community.publishCover('https://u.pone.rs/cover.jpg',{}),'https://u.pone.rs/cover.jpg');
    console.log('PASS: authorization, Supabase streaming relay, CORS, token isolation, Pone errors, cover URL persistence, dynamic PDF lookup, and catalogue merge.');
  } finally { global.fetch = nativeFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
