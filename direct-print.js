/* MILO CASHIER direct ESC/POS trial (Chrome/Edge, HTTPS/localhost).
   No silent fallback and no remote control. The user explicitly selects the device.
   Image output preserves Arabic shaping and QR. Only one cut is sent per job. */
(() => {
  'use strict';
  const enc = new TextEncoder();
  let usb = null, endpoint = null, serial = null;
  const status = message => {const el = document.getElementById('miloDirectStatus'); if(el) el.textContent = message;};
  const E = (s,ctx) => {if(ctx?.measureText)return ctx.measureText(s).width;return s.length*9};
  const paperWidth = paper => paper === '58' ? 384 : 576;
  function layout(html,paper){
    const doc = new DOMParser().parseFromString(html,'text/html');
    const root = doc.querySelector('#receipt');
    if(!root) throw Error('لم يتم العثور على بيانات الفاتورة');
    const width = paperWidth(paper);
    const pad = paper==='58' ? 12 : 16;
    let y=0;
    const cvs=document.createElement('canvas');cvs.width=width;
    const ctx=cvs.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#000';ctx.textBaseline='top';
    const ops=[];
    function line(text,size=26,bold=false,align='center',gap=4){
      if(text==null || String(text).trim()==='')return;
      const raw=String(text).replace(/\s+/g,' ').trim();
      ctx.font=`${bold?'bold ':''}${size}px Tahoma, Arial, sans-serif`;
      const maxWidth=width-2*pad;
      const parts=[];
      for(const word of raw.split(' ')){
        if(!parts.length){parts.push(word);continue;}
        const last=parts.length-1;
        if(E(parts[last]+' '+word,ctx)<=maxWidth)parts[last]+=' '+word;
        else parts.push(word);
      }
      const lines=[];
      for (const piece of parts) {
        if (E(piece,ctx)<=maxWidth) {lines.push(piece); continue;}
        let fragment='';
        for (const char of piece) {
          if (fragment && E(fragment+char,ctx)>maxWidth) {lines.push(fragment); fragment=char;}
          else fragment+=char;
        }
        if (fragment) lines.push(fragment);
      }
      for(const piece of lines){
        const hh=Math.ceil(size*1.23);
        ops.push({type:'text',text:piece,y,height:hh,size,bold,align});
        y+=hh;
      }
      y+=Math.min(gap,4);
    }
    function rule(){ops.push({type:'rule',y});y+=8;}
    const top=root.querySelector('.receipt-head');
    if(top){
      const head=top.querySelector('h2'); if(head)line(head.textContent,36,true);
      top.querySelectorAll('.receipt-sub, .receipt-badge, .milo-vat-at-top').forEach(el=>line(el.textContent,23,false));
      const order=top.querySelector('.milo-order-number strong'); if(order){line('رقم الطلب',23);line(order.textContent,46,true);}
    }
    rule();
    const metadata=root.querySelector('.receipt-box');
    if(metadata){
      metadata.querySelectorAll('.receipt-grid > div').forEach(el=>line(el.textContent,21,false,'right',2));
      if(!metadata.querySelector('.receipt-grid'))line(metadata.textContent,21,false,'right');
    }
    rule();
    const rows=root.querySelectorAll('.receipt-items tbody tr');
    if(rows.length){
      line('الأصناف',27,true);
      rows.forEach(row=>{
        const cells=[...row.querySelectorAll('td')];
        if(!cells.length)return;
        const name=(cells[0].querySelector('.item-main')?.textContent||cells[0].textContent||'').trim();
        const qty=(cells[1]?.textContent||'').trim();
        const total=(cells[cells.length-1]?.textContent||'').trim();
        line(name,27,true,'right',1);
        line(`الكمية: ${qty}${cells.length>2 ? '    الإجمالي: '+total : ''}`,23,false,'right',3);
      });
    }
    rule();
    const summary=root.querySelector('.receipt-summary');
    if(summary){summary.querySelectorAll('.rline').forEach(el=>line(el.textContent.replace(/\s+/g,' '),el.classList.contains('receipt-strong')?30:23,el.classList.contains('receipt-strong'),'right',3));}
    root.querySelectorAll('.milo-shift-group').forEach(group=>{
      const heading=group.querySelector('.milo-shift-group-title');
      if(heading)line(heading.textContent,27,true);
      group.querySelectorAll('.milo-shift-row').forEach(row=>line(row.textContent,23,false,'right',2));
      rule();
    });
    const foot=root.querySelector('.receipt-footer,.milo-shift-end');
    const note=root.querySelector('.receipt-note');if(note)line(note.textContent,23);
    const qr=root.querySelector('.qr-area svg');
    if(qr){ops.push({type:'qr',svg:qr.outerHTML,y});y+=paper==='58'?200:220;}
    if(foot)line(foot.textContent,25,false,'center',2);
    const height=Math.ceil(y+5);
    cvs.height=height;
    const c=cvs.getContext('2d',{willReadFrequently:true});
    c.fillStyle='white';c.fillRect(0,0,width,height);c.fillStyle='black';c.textBaseline='top';
    return {canvas:cvs,c,ops,width,pad,height};
  }
  async function rasterize(html,paper){
    const L=layout(html,paper), {c,ops,width,pad,canvas}=L;
    for(const op of ops){
      if(op.type==='rule'){c.fillRect(pad,op.y,width-2*pad,1);continue;}
      if(op.type==='text'){
        c.font=`${op.bold?'bold ':''}${op.size}px Tahoma, Arial, sans-serif`;
        c.textAlign=op.align==='center'?'center':'right';
        c.direction='rtl';
        c.fillText(op.text,op.align==='center'?width/2:width-pad,op.y,width-2*pad);
        continue;
      }
      if(op.type==='qr'){
        const blob=new Blob([op.svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
        try{
          const img=new Image();img.src=url; await img.decode();
          const size=paper==='58'?190:210;
          c.drawImage(img,Math.round((width-size)/2),op.y,size,size);
        }catch(err){console.warn('Failed to rasterize QR:',err);throw Error('تعذر رسم رمز QR؛ ألغِ الطباعة أو استخدم طباعة المتصفح');}
        finally{URL.revokeObjectURL(url);}
      }
    }
    return canvas;
  }
  async function connectUsb(){
    if(!('usb' in navigator))throw Error('WebUSB غير مدعوم في هذا المتصفح');
    const device=await navigator.usb.requestDevice({filters:[]});
    await device.open();
    if(!device.configuration) await device.selectConfiguration(1);
    let chosen=null;
    for(const intf of device.configuration.interfaces){
      for(const alt of intf.alternates){
        const out=alt.endpoints.find(ep=>ep.direction==='out'&&ep.type==='bulk');
        if(out && (alt.interfaceClass===7||alt.interfaceClass===255)){chosen={intf,alt,out};break;}
      }if(chosen)break;
    }
    if(!chosen){await device.close();throw Error('لم أجد منفذ طباعة USB Bulk مناسبًا؛ جرّب Serial أو طباعة المتصفح');}
    await device.claimInterface(chosen.intf.interfaceNumber);
    if(chosen.intf.alternate.alternateSetting!==chosen.alt.alternateSetting) await device.selectAlternateInterface(chosen.intf.interfaceNumber,chosen.alt.alternateSetting);
    usb=device;endpoint=chosen.out.endpointNumber;serial=null;
    status('متصل بطابعة USB: '+(device.productName||'ESC/POS'));
  }
  async function connectSerial(){
    if(!('serial' in navigator))throw Error('Web Serial غير مدعوم في هذا المتصفح');
    const port=await navigator.serial.requestPort();
    const baud=Number(localStorage.getItem('milo_escpos_baud')||9600);
    await port.open({baudRate:baud});
    serial=port;usb=null;endpoint=null;
    status('تم الاتصال بمنفذ Serial بسرعة '+baud);
  }
  async function write(bytes){
    if(usb){
      for(let off=0;off<bytes.length;off+=4096){
        const result=await usb.transferOut(endpoint,bytes.subarray(off,off+4096));
        if(result.status!=='ok')throw Error('فشل إرسال البيانات للطابعة USB');
      }return;
    }
    if(serial?.writable){
      const writer=serial.writable.getWriter();
      try{await writer.write(bytes);}finally{writer.releaseLock();}return;
    }
    throw Error('اربط الطابعة من الإعدادات قبل أول طباعة. يمكن الرجوع لطباعة المتصفح.');
  }
  function rasterRows(canvas,start,rows){
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const width=canvas.width;
    const byteWidth=Math.ceil(width/8), data=ctx.getImageData(0,start,width,rows).data;
    const out=new Uint8Array(8+byteWidth*rows);
    out.set([0x1d,0x76,0x30,0,byteWidth&255,byteWidth>>8,rows&255,rows>>8]);
    for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const intensity=(data[i]*299+data[i+1]*587+data[i+2]*114)/1000;
      if(intensity<168&&data[i+3]>100)out[8+y*byteWidth+(x>>3)]|=0x80>>(x&7);
    }
    return out;
  }
  // Crop only fully white bitmap rows from the beginning of the receipt.
  // Avoids blank leading paper without shrinking text or cutting printed content.
  function firstInkRow(canvas){
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const w=canvas.width;
    for(let y=0;y<canvas.height;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const intensity=(pixels[i]*299+pixels[i+1]*587+pixels[i+2]*114)/1000;
        if(pixels[i+3]>100 && intensity<168)return y;
      }
    }
    return 0;
  }
  // ESC/POS cash drawer pulse. Pin 2 is standard; some printers use pin 5.
  async function openDrawer(){
    if(!usb&&!serial)throw Error('اتصل بالطابعة عبر USB أو Serial أولًا');
    const pin=localStorage.getItem('milo_drawer_pin')==='5'?1:0;
    await write(Uint8Array.from([0x1b,0x70,pin,0x32,0x32]));
    status('تم إرسال نبضة فتح الدرج إلى الطابعة (لا يمكن التحقق من الفتح ميكانيكيًا).');
    return true;
  }
  async function printTask(task){
    if(!usb&&!serial)throw Error('اختر توصيل USB أو Serial من الإعدادات أولاً');
    status('جارٍ تجهيز الفاتورة...');
    const canvas=await rasterize(task.html,task.paper);
    // Initialize with no leading feed. Start at first printed raster row.
    await write(Uint8Array.from([0x1b,0x40,0x1b,0x61,0x00]));
    const top=firstInkRow(canvas);
    for(let y=top;y<canvas.height;y+=192){await write(rasterRows(canvas,y,Math.min(192,canvas.height-y)));}
    // One short feed before the single final cut; no page breaks.
    await write(Uint8Array.from([0x1b,0x64,0x01,0x1d,0x56,0x00]));
    status('أُرسلت الفاتورة كاملة للطابعة.');
  }
  document.addEventListener('click',async ev=>{
    const id=ev.target?.closest?.('button')?.id;
    if(!['miloUsbConnect','miloSerialConnect','miloDirectTest','miloDrawerDirectTest'].includes(id))return;
    ev.preventDefault();ev.stopPropagation();
    try{
      if(id==='miloUsbConnect')await connectUsb();
      if(id==='miloSerialConnect')await connectSerial();
      if(id==='miloDrawerDirectTest')await openDrawer();
      if(id==='miloDirectTest'){
        const paper=localStorage.getItem('milo_paper')||'80';
        const html=`<section id="receipt" class="print-receipt"><div class="receipt-inner"><div class="receipt-head"><h2>MILO CASHIER</h2><div class="receipt-sub">اختبار الطباعة المباشرة</div><div class="milo-order-number"><span>رقم الطلب</span><strong>47</strong></div></div><table class="receipt-items"><tbody><tr><td>منتج تجريبي عربي</td><td>2</td><td>15.00</td></tr></tbody></table><div class="receipt-summary"><div class="rline receipt-strong">الإجمالي 30.00 ر.س</div></div><div class="receipt-footer">شكرًا لزيارتكم</div></div></section>`;
        await printTask({html,paper});
      }
    }catch(e){status('خطأ: '+String(e.message||e));console.error(e);}
  },true);
  document.addEventListener('change',ev=>{
    if(ev.target?.id==='miloDirectEnabled'){
      localStorage.setItem('milo_direct_mode',ev.target.checked?'1':'0');
      status(ev.target.checked?'الوضع المباشر مفعل. اتصل بالطابعة قبل البيع.':'تم الرجوع لطباعة المتصفح.');
    }
  },true);
  window.MiloDirectPrint={connectUsb,connectSerial,printTask,openDrawer};
})();
