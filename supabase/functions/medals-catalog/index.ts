import {handleMedalCatalog} from './handler.mjs';
Deno.serve(req=>handleMedalCatalog(req,{env:name=>Deno.env.get(name)}));
