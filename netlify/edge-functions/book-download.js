import { cloudSource, validPdf } from '../lib/book-cloud.js';
// A catalogue-source, full-file download. PDF.js never reads this URL directly.
const SOURCES = {"pdf-reading-test": "https://u.pone.rs/zkaylinz.pdf", "a-dog-of-flanders": "https://u.pone.rs/qelkoevg.pdf", "aladdin-and-his-wonderful-lamp": "https://u.pone.rs/ehbqnbee.pdf", "alice-in-wonderland": "https://u.pone.rs/cmxqudzv.pdf", "gullivers-travels": "https://u.pone.rs/qqccjlit.pdf", "heidi": "https://u.pone.rs/wijcznaj.pdf", "iggy-the-incredible-inventor": "https://u.pone.rs/xaxjurup.pdf", "journey-to-the-west": "https://u.pone.rs/kxjfgzfi.pdf", "rocket-girl-galaxy-squad": "https://u.pone.rs/isqpdqxo.pdf", "rocket-girl-journey-to-the-west": "https://u.pone.rs/yshuiyzs.pdf", "single-stories": "https://u.pone.rs/fudnlnmi.pdf", "the-adventures-of-pinocchio": "https://u.pone.rs/mxuhlmxm.pdf", "the-enchanted-castle": "https://u.pone.rs/cjumsjir.pdf", "the-little-mermaid": "https://u.pone.rs/wrzwsrbd.pdf", "the-railway-children": "https://u.pone.rs/wrafmuqy.pdf", "disney-the-lion-king": "https://u.pone.rs/qrpgpmlj.pdf", "three-kingdoms-02": "https://u.pone.rs/wvrginuf.pdf", "three-kingdoms-03": "https://u.pone.rs/lasqengr.pdf", "three-kingdoms-04": "https://u.pone.rs/lcnpduky.pdf", "three-kingdoms-05": "https://u.pone.rs/xukshgmh.pdf", "three-kingdoms-06": "https://u.pone.rs/tybyybvg.pdf", "three-kingdoms-07": "https://u.pone.rs/adlemyxa.pdf", "three-kingdoms-08": "https://u.pone.rs/dbrfselm.pdf", "three-kingdoms-09": "https://u.pone.rs/cyimcyzw.pdf", "three-kingdoms-10": "https://u.pone.rs/iwihumxn.pdf", "three-kingdoms-11": "https://u.pone.rs/canhqqrr.pdf", "three-kingdoms-12": "https://u.pone.rs/kucisgqw.pdf"};
export default async function bookDownload(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const match = /^\/book-download\/([a-z0-9-]+)\.pdf$/.exec(new URL(request.url).pathname);
  if (!match) return new Response('Book not found', { status: 404 });
  try {
    const dynamic = await cloudSource(match[1], request.signal).catch(() => null);
    const source = dynamic || SOURCES[match[1]];
    if (!validPdf(source)) return new Response('Book not found', { status: 404 });
    // Deliberately omit Range/Cookie: obtain one complete, anonymous file.
    const upstream = await fetch(source, { method: request.method, signal: request.signal });
    if (upstream.status !== 200 || !/application\/(?:pdf|octet-stream)/i.test(upstream.headers.get('content-type') || '')) {
      await upstream.body?.cancel();
      return new Response('PDF download unavailable', { status: 502 });
    }
    const headers = new Headers({ 'Content-Type': 'application/pdf', 'Cache-Control': dynamic ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    if (!upstream.headers.get('content-encoding') && upstream.headers.has('content-length')) headers.set('Content-Length', upstream.headers.get('content-length'));
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers });
  } catch (_) { return new Response('PDF download unavailable', { status: 502 }); }
}
export const config = { path: '/book-download/*' };
