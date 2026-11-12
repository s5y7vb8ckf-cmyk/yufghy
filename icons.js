/* كاشير ميلو — أيقونات احترافية متجهة. لا تحميل خارجي. */
(function(){
 'use strict';
 const paths={
  'menu':'<path d="M4 7h16M4 12h16M4 17h16"/>',
  'shop':'<path d="M3 10h18l-1-6H4l-1 6Z"/><path d="M5 10v10h14V10M9 20v-7h6v7M3 10c0 2 3 3 5 0 1 2 4 2 5 0 2 3 5 2 6 0"/>',
  'cart':'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 3h2l2.2 12h13.5l2-9H5"/>',
  'package':'<path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/>',
  'receipt':'<path d="M4 3v18l3-2 3 2 3-2 3 2 4-2V3H4Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  'chart':'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
  'boxes':'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="8" y="13" width="8" height="8" rx="1"/><path d="M3 7h8M13 7h8M8 17h8"/>',
  'users':'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  'truck':'<path d="M3 6h12v12H3zM15 10h4l3 4v4h-7z"/><circle cx="7.5" cy="18.5" r="1.7"/><circle cx="18.5" cy="18.5" r="1.7"/>',
  'shopping-bag':'<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  'list':'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  'wallet':'<path d="M3 7V5a2 2 0 0 1 2-2h15v4M3 7h18v14H5a2 2 0 0 1-2-2V7Z"/><path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  'undo':'<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  'tag':'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  'user-cog':'<circle cx="9" cy="8" r="4"/><path d="M2 21v-2a6 6 0 0 1 11-3M18 17v4M16 19h4M17.2 15l1-1 1 1"/>',
  'clock':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'clipboard':'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 11h6M9 15h6"/>',
  'monitor':'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8M12 18v4"/>',
  'headphones':'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 14h4v7H5a2 2 0 0 1-2-2v-5ZM21 14h-4v7h2a2 2 0 0 0 2-2v-5Z"/>',
  'settings':'<path d="M12 2 14 4l3-.4 1 3 3 1 .4 3L23 12l-1.6 1.4L21 16l-3 1-1 3-3-.4-2 2-2-2-3 .4-1-3-3-1-.4-2.6L1 12l1.6-1.4L3 8l3-1 1-3 3 .4 2-2Z"/><circle cx="12" cy="12" r="3"/>',
  'user':'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  'refresh':'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.3 9A8 8 0 0 1 20 12M18.7 15A8 8 0 0 1 4 12"/>',
  'pause':'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  'play':'<path d="m8 5 12 7-12 7V5Z"/>',
  'plus':'<path d="M12 5v14M5 12h14"/>',
  'minus':'<path d="M5 12h14"/>',
  'search':'<circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/>',
  'printer':'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6zM18 12h.01"/>',
  'trash':'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  'pencil':'<path d="m15 5 4 4M3 21l4-1 13-13a3 3 0 0 0-4-4L3 16l-1 5 5-1"/>',
  'download':'<path d="M12 3v12m-5-5 5 5 5-5M5 18v3h14v-3"/>',
  'check':'<path d="m4 12 5 5L20 6"/>',
  'x':'<path d="M18 6 6 18M6 6l12 12"/>',
  'logout':'<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H9"/>',
  'credit-card':'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 16h5"/>',
  'cash':'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h1M18 15h1"/>',
  'layers':'<path d="m12 2 10 6-10 6L2 8l10-6ZM2 12l10 6 10-6M2 16l10 6 10-6"/>',
  'arrow-left':'<path d="m14 6-6 6 6 6M8 12h13"/>',
  'arrow-down':'<path d="m6 9 6 6 6-6"/>',
  'unlock':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/>',
  'lock':'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  'info':'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
  'barcode':'<path d="M3 4v16M7 4v16M10 4v16M14 4v16M17 4v16M21 4v16"/>',
  'calendar':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  'upload':'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  'shield':'<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>'
 };
 const pages={sale:'cart',products:'package',invoices:'receipt',reports:'chart',inventory:'boxes',customers:'users',suppliers:'truck',purchases:'shopping-bag',purchaseItems:'list',expenses:'wallet',vouchers:'file-text',returns:'undo',promotions:'tag',employees:'user-cog',shifts:'clock',manual:'clipboard',devices:'monitor',support:'headphones',settings:'settings',account:'user'};
 const actions={
  'refresh-products':'refresh','refresh-all':'refresh','reload-page':'refresh','reload-settings':'refresh',
  'reload-report':'refresh','device-heartbeat':'refresh','test-ping':'check-circle',
  'hold-cart':'pause','recover-held':'play','restore-held':'undo','clear-cart':'trash',
  'start-payment':'credit-card','pay-mode':'credit-card','focus-scan':'barcode',
  'new-product':'plus','new-record':'plus','new-manual':'plus','add-option':'plus',
  'edit-product':'pencil','edit-record':'pencil','edit-settings':'settings','edit-device':'monitor','rename-category':'pencil',
  'delete-product':'trash','drop-category':'trash','remove-line':'trash','remove-option':'trash',
  'search-invoices':'search','invoice-detail':'receipt','load-report':'chart','export-report':'download',
  'open-shift':'unlock','close-shift':'lock','print-manual':'printer','print-settings':'printer',
  'go-account':'user','go-support':'headphones','purchase-items':'list',
  'go-settings':'settings','logout':'logout','qty':'plus'
 };
 const pick=(action,label='')=>{
  if(actions[action])return actions[action];
  const s=String(label).trim();
  if(s.includes('طباعة')||s.includes('الطابعة'))return 'printer';
  if(s.includes('حذف')||s.includes('إفراغ'))return 'trash';
  if(s.includes('بحث')||s.includes('عرض الفواتير'))return 'search';
  if(s.includes('تحديث')||s.includes('مزامنة'))return 'refresh';
  if(s.includes('حفظ')||s.includes('تأكيد')||s.includes('إتمام'))return 'check';
  if(s.includes('إضافة')||s.includes('جديد')||s.includes('فتح وردية'))return 'plus';
  if(s.includes('تعديل')||s.includes('تسمية'))return 'pencil';
  if(s.includes('إلغاء')||s.includes('إغلاق'))return 'x';
  if(s.includes('تحميل')||s.includes('تثبيت')||s.includes('تصدير'))return 'download';
  if(s.includes('دفع')||s.includes('شبكة'))return 'credit-card';
  if(s.includes('نقد'))return 'cash';
  if(s.includes('تسجيل الخروج'))return 'logout';
  if(s.includes('الدخول'))return 'arrow-left';
  return null;
 };
 const svg=(name,cls='')=>{
  const body=paths[name];if(!body)return '';
  return `<svg class="milo-ui-icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${body}</svg>`;
 };
 function decorate(){
  document.querySelectorAll('button:not(.milo-icon-ready)').forEach(el=>{
   el.classList.add('milo-icon-ready');
   if(el.querySelector('.milo-ui-icon,.side-icon'))return;
   if(el.closest('.qty-controls,.qty,.quantity-stepper,.numeric-keypad'))return;
   if(el.classList.contains('chip')||el.classList.contains('paymethod')||el.classList.contains('catalog-card'))return;
   if(el.matches('[data-action="qty"],[data-action="filter-category"],[data-action="product-tab"]'))return;
   const action=el.dataset.action||'';
   const label=el.textContent||'';
   const ico=pick(action,label);
   if(ico) el.insertAdjacentHTML('afterbegin',svg(ico));
  });
  document.querySelectorAll('.setting-tile h3:not(.milo-title-icon-ready)').forEach(h=>{
   h.classList.add('milo-title-icon-ready');
   const text=h.textContent||'';
   const name=text.includes('طباعة')?'printer':text.includes('مطعم')?'shopping-bag':text.includes('بيانات')?'shop':text.includes('الجهاز')||text.includes('الكاشيرات')?'monitor':text.includes('المزامنة')?'refresh':text.includes('حساب')?'user':text.includes('الدعم')?'headphones':text.includes('المستخدمون')?'users':'settings';
   h.insertAdjacentHTML('afterbegin',svg(name,'setting-title-icon'));
  });
 }
 const boot=()=>{
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  decorate();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
 window.MiloIcons={svg,pages,pick,decorate};
})();
