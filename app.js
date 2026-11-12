'use strict';
/* MILO CASHIER browser client for the REST actions in the user's Code.gs.
   This client intentionally does not claim to fix missing server-side ACL, atomicity or auth. */
const API_URL=(location.hostname==='127.0.0.1'&&location.port==='37941')?'/api':'https://script.google.com/macros/s/AKfycby2xxFE1xFBdBVCH0E2tJs8BWwr7Kuxb0rrA5JaJULwrvVMwsxWIe-NuoV0wkZLyTgc/exec';
const $=id=>document.getElementById(id);
// Login progress follows real application work; it does not claim success before completion.
function miloSetLoginLoading(visible,message){
 const overlay=$('miloLoginLoading');if(!overlay)return;
 if(message&&$('miloLoadingStatus'))$('miloLoadingStatus').textContent=message;
 // Slide transitions are tied to actual login progress; no artificial delay to access.
 const first=$('miloLoadingSlide1'),second=$('miloLoadingSlide2');
 const slideTwo=!!(visible&&message&&(/تم التحقق|تحميل المنتجات|تجهيز نقطة البيع/.test(message)));
 if(visible&&overlay.classList.contains('hidden')){
   first?.classList.add('is-active');second?.classList.remove('is-active');
 }
 if(slideTwo){first?.classList.remove('is-active');second?.classList.add('is-active');}
 if(!visible){first?.classList.add('is-active');second?.classList.remove('is-active');}
 if(first)first.setAttribute('aria-hidden',slideTwo?'true':'false');
 if(second)second.setAttribute('aria-hidden',slideTwo?'false':'true');
 overlay.classList.toggle('hidden',!visible);document.body.classList.toggle('milo-login-pending',!!visible);
}
// Prevent accidental page zoom in the kiosk UI. Browser menu zoom / OS magnifier
// remain under the browser/OS control; this cannot enforce a true 100% scale.
function miloPreventPageZoom(){document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','=','-','0','add','subtract'].includes((e.key||'').toLowerCase()))e.preventDefault()}, {capture:true});document.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault()},{passive:false,capture:true});document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});}
miloPreventPageZoom();

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amt=x=>Number(x||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
const n=x=>{const v=Number(x);return Number.isFinite(v)?v:0};
const rnd=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
const isoDay=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,10);
const dateTime=()=>new Date().toISOString();
const uid=()=>{if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const a=new Uint8Array(16);crypto.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;return [...a].map((v,i)=>([4,6,8,10].includes(i)?'-':'')+v.toString(16).padStart(2,'0')).join('')};
const deviceCode=()=>{let code=localStorage.getItem('milo_device_code');if(!/^MILO-[0-9A-F]{20}$/.test(code||'')){const b=new Uint8Array(10);crypto.getRandomValues(b);code='MILO-'+[...b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();localStorage.setItem('milo_device_code',code)}return code};
const terminalId=()=>deviceCode();
const vDate=x=>{try{return new Date(x).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}catch{return esc(x)}};
const state={auth:null,account:null,products:[],reports:[],shifts:[],settings:{},customers:[],suppliers:[],cart:[],held:[],manualOrders:[],page:'sale',tab:'products',category:'الكل',saleQuery:'',wholesale:false,pendingInvoice:null,paymentMode:'cash',isBusy:false,activeShift:null,paper:localStorage.getItem('milo_paper')||'80',terminalName:localStorage.getItem('milo_terminal_name')||'الكاشير الرئيسي',networkOK:false,reportCache:[],lastPing:0,productsRevision:"",syncBusy:false,lastSyncAt:0,serviceType:localStorage.getItem('milo_sale_service_type')||'سفري'};
// The optional receipt logo is local to this device and never sent to the backend.
const receiptLogo=()=>{const v=localStorage.getItem('milo_receipt_logo')||'';return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<350000?v:''};
function receiptLogoHtml(){const url=receiptLogo();return url?`<img class="milo-receipt-logo" src="${url}" alt="شعار المتجر">`:''}
function chooseReceiptLogo(file){
 return new Promise((resolve,reject)=>{
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(Error('اختر صورة PNG أو JPG أو WebP'));
  if(file.size>6*1024*1024)return reject(Error('الصورة أكبر من 6 ميجابايت'));
  const reader=new FileReader();reader.onerror=()=>reject(Error('تعذر قراءة الصورة'));
  reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error('الصورة غير صالحة'));
   img.onload=()=>{try{const canvas=document.createElement('canvas');const scale=Math.min(1,320/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.72);if(data.length>330000)throw Error('حجم الشعار بعد التحويل كبير');localStorage.setItem('milo_receipt_logo',data);resolve()}catch(err){reject(err)}};img.src=String(reader.result)};reader.readAsDataURL(file);
 });
}
const receiptCustom=()=>({policy:localStorage.getItem('milo_receipt_policy')||'',extra:localStorage.getItem('milo_receipt_extra')||'',logoSize:Math.min(220,Math.max(30,Number(localStorage.getItem('milo_receipt_logo_size')||70))),qrSize:Math.min(320,Math.max(80,Number(localStorage.getItem('milo_receipt_qr_size')||120)))});
const printPrefs=()=>({paper:localStorage.getItem('milo_paper')||state.paper||'80',mode:'browser',showQr:(localStorage.getItem('milo_print_show_qr')||'1')!=='0',fontScale:localStorage.getItem('milo_receipt_font')||'normal',align:localStorage.getItem('milo_receipt_align')||'center',footer:localStorage.getItem('milo_receipt_footer_style')||'center',margin:Math.min(8,Math.max(0,Number(localStorage.getItem('milo_receipt_margin')||'2'))),kitchen:(localStorage.getItem('milo_kitchen_print')||'1')==='1',shiftReport:(localStorage.getItem('milo_shift_print')||'1')==='1',drawer:localStorage.getItem('milo_drawer_mode')||'never',receiptOffset:Math.min(8,Math.max(-8,Number(localStorage.getItem('milo_receipt_offset')??'2')))});
// Browser edition: always use the browser print dialog; no Electron print driver.
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
function renderBrowserInstallNotice(){/* Native browser install UI only. */} function enforceBrowserHardening(){window.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('keydown',e=>{const k=(e.key||'').toLowerCase();if(k==='f12'||(e.ctrlKey&&e.shiftKey&&['i','j','c'].includes(k))||(e.ctrlKey&&['u','s'].includes(k))){e.preventDefault();e.stopPropagation();toast('هذه العملية غير متاحة داخل الكاشير',true);return false;}},true);let hits=0;setInterval(()=>{const opened=(window.outerWidth-window.innerWidth>160)||(window.outerHeight-window.innerHeight>160);if(opened){hits++;if(hits>=2){document.body.classList.add('devtools-warning');toast('يرجى تشغيل كاشير ميلو في وضع الاستخدام فقط',true);} }else{hits=0;document.body.classList.remove('devtools-warning');}},1400);}

const menus=[['sale','نقطة البيع','cart'],['products','المنتجات','package'],['labels','ملصقات الباركود','tag'],['invoices','الفواتير','receipt'],['reports','التقارير','chart'],['inventory','المخزون','boxes'],['customers','العملاء','users'],['loyalty','برنامج الولاء','gift'],['suppliers','الموردون','truck'],['purchases','المشتريات','shopping-bag'],['purchaseItems','بنود المشتريات','list'],['expenses','المصروفات','wallet'],['vouchers','السندات','file-text'],['returns','المرتجعات','undo'],['promotions','العروض','tag'],['employees','الموظفون','user-cog'],['shifts','الورديات','clock'],['onlineOrders','طلبات الزبائن','clipboard'],['manual','طلبات يدوية','clipboard'],['devices','الأجهزة','monitor'],['support','الدعم','headphones'],['settings','الإعدادات','settings'],['account','حسابي','user']];
const titles=Object.fromEntries(menus.map(x=>[x[0],x[1]]));
let handler=null,toastTimer=null,pollTimer=null,accountCheckTimer=null,accountCheckInFlight=false,accountCheckLastAt=0;
const ACCOUNT_CHECK_EVERY_MS=60000;
// أصوات محلية اختيارية؛ لا تعتمد على الإنترنت أو ملفات صوتية خارجية.
const soundEnabled=()=>localStorage.getItem('milo_product_sound')==='1';
const errorSoundEnabled=()=>localStorage.getItem('milo_error_sound')!=='0';
let miloAudioContext=null;
function playMiloSound(kind='product'){
 try{
  if((kind==='product'&&!soundEnabled())||(kind==='error'&&!errorSoundEnabled()))return;
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)return;
  if(!miloAudioContext)miloAudioContext=new AudioCtx();
  const ctx=miloAudioContext;
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  const now=ctx.currentTime;
  const tones=kind==='error'?[{hz:310,at:0,dur:.11},{hz:220,at:.15,dur:.18}]:[{hz:780,at:0,dur:.075},{hz:1050,at:.085,dur:.09}];
  for(const t of tones){const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind==='error'?'triangle':'sine';osc.frequency.setValueAtTime(t.hz,now+t.at);gain.gain.setValueAtTime(.0001,now+t.at);gain.gain.exponentialRampToValueAtTime(kind==='error'?.09:.055,now+t.at+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+t.at+t.dur);osc.connect(gain);gain.connect(ctx.destination);osc.start(now+t.at);osc.stop(now+t.at+t.dur+.012)}
 }catch(_){/* لا يجوز أن يمنع الصوت عملية البيع */}
}
// تهيئة الصوت عند أول تفاعل للمستخدم بسبب سياسات المتصفح.
document.addEventListener('pointerdown',()=>{if(miloAudioContext?.state==='suspended')void miloAudioContext.resume().catch(()=>{})},{passive:true});

function toast(message,isError=false){if(isError)playMiloSound('error');const el=$('toast');el.textContent=message;el.className='toast'+(isError?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),4300)}
function connection(ok,label){state.networkOK=ok;const el=$('connection');el.className='connection'+(ok?'':' offline');el.innerHTML='<i></i> '+esc(label||(ok?'متصل بالخادم':'تعذر الاتصال بالخادم'))}
function busy(v){state.isBusy=v;document.querySelectorAll('[data-commit]').forEach(x=>{x.disabled=!!v})}
function hdr(title,sub='',actions=''){ $('pageTitle').textContent=title;$('pageSub').textContent=sub;$('pageEyebrow').textContent='كاشير ميلو / '+(state.account?.storeName||'نقطة البيع');$('headerActions').innerHTML=actions}
function btn(label,act,id='',style='outline',extra=''){return `<button type="button" class="btn ${style} small" data-action="${esc(act)}" data-id="${esc(id)}" ${extra}>${MiloIcons.svg(MiloIcons.pick(act,label))}${esc(label)}</button>`}
function info(message,kind=''){return `<div class="notice ${esc(kind)}">${esc(message)}</div>`}
function field(label,key,value='',type='text',attrs=''){return `<label>${esc(label)}<input class="input" name="${esc(key)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`}
function selectField(label,key,choices,current=''){return `<label>${esc(label)}<select class="input" name="${esc(key)}">${choices.map(([v,s])=>`<option value="${esc(v)}" ${String(current)===String(v)?'selected':''}>${esc(s)}</option>`).join('')}</select></label>`}
function textArea(label,key,value=''){return `<label class="wide">${esc(label)}<textarea name="${esc(key)}" class="input">${esc(value)}</textarea></label>`}
function checkbox(label,key,yes){return `<label class="wide"><span><input type="checkbox" name="${esc(key)}" ${yes?'checked':''}>${esc(label)}</span></label>`}
function formGet(form){const out={};new FormData(form).forEach((v,k)=>out[k]=v);return out}
function tabular(headers,rows,empty='لا توجد بيانات بعد'){return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">${esc(empty)}</td></tr>`}</tbody></table></div>`}
function showModal(title,body,buttons=[{label:'إغلاق',type:'close'}]){$('modalTitle').textContent=title;$('modalContent').innerHTML=body;$('modalActions').innerHTML=buttons.map((b,i)=>`<button class="btn ${esc(b.style||'outline')}" data-action="modal-button" data-id="${i}" ${b.type==='save'?'data-commit':''}>${MiloIcons.svg(MiloIcons.pick('',b.label))}${esc(b.label)}</button>`).join('');handler=buttons;$('modal').classList.remove('hidden')}
function closeModal(){$('modal').classList.add('hidden');handler=null}
function confirmModal(title,description,task){showModal(title,`<p>${esc(description)}</p>`,[{label:'إلغاء',onClick:closeModal},{label:'تأكيد',style:'danger',onClick:async()=>{await task();closeModal()}}])}
async function request(payload,{timeoutMs=23000}={}){if(!navigator.onLine)throw Error('الجهاز بلا اتصال. يُمنع الحفظ حتى الاتصال بالخادم.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},redirect:'follow',credentials:'omit',body:JSON.stringify(payload),signal:controller.signal});if(!response.ok)throw Error('تعذر الوصول إلى تطبيق الويب (HTTP '+response.status+'). تحقق من صلاحيات النشر.');const txt=await response.text();let result;try{result=JSON.parse(txt)}catch{throw Error('لم يرجع الخادم JSON؛ قد يكون رابط النشر أو صلاحياته غير صحيحة.')}if(!result||result.ok!==true)throw Error(result?.message||'رفض الخادم تنفيذ الطلب.');connection(true,'متصل · مزامنة مباشرة');state.lastPing=Date.now();return result;
 }catch(e){connection(false,'الاتصال غير مؤكد');if(e?.name==='AbortError')throw Error('انتهت مهلة الطلب. حالة العملية غير مؤكدة، لا تنشئ فاتورة جديدة قبل التحقق.');if(e instanceof TypeError)throw Error('فشل الاتصال برابط Apps Script؛ افحص صلاحيات النشر وقيود CORS في المتصفح.');throw e}finally{clearTimeout(timer)}}
async function api(action,body={}){if(state.accountLocked)throw Error('الحساب موقوف. يرجى التواصل مع إدارة النظام.');if(!state.auth)throw Error('سجّل الدخول أولًا.');return request({action,username:state.auth.username,password:state.auth.password,...body})}
function isConnectionFailure(error){const msg=String(error?.message||error||'');return navigator.onLine===false||/بلا اتصال|انتهت مهلة|فشل الاتصال|تعذر الاتصال بالخادم|تعذر الوصول|الإنترنت|HTTP 502|fetch|network|Failed to fetch|Load failed|NetworkError|timed out/i.test(msg)}
function canDisplaySale(){return state.page==='sale'&&$('modal')?.classList.contains('hidden')===true}
async function updateQueueBadge(){
 try{const rows=state.account?await MiloLocal.list(state.account):[];const count=rows.length;
  const badge=$('syncQueueButton');if(badge){badge.hidden=!count;badge.classList.toggle('has-review',rows.some(x=>x.status==='review'));}
  if($('syncQueueCount'))$('syncQueueCount').textContent=String(count);
 }catch(e){const badge=$('syncQueueButton');if(badge){badge.hidden=false;badge.textContent='تعذر قراءة العمليات المحلية';}}
}
// V4: centred confirmation shown only after the backend acknowledges the sale.
function miloPaymentStatus(kind='approved'){
 const approved=kind==='approved';let el=document.getElementById('milo-payment-status');
 if(!el){el=document.createElement('div');el.id='milo-payment-status';el.className='milo-payment-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el)}
 el.innerHTML=`<div class="milo-payment-status-card"><div class="milo-payment-check">${approved?'✓':'◷'}</div><h2>${approved?'تم الدفع بنجاح':'تم الحفظ على الجهاز'}</h2><p>${approved?'تم اعتماد العملية وإرسال طلب الطباعة':'بانتظار المزامنة والاعتماد عند عودة الشبكة'}</p></div>`;
 el.classList.add('show');clearTimeout(miloPaymentStatus.timer);miloPaymentStatus.timer=setTimeout(()=>el.classList.remove('show'),2400);
}
function miloShortcut(key){return localStorage.getItem('milo_shortcut_'+key)||(key==='search'?'F2':'F4')}
function showShortcutSettings(){
 const choices=['F1','F2','F3','F4','F6','F7','F8','F9','F10'];
 const select=(id,value)=>`<select class="input" id="${id}">${choices.map(x=>`<option value="${x}" ${x===value?'selected':''}>${x}</option>`).join('')}</select>`;
 showModal('اختصارات لوحة المفاتيح',`<div class="stack"><label>اختصار البحث عن المنتج ${select('shortcutSearch',miloShortcut('search'))}</label><label>اختصار فتح الدفع ${select('shortcutPay',miloShortcut('pay'))}</label><p class="small-note">تُحفظ الاختصارات على هذا الجهاز فقط؛ ولا تعمل داخل حقول الكتابة.</p></div>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ الاختصارات',style:'primary',onClick:()=>{const search=$('shortcutSearch').value,pay=$('shortcutPay').value;if(search===pay){toast('اختر مفتاحين مختلفين',true);return}localStorage.setItem('milo_shortcut_search',search);localStorage.setItem('milo_shortcut_pay',pay);closeModal();toast('تم حفظ اختصارات الكاشير')}}]);
}
function refreshVisibleCatalog(){if(canDisplaySale()){renderCategories();renderSaleGrid();}}
async function cacheCoreSnapshots(){if(!state.account)return;const a=state.account;
 for(const [key,value] of [['products',state.products],['settings',state.settings],['shifts',state.shifts]]){
  try{await MiloLocal.cache(key,a,value)}catch(e){console.warn('cache snapshot',key,e)}
 }
}
async function restoreCachedSnapshots(){if(!state.account)return;const a=state.account;
 try{const [products,settings,shifts]=await Promise.all(['products','settings','shifts'].map(x=>MiloLocal.cached(x,a)));
  if(Array.isArray(products))state.products=products;
  if(settings&&typeof settings==='object')state.settings={...state.settings,...settings};
  if(Array.isArray(shifts)){state.shifts=shifts;state.activeShift=shifts.find(x=>!x.closed_at&&String(x.terminal)===terminalId())||null}
 }catch(e){console.warn('تعذر استرداد البيانات المحلية',e)}
}
async function markPendingInvoice(invoice){
 await MiloLocal.queue(invoice,state.account);await updateQueueBadge();
 state.cart=[];state.discountValue=0;state.customerValue='';state.pendingInvoice=null;
 closeModal();renderSale();
 toast('حُفظ طلب البيع على الجهاز بانتظار مزامنته ولم يتم اعتماده.');
}
async function showSyncQueue(){if(!state.account)return;const all=await MiloLocal.list(state.account);
 const rows=all.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(vDate(x.createdAt))}</td><td>${amt(x.invoice.total)}</td><td><span class="tag ${x.status==='review'?'amber':''}">${x.status==='review'?'تحتاج مراجعة':'بانتظار التأكيد'}</span></td><td>${esc(x.lastError||'—')}</td><td>${x.status==='review'?btn('إعادة المحاولة','retry-sync-invoice',x.id,'secondary'):''}</td></tr>`).join('');
 showModal('مزامنة الفواتير المحفوظة',`<div class="stack">${info('تُحفظ الفواتير غير المؤكدة على هذا الجهاز. لا تطبع الفاتورة الضريبية قبل تأكيد حفظها. تتم المحاولة عند عودة الاتصال وكل دقيقتين أثناء تشغيل التطبيق.')}<div class="metric"><span>فواتير بانتظار التأكيد أو المراجعة</span><b>${all.length}</b></div>${tabular(['رقم الفاتورة','التاريخ','الإجمالي','الحالة','ملاحظة','إجراء'],rows,'لا توجد فواتير معلقة')}</div>`,[{label:'إغلاق',onClick:closeModal},{label:'مزامنة الآن',style:'primary',onClick:async()=>{closeModal();await syncNow({manual:true});await showSyncQueue()}}]);
}
async function syncConfirmedInvoice(invoice){
 // Only the explicit Windows launcher signals a managed printing environment.
 // The flag does not grant permissions and does not guarantee physical printing.
 const managed=!!window.miloDesktop?.isDesktop||new URLSearchParams(location.search).get('milo_print_launch')==='1';
 if(window.miloDesktop?.printReceipt){printReceipt(invoice,false,false);return;}
 if(managed && document.visibilityState==='visible'){
  await new Promise(resolve=>{
   let settled=false;
   const done=()=>{if(settled)return;settled=true;window.removeEventListener('afterprint',done);resolve()};
   window.addEventListener('afterprint',done);
   // Give Chrome time to submit the last job before rendering the next receipt.
   setTimeout(done,4000);
   printReceipt(invoice,false,false);
  });
 } else toast('تم اعتماد فاتورة معلّقة. راجع الفواتير لإعادة طباعتها عند الحاجة.');
}
async function processOutbox(){
 const account=state.account;if(!account||!navigator.onLine)return;
 const all=await MiloLocal.list(account);
 for(const record of all){
  if(record.status==='review')continue;
  const inv=record.invoice;
  try{
   // A timed-out submit may have succeeded: check by stable invoice identifier before retry.
   const day=String(inv.date||'').slice(0,10);
   let alreadySaved=false;
   if(/^\d{4}-\d{2}-\d{2}$/.test(day)){
    const remote=await api('reports',{from:day,to:day});
    alreadySaved=(remote.reports||[]).some(r=>r.invoiceId===inv.invoiceId&&String(r.terminal)===String(inv.terminal));
   }
   if(!alreadySaved){
    const shifts=await api('shifts');
    const active=(shifts.shifts||[]).some(s=>!s.closed_at&&String(s.terminal)===String(inv.terminal));
    if(!active)throw Error('الوردية مغلقة الآن. راجع الفاتورة قبل إعادة المحاولة');
    const remoteProducts=(await api('products')).products||[];
    for(const item of inv.items){const product=remoteProducts.find(x=>String(x.barcode)===String(item.barcode));
     if(!product)throw Error('الصنف غير موجود الآن: '+String(item.barcode));
     if(!product.unlimitedStock && n(product.stock)<n(item.qty))throw Error('المخزون غير كافٍ للصنف: '+String(item.barcode));
    }
    await api('addInvoice',{invoice:inv});
   }
   // Once the server confirms, forget from outbox before attempting optional printing.
   await MiloLocal.erase(record.id);
   await updateQueueBadge();
   if(!record.printedOffline)await syncConfirmedInvoice(inv);
  }catch(e){
   if(isConnectionFailure(e))return; // retry later with SAME invoice ID
   // Server/business rejection needs user review; never blindly overwrite stock or re-send forever.
   record.status='review';record.lastError=String(e.message||e).slice(0,240);record.attempts=(record.attempts||0)+1;
   await MiloLocal.save(record);await updateQueueBadge();
  }
 }
}
async function syncNow({manual=false}={}){
 if(!state.auth||state.syncBusy)return;
 if(!navigator.onLine){connection(false,'الجهاز دون شبكة · حفظ محلي');await updateQueueBadge();return}
 state.syncBusy=true;
 try{
  await api('ping');
  await processOutbox();
  if(!state.networkOK)return;
  // Pull only changed catalog when backend understands ifRevision; other versions return full catalog.
  const [pr,settings,shifts]=await Promise.allSettled([
   api('products',{ifRevision:state.productsRevision||''}),api('getStoreSettings'),api('shifts')
  ]);
  if(pr.status==='fulfilled'){
   const r=pr.value;if(r.productsRevision)state.productsRevision=r.productsRevision;
   if(!r.productsUnchanged&&Array.isArray(r.products)){state.products=r.products;refreshVisibleCatalog();}
  }
  if(settings.status==='fulfilled')state.settings={...state.settings,...settings.value.settings};
  if(shifts.status==='fulfilled'){
   state.shifts=shifts.value.shifts||[];
   const before=!!state.activeShift;
   state.activeShift=state.shifts.find(x=>!x.closed_at&&String(x.terminal)===terminalId())||null;
   if(before!==!!state.activeShift&&state.page==='sale'&&$('modal')?.classList.contains('hidden'))renderSale();
  }
  if([pr,settings,shifts].every(r=>r.status==='rejected'))throw Error('تعذر جلب التغييرات من الخادم');
  await cacheCoreSnapshots();
  state.lastSyncAt=Date.now();await updateQueueBadge();
  if(manual)toast('اكتملت محاولة المزامنة. راجع الفواتير المعلقة لأي تعارض.');
 }catch(e){if(manual)toast('تعذّرت المزامنة: '+e.message,true)}finally{state.syncBusy=false}
}
async function retryPendingInvoice(id){const x=await MiloLocal.get(id);if(!x||x.scope!==state.account.storeCode+'::'+String(state.account.username).toLowerCase())throw Error('الفاتورة غير موجودة');
 x.status='pending';x.lastError='';await MiloLocal.save(x);closeModal();await syncNow({manual:true});await showSyncQueue();
}

// Account status is revalidated against the existing Apps Script login action.
// A temporary network failure must NEVER be mistaken for a suspended account.
const inactiveAccountStates=new Set(['closed','disabled','suspended','blocked','inactive','deactivated','expired','terminated','locked','مغلق','موقوف','معطل','معطّل','محظور','منتهي']);
function isAccountRevoked(account){
 if(!account||typeof account!=='object')return false;
 for(const value of [account.status,account.accountStatus,account.subscriptionStatus,account.state]){
  if(typeof value==='string'&&inactiveAccountStates.has(value.trim().toLowerCase()))return true;
 }
 return account.isActive===false||account.active===false||account.enabled===false||account.isClosed===true||account.isSuspended===true;
}
function isExplicitRevocationMessage(message){
 const text=String(message||'').trim();
 return /(?:الحساب|الاشتراك|المتجر).{0,36}(?:مغلق|موقوف|معط[ّ]?ل|محظور|منتهي|تم إيقافه|غير نشط)|(?:account|subscription|store).{0,36}(?:closed|suspended|disabled|blocked|deactivated|expired|inactive)/i.test(text);
}
function lockAccount(message){
 if(state.accountLocked)return;
 state.accountLocked=true;
 clearInterval(pollTimer);clearInterval(accountCheckTimer);
 // Do not clear or delete unsynchronized local data.
 state.auth=null;
 $('app')?.classList.add('hidden');$('loginScreen')?.classList.add('hidden');
 const panel=$('accountBlockedScreen');
 if(panel){$('accountBlockedReason').textContent=message||'تم إيقاف الحساب أو إغلاق اشتراك المتجر. يرجى التواصل مع إدارة النظام.';panel.classList.remove('hidden');}
 connection(false,'الحساب موقوف');
}
async function checkAccountStatus(){
 if(!state.auth||state.accountLocked||accountCheckInFlight||!navigator.onLine)return;
 accountCheckInFlight=true;accountCheckLastAt=Date.now();
 const credentials={...state.auth};
 try{
  const result=await request({action:'login',username:credentials.username,password:credentials.password},{timeoutMs:15000});
  if(!state.auth||state.auth.username!==credentials.username||state.accountLocked)return;
  if(isAccountRevoked(result.account)||isAccountRevoked(result)){
   lockAccount('تم إيقاف الحساب أو إغلاق الاشتراك من إدارة النظام. يرجى التواصل مع المسؤول.');return;
  }
  if(result.account){state.account={...state.account,...result.account};}
 }catch(err){
  if(!state.auth||state.accountLocked)return;
  if(isExplicitRevocationMessage(err.message))lockAccount(err.message);
  // Transient timeouts and offline errors retain the session; server must also
  // reject revoked accounts on every privileged API operation.
 }finally{accountCheckInFlight=false;}
}
function startAccountChecks(){
 clearInterval(accountCheckTimer);
 accountCheckTimer=setInterval(()=>{void checkAccountStatus()},ACCOUNT_CHECK_EVERY_MS);
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&state.auth&&Date.now()-accountCheckLastAt>=ACCOUNT_CHECK_EVERY_MS)void checkAccountStatus();
});
async function authenticate(username,password){const resp=await request({action:'login',username,password});miloSetLoginLoading(true,'تم التحقق من الحساب · جارٍ تهيئة المتجر...');if(isAccountRevoked(resp.account)||isAccountRevoked(resp))throw Error('الحساب موقوف أو مغلق. يرجى التواصل مع إدارة النظام.');state.accountLocked=false;$('accountBlockedScreen')?.classList.add('hidden');state.auth={username,password};state.account=resp.account;state.settings={store_name:resp.account?.storeName||'',vat_number:resp.account?.vatNumber||'',phone:resp.account?.phone||'',address:resp.account?.address||'',footer:'شكرًا لزيارتكم',restaurant_mode:'retail'};$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');$('storeTitle').textContent=resp.account.storeName||'متجر ميلو';$('userName').textContent=resp.account.ownerName||resp.account.username||'حساب المتجر';$('accountMenuOwner').textContent=resp.account.ownerName||resp.account.username||'حساب المتجر';$('accountMenuStore').textContent=resp.account.storeName||'إدارة الحساب';renderBrowserInstallNotice();$('mainNav').innerHTML=menus.map(([key,title,ico],idx)=>{
  const group=idx===0?'الرئيسية':idx===4?'المخزون والتشغيل':idx===8?'الإدارة المالية':idx===14?'الإدارة والنظام':'';
  return (group?`<div class="side-group-label sidebar-label">${group}</div>`:'')+`<button type="button" data-page="${key}" class="side-link ${key==='sale'?'active':''}" title="${esc(title)}" aria-label="${esc(title)}"><span class="side-icon" aria-hidden="true">${MiloIcons.svg(ico)}</span><span class="sidebar-label">${esc(title)}</span></button>`;
 }).join('');await MiloLocal.requestDurableStorage();await restoreCachedSnapshots();miloSetLoginLoading(true,'جارٍ تحميل المنتجات وإعدادات المتجر...');await refreshCore();await cacheCoreSnapshots();miloSetLoginLoading(true,'جارٍ تجهيز نقطة البيع...');await showPage(document.body.dataset.initialPage||'sale');await updateQueueBadge();void deviceEvent('open');clearInterval(pollTimer);pollTimer=setInterval(()=>{void syncNow();if(document.visibilityState==='visible')void deviceEvent('heartbeat')},120000);startAccountChecks();void syncNow()}
