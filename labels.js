/* MILO CASHIER - Offline Code128B A4 product barcode labels */
'use strict';
const miloCode128Patterns = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
const miloLabelCart=[];
const miloLabelEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function miloLabelBarcode(value){
 const v=String(value||'').trim();if(!v||v.length>45||!/^[\x20-\x7e]+$/.test(v))return '';
 const codes=[104,...Array.from(v,c=>c.charCodeAt(0)-32)];let checksum=104;
 for(let i=1;i<codes.length;i++)checksum+=codes[i]*i;
 codes.push(checksum%103,106);
 let x=0,rects='';
 for(const c of codes){const p=miloCode128Patterns[c];for(let i=0;i<p.length;i++){const w=Number(p[i]);if(i%2===0)rects+=`<rect x="${x}" y="0" width="${w}" height="46"/>`;x+=w;}}
 return `<svg xmlns="http://www.w3.org/2000/svg" class="milo-label-barcode" viewBox="0 0 ${x} 46" role="img" aria-label="باركود ${miloLabelEscape(v)}" preserveAspectRatio="none"><g fill="#111">${rects}</g></svg>`;
}
function miloLabelItem(p){return {store:(document.getElementById('miloLabelStore')?.value||'').trim(),name:(document.getElementById('miloLabelName')?.value||'').trim(),description:(document.getElementById('miloLabelDesc')?.value||'').trim(),date:document.getElementById('miloLabelDateCheck')?.checked?(document.getElementById('miloLabelDate')?.value||''):'',barcode:(document.getElementById('miloLabelCode')?.value||'').trim()};}
function miloLabelMarkup(a){const svg=miloLabelBarcode(a.barcode);return `<div class="milo-label"><div class="milo-label-store">${miloLabelEscape(a.store)}</div><div class="milo-label-name">${miloLabelEscape(a.name)}</div><div class="milo-label-desc">${miloLabelEscape(a.description)}</div><div class="milo-label-code">${svg||'<span class="milo-label-invalid">باركود غير صالح</span>'}</div><div class="milo-label-number" dir="ltr">${miloLabelEscape(a.barcode)}</div>${a.date?`<div class="milo-label-date">التاريخ: ${miloLabelEscape(a.date)}</div>`:''}</div>`;}
function renderLabelsPage(){
 hdr('طباعة ملصقات الباركود','طباعة 12 ملصقًا في ورقة A4 — باركود Code 128 قابل للقراءة');
 const store=state.settings?.store_name||state.account?.storeName||'';
 setContent(`<div class="milo-labels-page"><section class="milo-labels-panel"><div class="milo-labels-heading"><div><strong>إعداد الملصق</strong><small>اختر منتجًا ثم راجع بياناته أو عدّلها قبل الإضافة</small></div><span class="milo-labels-count">A4 · 12 ملصق</span></div><div class="milo-labels-form"><label>اختيار المنتج من المخزون<select class="input" id="miloLabelProduct"><option value="">منتج مخصص / اختر منتجًا</option>${state.products.map((p,i)=>`<option value="${i}">${miloLabelEscape(p.name||p.productName||'منتج')} — ${miloLabelEscape(p.barcode||'بدون باركود')}</option>`).join('')}</select></label><label>اسم المحل<input class="input" id="miloLabelStore" maxlength="75" value="${miloLabelEscape(store)}"></label><label>اسم المنتج<input class="input" id="miloLabelName" maxlength="95" placeholder="اسم المنتج"></label><label>الباركود (Code 128)<input class="input" id="miloLabelCode" maxlength="45" dir="ltr" placeholder="مثال: 6281234567890"></label><label class="milo-labels-full">وصف المنتج (اختياري)<input class="input" id="miloLabelDesc" maxlength="100" placeholder="الحجم أو اللون أو وصف مختصر"></label><label class="milo-labels-full milo-labels-date"><span><input id="miloLabelDateCheck" type="checkbox"> إضافة تاريخ للملصق</span><input id="miloLabelDate" class="input" type="date" disabled></label><label>عدد الملصقات المراد إضافتها<input id="miloLabelQty" class="input" type="number" min="1" max="120" value="12"></label></div><div class="milo-labels-actions"><button class="btn primary" type="button" id="miloLabelAdd">إضافة الملصقات</button><button class="btn" type="button" id="miloLabelPrint">طباعة A4</button><button class="btn" type="button" id="miloLabelClear">مسح القائمة</button></div><p id="miloLabelMessage" class="milo-labels-hint">يمكن إضافة منتجات مختلفة في نفس الورقة. الطباعة تتم عبر نافذة المتصفح.</p></section><section class="milo-labels-preview"><div class="milo-labels-heading"><div><strong>معاينة ورقة A4</strong><small id="miloLabelSummary">لا توجد ملصقات في قائمة الطباعة</small></div><span class="milo-labels-count">3 أعمدة × 4 صفوف</span></div><div id="miloLabelPreview" class="milo-labels-sheet"></div></section></div>`);
 miloLabelsRefresh();
}
function miloLabelsRefresh(){
 const preview=document.getElementById('miloLabelPreview');if(!preview)return;
 const entries=miloLabelCart.slice(0,12),blanks=Array.from({length:12-entries.length},()=>'<div class="milo-label-blank"></div>');
 preview.innerHTML=entries.map(miloLabelMarkup).join('')+blanks.join('');
 const summary=document.getElementById('miloLabelSummary');if(summary)summary.textContent=`${miloLabelCart.length} ملصق · ${Math.ceil(miloLabelCart.length/12)} ورقة A4`;
}
function miloLabelNotify(s,err=false){const e=document.getElementById('miloLabelMessage');if(e){e.textContent=s;e.style.color=err?'#c93444':'#157a67';}}
function miloLabelsPrint(){
 if(!miloLabelCart.length)return miloLabelNotify('أضف منتجًا واحدًا على الأقل قبل الطباعة',true);
 const popup=window.open('','_blank');if(!popup)return miloLabelNotify('المتصفح منع نافذة الطباعة؛ اسمح بالنوافذ المنبثقة للموقع',true);
 const pages=[];
 for(let i=0;i<miloLabelCart.length;i+=12){const batch=miloLabelCart.slice(i,i+12);pages.push(`<div class="sheet">${batch.map(miloLabelMarkup).join('')}${Array.from({length:12-batch.length},()=>'<div class="milo-label-blank"></div>').join('')}</div>`);}
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>MILO CASHIER | ملصقات الباركود</title><style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{padding:0;margin:0;background:#fff;font-family:Arial,Tahoma,sans-serif;color:#111}.sheet{width:210mm;height:297mm;padding:7mm;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));column-gap:3mm;row-gap:3mm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.milo-label{border:0.22mm solid #ddd;border-radius:1.5mm;text-align:center;overflow:hidden;padding:3mm 2mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.15mm;min-width:0;min-height:0}.milo-label-store{font-size:11pt;font-weight:800;max-width:100%;overflow-wrap:anywhere}.milo-label-name{font-size:10pt;font-weight:700;max-width:100%;overflow-wrap:anywhere}.milo-label-desc{font-size:7.5pt;color:#444;max-width:100%;overflow-wrap:anywhere}.milo-label-code{width:100%;height:18mm;display:flex;align-items:center;justify-content:center}.milo-label-barcode{width:100%;height:100%;display:block}.milo-label-number{font:9pt Arial;letter-spacing:0.5px;direction:ltr}.milo-label-date{font-size:7pt;color:#555}.milo-label-blank{border:0.2mm dashed #eee;border-radius:1.5mm}@media print{.milo-label-blank{border:none}}
</style></head><body>${pages.join('')}<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),250)});<\/script></body></html>`;
 popup.document.open();popup.document.write(html.replace('<\/script>','</script>'));popup.document.close();
}
document.addEventListener('change',e=>{
 if(state.page!=='labels')return;
 if(e.target.id==='miloLabelDateCheck'){document.getElementById('miloLabelDate').disabled=!e.target.checked;return;}
 if(e.target.id==='miloLabelProduct'){
  const p=state.products[Number(e.target.value)];if(e.target.value===''||!p)return;
  document.getElementById('miloLabelName').value=p.name||p.productName||'';
  document.getElementById('miloLabelCode').value=p.barcode||'';
  document.getElementById('miloLabelDesc').value=p.description||p.desc||p.category||'';
 }
});
document.addEventListener('click',e=>{
 if(state.page!=='labels')return;
 const id=e.target.closest('button')?.id;
 if(id==='miloLabelAdd'){
  const item=miloLabelItem(),qty=Number(document.getElementById('miloLabelQty').value);
  if(!item.store||!item.name)return miloLabelNotify('أدخل اسم المحل واسم المنتج',true);
  if(!miloLabelBarcode(item.barcode))return miloLabelNotify('أدخل باركودًا صحيحًا من أحرف إنجليزية أو أرقام (حتى 45 رمزًا)',true);
  if(!Number.isInteger(qty)||qty<1||qty>120)return miloLabelNotify('العدد يجب أن يكون بين 1 و120',true);
  if(miloLabelCart.length+qty>1200)return miloLabelNotify('الحد الأقصى 1200 ملصق لكل عملية طباعة',true);
  for(let i=0;i<qty;i++)miloLabelCart.push({...item});miloLabelsRefresh();miloLabelNotify(`تمت إضافة ${qty} ملصق بنجاح`);
 }else if(id==='miloLabelPrint'){miloLabelsPrint();}
 else if(id==='miloLabelClear'){miloLabelCart.length=0;miloLabelsRefresh();miloLabelNotify('تم مسح قائمة الطباعة');}
});
