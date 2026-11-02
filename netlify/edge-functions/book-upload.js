import { project, publishableKey, validPdf } from './book-cloud.js';

export default async function upload(request) {
  const reply = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return reply(405, '只支持上传请求。');
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer \S+$/.test(authorization)) return reply(401, '请先登录管理员账号。');
  try {
    const auth = await fetch(`${project}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: authorization }, signal: request.signal });
    if (!auth.ok || (await auth.json()).app_metadata?.site_admin !== true) return reply(403, '仅管理员可以上传绘本。');
    const type = request.headers.get('content-type') || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(type)) return reply(400, '请选择 PDF 文件。');
    const max = 1073741824 + 65536;
    if (Number(request.headers.get('content-length')) > max) return reply(413, 'PDF 不能超过 1 GiB。');
    let bytes = 0;
    const body = request.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > max) throw new Error('Upload too large');
      controller.enqueue(chunk);
    } }));
    // Forward only the multipart body; never send the administrator token to Pone.
    // Send headers immediately: a large upload can exceed the edge header timeout.
    const encoder = new TextEncoder();
    const upstreamAbort = new AbortController();
    request.signal.addEventListener('abort', () => upstreamAbort.abort(), { once: true });
    let heartbeat;
    const stream = new ReadableStream({
      start(controller) {
        const send = value => controller.enqueue(encoder.encode(value));
        send(' ');
        heartbeat = setInterval(() => send(' '), 8000);
        (async () => {
          let response;
          try {
            const result = await fetch('https://pone.rs/upload', { method: 'POST', headers: { 'Content-Type': type }, body, duplex: 'half', signal: upstreamAbort.signal });
            if (!result.ok) throw new Error('Pone 上传失败，请稍后重试或填写已有直链。');
            const data = await result.json(), url = data.files?.[0]?.url;
            if (data.success === false || !validPdf(url)) throw new Error('Pone 未返回有效 PDF 直链。');
            response = { url };
          } catch (error) { response = { error: error.message || '上传连接中断，请重试。' }; }
          finally { clearInterval(heartbeat); }
          if (!upstreamAbort.signal.aborted) { send(JSON.stringify(response)); controller.close(); }
        })();
      },
      cancel() { clearInterval(heartbeat); upstreamAbort.abort(); }
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return reply(502, '上传连接中断，请重试；若已上传成功，可以直接填写 Pone 直链。'); }
}
export const config = { path: '/book-admin/upload' };