function logout(){closeAccountMenu();if(state.auth)void deviceEvent('close');clearInterval(pollTimer);clearInterval(accountCheckTimer);state.auth=null;state.account=null;state.products=[];state.reports=[];state.cart=[];state.held=[];state.pendingInvoice=null;$('app').classList.add('hidden');$('loginScreen').classList.remove('hidden');$('loginPass').value='';$('loginError').textContent='';connection(false,'غير مسجل');closeModal()}
async function deviceEvent(type){if(!state.auth)return;try{await api('saveDeviceEvents',{events:[{storeCode:state.account.storeCode,eventId:uid(),deviceCode:deviceCode(),deviceName:state.terminalName,eventType:type,occurredAt:dateTime(),details:'MILO browser'}]})}catch(_){}}
async function refreshCore(){const settled=await Promise.allSettled([api('products'),api('getStoreSettings'),api('customers'),api('suppliers'),api('shifts')]);const [pr,st,cu,su,sh]=settled;if(pr.status==='fulfilled'){state.products=pr.value.products||[];state.productsRevision=pr.value.productsRevision||'';}if(st.status==='fulfilled')state.settings={...state.settings,...st.value.settings};if(cu.status==='fulfilled')state.customers=cu.value.customers||[];if(su.status==='fulfilled')state.suppliers=su.value.suppliers||[];if(sh.status==='fulfilled')state.shifts=sh.value.shifts||[];state.activeShift=state.shifts.find(x=>!x.closed_at&&String(x.terminal)===terminalId())||null;if(pr.status==='rejected')toast('تعذّر تحديث المنتجات؛ ستبقى البيانات المحفوظة على الجهاز. '+pr.reason.message,true);await cacheCoreSnapshots()}
async function showPage(page){if(!titles[page])page='sale';state.page=page;document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));$('content').innerHTML='<div class="panel empty">جارٍ تحميل البيانات...</div>';try{const lookup={sale:renderSale,products:renderProductsPage,labels:renderLabelsPage,invoices:renderInvoicesPage,reports:renderReportsPage,inventory:renderInventoryPage,customers:()=>renderEntityPage('customers'),loyalty:renderLoyaltyPage,suppliers:()=>renderEntityPage('suppliers'),purchases:()=>renderEntityPage('purchases'),purchaseItems:()=>renderEntityPage('purchaseItems'),expenses:()=>renderEntityPage('expenses'),vouchers:()=>renderEntityPage('vouchers'),returns:()=>renderEntityPage('returns'),promotions:()=>renderEntityPage('promotions'),employees:()=>renderEntityPage('employees'),shifts:renderShiftsPage,manual:renderManualPage,onlineOrders:renderOnlineOrdersPage,devices:renderDevicesPage,support:renderSupportPage,settings:renderSettingsPage,account:renderAccountPage};await lookup[page]();renderBrowserInstallNotice()}catch(e){hdr(titles[page]);$('content').innerHTML=info(e.message,'danger');toast(e.message,true)}}
function setContent(html){$('content').innerHTML=html}
function optionsOf(p){try{const v=JSON.parse(p.restaurantOptionsJson||'{}');return {sizes:Array.isArray(v.sizes)?v.sizes:[],extras:Array.isArray(v.extras)?v.extras:[]}}catch{return {sizes:[],extras:[]}}}
function categoryNames(){return ['الكل',...new Set(state.products.map(p=>p.category).filter(Boolean))]}
function findProduct(barcode){return state.products.find(p=>String(p.barcode)===String(barcode))}
function lineTotal(row){return rnd(n(row.unitPrice)*row.qty+n(row.extrasPrice)*row.qty)}
function cartTotals(){const subtotal=rnd(state.cart.reduce((s,r)=>s+lineTotal(r),0));const discount=Math.min(subtotal,Math.max(0,n($('saleDiscount')?.value||0)));const total=rnd(subtotal-discount);const tax=String(state.settings.vat_number||state.account?.vatNumber||'').trim()?rnd(total*15/115):0;return {subtotal,discount,total,tax}}

/* Point of sale, barcodes, sizes, extras and online-only checkout */
function renderSale(){hdr('نقطة البيع','المنتجات والطلبات في شاشة واحدة', (state.activeShift?`<button type="button" data-page="shifts" class="shift-mini-button" title="الوردية مفتوحة — عرض التفاصيل">${MiloIcons.svg('check-circle')}<span>الوردية مفتوحة</span></button>`:'')+btn('تحديث المنتجات','refresh-products','','secondary')+btn('تعليق الطلب','hold-cart','','outline')+btn('استرجاع طلب','recover-held','','outline'));
 setContent(`<div class="sale-page ${state.activeShift?'sale-ready':'sale-locked'}">${state.activeShift?'':`<div class="shift-ribbon shift-inactive"><div class="shift-ribbon-icon">${MiloIcons.svg('lock')}</div><div><strong>الوردية مغلقة · البيع متوقف</strong><small>افتح وردية لتفعيل البيع على هذا الجهاز.</small></div><button class="btn primary small" data-page="shifts">فتح وردية الآن</button></div>`}<div class="sale-lockable"><div class="split"><section class="card sale-products"><div class="sale-toolbar"><div class="search-area"><input id="saleSearch" class="input" autocomplete="off" placeholder="ابحث عن منتج أو امسح الباركود" inputmode="search" spellcheck="false" value="${esc(state.saleQuery)}"></div><button class="btn outline small" data-action="focus-scan" title="تركيز البحث">بحث سريع</button><label class="chip"><input id="wholesaleMode" type="checkbox" ${state.wholesale?'checked':''}> سعر الجملة</label></div><div class="category-strip" id="categoryStrip"></div><div class="catalog" id="catalogGrid"></div></section><section class="card sale-cart"><div class="cart-title"><h2>سلة المشتريات</h2><span class="count-pill" id="cartPill">0 قطع</span></div><div class="cart-lines" id="cartLines"></div><div class="milo-cart-details ${localStorage.getItem('milo_cart_details_open')==='1'?'is-open':'is-closed'}" id="miloCartDetails"><button type="button" class="milo-cart-details-toggle" data-action="toggle-cart-details" id="miloCartDetailsToggle" aria-expanded="${localStorage.getItem('milo_cart_details_open')==='1'?'true':'false'}" aria-controls="miloCartDetailsBody"><span class="milo-cart-details-toggle-label"><span class="milo-cart-details-chevron" aria-hidden="true">⌄</span><strong>تفاصيل الطلب والحساب</strong></span><span class="milo-cart-details-hint">اضغط للإظهار أو الإخفاء</span></button><div class="milo-cart-details-body" id="miloCartDetailsBody" ${localStorage.getItem('milo_cart_details_open')==='1'?'':'hidden'}><label style="font-weight:800;font-size:11px">اسم العميل / ملاحظة الطلب<input id="saleCustomer" class="input" placeholder="عميل نقدي أو ملاحظة الطلب" value="${esc(state.customerValue||'')}"></label><label style="font-weight:800;font-size:11px">جوال العميل للولاء (اختياري)<input id="saleLoyaltyPhone" class="input" inputmode="tel" maxlength="16" placeholder="05xxxxxxxx" value="${esc(state.loyaltyPhone||'')}"></label>${String(state.settings.restaurant_mode||'retail')==='restaurant'?`<label style="font-weight:800;font-size:11px">نوع الطلب<select id="saleServiceType" class="input"><option value="سفري" ${state.serviceType==='سفري'?'selected':''}>سفري - Take Away</option><option value="محلي" ${state.serviceType==='محلي'?'selected':''}>محلي - Dine In</option></select></label>`:''}<div class="toolbar"><button class="btn outline small" data-action="loyalty-check-sale" type="button">رصيد نقاط العميل</button><button class="btn outline small" data-action="loyalty-redeem-sale" type="button">استبدال النقاط</button><small id="loyaltySaleInfo">${state.loyaltyUsed?`سيُستبدل ${state.loyaltyUsed} نقطة`: ''}</small></div><div class="total-box milo-cart-subtotals"><div class="total-row"><span>المجموع قبل الخصم</span><strong id="saleSubtotal">0.00</strong></div><div class="total-row"><span>الخصم (ر.س)</span><input id="saleDiscount" type="number" class="input" style="max-width:105px;min-height:34px;padding:5px" min="0" step="0.01" value="${n(state.discountValue)}"></div><div class="total-row"><span>ضريبة القيمة المضافة</span><strong id="saleTax">0.00</strong></div></div></div></div><div class="total-box milo-cart-grand"><div class="total-row grand"><span>الإجمالي النهائي</span><strong id="saleTotal">0.00</strong></div></div><div class="cart-checkout"><button class="btn outline" data-action="clear-cart">تفريغ السلة</button><button class="btn secondary" data-action="hold-cart">تعليق الطلب</button><button class="btn primary block full" id="startPay" data-action="start-payment" data-commit>متابعة الدفع والتحصيل</button></div><div class="small-note">اختصار البحث: F2 · اختصار الدفع: F4 · لا تعتبر الفاتورة مكتملة قبل تأكيد الحفظ في قاعدة البيانات.</div></section></div></div></div>`);
 renderCategories();renderSaleGrid();renderCart();updateShiftGate()}
