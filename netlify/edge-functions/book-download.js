import { cloudSource, validPdf } from '../lib/book-cloud.js';
// A catalogue-source, full-file download. PDF.js never reads this URL directly.
const SOURCES = {"pdf-reading-test": "https://u.pone.rs/zkaylinz.pdf", "a-dog-of-flanders": "https://u.pone.rs/qelkoevg.pdf", "aladdin-and-his-wonderful-lamp": "https://u.pone.rs/ehbqnbee.pdf", "alice-in-wonderland": "https://u.pone.rs/cmxqudzv.pdf", "gullivers-travels": "https://u.pone.rs/qqccjlit.pdf", "heidi": "https://u.pone.rs/wijcznaj.pdf", "iggy-the-incredible-inventor": "https://u.pone.rs/xaxjurup.pdf", "journey-to-the-west": "https://u.pone.rs/kxjfgzfi.pdf", "rocket-girl-galaxy-squad": "https://u.pone.rs/isqpdqxo.pdf", "rocket-girl-journey-to-the-west": "https://u.pone.rs/yshuiyzs.pdf", "single-stories": "https://u.pone.rs/fudnlnmi.pdf", "the-adventures-of-pinocchio": "https://u.pone.rs/mxuhlmxm.pdf", "the-enchanted-castle": "https://u.pone.rs/cjumsjir.pdf", "the-little-mermaid": "https://u.pone.rs/wrzwsrbd.pdf", "the-railway-children": "https://u.pone.rs/wrafmuqy.pdf", "disney-the-lion-king": "https://u.pone.rs/qrpgpmlj.pdf", "three-kingdoms-02": "https://u.pone.rs/wvrginuf.pdf", "three-kingdoms-03": "https://u.pone.rs/lasqengr.pdf", "three-kingdoms-04": "https://u.pone.rs/nlnifjku.pdf", "three-kingdoms-05": "https://u.pone.rs/ixcyxdfv.pdf", "three-kingdoms-06": "https://u.pone.rs/wkapogqd.pdf", "three-kingdoms-07": "https://u.pone.rs/fzmoluxd.pdf", "three-kingdoms-08": "https://u.pone.rs/ziygxjlb.pdf", "three-kingdoms-09": "https://u.pone.rs/qdxncyls.pdf", "three-kingdoms-10": "https://u.pone.rs/fgspcexb.pdf", "three-kingdoms-11": "https://u.pone.rs/gcjbhatc.pdf", "three-kingdoms-12": "https://u.pone.rs/rotcwcym.pdf", "three-kingdoms-13": "https://u.pone.rs/whhlqvnn.pdf", "three-kingdoms-14": "https://u.pone.rs/vumhvznu.pdf"};
export default async function bookDownload(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const match = /^\/book-download\/([a-z0-9-]+)\.pdf$/.exec(new URL(request.url).pathname);
  if (!match) return new Response('Book not found', { status: 404 });
  try {
    const officialId = /^littlefox-c(\d{7})$/.exec(match[1]);
    const dynamic = officialId ? null : await cloudSource(match[1], request.signal).catch(() => null);
    const source = officialId ? 'https://res.littlefox.com/en/supplement/load_pdf/C' + officialId[1] : dynamic || SOURCES[match[1]];
    if (!officialId && !validPdf(source)) return new Response('Book not found', { status: 404 });
    // Deliberately omit Range/Cookie: obtain one complete, anonymous file.
    const upstream = await fetch(source, { method: request.method, signal: request.signal });
    if (upstream.status !== 200 || !/application\/(?:pdf|octet-stream)/i.test(upstream.headers.get('content-type') || '')) {
      await upstream.body?.cancel();
      return new Response('PDF download unavailable', { status: 502 });
    }
    // Some official endpoints label PHP error pages as HTTP 200 application/pdf.
    // Verify actual bytes before forwarding, while streaming the remaining file.
    let body = upstream.body;
    if (request.method === 'GET') {
      if (!body) return new Response('PDF not available', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const reader = body.getReader(), chunks = [];
      let length = 0;
      while (length < 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value); length += value.byteLength;
      }
      const prefix = new Uint8Array(Math.min(length, 1024));
      let offset = 0;
      for (const chunk of chunks) {
        const part = chunk.subarray(0, prefix.length - offset);
        prefix.set(part, offset); offset += part.length;
        if (offset === prefix.length) break;
      }
      if (!new TextDecoder().decode(prefix).includes('%PDF-')) {
        await reader.cancel();
        return new Response('PDF not available', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      body = new ReadableStream({
        start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
        async pull(controller) {
          try { const { value, done } = await reader.read(); if (done) controller.close(); else controller.enqueue(value); }
          catch (error) { controller.error(error); }
        },
        cancel(reason) { return reader.cancel(reason); }
      });
    }
    const headers = new Headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': dynamic ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, noarchive' });
    if (!upstream.headers.get('content-encoding') && upstream.headers.has('content-length')) headers.set('Content-Length', upstream.headers.get('content-length'));
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
  } catch (_) { return new Response('PDF download unavailable', { status: 502 }); }
}
export const config = { path: '/book-download/*' };
