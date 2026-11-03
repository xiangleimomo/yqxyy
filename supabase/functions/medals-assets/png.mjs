const signature=[137,80,78,71,13,10,26,10];
const table=Uint32Array.from({length:256},(_,n)=>{let x=n;for(let i=0;i<8;i++)x=x&1?0xedb88320^(x>>>1):x>>>1;return x>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export async function validatePng(input,{thumbnail=false}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>4*1024*1024||bytes.length<45||signature.some((x,i)=>bytes[i]!==x))throw Error('请上传规范的 PNG 图片');
 let offset=8,width=0,height=0,components=0,ended=false,seenIdat=false,closedIdat=false;const compressed=[];
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset),end=offset+12+length;if(end>bytes.length)throw Error('图片数据不完整');
  const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),data=bytes.subarray(offset+8,offset+8+length);
  if(crc32(bytes.subarray(offset+4,offset+8+length))!==view.getUint32(offset+8+length))throw Error('图片校验失败');
  if(!['IHDR','IDAT','IEND','sRGB','gAMA','cHRM','pHYs'].includes(type))throw Error('图片含不支持的数据，请重新导出静态 PNG');
  if(offset===8&&type!=='IHDR')throw Error('图片头无效');
  if(type==='IHDR'){
   if(offset!==8||length!==13)throw Error('图片头无效');width=view.getUint32(offset+8);height=view.getUint32(offset+12);
   const min=thumbnail?64:512,max=thumbnail?512:2048;
   if(width<min||height<min||width>max||height>max||width/height<.6||width/height>1.67)throw Error(thumbnail?'缩略图尺寸无效':'图片需要 512–2048 像素且接近方形');
   if(data[8]!==8||![2,6].includes(data[9])||data[10]||data[11]||data[12])throw Error('请使用普通 RGB/RGBA 静态 PNG');components=data[9]===6?4:3;
  }else if(type==='IDAT'){
   if(closedIdat)throw Error('图片数据顺序无效');seenIdat=true;compressed.push(data);
  }else{if(seenIdat)closedIdat=true;}
  if(type==='IEND'){if(length||end!==bytes.length||!seenIdat)throw Error('图片尾部无效');ended=true;break;}
  offset=end;
 }
 if(!ended||!width)throw Error('图片数据不完整');
 const stride=width*components+1,expected=stride*height;let total=0;
 const reader=new Blob(compressed).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
 try{while(true){const {done,value}=await reader.read();if(done)break;if(total+value.length>expected)throw Error('图片解码数据超出限制');for(let i=(stride-total%stride)%stride;i<value.length;i+=stride)if(value[i]>4)throw Error('图片编码无效');total+=value.length;}}
 finally{await reader.cancel().catch(()=>{});}
 if(total!==expected)throw Error('图片解码数据不完整');
 return {width,height,bytes};
}
export const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
export function unhex(value){if(!/^(?:[a-f0-9]{2})+$/.test(value))throw Error('Invalid image key');return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));}
export async function encryptImage(bytes,keyHex){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey('raw',unhex(keyHex),'AES-GCM',false,['encrypt']);return {cipher:new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes)),iv:hex(iv)};}
export async function decryptImage(bytes,keyHex,ivHex){const key=await crypto.subtle.importKey('raw',unhex(keyHex),'AES-GCM',false,['decrypt']);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(ivHex)},key,bytes));}
