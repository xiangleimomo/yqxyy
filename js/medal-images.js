/* Read bounded image headers before browser decoding; uploads are canonicalized to static PNG. */
window.MedalImageTools={
 dimensions(bytes,mime){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(offset,count)=>String.fromCharCode(...bytes.subarray(offset,offset+count));
  if(mime==='image/png'&&bytes.length>=33&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)&&text(12,4)==='IHDR')return [view.getUint32(16),view.getUint32(20)];
  if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
   let offset=2;while(offset+4<bytes.length){if(bytes[offset++]!==255)throw Error('JPEG 编码无效');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)throw Error('JPEG 数据不完整');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)throw Error('JPEG 尺寸无效');return [view.getUint16(offset+5),view.getUint16(offset+3)];}offset+=length;}
  }
  if(mime==='image/webp'&&bytes.length>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'&&view.getUint32(4,true)+8===bytes.length){
   let offset=12,canvas=null,image=null;
   while(offset+8<=bytes.length){const type=text(offset,4),size=view.getUint32(offset+4,true),start=offset+8;if(start+size>bytes.length)throw Error('WebP 数据不完整');
    if(type==='ANIM'||type==='ANMF')throw Error('请使用静态 WebP 图片');
    if(type==='VP8X'){if(size!==10||bytes[start]&2)throw Error('请使用静态 WebP 图片');canvas=[1+bytes[start+4]+(bytes[start+5]<<8)+(bytes[start+6]<<16),1+bytes[start+7]+(bytes[start+8]<<8)+(bytes[start+9]<<16)];}
    if(type==='VP8 '){if(size<10||text(start+3,3)!=='\x9d\x01\x2a')throw Error('WebP 编码无效');image=[view.getUint16(start+6,true)&16383,view.getUint16(start+8,true)&16383];}
    if(type==='VP8L'){if(size<5||bytes[start]!==47)throw Error('WebP 编码无效');const data=view.getUint32(start+1,true);image=[(data&16383)+1,((data>>>14)&16383)+1];}
    offset=start+size+(size%2);
   }
   if(image&&(!canvas||image[0]===canvas[0]&&image[1]===canvas[1]))return image;
  }
  throw Error('图片格式与实际内容不符，请重新导出 PNG、JPEG 或静态 WebP');
 },
 async inspect(file){if(file.size>8*1024*1024||!['image/png','image/webp','image/jpeg'].includes(file.type))throw Error('图片类型或大小不符合要求');const size=this.dimensions(new Uint8Array(await file.arrayBuffer()),file.type);if(Math.min(...size)<512||Math.max(...size)>4096||size[0]/size[1]<.6||size[0]/size[1]>1.67)throw Error('图片需要 512–4096 像素且接近方形');return size;}
};
