import {handleMedalAssets} from './handler.mjs';
Deno.serve(req=>handleMedalAssets(req,{env:name=>Deno.env.get(name)}));