function renderCategories(){const el=$('categoryStrip');if(!el)return;el.innerHTML=categoryNames().map(c=>`<button class="chip ${state.category===c?'active':''}" data-action="filter-category" data-id="${esc(c)}">${esc(c)}</button>`).join('')}
function renderSaleGrid(){const el=$('catalogGrid');if(!el)return;const q=state.saleQuery.trim().toLowerCase();const filtered=state.products.filter(p=>(state.category==='الكل'||p.category===state.category)&&(!q||(`${p.name} ${p.barcode} ${p.category}`).toLowerCase().includes(q)));el.innerHTML=filtered.map(p=>{const out=!p.unlimitedStock&&n(p.stock)<=0;const src=/^https:\/\//i.test(String(p.imageUrl||''))?p.imageUrl:'';const price=state.wholesale&&n(p.wholesalePrice)>0?n(p.wholesalePrice):n(p.price);return `<button class="catalog-card" data-action="add-product" data-id="${esc(p.barcode)}" ${out?'disabled':''}><div class="catalog-img">${src?`<img loading="lazy" src="${esc(src)}" alt="">`:'<span class="placeholder">▦</span>'}</div><div class="body"><b>${esc(p.name)}</b><small>${esc(p.category||'منتجات')}</small><div class="amount">${amt(price)}<span>${out?'نفد المخزون':p.unlimitedStock?'متوفر':'متاح '+esc(p.stock)}</span></div></div></button>`}).join('')||'<div class="empty">لا توجد منتجات مطابقة في المتجر.</div>'}
function requireOpenShift(){if(!state.activeShift){toast('افتح وردية أولًا من صفحة الورديات حتى تتمكن من البيع.',true);return false}return true}
function updateShiftGate(){const pay=$('startPay');if(pay)pay.disabled=!state.activeShift||!state.cart.length||state.isBusy;const search=$('saleSearch');if(search)search.disabled=!state.activeShift;document.querySelectorAll('#catalogGrid .catalog-card').forEach(b=>{if(!state.activeShift)b.disabled=true});const customer=$('saleCustomer'),discount=$('saleDiscount');if(customer)customer.disabled=!state.activeShift;if(discount)discount.disabled=!state.activeShift}
function addProduct(bc){if(!requireOpenShift())return;const p=findProduct(bc);if(!p)return toast('المنتج غير موجود',true);const chosen=state.cart.filter(x=>x.barcode===bc).reduce((s,x)=>s+x.qty,0);if(!p.unlimitedStock&&chosen>=n(p.stock))return toast('لا توجد كمية كافية من هذا المنتج',true);const opts=state.settings.restaurant_mode==='restaurant'?optionsOf(p):{sizes:[],extras:[]};if(opts.sizes.length||opts.extras.length){const sizes=opts.sizes.filter(x=>x.name);const extras=opts.extras.filter(x=>x.name);const body=`<div class="stack"><div class="panel soft"><b>${esc(p.name)}</b><p class="muted">حدد الأحجام والإضافات المتاحة لهذا الصنف.</p></div><form id="chooseOptions" class="stack">${sizes.length?`<label>الحجم<select id="sizeOption" class="input"><option value="">بدون حجم</option>${sizes.map((o,i)=>`<option value="${i}">${esc(o.name)} — ${amt(n(o.price))}</option>`).join('')}</select></label>`:''}${extras.length?`<label>الإضافات (اختياري)</label>${extras.map((o,i)=>`<label><input type="checkbox" name="addon" value="${i}"> ${esc(o.name)} ${n(o.price)>0?'— '+amt(o.price):'· مجاني'}</label>`).join('')}`:''}<label>ملاحظات الصنف<input name="note" class="input" maxlength="120" placeholder="اختياري"></label></form></div>`;
 showModal('خيارات المنتج',body,[{label:'إلغاء',onClick:closeModal},{label:'إضافة إلى السلة',style:'primary',onClick:()=>{const form=$('chooseOptions');const sz=form.querySelector('#sizeOption')?.value||'';const size=sz===''?null:sizes[Number(sz)];const chosenExtras=[...form.querySelectorAll('[name=addon]:checked')].map(x=>extras[Number(x.value)]);const base=state.wholesale&&n(p.wholesalePrice)>0?n(p.wholesalePrice):n(p.price);pushLine(p,size?n(size.price):base,size?.name||'',chosenExtras,form.elements.note.value);closeModal()}}]);return}const base=state.wholesale&&n(p.wholesalePrice)>0?n(p.wholesalePrice):n(p.price);pushLine(p,base,'',[],'')}
function pushLine(p,unitPrice,sizeName,extras,note){if(!requireOpenShift())return;const other=extras.map(x=>x.name).join('، '),signature=JSON.stringify([p.barcode,unitPrice,sizeName,other,note]);const row=state.cart.find(r=>r.signature===signature);if(row)row.qty++;else state.cart.push({id:uid(),signature,barcode:p.barcode,name:p.name,unitPrice:rnd(unitPrice),size:sizeName,extras:extras.map(x=>({name:x.name,price:n(x.price)})),extrasPrice:rnd(extras.reduce((s,x)=>s+n(x.price),0)),note,qty:1});state.pendingInvoice=null;playMiloSound('product');renderCart()}
function editCart(id,diff){if(!requireOpenShift())return;const row=state.cart.find(x=>x.id===id);if(!row)return;const p=findProduct(row.barcode);const total=state.cart.filter(x=>x.barcode===row.barcode).reduce((s,x)=>s+x.qty,0);if(diff>0&&!p?.unlimitedStock&&total>=n(p?.stock))return toast('المخزون لا يكفي',true);row.qty+=diff;if(row.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);state.pendingInvoice=null;renderCart()}
function renderCart(){const target=$('cartLines');if(!target)return;const count=state.cart.reduce((s,x)=>s+x.qty,0);$('cartPill').textContent=count+' قطع · '+state.cart.length+' أصناف';target.innerHTML=state.cart.length?state.cart.map(row=>`<div class="cart-line"><div class="cart-line-header"><div><b>${esc(row.name)}</b><small style="display:block">${esc([row.size,row.extras.map(x=>x.name).join('، '),row.note].filter(Boolean).join(' · '))}</small></div><strong>${amt(lineTotal(row))}</strong></div><div class="cart-controls"><div class="counter"><button data-action="qty" data-id="${esc(row.id)}" data-step="-1">−</button><strong>${row.qty}</strong><button data-action="qty" data-id="${esc(row.id)}" data-step="1">+</button></div><span class="muted">${amt(row.unitPrice+row.extrasPrice)} / وحدة</span><button class="icon-text" data-action="remove-line" data-id="${esc(row.id)}">حذف</button></div></div>`).join(''):'<div class="empty"><b>سلة المشتريات فارغة</b>اختر الأصناف للبدء في البيع.</div>';const t=cartTotals();$('saleSubtotal').textContent=amt(t.subtotal);$('saleTax').textContent=amt(t.tax);$('saleTotal').textContent=amt(t.total);const svc=$('saleServiceType');if(svc&&String(state.settings.restaurant_mode||'retail')==='restaurant')svc.value=serviceTypeValue(state.serviceType)||'سفري';$('startPay').disabled=!state.activeShift||!state.cart.length||state.isBusy}
function holdCart(){if(!requireOpenShift())return;if(!state.cart.length)return toast('السلة فارغة',true);state.held.push({id:uid(),at:dateTime(),cart:structuredClone(state.cart),customer:state.customerValue||'',discount:n(state.discountValue),serviceType:serviceTypeValue(state.serviceType)||'سفري'});state.cart=[];state.pendingInvoice=null;state.discountValue=0;state.customerValue='';if(String(state.settings.restaurant_mode||'retail')==='restaurant'){state.serviceType='سفري';localStorage.setItem('milo_sale_service_type',state.serviceType);}renderSale();toast('تم تعليق الطلب على هذا الجهاز حتى انتهاء الجلسة')}
function showHeld(){showModal('طلبات معلقة في الجلسة',info('تُحفظ الطلبات المعلقة مؤقتًا في هذه الجلسة فقط؛ لا توجد واجهة تعليق سحابية في كود الخادم الحالي.','')+tabular(['التاريخ','الأصناف','إجراء'],state.held.map(x=>`<tr><td>${vDate(x.at)}</td><td>${x.cart.length}</td><td>${btn('استرجاع','restore-held',x.id,'secondary')}</td></tr>`).join('')),[{label:'إغلاق',onClick:closeModal}])}
function restoreHeld(idValue){if(!requireOpenShift())return;const old=state.held.find(x=>x.id===idValue);if(!old)return;state.cart=old.cart;state.discountValue=old.discount;state.customerValue=old.customer;state.serviceType=serviceTypeValue(old.serviceType)||state.serviceType||'سفري';localStorage.setItem('milo_sale_service_type',state.serviceType);state.held=state.held.filter(x=>x.id!==idValue);state.pendingInvoice=null;closeModal();renderSale();toast('تم استرجاع الطلب')}
// Short order number is local to this terminal; invoiceId remains the unique cloud identifier.
function nextLocalOrderNumber(){
 const key='milo_order_counter_'+terminalId();
 let current=0;
 try{current=Number(localStorage.getItem(key))||0}catch{}
 const next=current>=9999?1:current+1;
 try{localStorage.setItem(key,String(next))}catch{}
 return next;
}
function orderNumber(inv){
 const direct=Number(inv?.orderNumber);
 if(Number.isInteger(direct)&&direct>0)return String(direct);
 // Historical invoices retain their original identifier, rather than inventing an order number.
 return String(inv?.invoiceId||inv?.id||'');
}
// Stable, numeric, receipt-facing reference. The original invoiceId remains the
// authoritative accounting/API identifier; never replace it in stored records.
function printedInvoiceNumber(inv){
 const id=String(inv?.invoiceId||inv?.id||'');
 if(!id)return '—';
 // 53-bit integer hash; decimal result is stable across devices and reprints.
 let h=1469598103934665603n;
 for(let i=0;i<id.length;i++)h=BigInt.asUintN(64,(h^BigInt(id.charCodeAt(i)))*1099511628211n);
 return String(10000000000n+h%90000000000n);
}
function buildInvoice(){if(!state.cart.length)throw Error('السلة فارغة');const t=cartTotals();const cash=n($('cashPay')?.value),card=n($('cardPay')?.value);if(cash<0||card<0||!Number.isFinite(cash)||!Number.isFinite(card))throw Error('المبالغ المدخلة غير صالحة');if(rnd(cash+card)<t.total)throw Error('المبلغ المدفوع أقل من الإجمالي');if(card>t.total)throw Error('قيمة الشبكة لا يمكن أن تتجاوز الإجمالي');const paid=rnd(cash+card),date=dateTime();return {invoiceId:'MILO-'+date.slice(2,10).replace(/-/g,'')+'-'+uid().slice(0,12).toUpperCase(),orderNumber:nextLocalOrderNumber(),date,terminal:terminalId(),terminalName:state.terminalName,cashier:state.activeShift?.cashier||state.account.ownerName||state.account.username,customer:state.customerValue||'',customerPhone:state.loyaltyPhone||'',loyaltyPointsUsed:state.loyaltyUsed||0,subtotal:t.subtotal,discount:t.discount,total:t.total,vat:t.tax,cash,card,change:rnd(Math.max(0,paid-t.total)),items:state.cart.map(x=>({barcode:x.barcode,name:[x.name,x.size?'('+x.size+')':'',x.extras.length?' + '+x.extras.map(e=>e.name).join(' + '):'',x.note?'['+x.note+']':''].filter(Boolean).join(' '),qty:x.qty,price:rnd(x.unitPrice+x.extrasPrice),total:lineTotal(x)})),serviceType:String(state.settings.restaurant_mode||'retail')==='restaurant'?(serviceTypeValue(state.serviceType)||'سفري'):''}}
function showPayment(){if(!requireOpenShift())return;if(!state.cart.length)return toast('السلة فارغة',true);const t=cartTotals();const m=state.paymentMode;showModal('تحصيل قيمة الفاتورة',`<div class="metric"><span>إجمالي الفاتورة المطلوب</span><b>${amt(t.total)}</b></div><p class="muted">اختر طريقة الدفع، ثم أكد حفظ الفاتورة في السجل المركزي.</p><div class="payment-methods">${[['cash','نقدًا'],['card','شبكة'],['mixed','مختلط']].map(([v,label])=>`<button class="paymethod ${m===v?'selected':''}" data-action="pay-mode" data-id="${v}">${label}</button>`).join('')}</div><form id="paymentForm" class="form">${field('المبلغ النقدي','cashPay',m==='card'?'0':t.total,'number','id="cashPay" min="0" step="0.01"')}${field('مبلغ الشبكة','cardPay',m==='card'?t.total:'0','number','id="cardPay" min="0" step="0.01"')}<p class="wide small-note">لا تضغط حفظ مرتين إذا انقطع الاتصال؛ أعد المحاولة بنفس الفاتورة من الزر المخصص.</p></form>`,[{label:'رجوع',onClick:closeModal},{label:'حفظ وتأكيد الدفع',style:'primary',type:'save',onClick:checkout}])}
function changePaymentMode(mode){state.paymentMode=mode;const t=cartTotals();document.querySelectorAll('.paymethod').forEach(b=>b.classList.toggle('selected',b.dataset.id===mode));$('cashPay').value=mode==='card'?0:t.total;$('cardPay').value=mode==='card'?t.total:0}
async function checkout(){
 if(!requireOpenShift())return;
 if(state.isBusy)return;
 if(!state.auth)throw Error('سجّل الدخول');
 if(!state.pendingInvoice){state.pendingInvoice=buildInvoice()}
 else{const current=buildInvoice();if(rnd(current.total)!==rnd(state.pendingInvoice.total))throw Error('تغير الإجمالي. أعد معالجة الفاتورة قبل الدفع')}
 const invoice=state.pendingInvoice;busy(true);
 // Never print a document marked as approved until the server has accepted
 // the invoice. Approved print is dispatched immediately on successful response.

 try{
  // Online path: preserve original shift/catalog checks. Offline path creates a LOCAL pending sale.
  // Parallel independent preflight reads: faster than waiting for two
  // separate network round trips while keeping shift and stock checks.
  const [shiftCheck, check]=await Promise.all([api('shifts'),api('products')]);
  state.shifts=shiftCheck.shifts||[];
  state.activeShift=state.shifts.find(x=>!x.closed_at&&String(x.terminal)===terminalId())||null;
  if(!state.activeShift)throw Error('تم إغلاق الوردية. افتح وردية قبل تنفيذ البيع');
  const latest=check.products||[];
  for(const item of invoice.items){const p=latest.find(x=>String(x.barcode)===String(item.barcode));
   if(!p)throw Error('الصنف غير موجود: '+item.barcode);
   if(!p.unlimitedStock&&n(p.stock)<n(item.qty))throw Error('المخزون لم يعد يكفي: '+item.barcode);
  }
  const result=await api('addInvoice',{invoice});
  state.cart=[];state.discountValue=0;state.customerValue='';state.loyaltyPhone='';state.loyaltyUsed=0;state.loyaltyBaseDiscount=0;state.pendingInvoice=null;
  closeModal();
  // Submit the COMPLETE approved customer receipt (tax QR when valid,
  // barcode, logo, payment details, policy) immediately after approval.
  // Do not await printer I/O before releasing the selling screen.
  void printReceipt(invoice,false,false,true).catch(err=>toast('تعذرت الطباعة: '+err.message,true));
  renderSale();miloPaymentStatus('approved');
  void api('products').then(x=>{if(Array.isArray(x.products)){state.products=x.products;if(state.page==='sale')renderSaleGrid()}}).catch(()=>{});
  toast(result.duplicate?'الفاتورة محفوظة مسبقًا وتم إرسال النسخة المعتمدة للطباعة':'تم اعتماد الفاتورة وإرسالها للطباعة كاملة');
 }catch(e){
  if(isConnectionFailure(e)){
   if(invoice.loyaltyPointsUsed)throw Error('لا يمكن استخدام نقاط الولاء دون اتصال مباشر. ألغِ الاستبدال وأعد محاولة الدفع.');
   // Persist BEFORE clearing cart; a failed IndexedDB write must never discard a transaction.
   try{
    await markPendingInvoice(invoice);
    // Persist the print flag before dispatching; automatic re-sync will not duplicate a receipt.
    const saved=await MiloLocal.get(invoice.invoiceId);
    if(saved && localStorage.getItem('milo_offline_print')!=='0'){
     saved.printedOffline=true;await MiloLocal.save(saved);
     try{await printReceipt({...invoice,__provisional:true},false,false,false)}catch(printErr){toast('حُفظت العملية لكن تعذرت طباعة النسخة غير المعتمدة: '+printErr.message,true)}
    }
    miloPaymentStatus('offline');
   }catch(storageErr){throw Error('تعذّر حفظ الفاتورة محليًا: '+storageErr.message+'؛ تحقق من قائمة الفواتير المعلقة قبل إعادة المحاولة')}
  }else{
   if(state.pendingInvoice && $('modalContent')) $('modalContent').insertAdjacentHTML('beforeend',info('لم تُقبل الفاتورة من الخادم: '+e.message,'danger'));
   throw e;
  }
 }finally{busy(false)}
}

function receiptQrSvg(inv,seller,vat){
 if(!/^3\d{13}3$/.test(vat)||typeof window.MiloQRCode!=='function')return '';
 try{const tags=[[1,seller],[2,vat],[3,inv.date],[4,n(inv.total).toFixed(2)],[5,n(inv.vat).toFixed(2)]],bytes=[];
  for(const [tag,value] of tags){const encoded=new TextEncoder().encode(String(value||''));if(encoded.length>255)return '';bytes.push(tag,encoded.length,...encoded)}
  const encoded=btoa(String.fromCharCode(...bytes));let qr=null;
  for(let version=1;version<27;version++){try{const obj=new MiloQRCode(version,MiloQRCodeLevels.M);obj.addData(encoded);obj.make();qr=obj;break}catch(_){}}
  if(!qr)return '';const length=qr.getModuleCount();let shapes='';for(let y=0;y<length;y++)for(let x=0;x<length;x++)if(qr.isDark(y,x))shapes+=`<rect x="${x+4}" y="${y+4}" width="1" height="1"/>`;
  return `<div class="qr-area"><svg viewBox="0 0 ${length+8} ${length+8}" width="${receiptCustom().qrSize}" height="${receiptCustom().qrSize}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="رمز QR ضريبي"><rect width="100%" height="100%" fill="white"/><g fill="black">${shapes}</g></svg></div>`;
 }catch{return ''}
}
// Code 39 barcode for the order identifier; available on provisional and approved receipts.
// This is an order lookup barcode, NOT a tax QR or evidence of server approval.
function receiptOrderBarcodeSvg(inv){
 const raw=String(orderNumber(inv)||'').toUpperCase().replace(/[^0-9A-Z. $/+%\-]/g,'');
 if(!raw||raw.length>48)return '';
 const patterns={"0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn","A":"wnnnnwnnw","B":"nnwnnwnnw","C":"wnwnnwnnn","D":"nnnnwwnnw","E":"wnnnwwnnn","F":"nnwnwwnnn","G":"nnnnnwwnw","H":"wnnnnwwnn","I":"nnwnnwwnn","J":"nnnnwwwnn","K":"wnnnnnnww","L":"nnwnnnnww","M":"wnwnnnnwn","N":"nnnnwnnww","O":"wnnnwnnwn","P":"nnwnwnnwn","Q":"nnnnnnwww","R":"wnnnnnwwn","S":"nnwnnnwwn","T":"nnnnwnwwn","U":"wwnnnnnnw","V":"nwwnnnnnw","W":"wwwnnnnnn","X":"nwnnwnnnw","Y":"wwnnwnnnn","Z":"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn"};
 let x=12,rects='';for(const ch of '*'+raw+'*'){
  const pat=patterns[ch];if(!pat)return '';
  for(let i=0;i<9;i++){const w=pat[i]==='w'?5:2;if(i%2===0)rects+=`<rect x="${x}" y="0" width="${w}" height="72"/>`;x+=w;}x+=2;
 }
 const h=Number(localStorage.getItem('milo_order_barcode_height')||18);
 return `<div class="milo-order-barcode"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="باركود رقم الطلب" viewBox="0 0 ${x+12} 72" width="100%" height="${Math.min(32,Math.max(12,h))*3.78}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects}</g></svg><div class="milo-order-barcode-number">${esc(raw)}</div></div>`;
}
function receiptItemsFromText(text){return String(text||'').split(' | ').filter(Boolean).map(x=>({name:x,qty:'',total:''}))}
function serviceTypeValue(raw){const v=String(raw||'').trim();if(!v)return '';const x=v.toLowerCase();if(v==='محلي'||['dine in','dinein','dine-in','داخل المحل'].includes(x))return 'محلي';if(v==='سفري'||v==='استلام من المحل'||v==='توصيل'||['take away','takeaway','take-away','pickup','delivery'].includes(x))return 'سفري';return v}
function serviceTypeBadge(inv){const mode=serviceTypeValue(inv?.serviceType||inv?.fulfillment||'');if(!mode)return '';return mode==='محلي'?'محلي - Dine In':'سفري - Take Away'}
function receiptDualLabel(ar,en){return `<span class="milo-dual-label"><span class="ar">${esc(ar)}</span><span class="en">${esc(en)}</span></span>`}
function receiptDualRow(ar,en,val,opt={}){const dir=opt.dir||'auto';return `<div class="milo-dual-row"><span class="en">${esc(en)}:</span><b class="value" dir="${esc(dir)}">${esc(val??'')}</b><span class="ar">${esc(ar)}:</span></div>`}
function receiptSummaryRow(ar,en,val,strong=false){return `<div class="rline${strong?' receipt-strong':''}"><span>${receiptDualLabel(ar,en)}</span><b>${amt(val)}</b></div>`}
function receiptSummaryTextRow(ar,en,val){return `<div class="rline"><span>${receiptDualLabel(ar,en)}</span><b>${esc(val)}</b></div>`}
function printReceipt(invoice,fromHistory=false,manual=false,justSold=false){const seller=state.settings.store_name||state.account?.storeName||'كاشير ميلو';const vat=String(state.settings.vat_number||state.account?.vatNumber||'').trim();const addr=state.settings.address||state.account?.address||'';const phone=state.settings.phone||state.account?.phone||'';const items=Array.isArray(invoice.items)?invoice.items:receiptItemsFromText(invoice.items);const validVat=/^3\d{13}3$/.test(vat);const cash=n(invoice.cash),card=n(invoice.card);const prefs=printPrefs();const width=prefs.paper==='58'?'58':'80';const payLabel=manual?'—':cash>0&&card>0?'Mixed / مختلط':card>0?'Card / شبكة':'Cash / نقدًا';const serviceBadge=String(state.settings.restaurant_mode||'retail')==='restaurant'?serviceTypeBadge(invoice):'';$('receipt').dataset.paper=width;$('receipt').dataset.align=prefs.align;$('receipt').dataset.font=prefs.fontScale;$('receipt').style.setProperty('--receipt-pad',prefs.margin+'mm');$('receipt').style.setProperty('--receipt-offset',prefs.receiptOffset+'mm');
 $('receipt').style.setProperty('--milo-logo-scale',String(receiptCustom().logoSize/70));
 $('receipt').style.setProperty('--receipt-width',width==='58'?'54mm':'76mm');
 const rows=items.map(x=>`<tr><td><span class="item-main">${esc(x.name||'')}</span>${x.price!==''&&x.price!==undefined?`<span class="receipt-unit-price">Unit ${esc(amt(x.price))}</span>`:''}</td><td>${x.qty!==''&&x.qty!==undefined?esc(x.qty):''}</td><td>${x.price!==''&&x.price!==undefined?esc(amt(x.price)):''}</td><td>${x.total!==''&&x.total!==undefined?esc(amt(x.total)):''}</td></tr>`).join('');
 const showCashierBarcode=!manual&&String(state.settings.restaurant_mode||'retail')==='retail';
 const metaRows=[
   vat&&!manual?receiptDualRow('الرقم الضريبي','VAT No',vat,{dir:'ltr'}):'',
   addr?receiptDualRow('العنوان','Address',addr):'',
   phone?receiptDualRow('رقم الجوال','Mobile',phone,{dir:'ltr'}):'',
   receiptDualRow(manual?'رقم الطلب':'رقم الفاتورة',manual?'Order No':'Invoice',manual?orderNumber(invoice):printedInvoiceNumber(invoice),{dir:'ltr'}),
   invoice.cashier?receiptDualRow('الموظف','Employee',invoice.cashier):'',
   receiptDualRow('التاريخ','Date',vDate(invoice.date),{dir:'ltr'}),
   invoice.customer?receiptDualRow('العميل','Customer',invoice.customer):''
 ].filter(Boolean).join('');
 $('receipt').innerHTML=`<div class="receipt-inner"><div class="receipt-head">${receiptLogoHtml()}<h2>${esc(seller)}</h2>${state.settings.invoice_header?`<div class="receipt-sub milo-branch">${esc(state.settings.invoice_header)}</div>`:''}<div class="receipt-badge">${invoice.__provisional?'نسخة مبدئية — غير معتمدة':manual?'طلب يدوي غير محاسبي':validVat?'فاتورة ضريبية مبسطة':'إيصال مبيعات'}</div></div>${invoice.__provisional?'<div class="receipt-note milo-provisional-alert" style="border:2px solid #000;text-align:center;font-weight:bold;padding:8px">غير معتمدة — لا تُعد فاتورة ضريبية أو إثبات دفع</div>':''}<div class="receipt-box milo-classic-meta"><div class="receipt-grid milo-classic-grid milo-bilingual-meta">${metaRows}</div><div class="milo-order-number"><span>Order No / رقم الطلب</span><strong>${esc(orderNumber(invoice))}</strong></div>${serviceBadge?`<div class="milo-service-badge">${esc(serviceBadge)}</div>`:''}</div><table class="receipt-items milo-classic-items"><thead><tr><th><div class="milo-th-dual"><span class="en">Item</span><span class="ar">الصنف</span></div></th><th><div class="milo-th-dual"><span class="en">Qty</span><span class="ar">الكمية</span></div></th><th><div class="milo-th-dual"><span class="en">Price</span><span class="ar">السعر</span></div></th><th><div class="milo-th-dual"><span class="en">Total</span><span class="ar">المجموع</span></div></th></tr></thead><tbody>${rows}</tbody></table>${manual?`<div class="receipt-rule"></div><div class="receipt-note">${esc(invoice.notes||'')}</div>`:`<div class="receipt-rule"></div><div class="receipt-summary milo-classic-summary">${receiptSummaryRow('المجموع قبل الخصم','Subtotal',invoice.subtotal)}${n(invoice.discount)>0?receiptSummaryRow('الخصم','Discount',invoice.discount):''}${receiptSummaryRow('الضريبة (15%)','VAT (15%)',invoice.vat)}<div class="receipt-tax-note">الأسعار شاملة ضريبة القيمة المضافة</div>${receiptSummaryRow('الإجمالي','Total',invoice.total,true)}${receiptSummaryTextRow('تفاصيل الدفع','Payment Details',payLabel)}${cash>0?receiptSummaryRow('نقدًا','Cash',cash):''}${card>0?receiptSummaryRow('شبكة','Card',card):''}${n(invoice.change)>0?receiptSummaryRow('الباقي','Change',invoice.change):''}</div>`}<div class="receipt-footer">${esc(state.settings.footer||'شكرًا لزيارتكم')}${receiptCustom().policy?`<div class="milo-receipt-policy" data-hide-heading="${localStorage.getItem('milo_policy_heading')==='0'?'1':'0'}">${localStorage.getItem('milo_policy_heading')==='0'?'':`<strong>سياسة الاستبدال والاسترجاع</strong><br>`}${esc(receiptCustom().policy)}</div>`:''}${receiptCustom().extra?`<div class="milo-receipt-extra">${esc(receiptCustom().extra)}</div>`:''}</div>${!invoice.__provisional&&validVat&&prefs.showQr?receiptQrSvg(invoice,seller,vat):''}${!invoice.__provisional&&validVat&&prefs.showQr?'<div class="qr-caption">امسح الرمز للتحقق</div>':''}${showCashierBarcode?receiptOrderBarcodeSvg(invoice):''}</div>`;
 return queueReceiptHtml($('receipt').outerHTML,width,{kitchen:!invoice.__provisional&&!manual&&!fromHistory&&state.settings.restaurant_mode==='restaurant'&&prefs.kitchen?invoice:null,drawer:justSold&&(prefs.drawer==='all'||(prefs.drawer==='cash'&&cash>0))});
}
// Browser thermal roll: supply a per-job page height instead of @page size:auto.
// CSS page size is a request to Chrome/Edge and can still be overridden by the driver.
function prepareContinuousBrowserPage(html,paper){
  const rollMm=paper==='58'?58:80;
  const printableMm=paper==='58'?54:76;
  const holder=document.createElement('div');
  holder.className='milo-print-measure';
  holder.setAttribute('aria-hidden','true');
  holder.innerHTML=html;
  document.body.append(holder);
  const receipt=holder.querySelector('#receipt');
  let heightPx=0;
  try{
    if(!receipt)throw Error('لا يمكن قياس محتوى الفاتورة');
    receipt.style.setProperty('display','block','important');
    receipt.style.setProperty('width',printableMm+'mm','important');
    receipt.style.setProperty('height','auto','important');
    receipt.style.setProperty('max-height','none','important');
    receipt.style.setProperty('overflow','visible','important');
    // Detect wrapping, expanded item rows, QR and footer rather than estimating by item count.
    const content=receipt.querySelector('.receipt-inner')||receipt;
    heightPx=Math.max(receipt.scrollHeight,content.scrollHeight,content.getBoundingClientRect().height);
  }finally{holder.remove()}
  if(!Number.isFinite(heightPx)||heightPx<=0)throw Error('تعذر حساب طول الفاتورة');
  // Measure with the same compact receipt typography used for printing.
  // Do not add percentage-based slack; that caused large blank tails on long receipts.
  // Three mm is reserved for thermal printer feeding/cutting tolerances.
  const pageMm=Math.max(32,Math.ceil(heightPx*25.4/96+3));
  let style=document.getElementById('milo-continuous-page-rule');
  if(!style){style=document.createElement('style');style.id='milo-continuous-page-rule';document.head.append(style)}
  style.textContent=`@page {size:${rollMm}mm ${pageMm}mm; margin:0} @media print {html,body{width:${rollMm}mm!important;min-height:0!important;height:auto!important;overflow:visible!important} body.milo-browser-print #receipt.print-receipt{margin:0!important;break-after:avoid!important;page-break-after:avoid!important}}`;
  return pageMm;
}
function queueReceiptHtml(html,paper,options={}){
 const tasks=[{html,paper,receiptType:"customer"}];if(options.kitchen)tasks.push({html:kitchenTicketHtml(options.kitchen,paper),paper,receiptType:"kitchen"});
 // Jobs must run in order, not concurrently: a second job can otherwise collide with the first.
 const job=async()=>{if(localStorage.getItem("milo_print_mode")==="bridge"){if(!window.MiloPrintBridge)throw Error("ملف ربط الطابعة غير متاح");for(const task of tasks)await window.MiloPrintBridge.printTask(task);if(options.drawer){try{await window.MiloPrintBridge.openDrawer()}catch(e){toast("الفاتورة طُبعت لكن تعذر فتح الدرج: "+String(e?.message||e),true)}}return;}if(localStorage.getItem("milo_direct_mode")==="1"){if(!window.MiloDirectPrint)throw Error("ملف الطباعة المباشرة غير متاح");for(const task of tasks)await window.MiloDirectPrint.printTask(task);if(options.drawer){try{await window.MiloDirectPrint.openDrawer()}catch(e){toast("الفاتورة أُرسلت لكن تعذر فتح الدرج: "+String(e?.message||e),true)}}return;} if(options.drawer){if(window.miloDesktop?.openDrawer){try{await window.miloDesktop.openDrawer()}catch(e){toast('تعذر فتح درج المال: '+String(e?.message||e),true)}}else{toast("طباعة المتصفح العادية لا ترسل أمر فتح درج المال؛ استخدم طباعة ESC/POS المباشرة أو Bridge متوافقًا.",true)}}for(const task of tasks){
   // Browser-compatible printing: print the actual receipt element already present in
   // the main application, using the printer's roll-paper configuration. Do not
   // synthesize a long paper size or create a second hidden document.
   if(window.miloDesktop?.printBrowserReceipt && printPrefs().mode==='browser'){
     const el=$('receipt');if(!el)throw Error('عنصر الفاتورة غير موجود');
     el.outerHTML=task.html;
     document.body.classList.add('milo-browser-print');
     try{
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       const result=await window.miloDesktop.printBrowserReceipt();
       if(result?.cancelled)throw Error('تم إلغاء الطباعة من نافذة الطابعة');
     }finally{document.body.classList.remove('milo-browser-print')}
   }else if(window.miloDesktop?.printReceipt){
     await window.miloDesktop.printReceipt(task);
   }else{
     const el=$('receipt');if(!el)throw Error('عنصر الفاتورة غير موجود');
     el.outerHTML=task.html;
     document.body.classList.add('milo-browser-print');
     try {
       if(!sessionStorage.getItem('milo_print_browser_hint_348')){
         sessionStorage.setItem('milo_print_browser_hint_348','1');
         toast('لإخفاء رابط الموقع والوقت: في نافذة الطباعة افتح «مزيد من الإعدادات» وألغِ «الرؤوس والتذييلات»، واضبط المقياس 100% (فعلي).');
       }
       if(document.fonts?.ready)await document.fonts.ready;
       await Promise.all([...document.querySelectorAll('#receipt img')].map(i=>i.decode?i.decode().catch(()=>{}):Promise.resolve()));
       prepareContinuousBrowserPage(task.html,task.paper);
       await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
       window.print();
     } finally {
       document.body.classList.remove('milo-browser-print');
     }
     // Unlike the native job callback, window.print() has no reliable completion
     // notification across browsers. The delay is for browser-only fallback.
     await new Promise(resolve=>setTimeout(resolve,2000));
   }
  }};
 const next=receiptPrintQueue.then(job,job);
 receiptPrintQueue=next.catch(()=>{});
 next.then(()=>toast(tasks.length>1?'تم إرسال فاتورة الزبون وتذكرة المطبخ للطباعة':'تم إرسال المستند للطباعة')).catch(e=>toast('تعذرت الطباعة: '+String(e?.message||e),true));
 return next;
}
let receiptPrintQueue=Promise.resolve();
function kitchenTicketHtml(inv,paper){
 const items=Array.isArray(inv.items)?inv.items:receiptItemsFromText(inv.items);
 const rows=items.map(x=>`<tr><td>${esc(x.name||'')}</td><td>${esc(x.qty??'')}</td></tr>`).join('');
 return `<section id="receipt" class="print-receipt milo-special-ticket" data-paper="${paper}" style="--receipt-width:${paper==='58'?'54':'76'}mm;--receipt-pad:${printPrefs().margin}mm;--receipt-offset:${printPrefs().receiptOffset}mm" dir="rtl"><div class="receipt-inner"><div class="receipt-head"><h2>تذكرة تحضير المطبخ</h2><b>ليست فاتورة للزبون</b><div class="milo-order-number"><span>رقم الطلب</span><strong>${esc(orderNumber(inv))}</strong></div></div><div class="receipt-box"><div>رقم الطلب: <b>${esc(orderNumber(inv))}</b></div><div>الوقت: ${esc(vDate(inv.date))}</div>${inv.customer?`<div>العميل: ${esc(inv.customer)}</div>`:''}</div><table class="receipt-items"><thead><tr><th>الصنف / الإضافات</th><th>الكمية</th></tr></thead><tbody>${rows}</tbody></table>${inv.notes?`<div class="receipt-note">ملاحظات: ${esc(inv.notes)}</div>`:''}<div class="receipt-footer">يرجى تجهيز الطلب</div></div></section>`;
}
function shiftReportHtml(shift,paper){
 const cashDiff=rnd(n(shift.closing_cash)-n(shift.expected_cash));
 const money=v=>amt(v);
 const row=(title,value,em=false)=>`<div class="milo-shift-row${em?' milo-shift-em':''}"><span>${esc(title)}</span><b>${esc(value)}</b></div>`;
 const group=(title,rows)=>`<div class="milo-shift-group"><div class="milo-shift-group-title">${esc(title)}</div>${rows.join('')}</div>`;
 const html=`<section id="receipt" class="print-receipt milo-special-ticket milo-shift-ticket" data-paper="${paper}" style="--receipt-width:${paper==='58'?'54':'76'}mm;--receipt-pad:${printPrefs().margin}mm;--receipt-offset:${printPrefs().receiptOffset}mm" dir="rtl"><div class="receipt-inner"><div class="receipt-head"><div class="milo-shift-heading">MILO CASHIER</div><h2>تقرير إغلاق الوردية</h2><div class="receipt-sub">${esc(state.settings.store_name||state.account?.storeName||'كاشير ميلو')}</div></div>${group('بيانات الوردية',[row('رقم الوردية',String(shift.shift_id||'—')),row('الموظف',String(shift.cashier||'—')),row('الجهاز',String(state.terminalName||'—')),row('من',vDate(shift.opened_at)),row('إلى',vDate(shift.closed_at))])}${group('ملخص المبيعات',[row('عدد الفواتير',String(shift.invoice_count??0)),row('إجمالي المبيعات',money(shift.total_sales),true),row('نقدًا',money(shift.cash_sales)),row('شبكة',money(shift.card_sales)),row('الخصومات',money(shift.discount)),row('الضريبة',money(shift.vat))])}${group('تسوية الصندوق',[row('رصيد الافتتاح',money(shift.opening_cash)),row('النقد المتوقع',money(shift.expected_cash)),row('النقد المعدود',money(shift.closing_cash)),row('فرق الصندوق',money(cashDiff),true)])}<div class="milo-shift-end">نهاية التقرير • للاستخدام الإداري فقط</div></div></section>`;
 return html;
}


// V9: a printable, read-only day snapshot derived exclusively from approved Reports.
// No new server endpoint or Google Sheet columns; never count ReportDaily snapshots on top of invoices.
function miloSaudiDay(time){return new Date(time+3*3600000).toISOString().slice(0,10)}
function miloDayTotals(rows){
 const total=k=>rnd(rows.reduce((sum,r)=>sum+n(r[k]),0));
 const cash=rnd(rows.reduce((sum,r)=>sum+Math.max(0,n(r.cash)-n(r.change)),0));
 const card=total('card');
 const mixed=rows.filter(r=>n(r.card)>0&&n(r.cash)>0).length;
 const terminals=[...new Set(rows.map(r=>String(r.terminalName||r.terminal||'غير معروف')))];
 return {count:rows.length,sales:total('total'),subtotal:total('subtotal'),discount:total('discount'),vat:total('vat'),cash,card,mixed,average:rows.length?rnd(total('total')/rows.length):0,terminals};
}
function miloDayClosingReportHtml(shift,paper,dayRows,meta={}){
 const cashDiff=rnd(n(shift.closing_cash)-n(shift.expected_cash));
 const day=miloSaudiDay(miloShiftTime(shift.closed_at));
 const totals=miloDayTotals(dayRows);
 const r=(label,val,strong=false)=>`<div class="milo-shift-row${strong?' milo-shift-em':''}"><span>${esc(label)}</span><b>${esc(String(val))}</b></div>`;
 const section=(name,items)=>`<div class="milo-shift-group"><div class="milo-shift-group-title">${esc(name)}</div>${items.join('')}</div>`;
 const stats=reportProductStats(dayRows).items.sort((a,b)=>b.qty-a.qty).slice(0,5);
 const productRows=stats.map((p,i)=>r(`${i+1}. ${p.name}`,`${p.qty}${p.estimated?' تقريبًا':''}`));
 const terminalLabels=totals.terminals.length?totals.terminals.join('، '):'لا توجد مبيعات';
 const caution=meta.pendingUnknown?'تنبيه: لا يمكن التأكد من المبيعات غير المتزامنة على الأجهزة الأخرى.':'بيانات اليوم تشمل الفواتير المعتمدة المتاحة على الخادم فقط.';
 return `<section id="receipt" class="print-receipt milo-special-ticket milo-shift-ticket milo-day-close-ticket" data-paper="${paper}" style="--receipt-width:${paper==='58'?'54':'76'}mm;--receipt-pad:${printPrefs().margin}mm;--receipt-offset:${printPrefs().receiptOffset}mm" dir="rtl"><div class="receipt-inner"><div class="receipt-head"><div class="milo-shift-heading">MILO CASHIER</div><h2>تقرير إغلاق الوردية واليوم</h2><div class="receipt-sub">${esc(state.settings.store_name||state.account?.storeName||'كاشير ميلو')}</div>${state.settings.address?`<div class="receipt-sub">${esc(state.settings.address)}</div>`:''}</div>
 ${section('بيانات الإغلاق',[r('تاريخ اليوم',day),r('حتى وقت الإغلاق',vDate(shift.closed_at)),r('رقم الوردية',shift.shift_id||'—'),r('الكاشير',shift.cashier||'—'),r('الجهاز',state.terminalName||shift.terminal||'—'),r('بداية الوردية',vDate(shift.opened_at)),r('نهاية الوردية',vDate(shift.closed_at))])}
 ${section('حساب الوردية الحالية',[r('عدد الفواتير',shift.invoice_count),r('إجمالي المبيعات',amt(shift.total_sales),true),r('نقدًا',amt(shift.cash_sales)),r('شبكة',amt(shift.card_sales)),r('الخصومات',amt(shift.discount)),r('الضريبة المتضمنة',amt(shift.vat))])}
 ${section('تسوية النقدية',[r('عهدة بداية الوردية',amt(shift.opening_cash)),r('النقد المتوقع',amt(shift.expected_cash)),r('النقد المعدود',amt(shift.closing_cash)),r('فرق الصندوق',amt(cashDiff),true)])}
 ${section('إجمالي اليوم - جميع أجهزة المحل',[r('عدد الفواتير المعتمدة',totals.count),r('المبيعات شاملة الضريبة',amt(totals.sales),true),r('الخصومات',amt(totals.discount)),r('الضريبة المتضمنة',amt(totals.vat)),r('مبيعات النقد',amt(totals.cash)),r('مبيعات الشبكة',amt(totals.card)),r('مدفوعات مختلطة (عدد)',totals.mixed),r('متوسط الفاتورة',amt(totals.average)),r('عدد الأجهزة التي سجلت بيعًا',totals.terminals.length)])}
 ${stats.length?section('الأصناف الأكثر بيعًا - اليوم',productRows):''}
 <div class="receipt-note" style="font-size:10px">${esc(caution)} لا يشمل عمليات البيع التي لم تزامن بعد، ولا يُعد تقرير أرباح صافية. هذا تقرير إداري وليس فاتورة ضريبية.</div><div class="milo-shift-end">نهاية تقرير اليوم • تم تسجيل إغلاق الوردية</div></div></section>`;
}

/* Catalog, stock and restaurant options */
async function renderProductsPage(){hdr('المنتجات والتصنيفات','إدارة الأصناف والأسعار والباركود والصور وخيارات المطعم',btn('إضافة منتج','new-product','','primary')+btn('تحديث','refresh-products'));
 const body=`<div class="section-tabs"><button class="chip ${state.tab==='products'?'active':''}" data-action="product-tab" data-id="products">إدارة المنتجات</button><button class="chip ${state.tab==='categories'?'active':''}" data-action="product-tab" data-id="categories">إدارة التصنيفات</button></div>${state.tab==='categories'?`<div class="panel">${info('التصنيفات في الخادم الحالي محفوظة داخل المنتج، ولا توجد ورقة مستقلة للتصنيفات. تعديل اسم تصنيف يحدّث المنتجات التابعة له.')} ${tabular(['اسم التصنيف','عدد المنتجات','الإجراء'],categoryNames().filter(x=>x!=='الكل').map(c=>`<tr><td><b>${esc(c)}</b></td><td>${state.products.filter(x=>x.category===c).length}</td><td>${btn('إعادة تسمية','rename-category',c,'secondary')} ${btn('إلغاء التصنيف','drop-category',c,'danger')}</td></tr>`).join(''))}</div>`:`<div class="panel"><div class="toolbar"><input id="productsQuery" class="input" placeholder="بحث بالاسم أو الباركود" style="max-width:360px"></div><div id="productListing"></div></div>`}`;setContent(body);if(state.tab==='products')productListing()}
function productListing(){const target=$('productListing');if(!target)return;const q=String($('productsQuery')?.value||'').trim().toLowerCase();const rows=state.products.filter(p=>`${p.name} ${p.barcode} ${p.category}`.toLowerCase().includes(q)).map(p=>{const src=/^https:\/\//i.test(p.imageUrl||'')?p.imageUrl:'';return `<tr><td>${src?`<img class="cell-image" src="${esc(src)}" loading="lazy">`:'▦'}</td><td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.barcode)}</small></td><td>${esc(p.category||'عام')}</td><td>${amt(p.price)}</td><td>${p.unlimitedStock?'∞':esc(p.stock)}</td><td>${btn('تعديل','edit-product',p.barcode,'secondary')} ${btn('حذف','delete-product',p.barcode,'danger')}</td></tr>`}).join('');target.innerHTML=tabular(['صورة','المنتج والباركود','التصنيف','السعر','المخزون','الإدارة'],rows)}
let draftSizes=[],draftExtras=[];
function optionInputs(kind){const arr=kind==='sizes'?draftSizes:draftExtras;return arr.map((o,i)=>`<div class="option-row"><input class="input" placeholder="${kind==='sizes'?'اسم الحجم':'اسم الإضافة'}" data-opt="${kind}" data-idx="${i}" data-key="name" value="${esc(o.name)}"><input class="input" type="number" min="0" step="0.01" data-opt="${kind}" data-idx="${i}" data-key="price" value="${n(o.price)}"><button type="button" class="btn danger small" data-action="remove-option" data-id="${kind}:${i}">حذف</button></div>`).join('')||'<p class="small-note">لا توجد خيارات لهذا المنتج.</p>'}
function updateOptionsFields(){if($('sizeRows'))$('sizeRows').innerHTML=optionInputs('sizes');if($('extraRows'))$('extraRows').innerHTML=optionInputs('extras')}
function productEditor(p){const opt=p?optionsOf(p):{sizes:[],extras:[]};draftSizes=opt.sizes.map(x=>({...x}));draftExtras=opt.extras.map(x=>({...x}));const cat=categoryNames().filter(x=>x!=='الكل');const body=`<form id="productForm" class="form">${field('اسم المنتج','name',p?.name||'','text','required maxlength="500"')}${field('الباركود','barcode',p?.barcode||'','text',p?'required readonly':'required maxlength="120"')}${field('التصنيف (يمكن كتابة اسم جديد)','category',p?.category||'عام','text','list="productCategories" required')}<datalist id="productCategories">${cat.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>${field('سعر التجزئة','price',p?.price??'0','number','min="0" step="0.01" required')}${field('سعر الجملة','wholesalePrice',p?.wholesalePrice??'0','number','min="0" step="0.01" required')}${field('سعر التكلفة','costPrice',p?.costPrice??'0','number','min="0" step="0.01" required')}${field('المخزون المتاح','stock',p?.stock??'0','number','min="0" step="0.001" required')}${field('حد تنبيه المخزون','minStock',p?.minStock??'0','number','min="0" step="0.001" required')}${field('الوحدة','unit',p?.unit||'حبة')}${field('رابط صورة HTTPS','imageUrl',p?.imageUrl||'','url','placeholder="https://..."')}${textArea('وصف الصنف','description',p?.description||'')}${checkbox('مخزون غير محدود','unlimitedStock',p?.unlimitedStock)}<div class="form-section"><h3>الأحجام</h3><p class="form-help">يمكنك إضافة عدة أحجام وأسعار مستقلة. مثال: صغير ووسط وكبير.</p><div id="sizeRows"></div><button type="button" class="btn secondary small" data-action="add-option" data-id="sizes">+ إضافة حجم</button></div><div class="form-section"><h3>الإضافات</h3><p class="form-help">الإضافة ذات السعر صفر تكون مجانية.</p><div id="extraRows"></div><button type="button" class="btn secondary small" data-action="add-option" data-id="extras">+ إضافة اختيار</button></div></form>`;
 showModal(p?'تعديل بيانات المنتج':'إضافة منتج',body,[{label:'إلغاء',onClick:closeModal},{label:'حفظ المنتج',style:'primary',type:'save',onClick:saveProductForm}]);updateOptionsFields()}
function readOptionEdits(){document.querySelectorAll('[data-opt]').forEach(el=>{const arr=el.dataset.opt==='sizes'?draftSizes:draftExtras;const item=arr[Number(el.dataset.idx)];if(item)item[el.dataset.key]=el.dataset.key==='price'?n(el.value):el.value})}
async function saveProductForm(){const f=$('productForm');if(!f.reportValidity())return;readOptionEdits();const d=formGet(f);for(const row of [...draftSizes,...draftExtras])if(!String(row.name||'').trim()||n(row.price)<0)throw Error('كل حجم أو إضافة يحتاج اسمًا وسعرًا غير سالب.');const old=findProduct(d.barcode);const product={...old,barcode:d.barcode.trim(),name:d.name.trim(),category:d.category.trim(),price:n(d.price),wholesalePrice:n(d.wholesalePrice),costPrice:n(d.costPrice),stock:n(d.stock),minStock:n(d.minStock),unit:d.unit.trim()||'حبة',description:d.description||'',imageUrl:d.imageUrl||'',unlimitedStock:f.elements.unlimitedStock.checked,restaurantOptionsJson:JSON.stringify({sizes:draftSizes,extras:draftExtras})};await api('saveProducts',{products:[product]});state.products=(await api('products')).products||[];closeModal();renderProductsPage();toast('تم حفظ المنتج ومزامنته مع قاعدة البيانات')}
async function deleteProduct(bc){await api('deleteEntity',{entityType:'product',recordId:bc});state.products=(await api('products')).products||[];renderProductsPage();toast('تم حذف المنتج دون المساس بالفواتير القديمة')}
function renameCategory(old){showModal('إعادة تسمية التصنيف',`<form id="renameCategoryForm" class="form">${field('اسم التصنيف الجديد','name',old,'text','required')}</form>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ على كل المنتجات',style:'primary',onClick:async()=>{const next=formGet($('renameCategoryForm')).name.trim();if(!next)throw Error('الاسم مطلوب');await updateCategory(old,next);closeModal();renderProductsPage()}}])}
async function updateCategory(old,next){const batch=state.products.filter(x=>x.category===old).map(x=>({...x,category:next}));if(batch.length>300)throw Error('يتطلب تعديل أكثر من 300 منتج تقسيم العملية إلى دفعات.');if(batch.length)await api('saveProducts',{products:batch});state.products=(await api('products')).products||[];toast('تم تحديث التصنيف')}
async function renderInventoryPage(){hdr('المخزون والجرد','إدارة رصيد الأصناف والتنبيه عند انخفاض المخزون',btn('تحديث المخزون','refresh-products','','secondary'));const low=state.products.filter(p=>!p.unlimitedStock&&n(p.stock)<=n(p.minStock));const sumCost=state.products.filter(p=>!p.unlimitedStock).reduce((s,p)=>s+n(p.stock)*n(p.costPrice),0);setContent(`<div class="metrics"><div class="metric"><span>عدد المنتجات</span><b>${state.products.length}</b></div><div class="metric"><span>منتجات منخفضة</span><b>${low.length}</b></div><div class="metric"><span>قيمة المخزون بالتكلفة (تقديرية)</span><b>${amt(sumCost)}</b></div><div class="metric"><span>الأجهزة</span><b>متعددة</b></div></div><div class="panel">${info('تعديل المخزون يتم عبر تحديث رصيد المنتج في قاعدة البيانات. لا توجد في الخادم الحالي حركة جرد محاسبية مستقلة أو إصدار رقمي لكل منتج؛ تجنب التعديلات المتزامنة على الرصيد.')}<div class="toolbar"><input class="input" id="stockFilter" placeholder="بحث في المخزون"></div><div id="stockTable"></div></div>`);stockListing()}
function stockListing(){const target=$('stockTable');if(!target)return;const q=String($('stockFilter')?.value||'').toLowerCase();const rows=state.products.filter(p=>`${p.name} ${p.barcode}`.toLowerCase().includes(q)).map(p=>`<tr><td><b>${esc(p.name)}</b><br><small>${esc(p.barcode)}</small></td><td>${esc(p.category||'عام')}</td><td>${p.unlimitedStock?'∞':esc(p.stock)}</td><td>${p.unlimitedStock?'<span class="tag">غير محدود</span>':n(p.stock)<=n(p.minStock)?'<span class="tag red">منخفض</span>':'<span class="tag">متوفر</span>'}</td><td>${amt(p.costPrice)}</td><td>${btn('تعديل','edit-product',p.barcode,'secondary')}</td></tr>`).join('');target.innerHTML=tabular(['المنتج','التصنيف','الكمية','الحالة','سعر التكلفة','تعديل'],rows)}

/* Generic store records. The REST backend has upserts but only supports deleteEntity for products and contacts. */
const RECORDS={
 customers:{label:'العملاء',action:'customers',save:'saveCustomers',payload:'customers',id:'contact_id',columns:[['name','اسم العميل','text',true],['phone','الجوال'],['address','العنوان'],['vat_number','الرقم الضريبي'],['balance','الرصيد','number'],['notes','ملاحظات']]},
 suppliers:{label:'الموردون',action:'suppliers',save:'saveSuppliers',payload:'suppliers',id:'contact_id',columns:[['name','اسم المورد','text',true],['phone','الجوال'],['address','العنوان'],['vat_number','الرقم الضريبي'],['balance','الرصيد','number'],['notes','ملاحظات']]},
 purchases:{label:'المشتريات',action:'purchases',save:'savePurchases',payload:'records',id:'record_id',columns:[['supplier_id','معرف المورد'],['supplier_name','اسم المورد'],['invoice_number','رقم فاتورة المورد'],['date','التاريخ','date',true],['total','قيمة المشتريات','number',true]]},
 purchaseItems:{label:'بنود المشتريات',action:'purchaseItems',save:'savePurchaseItems',payload:'records',id:'record_id',columns:[['purchase_id','معرف المشتريات', 'text',true],['product_id','باركود المنتج', 'text',true],['product_name','اسم المنتج'],['qty','الكمية','number',true],['unit_cost','تكلفة الوحدة','number',true],['line_total','الإجمالي','number',true]]},
 expenses:{label:'المصروفات',action:'expenses',save:'saveExpenses',payload:'records',id:'record_id',columns:[['date','التاريخ','date',true],['category','التصنيف'],['description','البيان','text',true],['amount','المبلغ','number',true],['payment_method','طريقة الدفع'],['created_by','سُجل بواسطة']]},
 vouchers:{label:'السندات والذمم',action:'vouchers',save:'saveVouchers',payload:'records',id:'record_id',columns:[['kind','نوع السند'],['contact_type','نوع الجهة'],['contact_id','معرف الجهة'],['contact_name','اسم الجهة'],['date','التاريخ','date',true],['amount','المبلغ','number',true],['reference','المرجع'],['notes','ملاحظات']]},
 returns:{label:'المرتجعات',action:'returns',save:'saveReturns',payload:'records',id:'record_id',columns:[['invoice_id','رقم الفاتورة','text',true],['date','التاريخ','date',true],['items','تفاصيل المنتجات'],['total','قيمة الإرجاع','number',true],['reason','السبب'],['refund_method','طريقة الاسترداد'],['created_by','سُجل بواسطة']]},
 promotions:{label:'العروض والخصومات',action:'promotions',save:'savePromotions',payload:'records',id:'record_id',columns:[['name','اسم العرض','text',true],['discount_type','نوع الخصم'],['discount_value','قيمة الخصم','number',true],['barcode','باركود المنتج'],['start_date','بداية العرض','date'],['end_date','نهاية العرض','date'],['enabled','التفعيل','checkbox']]},
 employees:{label:'سجل الموظفين',action:'employees',save:'saveEmployees',payload:'records',id:'record_id',columns:[['name','اسم الموظف','text',true],['username','اسم المستخدم'],['role','الصفة الوظيفية'],['enabled','الحالة','checkbox']]}
};
async function renderEntityPage(type){const cfg=RECORDS[type];if(!cfg)throw Error('صفحة غير موجودة');const r=await api(cfg.action);const records=(cfg.payload==='records'?r.records:r[cfg.payload])||[];state[type]=records;hdr(cfg.label,'بيانات حقيقية محفوظة في متجر حسابك',btn('إضافة سجل','new-record',type,'primary')+btn('تحديث','reload-page'));
 let notice='';if(type==='employees')notice=info('إدارة هذا السجل لا تنشئ مستخدمين قادرين على الدخول. خادمك الحالي لا يوفّر مسارات إنشاء مستخدم بصلاحيات مستقلة.','danger');if(type==='returns')notice=info('تسجيل المرتجع هنا لا يسترجع مخزون الفاتورة ولا يغير أصل المبيعات تلقائيًا في الخادم الحالي؛ يلزم تطوير العملية المحاسبية في Code.gs.','danger');if(type==='purchases'||type==='purchaseItems')notice=info('تسجيل المشتريات لا يزيد المخزون تلقائيًا في الخادم الحالي. حدّث الرصيد عبر صفحة المخزون بعد المراجعة.');if(type==='promotions')notice=info('حفظ العرض لا يطبّق الخصم تلقائيًا على شاشة البيع؛ نظام العروض يحتاج تنفيذ حسابه في Code.gs.');
 setContent(`<div class="metrics"><div class="metric"><span>السجلات</span><b>${records.length}</b></div><div class="metric"><span>المتجر</span><b style="font-size:14px">${esc(state.account.storeName||'المتجر الحالي')}</b></div></div><div class="panel">${notice}${type==='purchases'?`<div class="toolbar">${btn('إدارة بنود المشتريات','purchase-items','','secondary')}</div>`:''}<div class="toolbar"><input id="recordQuery" class="input" placeholder="بحث داخل السجلات" style="max-width:350px"></div><div id="recordsTable"></div></div>`);recordListing(type)}
function recordListing(type){const cfg=RECORDS[type],target=$('recordsTable');if(!cfg||!target)return;const q=String($('recordQuery')?.value||'').toLowerCase();const all=state[type]||[];const columns=cfg.columns.slice(0,5);const rows=all.filter(r=>JSON.stringify(r).toLowerCase().includes(q)).map(r=>`<tr>${columns.map(([key])=>`<td>${esc(r[key]??'—')}</td>`).join('')}<td>${btn('تعديل','edit-record',`${type}|${r[cfg.id]}`,'secondary')}</td></tr>`).join('');target.innerHTML=tabular([...columns.map(x=>x[1]),'إدارة'],rows)}
function recordEditor(type,existing){const cfg=RECORDS[type];if(!cfg)return;const body=`<form id="recordForm" class="form">${cfg.columns.map(([key,label,kind='text',required])=>kind==='checkbox'?checkbox(label,key,['1','true','yes','نعم'].includes(String(existing?.[key]??'').toLowerCase())):field(label,key,existing?.[key]??(kind==='date'?isoDay():''),kind,`${required?'required':''} ${kind==='number'?'step="0.01" min="0"':''}`)).join('')}</form>`;
 showModal((existing?'تعديل':'إضافة')+' — '+cfg.label,body,[{label:'إلغاء',onClick:closeModal},{label:'حفظ السجل',style:'primary',type:'save',onClick:async()=>{const f=$('recordForm');if(!f.reportValidity())return;const data=formGet(f);cfg.columns.forEach(([k,,kind])=>{if(kind==='number')data[k]=n(data[k]);if(kind==='checkbox')data[k]=f.elements[k].checked?1:0});data[cfg.id]=existing?.[cfg.id]||uid();if(type==='customers'||type==='suppliers'){if(!data.name?.trim())throw Error('الاسم مطلوب')}await api(cfg.save,{[cfg.payload]:[data]});closeModal();await renderEntityPage(type);toast('تم حفظ السجل في قاعدة البيانات')}}])}

/* Invoices and reporting */
async function loadInvoices(from,to){const r=await api('reports',{from:from||'',to:to||''});state.reports=r.reports||[];return state.reports}
async function renderInvoicesPage(){hdr('سجل الفواتير','بحث وطباعة الفواتير المحفوظة مركزيًا',btn('تحديث','reload-page','','secondary'));const today=isoDay(),first=today.slice(0,8)+'01';setContent(`<div class="panel"><div class="toolbar"><label>من تاريخ<input id="invoicesFrom" type="date" class="input" value="${first}"></label><label>إلى<input id="invoicesTo" type="date" class="input" value="${today}"></label><label>رقم أو اسم العميل<input id="invoiceQuery" class="input" placeholder="بحث"></label><label>اسم الكاشير<input id="cashierFilter" class="input" placeholder="جميع الكاشيرات"></label><button class="btn primary" data-action="search-invoices">عرض الفواتير</button></div><div id="invoicesListing"></div></div>`);await queryInvoices()}
async function queryInvoices(){const from=$('invoicesFrom').value,to=$('invoicesTo').value;if(from>to)throw Error('نطاق التاريخ غير صحيح');await loadInvoices(from,to);invoiceListing()}
function invoiceListing(){const el=$('invoicesListing');if(!el)return;const q=String($('invoiceQuery')?.value||'').toLowerCase(),c=String($('cashierFilter')?.value||'').toLowerCase();const records=state.reports.filter(i=>(!q||`${i.invoiceId} ${i.customer}`.toLowerCase().includes(q))&&(!c||`${i.cashier} ${i.terminalName||''}`.toLowerCase().includes(c)));el.innerHTML=`<div class="metrics"><div class="metric"><span>عدد الفواتير</span><b>${records.length}</b></div><div class="metric"><span>المبيعات</span><b>${amt(records.reduce((s,i)=>s+n(i.total),0))}</b></div><div class="metric"><span>نقدًا (بعد الباقي)</span><b>${amt(records.reduce((s,i)=>s+n(i.cash)-n(i.change),0))}</b></div><div class="metric"><span>شبكة</span><b>${amt(records.reduce((s,i)=>s+n(i.card),0))}</b></div></div>`+tabular(['الوقت','الفاتورة','الكاشير','العميل','الإجمالي','الدفع','عرض'],records.slice(0,500).map(i=>`<tr><td>${esc(vDate(i.date))}</td><td><b>${esc(i.invoiceId)}</b></td><td>${esc(i.terminalName||i.cashier)}</td><td>${esc(i.customer||'عميل نقدي')}</td><td>${amt(i.total)}</td><td>${n(i.card)?'شبكة'+(n(i.cash)?'/نقد':''):'نقد'}</td><td>${btn('التفاصيل والطباعة','invoice-detail',i.invoiceId,'secondary')}</td></tr>`).join(''))}
function invoiceDetail(idValue){const i=state.reports.find(x=>x.invoiceId===idValue);if(!i)return toast('الفاتورة غير موجودة',true);showModal('تفاصيل الفاتورة '+i.invoiceId,`<div class="stack"><div class="metrics"><div class="metric"><span>الإجمالي</span><b>${amt(i.total)}</b></div><div class="metric"><span>الضريبة</span><b>${amt(i.vat)}</b></div><div class="metric"><span>الخصم</span><b>${amt(i.discount)}</b></div><div class="metric"><span>العميل</span><b style="font-size:14px">${esc(i.customer||'نقدي')}</b></div></div><div class="panel soft"><b>الأصناف المسجلة:</b><p>${esc(i.items||'لا توجد تفاصيل')}</p></div>${info('الفواتير السابقة تحفظ تفاصيل الأصناف بصورة مختصرة، لذلك قد لا تظهر جميع خيارات الأحجام والأسعار عند إعادة الطباعة.')}</div>`,[{label:'إغلاق',onClick:closeModal},{label:'إعادة طباعة',style:'primary',onClick:()=>printReceipt(i,true)}])}
function reportDateRange(preset){
 const today=isoDay(),now=new Date(today+'T12:00:00');let from=today,to=today;
 if(preset==='week'){const d=new Date(now);d.setDate(d.getDate()-((d.getDay()+6)%7));from=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
 if(preset==='month')from=today.slice(0,8)+'01';
 if(preset==='all'){from='2000-01-01';to=today}
 return {from,to};
}
function reportPreset(preset){const r=reportDateRange(preset);$('reportFrom').value=r.from;$('reportTo').value=r.to;document.querySelectorAll('[data-report-preset]').forEach(b=>b.classList.toggle('active',b.dataset.reportPreset===preset));return reportData()}
function reportShiftSelection(){const sel=$('reportShift');if(!sel)return;const selected=sel.value;sel.innerHTML='<option value="">جميع الورديات</option>'+state.shifts.slice().sort((a,b)=>String(b.opened_at).localeCompare(String(a.opened_at))).map(x=>`<option value="${esc(x.shift_id)}" ${x.shift_id===selected?'selected':''}>${esc(x.cashier||'كاشير')} · ${esc(vDate(x.opened_at))} · ${x.closed_at?'مغلقة':'مفتوحة'}</option>`).join('')}
async function renderReportsPage(){hdr('التقارير والتحليلات','المبيعات والأصناف والورديات حسب الفترة',btn('تصدير التقرير','export-report','','secondary'));const day=isoDay();setContent(`<div class="panel"><div class="report-presets"><button class="chip" data-report-preset="today">اليوم</button><button class="chip" data-report-preset="week">الأسبوع</button><button class="chip active" data-report-preset="month">الشهر</button><button class="chip" data-report-preset="all">كامل الفترة</button></div><div class="toolbar"><label>من<input class="input" id="reportFrom" type="date" value="${day.slice(0,8)}01"></label><label>إلى<input class="input" id="reportTo" type="date" value="${day}"></label><label>الكاشير<select id="reportCashier" class="input"><option value="">كل الكاشيرات</option></select></label><label>الوردية<select id="reportShift" class="input"><option value="">جميع الورديات</option></select></label><button class="btn primary" data-action="load-report">تحديث التقرير</button></div><div id="reportsResult" aria-live="polite"></div></div>`);try{const shifts=await api('shifts');state.shifts=shifts.shifts||[]}catch(e){console.warn('Shift filter:',e.message)}reportShiftSelection();await reportData()}
async function reportData(){const from=$('reportFrom').value,to=$('reportTo').value;if(from>to)throw Error('تاريخ البداية أحدث من تاريخ النهاية');const out=$('reportsResult');if(out)out.innerHTML='<div class="report-loading"><span class="report-spinner"></span><b>جارٍ إعداد التقرير...</b><small>يتم تحميل الفواتير وتحليل المبيعات</small></div>';try{await loadInvoices(from,to);const terminals=[...new Set(state.reports.map(x=>x.terminalName||x.terminal||x.cashier).filter(Boolean))];const selected=$('reportCashier')?.value||'';$('reportCashier').innerHTML='<option value="">كل الكاشيرات</option>'+terminals.map(x=>`<option ${x===selected?'selected':''} value="${esc(x)}">${esc(x)}</option>`).join('');renderReportData()}catch(e){if(out)out.innerHTML=info('تعذر تحميل التقرير: '+e.message,'danger');throw e}}
function reportRows(){const terminal=$('reportCashier')?.value||'',shiftId=$('reportShift')?.value||'';const shift=shiftId?state.shifts.find(s=>String(s.shift_id)===shiftId):null;return state.reports.filter(x=>(!terminal||(x.terminalName||x.terminal||x.cashier)===terminal)&&(!shift||String(x.terminal)===String(shift.terminal)&&new Date(x.date).getTime()>=new Date(shift.opened_at).getTime()&&(!shift.closed_at||new Date(x.date).getTime()<=new Date(shift.closed_at).getTime())))}
function reportProductStats(records){const map=new Map();let uncertain=0;for(const invoice of records){let items=invoice.items;if(typeof items==='string'){try{const parsed=JSON.parse(items);if(Array.isArray(parsed))items=parsed}catch{}}if(Array.isArray(items)){for(const item of items){const name=String(item.name||item.barcode||'غير معروف').trim(),qty=Number(item.qty);if(!name)continue;const old=map.get(name)||{name,qty:0,revenue:0,occurrences:0,estimated:false};old.occurrences++;if(Number.isFinite(qty)&&qty>0){old.qty+=qty;old.revenue+=Number(item.total)||0}else{old.qty++;old.estimated=true;uncertain++}map.set(name,old)}}else{for(const part of String(items||'').split(' | ').filter(Boolean)){const match=part.trim().match(/^(.*?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*$/);const name=(match?match[1]:part).trim();if(!name)continue;const old=map.get(name)||{name,qty:0,revenue:0,occurrences:0,estimated:false};old.occurrences++;old.qty+=match?Number(match[2]):1;if(!match){old.estimated=true;uncertain++}map.set(name,old)}}}return {items:[...map.values()],uncertain}}
function miloDashboardTrend(data){
 const vals=data.map(x=>Math.max(0,Number(x[1])||0));
 if(!vals.length)return '<div class="milo-empty-chart">لا توجد فواتير خلال الفترة المحددة</div>';
 const w=760,h=240,left=28,right=16,top=20,bottom=35,plotW=w-left-right,plotH=h-top-bottom;
 const max=Math.max(1,...vals)*1.14;
 const points=vals.map((v,i)=>[left+(vals.length===1?plotW/2:i*plotW/(vals.length-1)),top+plotH-v/max*plotH]);
 const line=points.map(p=>p.join(',')).join(' ');
 const area=`${left},${top+plotH} ${line} ${left+plotW},${top+plotH}`;
 const grid=[0,.25,.5,.75,1].map(t=>{const y=top+plotH*(1-t);return `<line x1="${left}" y1="${y}" x2="${w-right}" y2="${y}" stroke="#e7eff0" stroke-dasharray="4 6"/><text x="${left-6}" y="${y+3}" fill="#79909a" font-size="10" text-anchor="end">${Math.round(max*t).toLocaleString('en-US')}</text>`}).join('');
 const labels=points.map((p,i)=>i%Math.max(1,Math.ceil(points.length/6))===0||i===points.length-1?`<text x="${p[0]}" y="${h-8}" fill="#667e83" font-size="11" text-anchor="middle">${esc(data[i][0].slice(5))}</text>`:'').join('');
 const dots=points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#008f88" stroke="white" stroke-width="2"><title>${esc(data[i][0])} — ${amt(vals[i])}</title></circle>`).join('');
 return `<svg class="milo-trend-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="مخطط المبيعات اليومية بحسب الفواتير المعتمدة" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="miloChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#08a7a0" stop-opacity=".27"/><stop offset="100%" stop-color="#08a7a0" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#miloChartFill)"/><polyline points="${line}" stroke="#008f88" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>${dots}${labels}</svg>`;
}
function miloMetric(label,value,desc,mark,kind=''){
 return `<div class="milo-kpi ${kind}"><div class="milo-kpi-top"><span>${label}</span><i aria-hidden="true">${mark}</i></div><strong>${value}</strong><small>${desc}</small></div>`;
}
function renderReportData(){
 const out=$('reportsResult');if(!out)return;
 const records=reportRows();state.reportCache=records;
 const sum=k=>records.reduce((a,x)=>a+n(x[k]),0);
 const total=sum('total'),cash=records.reduce((a,x)=>a+Math.max(0,n(x.cash)-n(x.change)),0),card=sum('card'),vat=sum('vat'),disc=sum('discount');
 const daily=new Map(),hours=Array(24).fill(0);
 for(const inv of records){const date=String(inv.date||'');const day=date.slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(day))daily.set(day,(daily.get(day)||0)+n(inv.total));const hour=Number(date.slice(11,13));if(/^\d\d$/.test(date.slice(11,13))&&hour>=0&&hour<24)hours[hour]+=n(inv.total)}
 const days=[...daily.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 const stats=reportProductStats(records),top=stats.items.slice().sort((a,b)=>b.qty-a.qty).slice(0,8),maxTop=Math.max(1,...top.map(x=>x.qty));
 const hourData=hours.map((v,h)=>[h,v]).filter(([h])=>h>=6&&h<=23),maxHour=Math.max(1,...hourData.map(x=>x[1]));
 const shiftId=$('reportShift')?.value||'',shift=state.shifts.find(s=>String(s.shift_id)===shiftId);
 const chart=miloDashboardTrend(days.slice(-31));
 const payTotal=Math.max(0,cash)+Math.max(0,card),cashPercent=payTotal?Math.min(100,Math.max(0,100*cash/payTotal)):0;
 const timeLabel=`${esc($('reportFrom')?.value||'')} — ${esc($('reportTo')?.value||'')}`;
 const topHtml=top.length?top.map((p,i)=>`<div class="milo-product-rank"><span class="milo-rank-num">${i+1}</span><div class="milo-rank-meta"><div><b>${esc(p.name)}</b><span>${Math.round(p.qty*100)/100} ${p.estimated?'تقريبًا':'وحدة'}</span></div><div class="milo-rank-track"><i style="width:${Math.max(3,Math.min(100,p.qty/maxTop*100))}%"></i></div></div></div>`).join(''):'<div class="milo-empty-chart">لا توجد أصناف مباعة</div>';
 out.innerHTML=`<section class="milo-dashboard" dir="rtl">
 <div class="milo-dash-hero"><div><span class="milo-dash-overline">MILO · BUSINESS INTELLIGENCE</span><h2>نظرة شاملة على أداء المبيعات</h2><p>بيانات حقيقية من الفواتير المسجلة في النظام · ${timeLabel}</p>${shift?`<p class="milo-shift-note">الوردية: ${esc(shift.shift_id)} · ${esc(shift.cashier||'—')}</p>`:''}</div><div class="milo-live-chip"><span></span> التقرير المحدّث</div></div>
 <div class="milo-kpi-grid">${miloMetric('إجمالي المبيعات',amt(total),'إجمالي الفواتير في الفترة','↗','primary')}${miloMetric('عدد الفواتير',records.length.toLocaleString('en-US'),'العمليات المسجلة','▤')}${miloMetric('متوسط الفاتورة',amt(records.length?total/records.length:0),'متوسط قيمة عملية البيع','≈')}${miloMetric('الضريبة المتضمنة',amt(vat),'وفق مبالغ الضريبة المحفوظة','٪')}${miloMetric('المبيعات النقدية',amt(cash),'النقد بعد خصم الباقي','◉')}${miloMetric('مبيعات الشبكة',amt(card),'المدفوع بالبطاقة','▥')}${miloMetric('الخصومات',amt(disc),'إجمالي الخصومات المسجلة','−')}${miloMetric('الفواتير المختلطة',records.filter(x=>n(x.card)>0&&n(x.cash)>0).length,'نقد وشبكة في العملية نفسها','◈')}</div>
 <div class="milo-dashboard-grid"><article class="milo-dash-card milo-wide-card"><div class="milo-card-head"><div><span>اتجاه الأداء</span><h3>حركة المبيعات اليومية</h3></div><small>آخر 31 يومًا ضمن الفترة المختارة</small></div>${chart}</article>
 <article class="milo-dash-card"><div class="milo-card-head"><div><span>قنوات الدفع</span><h3>توزيع طرق الدفع</h3></div></div><div class="milo-pay-chart"><div class="milo-donut" style="--milo-cash-pct:${cashPercent}%"><div><b>${Math.round(cashPercent)}%</b><small>نقد</small></div></div><div class="milo-pay-legend"><div><i class="cash"></i><span>نقدًا</span><b>${amt(cash)}</b></div><div><i class="card"></i><span>شبكة</span><b>${amt(card)}</b></div></div></div></article>
 <article class="milo-dash-card"><div class="milo-card-head"><div><span>أداء الأصناف</span><h3>المنتجات الأكثر مبيعًا</h3></div><small>حسب الكميات المتاحة</small></div><div class="milo-product-list">${topHtml}</div>${stats.uncertain?'<p class="milo-dash-note">بعض الفواتير القديمة لا تتضمن كمية دقيقة؛ الترتيب تقريبي لهذه البنود.</p>':''}</article>
 <article class="milo-dash-card milo-wide-card"><div class="milo-card-head"><div><span>ساعات الذروة</span><h3>المبيعات حسب ساعة الفاتورة</h3></div><small>من 06:00 حتى 23:00</small></div><div class="milo-hour-bars">${hourData.map(([h,value])=>`<div class="milo-hour-col" title="${h}:00 · ${amt(value)}"><div class="milo-hour-bar" style="height:${Math.max(3,value/maxHour*100)}%"></div><small>${h}</small></div>`).join('')}</div></article></div>
 <div class="milo-report-foot"><span>المصدر: فواتير Reports المحفوظة مركزيًا، بعد تطبيق الفترة والفلاتر.</span><span>الأرباح غير معروضة لعدم توفر تكلفة كل فاتورة في بيانات التقارير.</span></div></section>`;
}
function exportReport(){const rows=state.reportCache||[];const headers=['invoiceId','date','cashier','terminalName','customer','subtotal','discount','vat','total','cash','card','change'];const csv='\ufeff'+[headers.join(','),...rows.map(row=>headers.map(k=>'"'+String(row[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MILO-REPORT-'+isoDay()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}

/* Cashier shifts */
async function renderShiftsPage(){const r=await api('shifts');state.shifts=r.shifts||[];state.activeShift=state.shifts.find(x=>!x.closed_at&&String(x.terminal)===terminalId())||null;hdr('الورديات والصندوق','رصيد افتتاحي وإغلاق ومطابقة صندوق كل جهاز',btn('تحديث','reload-page','','secondary'));setContent(`<div class="columns2"><div class="card"><h2>${state.activeShift?'الوردية الحالية مفتوحة':'فتح وردية جديدة'}</h2>${state.activeShift?`<div class="stack">${info('وردية الجهاز: '+state.terminalName,'good')}<p>اسم الكاشير: <b>${esc(state.activeShift.cashier||'—')}</b></p><p>تاريخ الفتح: ${esc(vDate(state.activeShift.opened_at))}</p><p>رصيد البداية: <b>${amt(state.activeShift.opening_cash)}</b></p><label>النقد الموجود فعليًا<input class="input" id="closingBalance" type="number" min="0" step="0.01" value="0"></label><button class="btn primary" data-action="close-shift" data-commit>حفظ إغلاق الوردية</button></div>`:`<div class="stack"><label>اسم الكاشير <span style="color:#B42318">*</span><input class="input" id="openingCashierName" type="text" maxlength="100" autocomplete="name" required placeholder="اكتب اسم الكاشير المسؤول عن الوردية"></label><label>المبلغ النقدي الابتدائي<input class="input" id="startingBalance" type="number" min="0" step="0.01" value="0"></label><button class="btn primary" data-action="open-shift" data-commit>فتح الوردية</button></div>`}</div><div class="card"><h2>ملخص</h2><p>الجهاز: <b>${esc(state.terminalName)}</b></p><p>كود الجهاز: <small>${esc(terminalId())}</small></p><p class="small-note">حساب حركة الوردية يستند إلى سجلات Reports خلال الفترة. لا تُجرِ عمليات قفل متعدد الكاشيرات دون ترقية التحقق الخادمي.</p></div></div><div class="panel" style="margin-top:15px"><h2>سجل الورديات</h2>${tabular(['الجهاز','الكاشير','تاريخ الفتح','الإغلاق','بداية الصندوق','نهاية الصندوق','الحالة','التقرير'],state.shifts.slice().reverse().map(s=>`<tr><td>${esc(s.terminal)}</td><td>${esc(s.cashier||'—')}</td><td>${esc(vDate(s.opened_at))}</td><td>${s.closed_at?esc(vDate(s.closed_at)):'—'}</td><td>${amt(s.opening_cash)}</td><td>${s.closed_at?amt(s.closing_cash):'—'}</td><td><span class="tag ${s.closed_at?'':'amber'}">${s.closed_at?'مغلقة':'مفتوحة'}</span></td><td>${s.closed_at?btn('إعادة طباعة التقرير','print-closed-shift',s.shift_id,'secondary'): '—'}</td></tr>`).join(''))}</div>`)}
async function openShift(){const cashier=String($('openingCashierName')?.value||'').trim().replace(/\s+/g,' ');if(!cashier)throw Error('اكتب اسم الكاشير قبل فتح الوردية');if(cashier.length>100)throw Error('اسم الكاشير طويل جدًا');const start=n($('startingBalance')?.value);if(start<0)throw Error('رصيد افتتاحي غير صالح');const shift={shift_id:uid(),terminal:terminalId(),cashier,opened_at:dateTime(),closed_at:'',opening_cash:start,closing_cash:0,expected_cash:start,invoice_count:0,cash_sales:0,card_sales:0,total_sales:0,vat:0,discount:0};await api('saveShifts',{shifts:[shift]});await renderShiftsPage();toast('تم فتح الوردية على الخادم')}
// Shift totals must be confirmed against remote invoices BEFORE closing.
// The server returns UTC ISO timestamps as well as historical Sheets timestamps;
// normalize both, and expand the day query to avoid missing midnight boundaries.
function miloShiftTime(value){
 const valueText=String(value??'').trim();
 if(!valueText)return NaN;
 const parsed=Date.parse(valueText);
 if(Number.isFinite(parsed))return parsed;
 // Sheets sometimes returns yyyy-MM-dd HH:mm:ss without a timezone.
 const match=valueText.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
 return match?Date.parse(match[1]+'T'+match[2]+'+03:00'):NaN;
}
function miloShiftDay(time){return new Date(time).toISOString().slice(0,10)}
async function closeShift(){
 const shift=state.activeShift;
 if(!shift)throw Error('لا توجد وردية مفتوحة');
 const amount=n($('closingBalance')?.value);
 if(amount<0)throw Error('المبلغ النقدي غير صحيح');
 const opened=miloShiftTime(shift.opened_at);
 if(!Number.isFinite(opened))throw Error('تاريخ فتح الوردية غير قابل للقراءة، لم يتم إغلاقها');
 const current=Date.now();
 // Expand the query for midnight crossings; use the Saudi local calendar day for the report.
 const from=miloShiftDay(opened-86400000),to=miloShiftDay(current+86400000);
 const records=await loadInvoices(from,to);
 if(!Array.isArray(records))throw Error('تعذر جلب سجلات المبيعات. لم يتم إغلاق الوردية');
 const during=records.filter(i=>{const time=miloShiftTime(i.date);return Number.isFinite(time)&&time>=opened-1000&&time<=current+60000});
 const own=during.filter(i=>String(i.terminal||'').trim()===String(shift.terminal||'').trim());
 const pending=window.MiloLocal&&state.account?await MiloLocal.list(state.account).catch(()=>null):[];
 if(pending===null)throw Error('تعذر فحص الفواتير المحلية المعلقة. لم يتم إغلاق الوردية');
 const pendingCount=(pending||[]).filter(x=>miloShiftTime(x.invoice?.date)>=opened-1000).length;
 if(pendingCount)throw Error('هناك '+pendingCount+' فاتورة محلية معلقة لم تعتمد بعد. زامنها أو راجعها قبل إغلاق الوردية، حتى لا ينقص التقرير');
 if(during.length && !own.length){
  const codes=[...new Set(during.map(i=>String(i.terminal||'غير مسجل')))].slice(0,4).join('، ');
  throw Error('تم العثور على '+during.length+' فاتورة خلال الوردية، لكن رمز جهازها لا يطابق الوردية الحالية. رموز الفواتير: '+codes+'؛ رمز الوردية: '+shift.terminal+'. لم يتم الإغلاق لحماية الأرقام');
 }
 if(own.some(i=>!Number.isFinite(n(i.total))))throw Error('بيانات مبيعات غير مكتملة. لم يتم إغلاق الوردية');
 const cash=own.reduce((s,x)=>s+n(x.cash)-n(x.change),0);
 const card=own.reduce((s,x)=>s+n(x.card),0);
 const full={...shift,closed_at:dateTime(),closing_cash:amount,expected_cash:rnd(n(shift.opening_cash)+cash),invoice_count:own.length,cash_sales:rnd(cash),card_sales:rnd(card),total_sales:rnd(own.reduce((s,x)=>s+n(x.total),0)),vat:rnd(own.reduce((s,x)=>s+n(x.vat),0)),discount:rnd(own.reduce((s,x)=>s+n(x.discount),0))};
 if(!own.length&&!window.confirm('لم يجد النظام أي فواتير معتمدة لهذه الوردية. هل أنت متأكد أن الوردية بلا مبيعات وتريد إغلاقها بصفر؟'))return;
 if(own.length&&!window.confirm('تأكيد إغلاق الوردية: '+own.length+' فاتورة، المبيعات '+amt(full.total_sales)+'، النقد '+amt(full.cash_sales)+'، الشبكة '+amt(full.card_sales)+'. هل الأرقام صحيحة؟'))return;
 // Prepare the print snapshot *before* navigating: renderShiftsPage may reset the report cache.
 const closingDay=miloSaudiDay(miloShiftTime(full.closed_at));
 const dayRows=records.filter(i=>{const t=miloShiftTime(i.date);return Number.isFinite(t)&&t<=miloShiftTime(full.closed_at)+60000&&miloSaudiDay(t)===closingDay;});
 const reportMarkup=miloDayClosingReportHtml(full,printPrefs().paper,dayRows,{pendingUnknown:true});
 await api('saveShifts',{shifts:[full]});
 // Printing is queued immediately after the server confirms the shift close.
 if(printPrefs().shiftReport)void queueReceiptHtml(reportMarkup,printPrefs().paper);
 await renderShiftsPage();
 toast('تم إغلاق الوردية وحفظ التقرير. فرق الصندوق '+amt(amount-full.expected_cash));
}

async function miloReprintClosedShift(shiftId){
 const shift=state.shifts.find(s=>String(s.shift_id)===String(shiftId));
 if(!shift||!shift.closed_at)throw Error('لا توجد وردية مغلقة بهذا الرقم');
 const closeMs=miloShiftTime(shift.closed_at);
 if(!Number.isFinite(closeMs))throw Error('تاريخ إغلاق الوردية غير صحيح');
 const day=miloSaudiDay(closeMs);
 const records=await loadInvoices(miloShiftDay(closeMs-86400000),miloShiftDay(closeMs+86400000));
 const dayRows=records.filter(i=>{const t=miloShiftTime(i.date);return Number.isFinite(t)&&t<=closeMs+60000&&miloSaudiDay(t)===day;});
 return queueReceiptHtml(miloDayClosingReportHtml(shift,printPrefs().paper,dayRows,{pendingUnknown:true}),printPrefs().paper);
}

/* Manual orders: printable, device-session only, excluded from sales as requested. */
function renderManualPage(){hdr('الطلبات اليدوية','تذاكر مستقلة لا تُضاف إلى المبيعات',btn('طلب يدوي جديد','new-manual','','primary'));setContent(`<div class="panel">${info('الطلبات اليدوية في هذه النسخة مؤقتة وتبقى ضمن جلسة المتصفح الحالية فقط، ولا تتم مزامنتها مع حساب المتجر.')} ${tabular(['رقم الطلب','التاريخ','العميل','الملاحظات','الطباعة'],state.manualOrders.map(o=>`<tr><td>${esc(o.id)}</td><td>${esc(vDate(o.date))}</td><td>${esc(o.customer)}</td><td>${esc(o.notes)}</td><td>${btn('طباعة التذكرة','print-manual',o.id,'secondary')}</td></tr>`).join(''))}</div>`)}
function manualEditor(){showModal('طلب يدوي جديد',`<form id="manualForm" class="form">${field('اسم العميل','customer','')}${field('وصف الطلب','description','','text','required')}${field('رقم الطلب المرجعي','reference','')}${textArea('ملاحظات المطبخ','notes','')}</form>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ مؤقت وطباعة',style:'primary',onClick:()=>{const f=$('manualForm');if(!f.reportValidity())return;const x=formGet(f);const order={id:x.reference||'MAN-'+uid().slice(0,8).toUpperCase(),date:dateTime(),cashier:state.account.username,customer:x.customer,notes:x.notes,items:[{name:x.description,qty:1,total:''}]};state.manualOrders.unshift(order);closeModal();renderManualPage();printReceipt(order,false,true)}}])}

/* Account, store settings, devices, support */
async function renderSettingsPage(){hdr('إعدادات المتجر','لوحة إعدادات منظمة لإدارة المتجر والطباعة والبيانات',btn('تحديث الإعدادات','reload-settings','','secondary'));const s=state.settings;setContent(`<div class="milo-settings-layout"><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>بيانات المتجر</h2><span>هوية المتجر وإعدادات البيع</span></div><div class="setting-grid"><div class="setting-tile"><h3>بيانات المتجر والفاتورة</h3><p>اسم المحل والرقم الضريبي والعنوان ورسالة الفاتورة</p>${btn('تعديل البيانات','edit-settings','','secondary')}</div><div class="setting-tile"><h3>وضع المطعم</h3><p>الأحجام والإضافات تظهر في المنتجات وشاشة البيع عند التفعيل</p><span class="tag">${s.restaurant_mode==='restaurant'?'مفعل':'غير مفعل'}</span> ${btn('إعدادات المطعم','edit-settings')}</div></div></div><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>موقع طلبات الزبائن</h2><span>استقبال طلبات العملاء من رابط خاص بالمتجر</span></div><div class="setting-grid"><div class="setting-tile"><h3>الطلبات الإلكترونية</h3><p>تفعيل صفحة المنتجات والطلبات للزبائن، وتظهر الطلبات في صفحة «طلبات الزبائن» مع تغيير حالتها.</p><span class="tag">${s.customer_orders_enabled==='1'?'مفعّل':'متوقف'}</span> ${btn(s.customer_orders_enabled==='1'?'إيقاف الطلبات':'تفعيل الطلبات','orders-enable','','secondary')} ${s.customer_orders_enabled==='1'?btn('نسخ رابط الطلبات','orders-copy-link','','outline'):''} ${btn('عرض الطلبات','orders-go','','outline')}<p class="small-note">يجب نشر التحديث الجديد لـ Code.gs أولًا، ويحتاج استقبال الطلبات إلى إنترنت.</p></div></div></div><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>الطباعة والتوصيل</h2><span>الطابعات والإيصالات وأجهزة الكاشير</span></div><div class="setting-grid"><div class="setting-tile"><h3>تجربة الطباعة الحرارية المباشرة</h3><p>طباعة ESC/POS من المتصفح، بدون تقسيم صفحات. تتطلب طابعة متوافقة مع WebUSB أو Web Serial.</p><label class="checkline"><input id="miloDirectEnabled" type="checkbox" ${localStorage.getItem("milo_direct_mode")==="1"?"checked":""}> <span>تفعيل الطباعة المباشرة التجريبية</span></label><p id="miloDirectStatus" class="small-note">اختر اتصال USB أو Serial ثم اطبع تجربة.</p><button type="button" class="btn primary small" id="miloUsbConnect">توصيل USB</button> <button type="button" class="btn secondary small" id="miloSerialConnect">توصيل Serial</button> <button type="button" class="btn outline small" id="miloDirectTest">طباعة تجربة</button> <button type="button" class="btn outline small" id="miloDrawerDirectTest">اختبار فتح الدرج (USB/Serial)</button></div><div class="setting-tile"><h3>الطباعة والفاتورة</h3><p>عرض الورق والطباعة التلقائية ومظهر الفاتورة والـ QR</p>${btn('إعدادات الطباعة والفاتورة','print-settings','','secondary')} ${btn('طباعة اختبار','test-print','','outline')}</div></div></div><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>تشغيل الكاشير</h2><span>خيارات الاستخدام اليومي</span></div><div class="setting-grid"><div class="setting-tile"><h3>اختصارات الكاشير</h3><p>تغيير مفاتيح البحث والدفع على هذا الجهاز.</p>${btn('تخصيص الاختصارات','shortcut-settings','','secondary')}</div><div class="setting-tile"><h3>البيع دون اتصال</h3><p>حفظ الفواتير محليًا عند انقطاع الشبكة ومزامنتها تلقائيًا عند عودتها. الإيصال غير معتمد حتى يوافق الخادم.</p><label class="checkline"><input type="checkbox" id="miloOfflinePrint" ${localStorage.getItem('milo_offline_print')!=='0'?'checked':''}> طباعة إيصال محلي غير معتمد عند انقطاع الشبكة</label>${btn('الفواتير المعلقة','view-sync-queue','','secondary')}</div><div class="setting-tile"><h3>الأصوات والتنبيهات</h3><p>صوت إضافة المنتج وتنبيه الأخطاء، مع إمكانية تشغيل أو إيقاف كل صوت</p>${btn('إعدادات الأصوات','sound-settings','','secondary')}</div><div class="setting-tile"><h3>أسماء الكاشيرات والأجهزة</h3><p>تسمية هذا الجهاز وتسجيل حضوره في النظام</p>${btn('إدارة الجهاز','edit-device','','secondary')}</div><div class="setting-tile"><h3>المزامنة التلقائية</h3><p>كل دقيقتين وأثناء عودة الشبكة. الفواتير غير المؤكدة تبقى على الجهاز حتى يعتمدها الخادم.</p>${btn('مزامنة الآن','sync-now','','secondary')} ${btn('عرض الفواتير المعلقة','view-sync-queue')}</div></div></div><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>الحساب والمساعدة</h2><span>المعلومات والدعم الفني</span></div><div class="setting-grid"><div class="setting-tile"><h3>حسابي والاشتراك</h3><p>بيانات الحساب وتاريخ انتهاء الاشتراك</p>${btn('عرض الحساب','go-account','','secondary')}</div><div class="setting-tile"><h3>الدعم الفني</h3><p>إرسال بلاغ مع تفاصيل المتجر والجهاز</p>${btn('إرسال بلاغ','go-support','','secondary')}</div></div></div><div class="milo-settings-section"><div class="milo-settings-section-heading"><h2>إدارة البيانات</h2><span>عمليات متقدمة على قاعدة بيانات المتجر</span></div><div class="setting-grid"><div class="setting-tile milo-danger-zone"><h3>حذف بيانات المتجر</h3><p>حذف نهائي من قاعدة بيانات المتجر، وليس من هذا الجهاز فقط. يلزم تأكيد العملية والاتصال بالخدمة. تُنشأ نسخة احتياطية قبل الحذف. يُرجى مراعاة متطلبات الاحتفاظ بالسجلات المالية.</p><div class="milo-danger-actions">${btn('حذف جميع الفواتير','purge-invoices','','danger')}${btn('حذف جميع التقارير','purge-reports','','danger')}${btn('حذف جميع المنتجات','purge-products','','danger')}</div><p class="small-note">كل عملية تخص بيانات المتجر المحددة فقط. قد تعود بيانات قديمة من جهاز آخر عند المزامنة؛ تأكد من إيقاف المزامنة على بقية الأجهزة قبل الحذف.</p></div><div class="setting-tile"><h3>المستخدمون والصلاحيات</h3><p>إنشاء دخول مستقل لمالك أو مدير أو كاشير يحتاج تحديث Code.gs الحالي</p><span class="tag amber">يتطلب تطوير الخادم</span></div></div></div></div>`)}
/* Permanent deletion must be implemented by the trusted Apps Script server.
   UI does not directly delete Google Sheets rows or pretend a successful deletion. */
const MILO_PURGE_TYPES={invoices:{title:'الفواتير',word:'حذف الفواتير',action:'purgeInvoices'},reports:{title:'التقارير',word:'حذف التقارير',action:'purgeReports'},products:{title:'المنتجات',word:'حذف المنتجات',action:'purgeProducts'}};
async function miloPurgeDialog(type){
 const cfg=MILO_PURGE_TYPES[type];if(!cfg)throw Error('نوع بيانات غير معروف');
 if(!state.networkOK||!navigator.onLine)throw Error('يتطلب الحذف اتصالاً مؤكدًا بالخادم');
 if(['invoices','reports'].includes(type)&&window.MiloLocal){const pending=await MiloLocal.list(state.account);if(pending.length)throw Error('توجد '+pending.length+' فاتورة محلية غير معتمدة. قم بمزامنتها والتحقق منها قبل حذف السجلات.');}
 showModal('حذف جميع '+cfg.title,`<div class="stack"><div class="notice danger"><b>عملية نهائية وخطيرة</b><p>سيُطلب من قاعدة البيانات حذف جميع ${cfg.title} الخاصة بمتجرك بعد تأكيد الطلب. قد يتعذر استعادتها، وقد يؤثر هذا في الدفاتر والامتثال الضريبي.</p></div><p>خذ نسخة احتياطية قبل المتابعة. لتمكين زر التأكيد اكتب العبارة التالية حرفيًا: <b>${esc(cfg.word)}</b></p><input class="input" id="miloPurgePhrase" autocomplete="off" placeholder="اكتب عبارة التأكيد"><p class="small-note">لا يلزم رمز إداري منفصل. يجب تسجيل الدخول وكتابة عبارة التأكيد، مع نسخة احتياطية تلقائية قبل الحذف.</p></div>`,[{label:'إلغاء',onClick:closeModal},{label:'حذف نهائي من قاعدة البيانات',style:'danger',onClick:async()=>{
 if($('miloPurgePhrase')?.value.trim()!==cfg.word)throw Error('عبارة التأكيد غير صحيحة؛ لم يتم الحذف');
 if(!window.confirm('تأكيد أخير: حذف جميع '+cfg.title+' الخاصة بهذا المتجر من قاعدة البيانات؟'))return;
 if(state.isBusy)throw Error('هناك عملية جارية');
 busy(true);
 try{
  const response=await api(cfg.action,{confirmation:cfg.word});
  if(response.deleted!==true||!Number.isInteger(response.deletedCount)||response.deletedCount<0||response.scopeVerified!==true)throw Error('لم يؤكد الخادم تنفيذ الحذف ونطاق المتجر؛ تحقق من السجلات قبل إعادة المحاولة');
  if(type==='products'){state.products=[];state.productsRevision='';state.cart=[];state.pendingInvoice=null;await cacheCoreSnapshots();}
  else if(type==='invoices'){state.reports=[];state.reportCache=[];}
  else if(type==='reports'){state.dailyReports=[];state.reportCache=[];}
  closeModal();await renderSettingsPage();toast('أكد الخادم حذف '+response.deletedCount+' سجل من '+cfg.title);
 }finally{busy(false)}
 }}]);
}
function settingsEditor(){const s=state.settings;showModal('إعدادات المتجر والفاتورة',`<form id="settingsForm" class="form">${field('اسم المتجر','store_name',s.store_name||state.account.storeName,'text','required')}${field('الرقم الضريبي','vat_number',s.vat_number||state.account.vatNumber)}${field('الهاتف','phone',s.phone||state.account.phone)}${field('العنوان','address',s.address||state.account.address)}${field('عنوان داخل الإيصال','invoice_header',s.invoice_header||'')}${field('رسالة أسفل الإيصال','footer',s.footer||'شكرًا لزيارتكم')}${selectField('نوع النشاط','restaurant_mode',[['retail','متجر ومبيعات'],['restaurant','مطعم وكاشير']],s.restaurant_mode)}</form>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ على الخادم',style:'primary',type:'save',onClick:async()=>{const f=$('settingsForm');if(!f.reportValidity())return;const v=formGet(f);await api('saveStoreSettings',{settings:v});state.settings={...state.settings,...v};closeModal();renderSettingsPage();toast('تم حفظ الإعدادات في قاعدة البيانات')}}])}
function soundSettingsEditor(){
 const product=soundEnabled(),error=errorSoundEnabled();
 showModal('إعدادات الأصوات والتنبيهات',`<div class="stack"><label class="checkline"><input id="soundOnProduct" type="checkbox" ${product?'checked':''}> <span>تشغيل صوت عند إضافة منتج إلى سلة البيع</span></label><label class="checkline"><input id="soundOnError" type="checkbox" ${error?'checked':''}> <span>تشغيل صوت تنبيه عند ظهور رسالة خطأ في النظام</span></label><p class="small-note">يُحفظ الاختيار على هذا الجهاز فقط. الأصوات لا تحتاج اتصالًا بالإنترنت. قد يمنع ويندوز أو المتصفح الصوت قبل أول تفاعل مع البرنامج. لا يُغني التنبيه الصوتي عن عرض رسالة الخطأ.</p><button type="button" class="btn outline small" data-action="test-sound-product">تجربة صوت المنتج</button><button type="button" class="btn outline small" data-action="test-sound-error">تجربة صوت الخطأ</button></div>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ الإعدادات',style:'primary',onClick:()=>{localStorage.setItem('milo_product_sound',$('soundOnProduct').checked?'1':'0');localStorage.setItem('milo_error_sound',$('soundOnError').checked?'1':'0');closeModal();toast('تم حفظ إعدادات الأصوات على هذا الجهاز')}}]);
}
async function printerEditor(){
 const prefs=printPrefs();
 let printerOptions='<option value="">الطابعة الافتراضية في ويندوز</option>';
 let selectedName='';
 let nativeMessage='الطباعة الصامتة المباشرة متاحة في برنامج ويندوز فقط.';
 if(window.miloDesktop?.listPrinters){
  try{const info=await window.miloDesktop.listPrinters();selectedName=info.selected||'';printerOptions+=(info.printers||[]).map(x=>`<option value="${esc(x.name)}" ${selectedName===x.name?'selected':''}>${esc(x.displayName||x.name)}${x.isDefault?' — الافتراضية':''}</option>`).join('');nativeMessage='للفواتير الطويلة اختر «رول حراري متصل»: البرنامج يحسب طول الإيصال مع رمز QR والتذييل ويطبعه كمهمة واحدة. يتطلب تعريف طابعة يدعم المقاسات المخصصة؛ يمكنك الرجوع إلى «مثل المتصفح» عند الحاجة.'}catch(err){nativeMessage='تعذر قراءة طابعات ويندوز: '+String(err.message||err)}
 }
 showModal('إعدادات الطباعة والفاتورة',`<div class="stack">${info(nativeMessage)}<div class="grid two">${window.miloDesktop?.isDesktop?`<label>طابعة USB / ويندوز<select id="nativePrinter" class="input">${printerOptions}</select></label>`:''}<label>شعار الفاتورة (اختيار صورة من الجهاز)<input id="receiptLogoPicker" class="input" type="file" accept="image/png,image/jpeg,image/webp"><small>اختياري · يُحفظ على هذا الجهاز فقط · قص الصورة إلى حجم مناسب تلقائيًا</small></label><button type="button" class="btn outline small" data-action="remove-receipt-logo">إزالة شعار الفاتورة</button><label>سياسة الاسترجاع والاستبدال<textarea id="receiptPolicy" class="input" rows="3" maxlength="700" placeholder="اكتب سياسة الاسترجاع">${esc(receiptCustom().policy)}</textarea></label><label class="checkline"><input type="checkbox" id="policyHeadingSetting" ${localStorage.getItem('milo_policy_heading')!=='0'?'checked':''}> <span>إظهار عنوان سياسة الاستبدال والاسترجاع على الفاتورة</span></label><p class="small-note">الطباعة السريعة المعتمدة: يتحقق النظام من الوردية والمخزون، ثم يبدأ طباعة الفاتورة كاملة فور قبول الخادم (بما فيها QR الضريبي إن توفرت بياناته، وباركود الطلب). عند انقطاع الشبكة يمكن طباعة نسخة محلية غير معتمدة فقط.</p><label>نص إضافي أسفل الفاتورة<textarea id="receiptExtra" class="input" rows="2" maxlength="500" placeholder="رسالة إضافية">${esc(receiptCustom().extra)}</textarea></label><label>حجم شعار المحل (%)<input id="receiptLogoSize" class="input" type="number" min="30" max="220" step="10" value="${receiptCustom().logoSize}"></label><label>حجم رمز QR (نقطة)<input id="receiptQrSize" class="input" type="number" min="80" max="320" step="10" value="${receiptCustom().qrSize}"></label><label>طريقة الطباعة<select id="printerMode" class="input"><option value="browser" ${localStorage.getItem('milo_print_mode')!=='bridge'?'selected':''}>طباعة المتصفح</option><option value="bridge" ${localStorage.getItem('milo_print_mode')==='bridge'?'selected':''}>MILO Print Bridge — طباعة USB مباشرة</option></select></label><label>مفتاح MILO Print Bridge (من برنامج ويندوز)<input id="bridgeToken" class="input" type="password" autocomplete="off" value="${esc(localStorage.getItem('milo_bridge_token')||'')}" placeholder="الصق مفتاح الربط هنا"><small>يُحفظ على هذا المتصفح فقط. يتطلب فتح برنامج الطباعة على الكمبيوتر.</small></label><label>مقاس ورق الطابعة<select id="printerPaper" class="input"><option value="80" ${prefs.paper==='80'?'selected':''}>80 ملم</option><option value="58" ${prefs.paper==='58'?'selected':''}>58 ملم</option></select></label><label>حجم خط الفاتورة<select id="receiptFont" class="input"><option value="normal" ${prefs.fontScale==='normal'?'selected':''}>قياسي واضح</option><option value="large" ${prefs.fontScale==='large'?'selected':''}>أكبر وأكثر وضوحًا</option></select></label><label>محاذاة الفاتورة<select id="receiptAlign" class="input"><option value="center" ${prefs.align==='center'?'selected':''}>توسيط المحتوى</option><option value="right" ${prefs.align==='right'?'selected':''}>محاذاة يمين</option></select></label><label>تحريك الفاتورة أفقيًا (ملم)<input id="receiptOffset" class="input" type="number" min="-8" max="8" step="1" value="${prefs.receiptOffset}"></label><label>متى يفتح درج المال؟<select id="drawerMode" class="input"><option value="never" ${prefs.drawer==='never'?'selected':''}>لا يفتح تلقائيًا</option><option value="cash" ${prefs.drawer==='cash'?'selected':''}>عند البيع النقدي أو المختلط</option><option value="all" ${prefs.drawer==='all'?'selected':''}>بعد كل عملية بيع ناجحة</option></select></label><p class="small-note">فتح الدرج يحتاج طابعة ESC/POS متصلة بدرج المال وتدعم أمر فتح الدرج. يتم إرسال نبضة للدرج عند إتمام البيع فقط، وليس عند إعادة طباعة فاتورة. في وضع Bridge يلزم دعم برنامج Windows المحلي لمسار /drawer.</p><button type="button" class="btn outline small" id="miloDrawerBridgeTest">اختبار فتح الدرج عبر Bridge</button><label>هامش جانبي للفاتورة (ملم)<input id="receiptMargin" class="input" type="number" min="0" max="8" step="1" value="${prefs.margin}"></label><label class="checkline"><input id="kitchenPrintSetting" type="checkbox" ${prefs.kitchen?'checked':''}> <span>طباعة تذكرة مطبخ مستقلة بعد فاتورة الزبون عند تفعيل المطعم</span></label><label class="checkline"><input id="shiftPrintSetting" type="checkbox" ${prefs.shiftReport?'checked':''}> <span>طباعة تقرير الوردية + إجمالي اليوم تلقائيًا</span></label><label class="checkline"><input id="showQrSetting" type="checkbox" ${prefs.showQr?'checked':''}> <span>إظهار رمز QR عند توفر بياناته</span></label></div><p class="small-note">اختيار الطابعة وحجم الورق يُحفظ على هذا الكمبيوتر. الطباعة التلقائية لا تعني تأكيد خروج الورقة فعليًا أو القص التلقائي.</p></div>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ',style:'primary',onClick:async()=>{const chosen=$('nativePrinter')?.value||'';if(window.miloDesktop?.setPrinter)await window.miloDesktop.setPrinter(chosen);state.paper=$('printerPaper').value;localStorage.setItem('milo_paper',state.paper);localStorage.setItem('milo_receipt_policy',$('receiptPolicy').value.slice(0,700));localStorage.setItem('milo_policy_heading',$('policyHeadingSetting').checked?'1':'0');localStorage.removeItem('milo_fast_provisional_print');localStorage.setItem('milo_receipt_extra',$('receiptExtra').value.slice(0,500));localStorage.setItem('milo_receipt_logo_size',String(Math.min(220,Math.max(30,Number($('receiptLogoSize').value)||70))));localStorage.setItem('milo_receipt_qr_size',String(Math.min(320,Math.max(80,Number($('receiptQrSize').value)||120))));localStorage.setItem('milo_print_mode',$('printerMode').value);localStorage.setItem('milo_bridge_token',$('bridgeToken').value.trim());localStorage.removeItem('milo_direct_mode');localStorage.setItem('milo_receipt_font',$('receiptFont').value);localStorage.setItem('milo_receipt_align',$('receiptAlign').value);localStorage.setItem('milo_receipt_offset',String(Math.min(8,Math.max(-8,Number($('receiptOffset').value)||0))));localStorage.setItem('milo_drawer_mode',$('drawerMode').value);localStorage.setItem('milo_print_show_qr',$('showQrSetting').checked?'1':'0');localStorage.setItem('milo_receipt_margin',String(Math.min(8,Math.max(0,Number($('receiptMargin').value)||0))));localStorage.setItem('milo_kitchen_print',$('kitchenPrintSetting').checked?'1':'0');localStorage.setItem('milo_shift_print',$('shiftPrintSetting').checked?'1':'0');closeModal();toast('تم حفظ إعدادات الطباعة والفاتورة')}}])
}

async function renderDevicesPage(){hdr('الكاشيرات والأجهزة','معلومات هذا الجهاز والمتابعة من السجل المركزي',btn('تحديث حالة الجهاز','device-heartbeat','','secondary'));setContent(`<div class="metrics"><div class="metric"><span>اسم الكاشير</span><b style="font-size:16px">${esc(state.terminalName)}</b></div><div class="metric"><span>كود الجهاز</span><b style="font-size:11px;overflow-wrap:anywhere">${esc(terminalId())}</b></div><div class="metric"><span>الربط</span><b style="font-size:14px">${state.networkOK?'متصل':'بحاجة تحقق'}</b></div></div><div class="panel"><h2>تسمية هذا الكاشير</h2>${info('اسم كل جهاز يُحفظ في متصفحه، ويتم إرساله مع الفاتورة وسجل نشاط الجهاز عند الاتصال. الخادم الحالي لا يتيح صفحة قراءة مركزية لجميع الأجهزة.')}<div class="toolbar">${btn('تعديل اسم الكاشير','edit-device','','primary')} ${btn('إرسال حالة الاتصال','device-heartbeat','','secondary')}</div></div>`)}
function deviceEditor(){showModal('بيانات الكاشير',`<form id="deviceForm" class="form">${field('اسم الجهاز','terminalName',state.terminalName,'text','required maxlength="80"')}<p class="wide small-note">المعرّف: ${esc(terminalId())}</p></form>`,[{label:'إلغاء',onClick:closeModal},{label:'حفظ',style:'primary',onClick:()=>{const f=$('deviceForm');if(!f.reportValidity())return;state.terminalName=formGet(f).terminalName.trim();localStorage.setItem('milo_terminal_name',state.terminalName);closeModal();void deviceEvent('heartbeat');showPage(state.page);toast('تم تحديث اسم الكاشير')}}])}
async function renderSupportPage(){hdr('الدعم الفني','إرسال بلاغ مسجل في قاعدة بيانات المتجر');setContent(`<div class="panel"><div class="columns2"><form id="supportForm" class="form" style="display:grid;grid-template-columns:1fr">${field('وصف المشكلة','description','','text','required minlength="10" maxlength="1200"')}${field('ملخص رسالة الخطأ (اختياري)','errorSummary','')}<button class="btn primary" data-commit type="submit">إرسال البلاغ إلى الدعم</button></form><div class="notice">يُحفظ البلاغ في سجل الدعم الفني مع بيانات الجهاز والمتجر. تسجيل البلاغ لا يعني الرد تلقائيًا؛ تتم متابعته عبر إدارة النظام.</div></div></div>`)}
async function sendTicket(){const f=$('supportForm');if(!f.reportValidity())return;const v=formGet(f);await api('submitSupportTicket',{ticket:{ticketId:uid(),storeCode:state.account.storeCode,deviceCode:terminalId(),deviceName:state.terminalName,occurredAt:dateTime(),description:v.description,errorSummary:v.errorSummary||''}});f.reset();toast('تم تسجيل البلاغ في قاعدة البيانات')}
async function renderAccountPage(){const a=state.account;hdr('حسابي والاشتراك','معلومات الحساب والاشتراك والاتصال');setContent(`<div class="metrics"><div class="metric"><span>المتجر</span><b style="font-size:16px">${esc(a.storeName)}</b></div><div class="metric"><span>اسم المستخدم</span><b style="font-size:16px">${esc(a.username)}</b></div><div class="metric"><span>الاشتراك ينتهي في</span><b style="font-size:16px">${esc(a.subscriptionEnd)}</b></div><div class="metric"><span>الأيام المتبقية</span><b>${n(a.daysLeft)}</b></div></div><div class="panel stack"><h2>حالة الاتصال</h2><div class="notice good">أثناء انقطاع الاتصال تُحفظ الفواتير غير المؤكدة محليًا، ثم يُعاد إرسالها بعد عودة الشبكة. لا تُعد مبيعات معتمدة قبل تأكيد الخادم.</div><p>معرّف المتجر: <b>${esc(a.storeCode)}</b></p><p>الجهاز الحالي: <b>${esc(terminalId())}</b></p><p>آخر اتصال ناجح: <b>${state.lastPing?esc(vDate(new Date(state.lastPing).toISOString())):'—'}</b></p><div class="toolbar">${btn('فحص تسجيل الدخول','test-ping','','primary')} ${btn('تحديث البيانات','refresh-all','','secondary')} ${btn('عرض الفواتير المعلقة','view-sync-queue')} ${btn('الدعم الفني','go-support')}</div>${info('الكود الحالي لا يدعم جلسات خادم مستقلة أو أدوارًا حقيقية. لذلك لا يمكن اعتبار الحسابات آمنة تجاريًا اعتمادًا على الواجهة فقط.','danger')}</div>`)}
async function fetchSettings(){const r=await api('getStoreSettings');state.settings={...state.settings,...r.settings};await renderSettingsPage()}
async function refreshAll(){await syncNow({manual:true});await showPage(state.page)}


// Loyalty interface. All balances are verified on the server; none are trusted from browser storage.
async function renderLoyaltyPage(){
 hdr('برنامج الولاء','نقاط العملاء والمكافآت');
 const cfg=await api('getStoreSettings');state.settings={...state.settings,...cfg.settings};
 const c=state.settings;
 setContent(`<div class="panel stack"><h2>إعدادات برنامج الولاء</h2><p class="muted">يُحتسب الرصيد من الفواتير المعتمدة فقط، ويستقل كل متجر بعملائه.</p><form id="loyaltySettingsForm" class="form"><label>حالة البرنامج<select class="input" name="loyalty_enabled"><option value="1" ${c.loyalty_enabled==='1'?'selected':''}>مفعّل</option><option value="0" ${c.loyalty_enabled!=='1'?'selected':''}>متوقف</option></select></label>${field('النقاط لكل ريال','loyalty_earn_per_sar',c.loyalty_earn_per_sar||'1','number','min="0" max="100" step="0.01" required')}${field('عدد النقاط للاستبدال','loyalty_redeem_points',c.loyalty_redeem_points||'100','number','min="1" max="100000" step="1" required')}${field('قيمة المكافأة بالريال','loyalty_redeem_sar',c.loyalty_redeem_sar||'5','number','min="0.01" max="10000" step="0.01" required')}</form><div class="toolbar"><button class="btn primary" data-action="loyalty-save-settings">حفظ إعدادات الولاء</button></div></div><div class="panel stack"><h2>بحث رصيد العميل</h2><label>رقم جوال العميل<input class="input" id="loyaltyQuery" inputmode="tel" placeholder="05xxxxxxxx"></label><div class="toolbar"><button class="btn primary" data-action="loyalty-lookup">عرض النقاط والحركات</button></div><div id="loyaltyResult" class="small-note">أدخل رقم الجوال لعرض الرصيد.</div></div>`);
}
async function loyaltySaveSettings(){
 const f=$('loyaltySettingsForm');if(!f.reportValidity())return;
 const v=formGet(f);const e=Number(v.loyalty_earn_per_sar),p=Number(v.loyalty_redeem_points),r=Number(v.loyalty_redeem_sar);
 if(!Number.isFinite(e)||e<0||e>100||!Number.isSafeInteger(p)||p<1||p>100000||!Number.isFinite(r)||r<=0||r>10000)throw Error('قيم البرنامج غير صحيحة');
 await api('saveStoreSettings',{settings:v});state.settings={...state.settings,...v};toast('تم حفظ إعدادات الولاء');
}
async function loyaltySearch(){
 const target=$('loyaltyResult');const phone=$('loyaltyQuery')?.value||'';const result=await api('loyaltyLookup',{phone});
 target.innerHTML=`<div class="metrics"><div class="metric"><span>الرصيد المتاح</span><b>${result.points} نقطة</b></div><div class="metric"><span>المكتسب</span><b>${result.earned}</b></div><div class="metric"><span>المستبدل</span><b>${result.spent}</b></div></div>${tabular(['الفاتورة','التاريخ','مكتسب','مستبدل'],result.history.map(x=>`<tr><td>${esc(x.invoiceId)}</td><td>${esc(x.date)}</td><td>+${x.earned}</td><td>-${x.spent}</td></tr>`).join(''),'لا توجد حركات بعد')}`;
}
async function loyaltySaleBalance(){
 const phone=$('saleLoyaltyPhone')?.value||state.loyaltyPhone;
 const r=await api('loyaltyLookup',{phone});state.loyaltyPhone=r.phone;
 if($('loyaltySaleInfo'))$('loyaltySaleInfo').textContent=`رصيد العميل: ${r.points} نقطة${r.config.enabled?'':' · البرنامج متوقف'}`;
 return r;
}
async function loyaltySaleRedeem(){
 if(!state.cart.length)throw Error('أضف منتجًا إلى السلة');
 const r=await loyaltySaleBalance(),c=r.config;
 if(!c.enabled)throw Error('برنامج الولاء متوقف');
 if(state.loyaltyUsed)throw Error('لإلغاء الاستبدال، عدّل الخصم ثم أعد المحاولة');
 const base=n($('saleDiscount')?.value),available=Math.floor(r.points/c.redeemPoints),maxByValue=Math.floor(Math.max(0,cartTotals().subtotal-base)/c.redeemSar),units=Math.min(available,maxByValue);
 if(units<1)throw Error('النقاط لا تكفي لمكافأة قابلة للاستخدام على هذه الفاتورة');
 showModal('استبدال نقاط العميل',`<p>الرصيد: <b>${r.points} نقطة</b></p><p>كل ${c.redeemPoints} نقطة = ${amt(c.redeemSar)} خصم</p><label>عدد المكافآت (الحد الأقصى ${units})<input id="loyaltyUnits" class="input" type="number" min="1" max="${units}" step="1" value="1"></label>`,[{label:'إلغاء',onClick:closeModal},{label:'تطبيق الخصم',style:'primary',onClick:()=>{
 const count=Number($('loyaltyUnits').value);if(!Number.isSafeInteger(count)||count<1||count>units)throw Error('عدد المكافآت غير صحيح');
 state.loyaltyUsed=count*c.redeemPoints;state.loyaltyBaseDiscount=base;state.discountValue=rnd(base+count*c.redeemSar);state.pendingInvoice=null;closeModal();renderCart();if($('saleDiscount'))$('saleDiscount').value=state.discountValue;
 if($('loyaltySaleInfo'))$('loyaltySaleInfo').textContent=`سيُستبدل ${state.loyaltyUsed} نقطة عند اعتماد الفاتورة`;
 }}]);
}


// Customer online orders: cloud-backed, independent from paid invoices.
const miloOrderLink=()=>new URL('customer-order.html?store='+encodeURIComponent(state.account?.storeCode||'')+'&key='+encodeURIComponent(state.settings.customer_orders_token||''),location.href).href;
async function miloToggleOnlineOrders(){
 const next=state.settings.customer_orders_enabled==='1'?'0':'1';
 let token=state.settings.customer_orders_token||'';
 if(next==='1'&&!/^[a-f0-9]{48}$/.test(token)){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);token=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
 const settings={customer_orders_enabled:next,customer_orders_token:token};
 await api('saveStoreSettings',{settings});Object.assign(state.settings,settings);
 await renderSettingsPage();toast(next==='1'?'تم تفعيل موقع الطلبات':'تم إيقاف استقبال الطلبات');
}
async function miloCopyOnlineLink(){if(state.settings.customer_orders_enabled!=='1'||!state.settings.customer_orders_token)throw Error('فعّل موقع الطلبات أولًا');
 const url=miloOrderLink();if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('تم نسخ رابط طلبات الزبائن');}else showModal('رابط الطلبات',`<input class="input" readonly value="${esc(url)}">`);
}
const miloOrderStatuses=['جديد','قيد التجهيز','جاهز للاستلام','في الطريق','مكتمل','ملغي'];
let miloOrders=[];
// While staff are looking at online orders, refresh from cloud every 20 seconds.
setInterval(()=>{if(state.auth&&state.page==='onlineOrders'&&document.visibilityState==='visible'&&!state.isBusy)void renderOnlineOrdersPage().catch(()=>{});},20000);
async function renderOnlineOrdersPage(){hdr('طلبات الزبائن','الطلبات القادمة من الموقع، مستقلة عن فواتير المبيعات',btn('تحديث الطلبات','orders-refresh','','secondary'));
 if(state.settings.customer_orders_enabled!=='1'){setContent('<div class="panel empty">موقع الطلبات متوقف. فعّله من الإعدادات أولًا.</div>');return;}
 const response=await api('customerOrders');miloOrders=response.orders||[];
 setContent(`<div class="milo-online-stats"><span>كل الطلبات: <b>${miloOrders.length}</b></span><span>طلبات جديدة: <b>${miloOrders.filter(o=>o.status==='جديد').length}</b></span><button class="btn outline small" data-action="orders-copy-link">نسخ رابط الموقع</button></div><div class="milo-online-grid">${miloOrders.map(o=>`<article class="card milo-online-card"><div class="milo-online-head"><strong>طلب #${esc(o.orderId.slice(-8).toUpperCase())}</strong><span class="tag">${esc(o.status)}</span></div><p><b>${esc(o.customerName)}</b> · <a href="tel:${esc(o.customerPhone)}">${esc(o.customerPhone)}</a></p><small>${esc(vDate(o.createdAt))} · ${esc(o.fulfillment||'استلام')}</small><p><b>الموعد المطلوب:</b> ${esc(o.requestedTime?o.requestedTime.replace('T',' · '):'غير محدد')}</p><div class="milo-online-lines">${(o.items||[]).map(it=>`<div><span>${esc(it.name)} × ${Number(it.qty)}</span><b>${amt(it.total)}</b></div>`).join('')}</div><div><strong>الإجمالي: ${amt(o.total)}</strong></div>${o.invoiceId?`<p><b>فاتورة محفوظة:</b> ${esc(o.invoiceId)}</p>`:''}${o.notes?`<p>ملاحظات: ${esc(o.notes)}</p>`:''}${o.address?`<p>العنوان: ${esc(o.address)}</p>`:''}<label>حالة الطلب<select class="input milo-order-status" data-order="${esc(o.orderId)}">${miloOrderStatuses.map(st=>`<option value="${esc(st)}" ${st===o.status?'selected':''}>${esc(st)}</option>`).join('')}</select></label><div class="toolbar">${o.invoiceId?`<button class="btn secondary small" data-action="orders-reprint" data-id="${esc(o.orderId)}">إعادة طباعة الفاتورة</button>`:''}<button class="btn outline small" data-action="orders-print" data-id="${esc(o.orderId)}">طباعة الطلب</button></div></article>`).join('')||'<div class="panel empty">لا توجد طلبات زبائن حتى الآن.</div>'}</div>`);
}
async function miloChangeOrderStatus(id,status){
 if(!miloOrderStatuses.includes(status))throw Error('حالة غير صحيحة');
 const order=miloOrders.find(o=>o.orderId===id);if(!order)throw Error('الطلب غير موجود');
 if(status==='مكتمل'){
  if(order.invoiceId){toast('هذه الفاتورة معتمدة مسبقاً؛ استخدم إعادة الطباعة');await renderOnlineOrdersPage();return;}
  if(!requireOpenShift())throw Error('افتح وردية قبل التحصيل');
  showModal('تحصيل طلب الزبون وإصدار الفاتورة',
   `<p>الطلب: <b>${esc(id.slice(-8).toUpperCase())}</b> · الإجمالي <b>${amt(order.total)}</b></p><p>تأكد من استلام قيمة الطلب قبل إصدار الفاتورة. سيتم تسجيل البيع مرة واحدة فقط ثم طباعة نفس فاتورة الكاشير الأصلية.</p><label>طريقة الدفع<select class="input" id="miloWebPaymentMethod"><option value="cash">نقدًا</option><option value="card">شبكة</option></select></label>`,
   [{label:'إلغاء',onClick:closeModal},{label:'تأكيد التحصيل وإصدار الفاتورة',style:'primary',type:'save',onClick:async()=>{
    if(state.isBusy)return;const paymentMethod=$('miloWebPaymentMethod').value;busy(true);
    try{
     const result=await api('completeCustomerOrder',{orderId:id,paymentMethod,terminal:terminalId(),terminalName:state.terminalName||'',cashier:state.activeShift?.cashier||state.account.username});
     closeModal();await renderOnlineOrdersPage();
     if(!result.duplicate){try{await printReceipt(result.invoice,false,false,false);toast('تم اعتماد الطلب والفاتورة وإرسالها للطباعة');}
      catch(err){toast('تم تسجيل الفاتورة، لكن تعذرت الطباعة: '+err.message,true);}}
     else toast('الفاتورة محفوظة مسبقًا؛ استخدم إعادة الطباعة عند الحاجة');
     void api('products').then(r=>{if(Array.isArray(r.products))state.products=r.products}).catch(()=>{});
    }finally{busy(false)}
   }}]);return;
 }
 if(order.invoiceId&&status!=='مكتمل')throw Error('لا يمكن تغيير حالة طلب له فاتورة معتمدة');
 await api('updateCustomerOrder',{orderId:id,status});toast('تم تحديث حالة الطلب');await renderOnlineOrdersPage();
}
async function miloReprintOnlineInvoice(id){
 const o=miloOrders.find(x=>x.orderId===id);if(!o?.invoiceId)throw Error('لا توجد فاتورة معتمدة لهذا الطلب');
 const res=await api('getCustomerOrderInvoice',{orderId:id});await printReceipt(res.invoice,true,false,false);
 toast('تم إرسال نسخة الفاتورة الأصلية للطباعة');
}
function miloPrintOnlineOrder(id){const o=miloOrders.find(x=>x.orderId===id);if(!o)throw Error('الطلب غير موجود');
 const w=window.open('','_blank','width=420,height=700');if(!w)throw Error('يرجى السماح بفتح نافذة الطباعة');
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>طلب زبون</title><style>body{font:16px Arial;padding:18px;max-width:330px;margin:auto}h2{text-align:center}p{margin:8px 0}table{width:100%;border-collapse:collapse}td{padding:7px 0;border-bottom:1px dashed #777}</style><h2>${esc(state.account.storeName||'MILO')}<br>طلب زبون (غير مدفوع)</h2><p>الطلب: ${esc(o.orderId)}</p><p>الحالة: ${esc(o.status)}</p><p>الزبون: ${esc(o.customerName)} · ${esc(o.customerPhone)}</p><p>التاريخ: ${esc(o.createdAt)}</p><p>الموعد المطلوب: ${esc(o.requestedTime?o.requestedTime.replace('T',' '):'غير محدد')}</p><table>${o.items.map(it=>`<tr><td>${esc(it.name)} × ${Number(it.qty)}</td><td>${amt(it.total)}</td></tr>`).join('')}</table><h3>الإجمالي: ${amt(o.total)}</h3><p>الملاحظة: ${esc(o.notes||'—')}</p><p>العنوان: ${esc(o.address||'—')}</p><p>هذا طلب غير مدفوع وليس فاتورة ضريبية.</p></html>`);w.document.close();w.focus();w.print();}
document.addEventListener('change',e=>{const el=e.target.closest('.milo-order-status');if(!el)return;const previous=miloOrders.find(o=>o.orderId===el.dataset.order)?.status;void miloChangeOrderStatus(el.dataset.order,el.value).catch(err=>{el.value=previous||'جديد';toast(err.message,true)});});

/* Central event router. No inactive controls. */
async function onAction(action,id,button){switch(action){
 case 'logout':return logout();case 'go-account':closeAccountMenu();return showPage('account');case 'close-modal':return closeModal();case 'modal-button':{const a=handler?.[Number(id)];if(a?.onClick)return a.onClick();return closeModal()}
 case 'orders-enable':return miloToggleOnlineOrders();case 'orders-copy-link':return miloCopyOnlineLink();case 'orders-refresh':return renderOnlineOrdersPage();case 'orders-go':return showPage('onlineOrders');case 'orders-status':return miloChangeOrderStatus(id,button.dataset.status);case 'orders-print':return miloPrintOnlineOrder(id);case 'orders-reprint':return miloReprintOnlineInvoice(id);case 'shortcut-settings':return showShortcutSettings();
 case 'reload-page':return showPage(state.page);case 'refresh-all':return refreshAll();case 'sync-now':return syncNow({manual:true});case 'view-sync-queue':return showSyncQueue();case 'retry-sync-invoice':return retryPendingInvoice(id);case 'refresh-products':{const r=await api('products');state.products=r.products||[];await showPage(state.page);return toast('تم تحديث المنتجات')}
 case 'toggle-cart-details':{const section=$('miloCartDetails'),body=$('miloCartDetailsBody'),toggle=$('miloCartDetailsToggle');if(!section||!body||!toggle)return;const open=section.classList.contains('is-closed');section.classList.toggle('is-closed',!open);section.classList.toggle('is-open',open);body.hidden=!open;toggle.setAttribute('aria-expanded',String(open));localStorage.setItem('milo_cart_details_open',open?'1':'0');return;}
 case 'focus-scan':if(!requireOpenShift())return;return $('saleSearch')?.focus();case 'filter-category':if(!requireOpenShift())return;state.category=id;renderCategories();renderSaleGrid();return;
 case 'add-product':return addProduct(id);case 'qty':return editCart(id,Number(button.dataset.step));case 'remove-line':if(!requireOpenShift())return;state.cart=state.cart.filter(x=>x.id!==id);state.pendingInvoice=null;return renderCart();
 case 'clear-cart':if(!requireOpenShift())return;return confirmModal('إفراغ السلة','هل تريد حذف جميع الأصناف الموجودة في سلة المشتريات؟',()=>{state.cart=[];state.pendingInvoice=null;state.discountValue=0;renderSale()});
 case 'hold-cart':return holdCart();case 'recover-held':if(!requireOpenShift())return;return showHeld();case 'restore-held':return restoreHeld(id);case 'start-payment':return showPayment();case 'pay-mode':return changePaymentMode(id);
 case 'product-tab':state.tab=id;return renderProductsPage();case 'new-product':return productEditor(null);case 'edit-product':return productEditor(findProduct(id));case 'delete-product':return confirmModal('حذف المنتج','سيُحذف هذا المنتج من قائمة البيع دون حذف الفواتير السابقة. هل توافق؟',()=>deleteProduct(id));
 case 'add-option':readOptionEdits();(id==='sizes'?draftSizes:draftExtras).push({name:'',price:0});return updateOptionsFields();
 case 'remove-option':readOptionEdits();{const [key,index]=id.split(':');(key==='sizes'?draftSizes:draftExtras).splice(Number(index),1);return updateOptionsFields()}
 case 'rename-category':return renameCategory(id);case 'drop-category':return confirmModal('إلغاء التصنيف','سيتم نقل منتجات التصنيف إلى «عام» دون حذف منتجات.',()=>updateCategory(id,'عام'));
 case 'new-record':return recordEditor(id);case 'edit-record':{const [type,recordId]=id.split('|'),cfg=RECORDS[type];return recordEditor(type,(state[type]||[]).find(x=>String(x[cfg.id])===recordId))}case 'purchase-items':return showPage('purchaseItems')
 case 'search-invoices':return queryInvoices();case 'invoice-detail':return invoiceDetail(id);case 'load-report':return reportData();case 'export-report':return exportReport();
 case 'print-closed-shift':return miloReprintClosedShift(id); case 'open-shift':return openShift();case 'close-shift':return confirmModal('إغلاق الوردية','سيحفظ النظام المبلغ الفعلي وملخص المبيعات في السجل.',closeShift);
 case 'new-manual':return manualEditor();case 'print-manual':{const order=state.manualOrders.find(x=>x.id===id);if(order)return printReceipt(order,false,true);return}
  case 'remove-receipt-logo':localStorage.removeItem('milo_receipt_logo');return toast('تم إزالة شعار الفاتورة');case 'sound-settings':return soundSettingsEditor();case 'test-sound-product':{const old=localStorage.getItem('milo_product_sound');localStorage.setItem('milo_product_sound','1');playMiloSound('product');if(old===null)localStorage.removeItem('milo_product_sound');else localStorage.setItem('milo_product_sound',old);return;}case 'test-sound-error':{const old=localStorage.getItem('milo_error_sound');localStorage.setItem('milo_error_sound','1');playMiloSound('error');if(old===null)localStorage.removeItem('milo_error_sound');else localStorage.setItem('milo_error_sound',old);return;}case 'edit-settings':return settingsEditor();case 'test-print':return printReceipt({id:'TEST-PRINT',date:dateTime(),cashier:state.account?.username||'تجربة',items:[{name:'اختبار طباعة كاشير ميلو',qty:1,price:0,total:0}],notes:'تجربة طباعة فقط — ليست فاتورة بيع'},false,true);case 'print-settings':return printerEditor();case 'edit-device':return deviceEditor();case 'reload-settings':return fetchSettings();
 case 'device-heartbeat':await deviceEvent('heartbeat');return toast('تم إرسال نبضة الاتصال إن كانت صلاحيات الخادم تسمح');case 'test-ping':await api('ping');return toast('تم التحقق من الاتصال بالخادم');
 case 'loyalty-check-sale':return loyaltySaleBalance();case 'loyalty-redeem-sale':return loyaltySaleRedeem();case 'loyalty-lookup':return loyaltySearch();case 'loyalty-save-settings':return loyaltySaveSettings();
 case 'purge-invoices':return miloPurgeDialog('invoices');case 'purge-reports':return miloPurgeDialog('reports');case 'purge-products':return miloPurgeDialog('products');
 case 'go-account':return showPage('account');case 'go-support':return showPage('support');
 default:throw Error('إجراء غير معروف: '+action)
}}
// Collapsible right navigation. Sidebar preference is UI-only, never controls permissions.
function closeAccountMenu(){const d=$('accountDropdown'),b=$('accountTrigger');if(d)d.hidden=true;if(b)b.setAttribute('aria-expanded','false')}
$('accountTrigger')?.addEventListener('click',e=>{e.stopPropagation();const d=$('accountDropdown');d.hidden=!d.hidden;$('accountTrigger').setAttribute('aria-expanded',String(!d.hidden))});
document.addEventListener('click',e=>{if(!e.target.closest('#accountMenu'))closeAccountMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAccountMenu()});
function sidebarIsMobile(){return window.matchMedia('(max-width: 900px)').matches}
function syncSidebarToggle(){
 const expanded=sidebarIsMobile()?document.body.classList.contains('mobile-menu-open'):!document.body.classList.contains('sidebar-collapsed');
 const toggle=$('sidebarToggle');if(toggle){toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'إغلاق القائمة':'فتح القائمة')}
 const scrim=$('sidebarScrim');if(scrim)scrim.hidden=!document.body.classList.contains('mobile-menu-open');
}
function toggleSidebar(){
 if(sidebarIsMobile()) document.body.classList.toggle('mobile-menu-open');
 else {document.body.classList.toggle('sidebar-collapsed');try{localStorage.setItem('milo_sidebar_collapsed',String(document.body.classList.contains('sidebar-collapsed')))}catch(_){}}
 syncSidebarToggle();
}
function closeMobileSidebar(){document.body.classList.remove('mobile-menu-open');syncSidebarToggle()}
try{if(localStorage.getItem('milo_sidebar_collapsed')==='true')document.body.classList.add('sidebar-collapsed')}catch(_){}
$('sidebarToggle')?.addEventListener('click',toggleSidebar);
$('sidebarScrim')?.addEventListener('click',closeMobileSidebar);
window.addEventListener('resize',()=>{if(!sidebarIsMobile())document.body.classList.remove('mobile-menu-open');syncSidebarToggle()});
syncSidebarToggle();
$('loginForm').addEventListener('submit',async ev=>{ev.preventDefault();const button=$('loginBtn');if(button.disabled)return;button.disabled=true;$('loginError').textContent='';miloSetLoginLoading(true,'جارٍ التحقق من بيانات الدخول...');try{await authenticate($('loginUser').value.trim(),$('loginPass').value)}catch(e){$('loginError').textContent=e.message;toast(e.message,true)}finally{miloSetLoginLoading(false);button.disabled=false}});
document.addEventListener('click',ev=>{const preset=ev.target.closest('[data-report-preset]');if(preset){Promise.resolve(reportPreset(preset.dataset.reportPreset)).catch(e=>toast(e.message,true));return;}const nav=ev.target.closest('[data-page]');if(nav){showPage(nav.dataset.page);if(sidebarIsMobile())closeMobileSidebar();return}const b=ev.target.closest('[data-action]');if(b&&!b.disabled){Promise.resolve(onAction(b.dataset.action,b.dataset.id,b)).catch(e=>toast(e.message,true))}});
document.addEventListener('submit',ev=>{if(ev.target.id==='supportForm'){ev.preventDefault();sendTicket().catch(e=>toast(e.message,true))}});
document.addEventListener('change',async ev=>{if(ev.target?.id==='receiptLogoPicker'){try{await chooseReceiptLogo(ev.target.files?.[0]);toast('تم حفظ شعار الفاتورة على هذا الجهاز')}catch(e){toast(e.message,true)}}});
document.addEventListener('input',ev=>{const el=ev.target;if(el.id==='saleSearch'){state.saleQuery=el.value;renderSaleGrid()}else if(el.id==='saleDiscount'){state.discountValue=n(el.value);state.loyaltyUsed=0;state.pendingInvoice=null;renderCart()}else if(el.id==='saleCustomer'){state.customerValue=el.value;state.pendingInvoice=null}else if(el.id==='saleLoyaltyPhone'){state.loyaltyPhone=el.value;state.pendingInvoice=null;state.loyaltyUsed=0}else if(el.id==='saleServiceType'){state.serviceType=serviceTypeValue(el.value)||'سفري';localStorage.setItem('milo_sale_service_type',state.serviceType);state.pendingInvoice=null}else if(el.id==='productsQuery'){productListing()}else if(el.id==='stockFilter'){stockListing()}else if(el.id==='recordQuery'){recordListing(state.page)}else if(['invoiceQuery','cashierFilter'].includes(el.id)){invoiceListing()}});
document.addEventListener('change',ev=>{if(ev.target.id==='miloOfflinePrint')localStorage.setItem('milo_offline_print',ev.target.checked?'1':'0');if(ev.target.id==='wholesaleMode'){state.wholesale=ev.target.checked;renderSaleGrid()}if(ev.target.id==='reportCashier'||ev.target.id==='reportShift')renderReportData()});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&document.body.classList.contains('mobile-menu-open'))closeMobileSidebar();if(ev.key==='Escape'&&!$('modal').classList.contains('hidden'))closeModal();if(ev.key===miloShortcut('search')&&state.page==='sale'&&!ev.target.closest('input,textarea,select')){$('saleSearch')?.focus();ev.preventDefault()}if(ev.key===miloShortcut('pay')&&state.page==='sale'&&!ev.target.closest('input,textarea,select')){ev.preventDefault();showPayment()}if(ev.key==='Enter'&&ev.target.id==='saleSearch'){ev.preventDefault();const raw=ev.target.value.trim();if(acceptScannedBarcode(raw)){ev.target.value='';state.saleQuery='';renderSaleGrid()}else if(raw){toast('لم يتم العثور على هذا الباركود',true)}}});

/* قارئ الباركود USB/Bluetooth بوضع لوحة المفاتيح. لا يؤثر على الكتابة في حقول النماذج.
   الحد الأدنى 4 محارف وسرعة إدخال ثابتة تقريبًا؛ يدعم الباركود اليدوي في خانة البحث.
   اضبط القارئ ليُرسل Enter بعد الرمز. لا يتم إجراء بيع عندما تكون الوردية مغلقة. */
let miloScanBuffer='',miloScanLast=0,miloScanStart=0;
function acceptScannedBarcode(code){
 const barcode=String(code||'').trim();
 if(!barcode||state.page!=='sale'||!state.auth)return false;
 if(!requireOpenShift())return true;
 const product=findProduct(barcode);
 if(!product)return false;
 addProduct(product.barcode);
 const search=$('saleSearch');if(search){search.value='';state.saleQuery='';renderSaleGrid()}
 return true;
}
document.addEventListener('keydown',event=>{
 if(state.page!=='sale'||!state.auth||document.visibilityState==='hidden'||!$('modal')?.classList.contains('hidden'))return;
 if(event.ctrlKey||event.altKey||event.metaKey||event.repeat)return;
 const target=event.target;
 if(target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
 const now=performance.now();
 if(now-miloScanLast>110){miloScanBuffer='';miloScanStart=now}
 if(event.key==='Enter'){
  const code=miloScanBuffer;
  const duration=now-miloScanStart;
  miloScanBuffer='';
  if(code.length>=4&&duration<Math.max(450,code.length*85)){
   event.preventDefault();
   if(!acceptScannedBarcode(code))toast('الباركود غير مسجل في المنتجات',true);
  }
  return;
 }
 if(event.key.length!==1||!/^[a-zA-Z0-9._-]$/.test(event.key)){miloScanBuffer='';return}
 miloScanBuffer+=event.key;
 if(miloScanBuffer.length>120)miloScanBuffer='';
 miloScanLast=now;
},true);

window.addEventListener('offline',()=>{connection(false,'لا توجد شبكة · الفواتير معلقة محليًا');void updateQueueBadge()});window.addEventListener('online',()=>{if(state.auth)void syncNow();else connection(false,'الرجاء تسجيل الدخول')});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.auth)void syncNow()});
enforceBrowserHardening();
connection(false,'جاهز للاتصال');

/* Embedded MIT-licensed QR library — qrcode-generator by Kazuhiko Arase. */

/* QRCode for JavaScript © Kazuhiko Arase (MIT); browser adaptation.
 https://github.com/kazuhikoarase/qrcode-generator */
(function(){
var QRMode = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

var QRErrorCorrectLevel = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


var QRMaskPattern = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}



function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};



function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};



function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};



function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};



var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};



//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};



window.MiloQRCode = QRCode; window.MiloQRCodeLevels = QRErrorCorrectLevel;
})();


// Drawer diagnostic only: never create an invoice or change stock.
document.addEventListener('click',async event=>{
 if(!event.target?.closest?.('#miloDrawerBridgeTest'))return;
 event.preventDefault();
 try{if(!window.MiloPrintBridge?.openDrawer)throw Error('ملف MILO Print Bridge غير محمل');
 await window.MiloPrintBridge.openDrawer();toast('أُرسل طلب فتح الدرج إلى Bridge. تحقق من فتحه فعليًا.');}
 catch(e){toast('اختبار الدرج: '+String(e?.message||e),true)}
});
