// Public catalogue only. Upload locally to Pone; emit an id/URL map for a reviewed DB update.
import fs from 'node:fs/promises';
import { project, publishableKey } from '../netlify/lib/book-cloud.js';
const output=process.argv[process.argv.indexOf('--output')+1];
const upload=process.argv.includes('--upload');
if(upload && (!process.argv.includes('--output') || !output))throw Error('--output backup.json is required');
const response=await fetch(project+'/rest/v1/story_books?select=id,cover_url&cover_url=like.data:*',{headers:{apikey:publishableKey}});
if(!response.ok)throw Error('Catalogue unavailable');
const books=await response.json();
if(!upload){console.log(JSON.stringify({embeddedCovers:books.length}));process.exit(0);}
let saved=[];try{saved=JSON.parse(await fs.readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const book of books){
 if(saved.some(row=>row.id===book.id))continue;
 const match=/^data:image\/(jpeg|png);base64,(.+)$/.exec(book.cover_url);if(!match)throw Error('Unsupported embedded cover '+book.id);
 const form=new FormData();form.append('files[]',new Blob([Buffer.from(match[2],'base64')],{type:'image/'+match[1]}),'cover.'+(match[1]==='jpeg'?'jpg':'png'));
 const result=await fetch('https://pone.rs/upload',{method:'POST',body:form,signal:AbortSignal.timeout(130000)});
 if(!result.ok)throw Error('Pone upload failed');const data=await result.json();const url=data.files?.[0]?.url;
 if(!data.success || !/^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.(jpg|jpeg|png)$/.test(url||''))throw Error('Invalid cover URL');
 saved.push({id:book.id,url,original:book.cover_url});await fs.writeFile(output,JSON.stringify(saved));
}
console.log(JSON.stringify(saved.map(({id,url})=>({id,url}))));
