/* MILO Print Bridge — structured customer/kitchen receipt payloads. */
(()=>{'use strict';
const endpoint='http://127.0.0.1:17855/print';
const txt=(el)=>el?.textContent?.replace(/\s+/g,' ').trim()||'';
const money=(s)=>{const m=String(s||'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):0};
async function imageAsPng(img, maxSize=320){
 if(!img)return null;
 const source=img.getAttribute("src");if(!source)return null;
 const picture=new Image();picture.src=source;await picture.decode();
 const scale=Math.min(1,maxSize/Math.max(picture.naturalWidth,picture.naturalHeight));
 const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));
 const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(picture,0,0,canvas.width,canvas.height);
 return canvas.toDataURL("image/png");
}
async function qrAsPng(svg){
 if(!svg)return null;
 const source=new XMLSerializer().serializeToString(svg);
 const blob=new Blob([source],{type:"image/svg+xml;charset=utf-8"});const url=URL.createObjectURL(blob);
 try {
  const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement("canvas");canvas.width=400;canvas.height=400;const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,400,400);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0,400,400);return canvas.toDataURL("image/png");
 } finally {URL.revokeObjectURL(url)}
}
async function barcodeAsPng(svg){
 if(!svg)return null;
 const source=new XMLSerializer().serializeToString(svg);
 const blob=new Blob([source],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{const img=new Image();img.src=url;await img.decode();const ratio=Math.max(1,Math.min(3,800/img.naturalWidth));
 const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}
 finally{URL.revokeObjectURL(url)}
}
async function payload(html,receiptType="customer"){
 const doc=new DOMParser().parseFromString(html,'text/html');const root=doc.querySelector('#receipt');if(!root)throw Error('الفاتورة غير موجودة');
 const fields=[...root.querySelectorAll('.receipt-grid > div')];
 const field=(label)=>txt(fields.find(x=>txt(x.querySelector('span')).includes(label))?.querySelector('b'));
 // Never infer the ticket type solely from display text; the print queue supplies it.
 const isKitchen=receiptType==='kitchen';
 if(!['kitchen','customer'].includes(receiptType))throw Error('نوع المستند غير معروف');
 const rows=[...root.querySelectorAll('.receipt-items tbody tr')].map(tr=>{const td=[...tr.querySelectorAll('td')];return {name:txt(td[0]?.querySelector('.item-main')||td[0]),qty:money(txt(td[1]))||1,price:isKitchen?0:money(txt(td[2])),lineTotal:money(txt(td[3]))}});
 const summary=[...root.querySelectorAll('.receipt-summary .rline')];
 const sum=(label)=>money(txt(summary.find(x=>txt(x.querySelector('span')).includes(label))?.querySelector('b')));
 const number=field('الفاتورة')||field('الطلب')||txt(root.querySelector('.milo-order-number strong'));
 const orderNumber=txt(root.querySelector('.milo-order-number strong'))||field('الطلب');
 const dateRaw=field('التاريخ');const dateParsed=new Date(dateRaw);
 const tax=txt(root.querySelector('.milo-vat-at-top')).replace(/[^0-9]/g,'');
 const logoBase64=isKitchen?null:await imageAsPng(root.querySelector(".milo-receipt-logo"),440);
 const qrBase64=isKitchen?null:await qrAsPng(root.querySelector(".qr-area svg"));
 const barcodeBase64=isKitchen?null:await barcodeAsPng(root.querySelector(".milo-order-barcode svg"));
 return {logoBase64,qrBase64,barcodeBase64,receiptType:isKitchen?'kitchen':'customer',store:txt(root.querySelector('.receipt-head h2'))||'MILO CASHIER',subtitle:txt(root.querySelector('.receipt-head .receipt-sub')),branch:txt(root.querySelector('.milo-branch')).replace(/^الفرع:\s*/,''),number,orderNumber,cashier:field('الكاشير'),paymentMethod:field('طريقة الدفع')||txt(summary.find(x=>txt(x.querySelector('span')).includes('طريقة الدفع'))?.querySelector('b')),taxNumber:tax,items:rows,subtotal:sum('المجموع قبل الخصم')||sum('المجموع الفرعي'),vat:sum('ضريبة القيمة المضافة'),cash:sum('نقدًا'),card:sum('شبكة'),change:sum('الباقي'),taxInclusive:!!root.querySelector('.receipt-tax-note'),total:sum('الإجمالي شامل الضريبة')||sum('الإجمالي المستحق')||sum('الإجمالي'),dateTime:Number.isNaN(dateParsed.getTime())?null:dateParsed.toISOString(),footer:(()=>{const e=root.querySelector('.receipt-footer')?.cloneNode(true);e?.querySelectorAll('.milo-receipt-policy,.milo-receipt-extra').forEach(x=>x.remove());return txt(e)||'شكرًا لزيارتكم'})(),hidePolicyHeading:root.querySelector('.milo-receipt-policy')?.dataset.hideHeading==='1',provisional:!!root.querySelector('.milo-provisional-alert'),returnPolicy:(()=>{const e=root.querySelector('.milo-receipt-policy')?.cloneNode(true);e?.querySelector('strong')?.remove();return txt(e)})(),extraFooter:txt(root.querySelector('.milo-receipt-extra')),qrSize:Number(localStorage.getItem('milo_receipt_qr_size')||120),logoSize:Number(localStorage.getItem('milo_receipt_logo_size')||70)};
}
async function send(data){const token=localStorage.getItem('milo_bridge_token')||'';if(!token)throw Error('أدخل مفتاح الربط في إعدادات الطباعة');let res;try{res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-MILO-Token':token},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)})}catch(e){throw Error('تعذر الاتصال ببرنامج MILO Print Bridge: '+e.message)}if(!res.ok)throw Error('رفض برنامج الطباعة الطلب (HTTP '+res.status+'): '+(await res.text()).slice(0,160));return true;}
async function printTask(task){const data=await payload(task.html,task.receiptType||"customer");await send(data);return true;}
async function openDrawer(){
 const token=localStorage.getItem('milo_bridge_token')||'';
 if(!token)throw Error('مفتاح MILO Print Bridge غير مضبوط');
 let res;
 try{res=await fetch('http://127.0.0.1:17855/drawer',{
  method:'POST',headers:{'Content-Type':'application/json','X-MILO-Token':token},
  body:JSON.stringify({command:'openDrawer',pin:localStorage.getItem('milo_drawer_pin')==='5'?5:2}),
  signal:AbortSignal.timeout(7000)
 });}catch(e){throw Error('تعذر الاتصال ببرنامج Bridge المحلي: '+e.message)}
 if(!res.ok)throw Error(res.status===404?'برنامج MILO Print Bridge الحالي لا يدعم /drawer ويحتاج تحديثًا':'ردّ برنامج Bridge بالخطأ HTTP '+res.status);
 return true;
}
// Website heartbeat: the Windows notification icon becomes green only when authenticated.
let lastHeartbeatError='';
async function heartbeat(){
 const token=localStorage.getItem('milo_bridge_token')||'';
 if(!token||localStorage.getItem('milo_print_mode')!=='bridge')return;
 try{
  const res=await fetch('http://127.0.0.1:17855/heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-MILO-Token':token},body:JSON.stringify({site:location.origin,page:location.pathname}),signal:AbortSignal.timeout(4000)});
  if(!res.ok)throw Error('HTTP '+res.status);
  lastHeartbeatError='';
 }catch(e){lastHeartbeatError=String(e?.message||e)}
}
setInterval(heartbeat,7000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',heartbeat,{once:true});else heartbeat();
window.MiloPrintBridge={printTask,openDrawer,heartbeat,getLastHeartbeatError:()=>lastHeartbeatError};
})();
