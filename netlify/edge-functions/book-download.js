// A fixed-source, full-file download. PDF.js never reads this URL directly.
const SOURCES = { 'pdf-reading-test': 'https://u.pone.rs/zkaylinz.pdf' };
export default async function bookDownload(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const match = /^\/book-download\/([a-z0-9-]+)\.pdf$/.exec(new URL(request.url).pathname);
  const source = match && SOURCES[match[1]];
  if (!source) return new Response('Book not found', { status: 404 });
  try {
    // Deliberately omit Range/Cookie: obtain one complete, anonymous file.
    const upstream = await fetch(source, { method: request.method, signal: request.signal });
    if (upstream.status !== 200 || !/application\/(?:pdf|octet-stream)/i.test(upstream.headers.get('content-type') || '')) {
      await upstream.body?.cancel();
      return new Response('PDF download unavailable', { status: 502 });
    }
    const headers = new Headers({ 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    if (!upstream.headers.get('content-encoding') && upstream.headers.has('content-length')) headers.set('Content-Length', upstream.headers.get('content-length'));
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
  } catch (_) { return new Response('PDF download unavailable', { status: 502 }); }
}
export const config = { path: '/book-download/*' };
