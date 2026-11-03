import { handlePoneUpload } from './handler.mjs';
Deno.serve(req => handlePoneUpload(req, { env: name => Deno.env.get(name) }));
