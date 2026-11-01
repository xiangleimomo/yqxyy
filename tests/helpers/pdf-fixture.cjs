function samplePdf(count = 2, sizes = []){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>', ''];
 const kids=[];
 const font=3+count*2;
 for(let page=1;page<=count;page++){
  const id=objects.length+1;kids.push(id+' 0 R');
  const [width,height]=sizes[page-1]||[200,160];
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+height+'] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+(id+1)+' 0 R >>');
  const stream='BT /F1 16 Tf 20 80 Td (Local PDF page '+page+') Tj ET';
  objects.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');
 }
 objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+count+' >>';
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let pdf='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
module.exports={samplePdf};
