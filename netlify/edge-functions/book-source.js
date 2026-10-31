const SOURCES = {
  'epub-reading-test': 'https://u.pone.rs/vkoptdac.epub'
};

const FORWARDED_HEADERS = ['range', 'if-range'];
const RESPONSE_HEADERS = ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified'];

export default async function bookSource(request, context) {
  const bookId = new URL(request.url).pathname.split('/').pop().replace(/\.epub$/i, '');
  const source = SOURCES[bookId];
  if (!source) return new Response('Book not found', { status: 404 });

  const headers = new Headers();
  FORWARDED_HEADERS.forEach(name => {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  });

  const upstream = await fetch(source, { method: request.method, headers });
  const responseHeaders = new Headers();
  RESPONSE_HEADERS.forEach(name => {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  });
  responseHeaders.set('Content-Type', 'application/epub+zip');
  responseHeaders.set('Cache-Control', 'public, max-age=86400');
  responseHeaders.set('Access-Control-Allow-Origin', new URL(request.url).origin);
  responseHeaders.set('Vary', 'Range');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  });
}

export const config = { path: '/book-source/*' };
