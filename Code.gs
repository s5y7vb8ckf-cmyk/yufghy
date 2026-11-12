/** Milo Cashier - قاعدة البيانات السحابية backend. Bind script to the spreadsheet. */
const SHEETS = { accounts:'Accounts', products:'Products', reports:'Reports', shifts:'Shifts', customers:'Customers', suppliers:'Suppliers', storeSettings:'StoreSettings', expenses:'Expenses', promotions:'Promotions', employees:'Employees', returns:'Returns', purchases:'Purchases', purchaseItems:'PurchaseItems', vouchers:'Vouchers', deviceActivity:'DeviceActivity', deviceStatus:'DeviceStatus', deviceAlerts:'DeviceAlerts', supportTickets:'SupportTickets', reportDaily:'ReportDaily', deletedRecords:'DeletedRecords', customerOrders:'CustomerOrders' };
const ACCOUNT_HEADERS = ['store_code','username','password','owner_name','store_name','vat_number','district','phone','address','subscription_end','days_left','status','notes'];
const PRODUCT_HEADERS = ['store_code','barcode','name','price','wholesale_price','cost_price','stock','category','unit','min_stock','description','image_url','unlimited_stock','restaurant_options_json'];
const REPORT_DAILY_HEADERS = ['store_code','report_id','device_code','report_date','invoice_count','subtotal','sales_total','vat','discount','cash','card','cost','gross_profit','top_products_json','updated_at','terminal_id','terminal_name'];
const REPORT_HEADERS = ['store_code','invoice_id','date','cashier','customer','customer_phone','subtotal','discount','total','vat','cash','card','change','terminal','items_count','items','print_status','print_token','print_time','print_error','terminal_name','service_type'];
const SHIFT_HEADERS = ['store_code','shift_id','terminal','cashier','opened_at','closed_at','opening_cash','closing_cash','expected_cash','invoice_count','cash_sales','card_sales','total_sales','vat','discount','updated_at'];
const CONTACT_HEADERS = ['store_code','contact_id','name','phone','address','vat_number','balance','notes','updated_at'];
const DELETED_HEADERS = ['store_code','entity_type','record_key','deleted_at'];
const STORE_SETTING_HEADERS = ['store_code','setting_key','setting_value','updated_at'];
const STORE_SETTING_KEYS = ['store_name','vat_number','phone','address','footer','invoice_header','restaurant_mode','customer_orders_enabled','customer_orders_token'];
const EXTRA_SCHEMAS = {
 expenses: {headers:['store_code','record_id','date','category','description','amount','payment_method','created_by','updated_at'], id:'record_id'},
 promotions: {headers:['store_code','record_id','name','discount_type','discount_value','barcode','start_date','end_date','enabled','updated_at'], id:'record_id'},
 employees: {headers:['store_code','record_id','name','username','role','enabled','updated_at'], id:'record_id'},
 returns: {headers:['store_code','record_id','invoice_id','date','items','total','reason','refund_method','created_by','updated_at'], id:'record_id'},
 purchases: {headers:['store_code','record_id','supplier_id','supplier_name','invoice_number','date','total','updated_at'], id:'record_id'},
 purchaseItems: {headers:['store_code','record_id','purchase_id','product_id','product_name','qty','unit_cost','line_total','updated_at'], id:'record_id'},
 vouchers: {headers:['store_code','record_id','kind','contact_type','contact_id','contact_name','date','amount','reference','notes','updated_at'], id:'record_id'}
};
const DEVICE_ACTIVITY_HEADERS = ['store_code','event_id','device_code','device_name','username','owner_name','event_type','occurred_at','received_at','details'];
const DEVICE_STATUS_HEADERS = ['store_code','device_code','device_name','username','owner_name','last_open','last_close','last_seen','current_status','inactivity_alert_at','updated_at'];
const DEVICE_ALERT_HEADERS = ['store_code','device_code','device_name','owner_name','alert_type','last_seen','alert_at','details'];
const SUPPORT_TICKET_HEADERS = ['store_code','ticket_id','occurred_at','received_at','device_code','device_name','username','owner_name','description','error_summary','status'];
const ACTIVE_VALUES = ['مفعل','مفعّل','active','1','yes','true','نعم'];
function fail_(error,message){return {ok:false,error:error,message:message};}
function str_(v){return v==null?'':String(v).trim();}
function num_(v){const n=Number(str_(v).replace(/,/g,''));return isFinite(n)?n:0;}
function book_(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw Error('اربط السكربت بملف قاعدة البيانات السحابية');return ss;}
function table_(name){const sh=book_().getSheetByName(name);if(!sh)throw Error('الورقة غير موجودة: '+name+'؛ شغّل setup');const values=sh.getDataRange().getValues();const headers=values[0].map(str_);const idx={};headers.forEach((h,i)=>idx[h]=i);return {sh,values,headers,idx};}
function requireCols_(t,cols){cols.forEach(c=>{if(t.idx[c]===undefined)throw Error('العمود ناقص: '+c);});}
function col_(t,row,key){return t.idx[key]===undefined?'':row[t.idx[key]];}
function dateStr_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');const s=str_(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';}
function daysLeft_(v){const s=dateStr_(v);if(!s)return null;const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');return Math.round((Date.parse(s+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);}
// Web App: public health-check remains unchanged. Mobile dashboard is gated by account login.
function doGet(e){
 if(e && e.parameter && String(e.parameter.mobile||'')==='1'){
  return HtmlService.createHtmlOutputFromFile('MobileReports')
   .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover')
   .setTitle('MILO | تقارير الجوال');
 }
 return ContentService.createTextOutput('Milo Cashier cloud is running');
}
function doPost(e){let out;try{const req=JSON.parse(e.postData.contents);out=route_(req);}catch(err){out=fail_('server','خطأ في الخادم: '+err.message);}return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);}
function authenticate_(req){const username=str_(req.username),password=str_(req.password);if(!username||!password)return fail_('bad_credentials','اكتب اسم المستخدم وكلمة السر');
 const cache=CacheService.getScriptCache();const key='fail:'+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,username.toLowerCase())).slice(0,35);
 if(num_(cache.get(key))>=5)return fail_('too_many','محاولات خاطئة كثيرة. انتظر 10 دقائق');
 const t=table_(SHEETS.accounts);requireCols_(t,['store_code','username','password','subscription_end','status']);let row=null;
 for(let i=1;i<t.values.length;i++){let v=t.values[i];if(str_(col_(t,v,'username')).toLowerCase()===username.toLowerCase()&&str_(col_(t,v,'password'))===password){row=v;break;}}
 if(!row){cache.put(key,String(num_(cache.get(key))+1),600);return fail_('bad_credentials','اسم المستخدم أو كلمة السر غير صحيحة');}cache.remove(key);
 if(!ACTIVE_VALUES.includes(str_(col_(t,row,'status')).toLowerCase()))return fail_('locked','الحساب مغلق. تواصل مع الإدارة');
 const days=daysLeft_(col_(t,row,'subscription_end'));if(days===null||days<0)return fail_('expired','الاشتراك منتهي أو التاريخ غير صحيح');
 const get=k=>str_(col_(t,row,k));const storeCode=get('store_code');if(!storeCode)return fail_('locked','كود المحل غير موجود');
 return {ok:true,account:{storeCode,username:get('username'),ownerName:get('owner_name'),storeName:get('store_name'),vatNumber:get('vat_number'),district:get('district'),phone:get('phone'),address:get('address'),subscriptionEnd:dateStr_(col_(t,row,'subscription_end')),daysLeft:days}};
}
function route_(req){const action=str_(req.action);if(action.startsWith('admin'))return miloAdminAction_(req);if(['publicCustomerCatalog','submitCustomerOrder','publicOrderStatus'].includes(action))return miloPublicOrderAction_(action,req);if(!['login','ping','products','reports','addInvoice','saveProducts','shifts','saveShifts','customers','saveCustomers','suppliers','saveSuppliers','claimPrint','completePrint','getStoreSettings','saveStoreSettings','expenses','saveExpenses','promotions','savePromotions','employees','saveEmployees','returns','saveReturns','purchases','savePurchases','purchaseItems','savePurchaseItems','vouchers','saveVouchers','saveDeviceEvents','submitSupportTicket','saveReportDaily','reportDaily','capabilities','deleteEntity','deletedRecords','purgeInvoices','purgeReports','purgeProducts','customerOrders','updateCustomerOrder','completeCustomerOrder','getCustomerOrderInvoice'].includes(action))return fail_('bad_request','طلب غير معروف');const auth=authenticate_(req);if(!auth.ok)return auth;const storeCode=auth.account.storeCode;
 if(action==='login'||action==='ping')return {ok:true,account:auth.account};
  if(action==='customerOrders')return miloCustomerOrders_(storeCode);
  if(action==='updateCustomerOrder')return miloUpdateCustomerOrder_(storeCode,req);
  if(action==='completeCustomerOrder')return miloCompleteCustomerOrder_(storeCode,req,auth.account);
  if(action==='getCustomerOrderInvoice')return miloGetCustomerOrderInvoice_(storeCode,req);
 if(['purgeInvoices','purgeReports','purgeProducts','customerOrders','updateCustomerOrder'].includes(action))return miloPurgeStoreData_(action,auth.account,req);
 if(action==='capabilities')return {ok:true,reportsSyncVersion:2};
 if(action==='saveReportDaily')return saveReportDaily_(storeCode,req.records);
 if(action==='reportDaily')return {ok:true,dailyReports:readReportDaily_(storeCode,str_(req.from),str_(req.to))};
 if(action==='saveDeviceEvents')return saveDeviceEvents_(storeCode,auth.account,req.events);
 if(action==='submitSupportTicket')return submitSupportTicket_(storeCode,auth.account,req.ticket);
 if(action==='products'){
  const catalog=products_(storeCode),revision=productCatalogRevision_(catalog);
  if(str_(req.ifRevision)&&str_(req.ifRevision)===revision)
   return {ok:true,productsUnchanged:true,productsRevision:revision};
  return {ok:true,products:catalog,productsUnchanged:false,productsRevision:revision};
 }
 if(action==='saveProducts')return saveProducts_(storeCode,req.products);
 if(action==='deleteEntity')return deleteEntity_(storeCode,req.entityType,req.recordId);
 if(action==='deletedRecords')return {ok:true,deletedRecords:listDeletedRecords_(storeCode)};
 if(action==='shifts')return {ok:true,shifts:readEntities_(SHEETS.shifts,SHIFT_HEADERS,storeCode)};
 if(action==='customers')return {ok:true,customers:readEntities_(SHEETS.customers,CONTACT_HEADERS,storeCode)};
 if(action==='suppliers')return {ok:true,suppliers:readEntities_(SHEETS.suppliers,CONTACT_HEADERS,storeCode)};
 if(action==='saveShifts')return saveEntities_(SHEETS.shifts,SHIFT_HEADERS,storeCode,req.shifts,'shift_id',['shift_id','terminal']);
 if(action==='saveCustomers')return saveEntities_(SHEETS.customers,CONTACT_HEADERS,storeCode,req.customers,'contact_id',['contact_id']);
 if(action==='saveSuppliers')return saveEntities_(SHEETS.suppliers,CONTACT_HEADERS,storeCode,req.suppliers,'contact_id',['contact_id']);
 if(action==='getStoreSettings')return {ok:true,settings:getStoreSettings_(storeCode)};
 if(action==='saveStoreSettings')return saveStoreSettings_(storeCode,req.settings);
 for(const [category,schema] of Object.entries(EXTRA_SCHEMAS)){
  if(action===category)return {ok:true,records:readEntities_(SHEETS[category],schema.headers,storeCode)};
  if(action==='save'+category.charAt(0).toUpperCase()+category.slice(1))
   return saveExtraRecords_(SHEETS[category],schema,storeCode,req.records);
 }
 if(action==='claimPrint')return claimPrint_(storeCode);
 if(action==='completePrint')return completePrint_(storeCode,req);
 if(action==='reports')return {ok:true,account:auth.account,reports:reports_(storeCode,str_(req.from),str_(req.to))};
 const saved=addInvoice_(storeCode,req.invoice||{},req.noStockDeduction===true);return {ok:true,duplicate:!saved};
}

// Daily report snapshots contain derived totals, not invoices. A record is keyed by
// authenticated store_code + stable device_code + calendar date. Retrying replaces it.
// The source of truth remains the Reports invoice sheet; never add snapshots to it.
function saveReportDaily_(storeCode,records){
 if(!Array.isArray(records)||!records.length||records.length>50)
  return fail_('bad_request','يجب إرسال 1 إلى 50 تقريرًا يوميًا');
 const rows=[],seen=new Set();
 for(const record of records){
  if(!record||typeof record!=='object')return fail_('bad_request','سجل التقرير غير صحيح');
  const device=str_(record.deviceCode),day=str_(record.reportDate),id=str_(record.reportId);
  if(!/^MILO-[A-F0-9]{20}$/.test(device)||!/^\d{4}-\d{2}-\d{2}$/.test(day)||
     id!==device+':'+day||seen.has(id))return fail_('bad_request','معرف التقرير أو تاريخه غير صحيح');
  seen.add(id);
  const numbers=['invoiceCount','subtotal','salesTotal','vat','discount','cash','card','cost','grossProfit'];
  if(numbers.some(k=>typeof record[k]!=='number'||!isFinite(record[k])||Math.abs(record[k])>1000000000000))
   return fail_('bad_request','أرقام التقرير غير صحيحة');
  if(!Number.isInteger(record.invoiceCount)||record.invoiceCount<0)return fail_('bad_request','عدد الفواتير غير صحيح');
  const top=str_(record.topProductsJson);
  if(top.length>35000)return fail_('bad_request','تفاصيل المنتجات طويلة جدًا');
  let parsed;try{parsed=JSON.parse(top||'[]');}catch(e){return fail_('bad_request','تفاصيل المنتجات ليست JSON');}
  if(!Array.isArray(parsed)||parsed.length>20||parsed.some(x=>!x||typeof x.name!=='string'||x.name.length>300||
     !isFinite(x.qty)||!isFinite(x.total)))return fail_('bad_request','تفاصيل المنتجات غير صحيحة');
  rows.push({store_code:storeCode,report_id:id,device_code:device,report_date:day,
   invoice_count:record.invoiceCount,subtotal:record.subtotal,sales_total:record.salesTotal,
   vat:record.vat,discount:record.discount,cash:record.cash,card:record.card,
   cost:record.cost,gross_profit:record.grossProfit,top_products_json:top,
   terminal_id:safeCell_(str_(record.terminalId).slice(0,64)),terminal_name:safeCell_(str_(record.terminalName).slice(0,80)),
   updated_at:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss')});
 }
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  ensureSheet_(book_(),SHEETS.reportDaily,REPORT_DAILY_HEADERS);
  const t=table_(SHEETS.reportDaily);requireCols_(t,REPORT_DAILY_HEADERS);
  const index=new Map();for(let i=1;i<t.values.length;i++){
   if(str_(col_(t,t.values[i],'store_code'))!==storeCode)continue;
   const id=str_(col_(t,t.values[i],'report_id'));if(id&&!index.has(id))index.set(id,i+1);
  }
  let added=0,updated=0;
  const append=[];
  for(const data of rows){
   const n=index.get(data.report_id);
   const vals=n?t.values[n-1].slice():Array(t.headers.length).fill('');
   REPORT_DAILY_HEADERS.forEach(h=>{vals[t.idx[h]]=data[h];});
   if(n){t.sh.getRange(n,1,1,t.headers.length).setValues([vals]);updated++;}
   else{append.push(vals);added++;}
  }
  if(append.length)t.sh.getRange(t.sh.getLastRow()+1,1,append.length,t.headers.length).setValues(append);
  SpreadsheetApp.flush();return {ok:true,added,updated,count:rows.length};
 }finally{lock.releaseLock();}
}
function readReportDaily_(storeCode,from,to){
 if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to)))
  throw Error('نطاق التاريخ غير صحيح');
 ensureSheet_(book_(),SHEETS.reportDaily,REPORT_DAILY_HEADERS);
 const t=table_(SHEETS.reportDaily);requireCols_(t,REPORT_DAILY_HEADERS);
 const data=[];
 for(let i=1;i<t.values.length;i++){
  const row=t.values[i];if(str_(col_(t,row,'store_code'))!==storeCode)continue;
  const day=dateStr_(col_(t,row,'report_date'));
  if((from&&day<from)||(to&&day>to))continue;
  data.push({reportId:str_(col_(t,row,'report_id')),deviceCode:str_(col_(t,row,'device_code')),
   terminalId:str_(col_(t,row,'terminal_id')),terminalName:str_(col_(t,row,'terminal_name')),
   reportDate:day,invoiceCount:num_(col_(t,row,'invoice_count')),
   subtotal:num_(col_(t,row,'subtotal')),salesTotal:num_(col_(t,row,'sales_total')),
   vat:num_(col_(t,row,'vat')),discount:num_(col_(t,row,'discount')),
   cash:num_(col_(t,row,'cash')),card:num_(col_(t,row,'card')),
   cost:num_(col_(t,row,'cost')),grossProfit:num_(col_(t,row,'gross_profit')),
   topProductsJson:str_(col_(t,row,'top_products_json')),updatedAt:str_(col_(t,row,'updated_at'))});
 }
 return data;
}

// Store-wide preferences: never accept store_code from the client or share device printer paths.
function getStoreSettings_(storeCode){
 const t=table_(SHEETS.storeSettings);requireCols_(t,STORE_SETTING_HEADERS);
 const result={};for(let i=1;i<t.values.length;i++){
  const v=t.values[i];if(str_(col_(t,v,'store_code'))!==storeCode)continue;
  const key=str_(col_(t,v,'setting_key'));if(STORE_SETTING_KEYS.includes(key))result[key]=str_(col_(t,v,'setting_value'));
 }return result;
}
function saveStoreSettings_(storeCode,settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings))return fail_('bad_request','إعدادات غير صحيحة');
 const entries=Object.entries(settings);
 if(!entries.length||entries.length>STORE_SETTING_KEYS.length||entries.some(([k,v])=>!STORE_SETTING_KEYS.includes(k)||typeof v!=='string'||v.length>1000))return fail_('bad_request','مفتاح إعدادات أو قيمة غير مسموح بها');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{const t=table_(SHEETS.storeSettings);requireCols_(t,STORE_SETTING_HEADERS);
  const rows={};for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===storeCode)rows[str_(col_(t,t.values[i],'setting_key'))]=i+1;
  const when=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
  const appended=[];for(const [key,value] of entries){
   const row={store_code:storeCode,setting_key:key,setting_value:safeCell_(value),updated_at:when};
   const vals=t.headers.map(h=>row[h]===undefined?'':row[h]);
   if(rows[key])t.sh.getRange(rows[key],1,1,vals.length).setValues([vals]);else appended.push(vals);
  }
  if(appended.length)t.sh.getRange(t.sh.getLastRow()+1,1,appended.length,t.headers.length).setValues(appended);
  return {ok:true,count:entries.length};
 }finally{lock.releaseLock();}
}
function saveExtraRecords_(name,schema,storeCode,records){
 if(!Array.isArray(records)||records.length<1||records.length>200)return fail_('bad_request','عدد السجلات غير صحيح');
 const known=new Set(schema.headers),seen=new Set(),items=[];
 for(const record of records){
  if(!record||typeof record!=='object'||Array.isArray(record))return fail_('bad_request','سجل غير صالح');
  const id=str_(record[schema.id]);if(!id||id.length>120||seen.has(id))return fail_('bad_request','معرف مفقود أو مكرر');seen.add(id);
  const entry={store_code:storeCode,updated_at:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss')};
  for(const key of Object.keys(record))if(known.has(key)&&key!=='store_code'&&key!=='updated_at'){
   const val=record[key];if(typeof val!=='number'&&typeof val!=='string'&&typeof val!=='boolean')return fail_('bad_request','نوع حقل غير صالح');
   entry[key]=typeof val==='string'?safeCell_(val.slice(0,2000)):val;
  }
  entry[schema.id]=id;items.push(entry);
 }
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{const t=table_(name);requireCols_(t,schema.headers);const existing=new Map();
  for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===storeCode)existing.set(str_(col_(t,t.values[i],schema.id)),i+1);
  const append=[];for(const item of items){const vals=t.headers.map(h=>item[h]===undefined?'':item[h]);
   if(existing.has(item[schema.id]))t.sh.getRange(existing.get(item[schema.id]),1,1,vals.length).setValues([vals]);else append.push(vals);
  }
  if(append.length)t.sh.getRange(t.sh.getLastRow()+1,1,append.length,t.headers.length).setValues(append);
  return {ok:true,count:items.length,added:append.length};
 }finally{lock.releaseLock();}
}
// Generic store-isolated reads / idempotent upserts for business records.
function safeCell_(value){const s=str_(value);return /^[=+@\-]/.test(s)&&!/^-[0-9.]+$/.test(s)?"'"+s:s;}
function readEntities_(name,headers,storeCode){
 const t=table_(name);requireCols_(t,headers);const out=[];
 const entityType=name===SHEETS.customers?'customer':name===SHEETS.suppliers?'supplier':'';
 const deleted=entityType?deletedKeys_(storeCode,entityType):new Set();
 for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===storeCode&&
    (!entityType||!deleted.has(str_(col_(t,t.values[i],'contact_id'))))){
  const obj={};headers.forEach(h=>{if(h!=='store_code'){
   let v=col_(t,t.values[i],h);obj[h]=v instanceof Date?Utilities.formatDate(v,Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm:ss"):v;
  }});out.push(obj);
 }return out;
}
function saveEntities_(name,headers,storeCode,incoming,idField,keyFields){
 if(!Array.isArray(incoming)||incoming.length<1||incoming.length>250)return fail_('bad_request','يجب إرسال 1 إلى 250 سجلاً');
 const items=[],seen=new Set();
 for(const original of incoming){
  if(!original||typeof original!=='object')return fail_('bad_request','السجل غير صحيح');
  const entry={store_code:storeCode};
  headers.forEach(h=>{if(h!=='store_code')entry[h]=typeof original[h]==='number'?original[h]:safeCell_(original[h]);});
  if(!str_(entry[idField])||str_(entry[idField]).length>120)return fail_('bad_request','معرف السجل مفقود');
  if(name!==SHEETS.shifts&&!str_(entry.name))return fail_('bad_request','اسم العميل أو المورد مطلوب');
  const key=keyFields.map(h=>str_(entry[h])).join('::');
  if(seen.has(key))return fail_('bad_request','سجل مكرر في الطلب');
  seen.add(key);entry.updated_at=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd HH:mm:ss");items.push({key,entry});
 }
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const t=table_(name);requireCols_(t,headers);const indexed=new Map();
  const entityType=name===SHEETS.customers?'customer':name===SHEETS.suppliers?'supplier':'';
  const deleted=entityType?deletedKeys_(storeCode,entityType):new Set();
  for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===storeCode){
   const key=keyFields.map(h=>str_(col_(t,t.values[i],h))).join('::');if(!indexed.has(key))indexed.set(key,i+1);
  }
  const append=[];let added=0,updated=0,skipped=0;
  for(const item of items){
   if(deleted.has(str_(item.entry[idField]))){skipped++;continue;}
   const vals=t.headers.map(h=>item.entry[h]===undefined?'':item.entry[h]);
   if(indexed.has(item.key)){t.sh.getRange(indexed.get(item.key),1,1,vals.length).setValues([vals]);updated++;}
   else{append.push(vals);added++;}
  }
  if(append.length)t.sh.getRange(t.sh.getLastRow()+1,1,append.length,t.headers.length).setValues(append);
  SpreadsheetApp.flush();return {ok:true,added,updated,skipped,count:items.length};
 }finally{lock.releaseLock();}
}
function products_(storeCode){const t=table_(SHEETS.products);requireCols_(t,['store_code','barcode','name','price']);const out=new Map();
 const deleted=deletedKeys_(storeCode,'product');
 for(let r=1;r<t.values.length;r++){
  const v=t.values[r],barcode=str_(col_(t,v,'barcode'));
  if(str_(col_(t,v,'store_code'))!==storeCode||!barcode||!str_(col_(t,v,'name'))||
    deleted.has(barcode)||out.has(barcode))continue;
  // Existing duplicate barcodes in older sheets are read only once; no history is deleted.
  out.set(barcode,{barcode,name:str_(col_(t,v,'name')),price:num_(col_(t,v,'price')),
   wholesalePrice:num_(col_(t,v,'wholesale_price')),costPrice:num_(col_(t,v,'cost_price')),
   stock:num_(col_(t,v,'stock')),category:str_(col_(t,v,'category')),
   unit:str_(col_(t,v,'unit')),minStock:num_(col_(t,v,'min_stock')),
   description:str_(col_(t,v,'description')),imageUrl:str_(col_(t,v,'image_url')),
   unlimitedStock:['1','true','yes','نعم'].includes(str_(col_(t,v,'unlimited_stock')).toLowerCase()),
   restaurantOptionsJson:str_(col_(t,v,'restaurant_options_json'))});
 }
 return Array.from(out.values());
}
// Stable store-specific digest: if unchanged, the second terminal downloads NO catalog.
// No extra columns and no product duplication. Local edits still queue on save.
function productCatalogRevision_(items){
 const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(items),Utilities.Charset.UTF_8);
 return Utilities.base64EncodeWebSafe(digest);
}
// Store-scoped batch upsert. Never accept store_code from client payload.
function saveProducts_(storeCode, incoming){
 if(!Array.isArray(incoming)||incoming.length<1||incoming.length>300) return fail_('bad_request','عدد المنتجات غير صالح (1 إلى 300)');
 const validated=[],seen=new Set();
 for(const item of incoming){
  const barcode=str_(item.barcode),name=str_(item.name);
  const keys=['price','wholesalePrice','costPrice','stock','minStock'];
  if(!barcode||barcode.length>120||!name||name.length>500||seen.has(barcode)||keys.some(k=>!Number.isFinite(Number(item[k]))||Number(item[k])<0))
   return fail_('invalid_product','بيانات منتج غير صالحة أو باركود مكرر');
  seen.add(barcode);
  validated.push({store_code:storeCode,barcode,name,price:num_(item.price),wholesale_price:num_(item.wholesalePrice),cost_price:num_(item.costPrice),stock:num_(item.stock),category:str_(item.category),unit:str_(item.unit)||'حبة',min_stock:num_(item.minStock),description:str_(item.description),image_url:/^https:\/\//i.test(str_(item.imageUrl))?str_(item.imageUrl).slice(0,2000):'',unlimited_stock:item.unlimitedStock===true?1:(item.unlimitedStock===false?0:undefined),restaurant_options_json:str_(item.restaurantOptionsJson).slice(0,18000)});
 }
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const t=table_(SHEETS.products);requireCols_(t,PRODUCT_HEADERS);
  const deleted=deletedKeys_(storeCode,'product');
  const existing=new Map();
  for(let i=1;i<t.values.length;i++) if(str_(col_(t,t.values[i],'store_code'))===storeCode){const bc=str_(col_(t,t.values[i],'barcode'));if(bc&&!existing.has(bc))existing.set(bc,i+1);}
  let added=0,updated=0,skipped=0;const append=[];
  for(const item of validated){
   if(deleted.has(item.barcode)){skipped++;continue;}
   const previousRow=existing.has(item.barcode)?t.values[existing.get(item.barcode)-1]:null;
   const vals=t.headers.map((h,i)=>item[h]===undefined?(previousRow?previousRow[i]:''):item[h]);
   if(existing.has(item.barcode)){
    if(vals.some((v,j)=>String(v??'')!==String(previousRow[j]??''))){
     t.sh.getRange(existing.get(item.barcode),1,1,vals.length).setValues([vals]);updated++;
    }else skipped++;
   }
   else {append.push(vals);added++;}
  }
  if(append.length) t.sh.getRange(t.sh.getLastRow()+1,1,append.length,t.headers.length).setValues(append);
  SpreadsheetApp.flush();return {ok:true,added,updated,skipped,count:validated.length};
 }finally{lock.releaseLock();}
}
// Deletion is immediate and account-scoped. Historic invoices/ledger entries are never removed.
// A tombstone prevents an offline terminal's next upsert from re-creating a deleted record.
function deletedKeys_(storeCode, entityType){
 const sh=book_().getSheetByName(SHEETS.deletedRecords);
 if(!sh)return new Set();
 const t=table_(SHEETS.deletedRecords);requireCols_(t,DELETED_HEADERS);
 return new Set(t.values.slice(1).filter(v=>str_(col_(t,v,'store_code'))===storeCode&&
   str_(col_(t,v,'entity_type'))===entityType).map(v=>str_(col_(t,v,'record_key'))));
}
function listDeletedRecords_(storeCode){
 const sh=book_().getSheetByName(SHEETS.deletedRecords);if(!sh)return [];
 const t=table_(SHEETS.deletedRecords);requireCols_(t,DELETED_HEADERS);
 return t.values.slice(1).filter(r=>str_(col_(t,r,'store_code'))===storeCode)
  .map(r=>({entityType:str_(col_(t,r,'entity_type')),recordId:str_(col_(t,r,'record_key'))}));
}
function deleteEntity_(storeCode,entityType,recordId){
 const targets={product:{name:SHEETS.products,column:'barcode'},
                customer:{name:SHEETS.customers,column:'contact_id'},
                supplier:{name:SHEETS.suppliers,column:'contact_id'}};
 const kind=str_(entityType),key=str_(recordId),target=targets[kind];
 if(!target||!key||key.length>120||/[\r\n]/.test(key)||/^[=+@]/.test(key))
   return fail_('bad_request','معرف السجل غير صالح');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
   // Keep the deletion record first. On a partial failure a later retry can finish deletion safely.
   const tomb=ensureSheet_(book_(),SHEETS.deletedRecords,DELETED_HEADERS);
   const saved=deletedKeys_(storeCode,kind);
   if(!saved.has(key)){
     const ts=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
     const t=table_(SHEETS.deletedRecords);
     t.sh.appendRow(t.headers.map(h=>({store_code:storeCode,entity_type:kind,record_key:key,deleted_at:ts}[h]||'')));
     SpreadsheetApp.flush();
   }
   const t=table_(target.name);requireCols_(t,['store_code',target.column]);
   let removed=0;
   for(let i=t.values.length-1;i>=1;i--){
     const v=t.values[i];
     if(str_(col_(t,v,'store_code'))===storeCode&&str_(col_(t,v,target.column))===key){
       t.sh.deleteRow(i+1);removed++;
     }
   }
   return {ok:true,deleted:true,count:removed};
 }finally{lock.releaseLock();}
}
function reports_(storeCode,from,to){ensureSheet_(book_(),SHEETS.reports,REPORT_HEADERS);if(from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))throw Error('تاريخ البداية غير صحيح');if(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))throw Error('تاريخ النهاية غير صحيح');
 const t=table_(SHEETS.reports);requireCols_(t,['store_code','invoice_id','date']);const out=[];
 for(let r=1;r<t.values.length;r++){const v=t.values[r];if(str_(col_(t,v,'store_code'))!==storeCode)continue;let raw=col_(t,v,'date');let date=raw instanceof Date?Utilities.formatDate(raw,Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'):str_(raw);const day=date.slice(0,10);if((from&&day<from)||(to&&day>to))continue;
 out.push({invoiceId:str_(col_(t,v,'invoice_id')),date,terminalName:str_(col_(t,v,'terminal_name')),cashier:str_(col_(t,v,'cashier')),customer:str_(col_(t,v,'customer')),customerPhone:str_(col_(t,v,'customer_phone')),subtotal:num_(col_(t,v,'subtotal')),discount:num_(col_(t,v,'discount')),total:num_(col_(t,v,'total')),vat:num_(col_(t,v,'vat')),cash:num_(col_(t,v,'cash')),card:num_(col_(t,v,'card')),change:num_(col_(t,v,'change')),terminal:str_(col_(t,v,'terminal')),itemsCount:num_(col_(t,v,'items_count')),items:str_(col_(t,v,'items')),serviceType:str_(col_(t,v,'service_type'))});}
 out.sort((a,b)=>b.date.localeCompare(a.date));return out;
}
function addInvoice_(storeCode,inv,skipStockDeduction){ensureSheet_(book_(),SHEETS.reports,REPORT_HEADERS);const id=str_(inv.invoiceId),terminal=str_(inv.terminal);if(!id)throw Error('رقم الفاتورة ناقص');const lock=LockService.getScriptLock();lock.waitLock(25000);try{
 const t=table_(SHEETS.reports);requireCols_(t,['store_code','invoice_id']);for(let i=1;i<t.values.length;i++){const v=t.values[i];if(str_(col_(t,v,'store_code'))===storeCode&&str_(col_(t,v,'invoice_id'))===id&&str_(col_(t,v,'terminal'))===terminal)return false;}
 const items=Array.isArray(inv.items)?inv.items:[];if(items.length>500)throw Error('عدد المنتجات كبير جدًا');
 const values={store_code:storeCode,invoice_id:id,date:str_(inv.date),cashier:str_(inv.cashier),customer:str_(inv.customer),customer_phone:str_(inv.customerPhone),subtotal:num_(inv.subtotal),discount:num_(inv.discount),total:num_(inv.total),vat:num_(inv.vat),cash:num_(inv.cash),card:num_(inv.card),change:num_(inv.change),terminal,terminal_name:safeCell_(str_(inv.terminalName).slice(0,80)),items_count:items.length,items:items.map(it=>str_(it.name)+' ×'+num_(it.qty)+' = '+num_(it.total)).join(' | '),service_type:safeCell_(str_(inv.serviceType||''))};
 t.sh.appendRow(t.headers.map(h=>values[h]===undefined?'':values[h]));
 // The terminal already decremented local stock and queued an absolute stock value.
 // Avoid deducting again for synced invoices and historical backfill.
 if(!skipStockDeduction){const p=table_(SHEETS.products);if(p.idx.store_code!==undefined&&p.idx.barcode!==undefined&&p.idx.stock!==undefined){const rowOf={};for(let r=1;r<p.values.length;r++)if(str_(col_(p,p.values[r],'store_code'))===storeCode)rowOf[str_(col_(p,p.values[r],'barcode'))]=r;
 const sums={};items.forEach(it=>{const bc=str_(it.barcode),q=num_(it.qty);if(bc&&q>0&&rowOf[bc]!==undefined)sums[bc]=(sums[bc]||0)+q;});Object.keys(sums).forEach(bc=>{const r=rowOf[bc],nv=Math.max(0,num_(col_(p,p.values[r],'stock'))-sums[bc]);p.sh.getRange(r+1,p.idx.stock+1).setValue(nv);});}}
 return true;
 }finally{lock.releaseLock();}}
// Queue control: manual rows must include store_code and invoice_id; only literal طباعة/PENDING triggers printing.
function ensurePrintColumns_(){
 const sh=book_().getSheetByName(SHEETS.reports);if(!sh)throw Error('ورقة Reports غير موجودة');
 const names=['print_status','print_token','print_time','print_error'];
 let hdr=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(str_);
 names.forEach(name=>{if(hdr.indexOf(name)<0){let c=hdr.length+1;
  if(c>sh.getMaxColumns()){
   miloMakeRoomForColumns_(book_(),sh,1);
   sh.insertColumnAfter(sh.getMaxColumns());
  }
  sh.getRange(1,c).setValue(name);hdr.push(name);}});
 return table_(SHEETS.reports);
}
function claimPrint_(storeCode){
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{const t=ensurePrintColumns_();
  for(let r=1;r<t.values.length;r++){
   const v=t.values[r];if(str_(col_(t,v,'store_code'))!==storeCode)continue;
   if(!str_(col_(t,v,'invoice_id')))continue;
   const state=str_(col_(t,v,'print_status')).toLowerCase();
   const ready=state==='طباعة'||state==='pending'||state==='print';
   if(!ready)continue;
   const token=Utilities.getUuid(),row=r+1;
   t.sh.getRange(row,t.idx.print_status+1).setValue('جاري الطباعة');
   t.sh.getRange(row,t.idx.print_token+1).setValue(token);
   t.sh.getRange(row,t.idx.print_error+1).clearContent();
   const get=k=>col_(t,v,k);
   return {ok:true,job:{token,invoiceId:str_(get('invoice_id')),date:get('date') instanceof Date?Utilities.formatDate(get('date'),Session.getScriptTimeZone(),"yyyy-MM-dd HH:mm:ss"):str_(get('date')),cashier:str_(get('cashier')),customer:str_(get('customer')),subtotal:num_(get('subtotal')),discount:num_(get('discount')),total:num_(get('total')),vat:num_(get('vat')),cash:num_(get('cash')),card:num_(get('card')),items:str_(get('items')),serviceType:str_(get('service_type'))}};
  }return {ok:true,job:null};
 }finally{lock.releaseLock();}
}
function completePrint_(storeCode,req){
 const token=str_(req.token);if(!token)return fail_('bad_request','رمز المهمة ناقص');
 const lock=LockService.getScriptLock();lock.waitLock(25000);
 try{const t=ensurePrintColumns_();for(let r=1;r<t.values.length;r++){
  const v=t.values[r];if(str_(col_(t,v,'store_code'))!==storeCode||str_(col_(t,v,'print_token'))!==token)continue;
  t.sh.getRange(r+1,t.idx.print_status+1).setValue(req.success===true?'تمت الطباعة':'فشلت الطباعة');
  t.sh.getRange(r+1,t.idx.print_error+1).setValue(req.success===true?'':str_(req.message).slice(0,200));
  return {ok:true};
 }return fail_('not_found','مهمة الطباعة منتهية أو غير موجودة');
 }finally{lock.releaseLock();}
}
// MILO V13.3.15: Google Sheets counts ALLOCATED rows * columns in every tab
// against the workbook's 20M-cell limit, including entirely blank cells.
// This helper only removes trailing EMPTY grid space after the last data/formula
// cell. It NEVER touches occupied rows/columns or invoice/product records.
// Note: formatting / validations on unused trailing cells may be removed.
const MILO_WORKBOOK_CELL_LIMIT_ = 20000000;
function miloAllocatedCellCount_(ss){
 return ss.getSheets().reduce((total,tab)=>total+tab.getMaxRows()*tab.getMaxColumns(),0);
}
function miloWorkbookCapacityReport(){
 const ss=book_(),rows=ss.getSheets().map(tab=>({
  name:tab.getName(),maxRows:tab.getMaxRows(),usedRows:tab.getLastRow(),
  maxCols:tab.getMaxColumns(),usedCols:tab.getLastColumn(),
  allocated:tab.getMaxRows()*tab.getMaxColumns()
 })).sort((a,b)=>b.allocated-a.allocated);
 const sum=rows.reduce((a,r)=>a+r.allocated,0);
 Logger.log('MILO: الخلايا المحجوزة '+sum.toLocaleString()+' / '+MILO_WORKBOOK_CELL_LIMIT_.toLocaleString());
 rows.forEach(r=>Logger.log(r.name+': '+r.allocated.toLocaleString()+
  ' خلية محجوزة، الصفوف '+r.usedRows+'/'+r.maxRows+'، الأعمدة '+r.usedCols+'/'+r.maxCols));
 return rows;
}
function miloMakeRoomForColumns_(ss,target,extraCols){
 if(extraCols<=0)return;
 const shortage=()=>miloAllocatedCellCount_(ss)+target.getMaxRows()*extraCols-MILO_WORKBOOK_CELL_LIMIT_;
 if(shortage()<=0)return;
 // Prioritize tabs with the most trailing EMPTY rows; keep at least 25 spare
 // rows for new sales, and at least 100 rows on small sheets.
 const candidates=ss.getSheets().map(tab=>{
  const spare=Math.max(0,tab.getMaxRows()-Math.max(100,tab.getLastRow()+25));
  return {tab,spare,gain:spare*(tab.getMaxColumns()+(tab===target?extraCols:0))};
 }).sort((a,b)=>b.gain-a.gain);
 for(const entry of candidates){
  const left=shortage();if(left<=0)break;
  const tab=entry.tab;
  const freedPerRow=tab.getMaxColumns()+(tab===target?extraCols:0);
  const n=Math.min(entry.spare,Math.ceil(left/freedPerRow));
  if(n<1)continue;
  try{
   const from=tab.getMaxRows()-n+1;
   tab.deleteRows(from,n);
   Logger.log('MILO: تم تحرير '+n+' صف فارغ أسفل '+tab.getName()+' لتوفير مساحة للعمود الجديد');
  }catch(e){Logger.log('تعذر تحرير صفوف '+tab.getName()+': '+e.message);}
 }
 // Also reclaim trailing completely unused columns from OTHER sheets.
 if(shortage()>0){
  const tabs=ss.getSheets().filter(tab=>tab!==target).sort((a,b)=>
   (b.getMaxColumns()-Math.max(2,b.getLastColumn()+1))*b.getMaxRows()-
   (a.getMaxColumns()-Math.max(2,a.getLastColumn()+1))*a.getMaxRows());
  for(const tab of tabs){
   if(shortage()<=0)break;
   const keep=Math.max(2,tab.getLastColumn()+1);
   const free=Math.max(0,tab.getMaxColumns()-keep);
   const n=Math.min(free,Math.ceil(shortage()/tab.getMaxRows()));
   if(n<1)continue;
   try{
    tab.deleteColumns(tab.getMaxColumns()-n+1,n);
    Logger.log('MILO: تم تحرير '+n+' عمود فارغ من '+tab.getName());
   }catch(e){Logger.log('تعذر تحرير أعمدة '+tab.getName()+': '+e.message);}
  }
 }
 if(shortage()>0)
  throw Error('قاعدة البيانات ممتلئة (20 مليون خلية) حتى بعد فحص الصفوف الفارغة؛ '
   +'شغّل miloWorkbookCapacityReport لمعرفة الأوراق الكبيرة، '
   +'ثم انقل السجلات القديمة إلى ملف أرشيف منفصل بعد أخذ نسخة احتياطية. لم يتم حذف بيانات.');
}
// Non-destructive schema upgrade: match columns by header name, never rewrite or reorder existing ones.
function ensureSheet_(ss,name,headers){
 let sh=ss.getSheetByName(name);
 if(!sh)sh=ss.insertSheet(name);
 const existing=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(str_);
 const hasHeaders=existing.some(h=>h!=='');
 if(!hasHeaders){
   if(sh.getMaxColumns()<headers.length){
     const n=headers.length-sh.getMaxColumns();
     miloMakeRoomForColumns_(ss,sh,n);sh.insertColumnsAfter(sh.getMaxColumns(),n);
   }
   sh.getRange(1,1,1,headers.length).setValues([headers]);
 }else{
   // Preserve all old headers and cells, including separately-added printed_at / printed_by.
   // Do not silently create a duplicate store_code when an existing table has malformed headers.
   if(sh.getLastRow()>1&&!existing.includes('store_code'))
     throw Error('الورقة '+name+' تحتوي بيانات بدون عمود store_code؛ راجع صف العناوين قبل التحديث');
   const missing=headers.filter(h=>!existing.includes(h));
   if(missing.length){
     const from=existing.length+1;
     const needed=from+missing.length-1-sh.getMaxColumns();
     if(needed>0){
       miloMakeRoomForColumns_(ss,sh,needed);
       sh.insertColumnsAfter(sh.getMaxColumns(),needed);
     }
     sh.getRange(1,from,1,missing.length).setValues([missing]);
     Logger.log(name+': أضيفت الأعمدة: '+missing.join(', '));
   }
 }
 sh.getRange(1,1,1,sh.getLastColumn()).setFontWeight('bold').setBackground('#14745E').setFontColor('#FFFFFF');
 sh.setFrozenRows(1);
 return sh;
}
function setup(){
 const ss=book_();
 for(const [name,headers] of [[SHEETS.accounts,ACCOUNT_HEADERS],[SHEETS.products,PRODUCT_HEADERS],
 [SHEETS.reports,REPORT_HEADERS],[SHEETS.customerOrders,MILO_CUSTOMER_ORDER_HEADERS],[SHEETS.reportDaily,REPORT_DAILY_HEADERS],[SHEETS.shifts,SHIFT_HEADERS],[SHEETS.customers,CONTACT_HEADERS],
 [SHEETS.suppliers,CONTACT_HEADERS],[SHEETS.deletedRecords,DELETED_HEADERS],[SHEETS.storeSettings,STORE_SETTING_HEADERS],
 [SHEETS.deviceActivity,DEVICE_ACTIVITY_HEADERS],[SHEETS.deviceStatus,DEVICE_STATUS_HEADERS],
 [SHEETS.deviceAlerts,DEVICE_ALERT_HEADERS],[SHEETS.supportTickets,SUPPORT_TICKET_HEADERS],
 ...Object.entries(EXTRA_SCHEMAS).map(([key,schema])=>[SHEETS[key],schema.headers])])ensureSheet_(ss,name,headers);
 ensurePrintColumns_();
 // Existing accounts, invoices and products are never cleared, reordered or replaced.
 Logger.log('تم تجهيز الأوراق دون استبدال بيانات المحلات: '+ss.getUrl());
}
function checkMiloDatabase(){
 const ss=book_();Object.values(SHEETS).forEach(name=>{
  const sh=ss.getSheetByName(name);Logger.log(name+': '+(sh?'جاهزة، الصفوف '+sh.getLastRow():'غير موجودة'));
 });
}


// Device log + support requests: authenticated per store_code, idempotent by event/ticket ID.
// These logs are visible to the administrator in the spreadsheet. No silent uninstall protection.
function rowFor_(headers,obj){return headers.map(h=>obj[h]===undefined?'':obj[h]);}
function safeLimited_(s,max){return safeCell_(str_(s).slice(0,max));}
function requireDeviceCode_(s){const v=str_(s);if(!/^MILO-[0-9A-F]{20}$/.test(v))throw Error('كود الجهاز غير صحيح');return v;}
function ensureMonitorSheets_(){
 const ss=book_();
 for(const [n,h] of [[SHEETS.deviceActivity,DEVICE_ACTIVITY_HEADERS],[SHEETS.deviceStatus,DEVICE_STATUS_HEADERS],
                    [SHEETS.deviceAlerts,DEVICE_ALERT_HEADERS],[SHEETS.supportTickets,SUPPORT_TICKET_HEADERS]])
   ensureSheet_(ss,n,h);
}
function saveDeviceEvents_(storeCode,account,events){
 if(!Array.isArray(events)||events.length<1||events.length>30)return fail_('bad_request','عدد الأحداث غير صحيح');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  ensureMonitorSheets_();
  const a=table_(SHEETS.deviceActivity),s=table_(SHEETS.deviceStatus);
  requireCols_(a,DEVICE_ACTIVITY_HEADERS);requireCols_(s,DEVICE_STATUS_HEADERS);
  const seen=new Set(a.values.slice(1).filter(r=>str_(col_(a,r,'store_code'))===storeCode).map(r=>str_(col_(a,r,'event_id'))));
  const index=new Map();for(let i=1;i<s.values.length;i++)if(str_(col_(s,s.values[i],'store_code'))===storeCode)
    index.set(str_(col_(s,s.values[i],'device_code')),i+1);
  const now=new Date().toISOString();let accepted=0;
  for(const e of events){
   if(!e||typeof e!=='object'||!/^[a-f0-9-]{36}$/i.test(str_(e.eventId)))return fail_('bad_request','معرف حدث غير صحيح');
   const code=requireDeviceCode_(e.deviceCode),kind=str_(e.eventType);
   if(str_(e.storeCode)!==storeCode)return fail_('bad_request','حدث تابع لمحل آخر');
   if(!['open','close','heartbeat'].includes(kind))return fail_('bad_request','نوع حدث غير معروف');
   const occurred=/^\d{4}-\d\d-\d\dT/.test(str_(e.occurredAt))?str_(e.occurredAt).slice(0,35):now;
   if(!seen.has(str_(e.eventId))){
    const row={store_code:storeCode,event_id:str_(e.eventId),device_code:code,device_name:safeLimited_(e.deviceName,80),
      username:safeLimited_(account.username,120),owner_name:safeLimited_(account.ownerName,150),
      event_type:kind,occurred_at:occurred,received_at:now,details:safeLimited_(e.details,160)};
    a.sh.appendRow(rowFor_(a.headers,row));seen.add(str_(e.eventId));accepted++;
   }
   const pos=index.get(code);
   const prior=pos?s.sh.getRange(pos,1,1,s.headers.length).getValues()[0]:null;
   const get=h=>prior?str_(col_(s,prior,h)):'';
   // Use received time as last_seen to avoid a stale clock or old offline events triggering a false inactivity alert.
   const row={store_code:storeCode,device_code:code,device_name:safeLimited_(e.deviceName,80),
    username:safeLimited_(account.username,120),owner_name:safeLimited_(account.ownerName,150),
    last_open:kind==='open'?now:get('last_open'),last_close:kind==='close'?now:get('last_close'),
    last_seen:now,current_status:kind==='close'?'مغلق':'متصل',inactivity_alert_at:'',updated_at:now};
   const values=rowFor_(s.headers,row);
   if(pos)s.sh.getRange(pos,1,1,values.length).setValues([values]);
   else{const nr=s.sh.getLastRow()+1;s.sh.getRange(nr,1,1,values.length).setValues([values]);index.set(code,nr);}
  }
  return {ok:true,accepted};
 }finally{lock.releaseLock();}
}
function submitSupportTicket_(storeCode,account,ticket){
 if(!ticket||typeof ticket!=='object'||!/^[a-f0-9-]{36}$/i.test(str_(ticket.ticketId)))return fail_('bad_request','رقم البلاغ غير صالح');
 const code=requireDeviceCode_(ticket.deviceCode),description=str_(ticket.description);
 if(str_(ticket.storeCode)!==storeCode)return fail_('bad_request','البلاغ تابع لمحل آخر');
 if(description.length<10||description.length>1200)return fail_('bad_request','وصف المشكلة غير كافٍ');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  ensureMonitorSheets_();const t=table_(SHEETS.supportTickets);requireCols_(t,SUPPORT_TICKET_HEADERS);
  if(t.values.slice(1).some(r=>str_(col_(t,r,'store_code'))===storeCode&&str_(col_(t,r,'ticket_id'))===str_(ticket.ticketId)))
    return {ok:true,duplicate:true};
  const now=new Date().toISOString();const row={store_code:storeCode,ticket_id:str_(ticket.ticketId),
   occurred_at:safeLimited_(ticket.occurredAt,35),received_at:now,device_code:code,
   device_name:safeLimited_(ticket.deviceName,80),username:safeLimited_(account.username,120),
   owner_name:safeLimited_(account.ownerName,150),description:safeLimited_(description,1200),
   error_summary:safeLimited_(ticket.errorSummary,400),status:'جديد'};
  t.sh.appendRow(rowFor_(t.headers,row));return {ok:true};
 }finally{lock.releaseLock();}
}

// Runs independently of cash register; it can report a device that has not connected for >48h.
function checkDeviceInactivity(){
 ensureMonitorSheets_();const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const t=table_(SHEETS.deviceStatus),a=table_(SHEETS.deviceAlerts);
  requireCols_(t,DEVICE_STATUS_HEADERS);requireCols_(a,DEVICE_ALERT_HEADERS);
  const now=new Date(),nowIso=now.toISOString(),threshold=48*60*60*1000;let count=0;
  for(let i=1;i<t.values.length;i++){
   const v=t.values[i],last=col_(t,v,'last_seen');
   const parsed=new Date(last instanceof Date?last.getTime():str_(last));
   if(isNaN(parsed.getTime())||now.getTime()-parsed.getTime()<=threshold)continue;
   if(str_(col_(t,v,'current_status'))==='غائب أكثر من يومين')continue;
   const row={store_code:str_(col_(t,v,'store_code')),device_code:str_(col_(t,v,'device_code')),
    device_name:str_(col_(t,v,'device_name')),owner_name:str_(col_(t,v,'owner_name')),
    alert_type:'inactive_48h',last_seen:parsed.toISOString(),alert_at:nowIso,
    details:'لم يسجل الجهاز نشاط اتصال لأكثر من 48 ساعة؛ قد يكون مطفأ أو خارج الشبكة'};
   a.sh.appendRow(rowFor_(a.headers,row));
   t.sh.getRange(i+1,t.idx.current_status+1).setValue('غائب أكثر من يومين');
   t.sh.getRange(i+1,t.idx.inactivity_alert_at+1).setValue(nowIso);
   count++;
  }
  Logger.log('أجهزة غائبة جديدة: '+count);return count;
 }finally{lock.releaseLock();}
}
function installDeviceInactivityMonitor(){
 ensureMonitorSheets_();
 const name='checkDeviceInactivity';
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name).forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger(name).timeBased().everyHours(6).create();
 Logger.log('تم تشغيل مراقبة غياب الأجهزة كل 6 ساعات. تنبيهات أكثر من 48 ساعة تظهر بورقة DeviceAlerts.');
}

// One-column, non-destructive upgrade for optional unlimited stock.
// Run this once after updating Code.gs. It does not run setup or insert demo accounts.
function enableUnlimitedStockProducts(){
 const sh=book_().getSheetByName(SHEETS.products);
 if(!sh)throw Error('ورقة Products غير موجودة');
 const headers=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(str_);
 if(headers.includes('unlimited_stock')){
  Logger.log('unlimited_stock موجود مسبقًا — لم يتم تعديل المنتجات');return;
 }
 const next=headers.length+1;
 if(next>sh.getMaxColumns()){
   miloMakeRoomForColumns_(book_(),sh,1);sh.insertColumnsAfter(sh.getMaxColumns(),1);
 }
 sh.getRange(1,next).setValue('unlimited_stock')
  .setBackground('#14745E').setFontColor('#FFFFFF').setFontWeight('bold');
 Logger.log('تم إضافة عمود unlimited_stock دون تغيير بيانات المنتجات السابقة');
}


// MILO mobile reports: separate read-only dashboard for the authenticated store.
// IMPORTANT: do not accept a store code from the browser or expose customer data.
function mobileReportDashboard(req){
 try{
  if(!req||typeof req!=='object')return fail_('bad_request','طلب غير صالح');
  const from=str_(req.from),to=str_(req.to);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)
   return fail_('bad_request','الرجاء تحديد فترة صحيحة');
  const start=Date.parse(from+'T12:00:00Z'),end=Date.parse(to+'T12:00:00Z');
  if(!isFinite(start)||!isFinite(end)||(end-start)>186*86400000)
   return fail_('bad_request','الحد الأقصى للفترة هو 6 أشهر');
  const auth=authenticate_({username:req.username,password:req.password});
  if(!auth.ok)return auth;
  const store=auth.account.storeCode;
  const dailySheet=book_().getSheetByName(SHEETS.reportDaily);
  const snapshots=dailySheet?readReportDaily_(store,from,to):[];
  const invoices=book_().getSheetByName(SHEETS.reports)?reports_(store,from,to):[];

  // Repeated snapshots overwrite by ID; if old duplicate rows exist, latest wins.
  const latest=new Map();
  snapshots.forEach(r=>{if(r.reportId)latest.set(r.reportId,r);});
  const reports=Array.from(latest.values());
  const totals={invoiceCount:0,subtotal:0,sales:0,vat:0,discount:0,cash:0,card:0,cost:0,grossProfit:0};
  const graph=new Map(),products=new Map();
  let lastUpdated='';
  if(reports.length){
   reports.forEach(r=>{
    totals.invoiceCount+=num_(r.invoiceCount);
    totals.subtotal+=num_(r.subtotal);
    totals.sales+=num_(r.salesTotal);
    totals.vat+=num_(r.vat);
    totals.discount+=num_(r.discount);
    totals.cash+=num_(r.cash);
    totals.card+=num_(r.card);
    totals.cost+=num_(r.cost);
    totals.grossProfit+=num_(r.grossProfit);
    graph.set(r.reportDate,(graph.get(r.reportDate)||0)+num_(r.salesTotal));
    if(r.updatedAt>lastUpdated)lastUpdated=r.updatedAt;
    let top=[];
    try{top=JSON.parse(r.topProductsJson||'[]');}catch(_){top=[];}
    if(!Array.isArray(top))top=[];
    top.slice(0,20).forEach(p=>{
     const name=str_(p.name).slice(0,100);
     if(!name)return;
     const old=products.get(name)||{name,qty:0,total:0};
     old.qty+=num_(p.qty);old.total+=num_(p.total);products.set(name,old);
    });
   });
  }else{
   // If daily snapshots have not synced yet, show available invoice-level sales.
   invoices.forEach(r=>{
    totals.invoiceCount++;
    totals.subtotal+=num_(r.subtotal);
    totals.sales+=num_(r.total);
    totals.vat+=num_(r.vat);
    totals.discount+=num_(r.discount);
    totals.cash+=Math.max(0,num_(r.cash)-num_(r.change));
    totals.card+=num_(r.card);
    const day=str_(r.date).slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(day))graph.set(day,(graph.get(day)||0)+num_(r.total));
   });
   totals.cost=null;totals.grossProfit=null;
  }
  // Round display totals without modifying any source records.
  Object.keys(totals).forEach(k=>{if(totals[k]!==null)totals[k]=Math.round(totals[k]*100)/100;});
  return {ok:true,
   storeName:auth.account.storeName||'محلك',ownerName:auth.account.ownerName||'',
   from,to,summarySource:reports.length?'daily':'invoices',
   totals,days:Array.from(graph.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([day,sales])=>({day,sales:Math.round(sales*100)/100})),
   topProducts:Array.from(products.values()).sort((a,b)=>b.total-a.total).slice(0,12),
   recentInvoices:invoices.slice(0,40).map(i=>({invoiceId:i.invoiceId,date:i.date,total:i.total,
    cash:Math.max(0,i.cash-i.change),card:i.card,itemsCount:i.itemsCount})),
   lastUpdated,invoiceRowsCount:invoices.length
  };
 }catch(err){
  // Do not leak internal spreadsheet or account details to the mobile browser.
  console.error('MILO mobile report failed: '+String(err&&err.message||err));
  return fail_('report_error','تعذر تحميل التقارير. تأكد من اكتمال المزامنة ثم حاول مجددًا');
 }
}

// MILO V13.3.14 — Add the optional restaurant options column without rewriting product rows.
function enableRestaurantProductOptions(){
 const ss=book_();
 // Only the needed product schema is checked; setup() and other sheets are not initialized.
 ensureSheet_(ss,SHEETS.products,PRODUCT_HEADERS);
 Logger.log('تم تجهيز خيارات الأحجام والإضافات للمنتجات دون حذف أي منتج سابق.');
 Logger.log('الخلايا المستخدمة فعليًا في شبكة الأوراق: '+miloAllocatedCellCount_(ss).toLocaleString());
}


// MILO maintenance: destructive actions require signed-in account and exact typed confirmation.
// WARNING: without a separate admin PIN, any user with valid store login can perform deletion.
function miloPurgeStoreData_(action,account,req){
 const types={purgeInvoices:{sheet:SHEETS.reports,phrase:'حذف الفواتير'},purgeReports:{sheet:SHEETS.reportDaily,phrase:'حذف التقارير'},purgeProducts:{sheet:SHEETS.products,phrase:'حذف المنتجات'}};
 const type=types[action],storeCode=str_(account.storeCode);
 if(!type||!storeCode)return fail_('bad_request','عملية غير معروفة');
 if(str_(req.confirmation)!==type.phrase)return fail_('confirmation_required','عبارة التأكيد غير صحيحة');
 // Scope is derived from authenticated Accounts record only. Ignore client storeCode.
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(30000))return fail_('busy','قاعدة البيانات مشغولة');
 try{
  const ss=book_(),sh=ss.getSheetByName(type.sheet);
  if(!sh)return fail_('missing_sheet','الجدول غير موجود؛ لم يتم حذف بيانات');
  const t=table_(type.sheet);requireCols_(t,['store_code']);
  const rows=[];
  for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===storeCode)rows.push(i+1);
  if(!rows.length)return {ok:true,deleted:true,scopeVerified:true,deletedCount:0};
  // Automatic full-spreadsheet backup. Abort if this fails.
  let backup;
  try{const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss');backup=DriveApp.getFileById(ss.getId()).makeCopy('MILO_BACKUP_BEFORE_'+action+'_'+stamp);}
  catch(e){console.error('Backup failed: '+e.message);return fail_('backup_failed','تعذر إنشاء النسخة الاحتياطية؛ لم يتم حذف شيء');}
  let count=0,upper=rows[rows.length-1],lower=upper;
  const remove=()=>{sh.deleteRows(lower,upper-lower+1);count+=upper-lower+1;};
  for(let i=rows.length-2;i>=0;i--){if(rows[i]===lower-1){lower=rows[i];continue;}remove();upper=lower=rows[i];}
  remove();SpreadsheetApp.flush();
  return {ok:true,deleted:true,scopeVerified:true,deletedCount:count,backupUrl:backup.getUrl(),sheet:type.sheet};
 }catch(e){console.error('Purge error: '+e.message);return fail_('purge_failed','قد يكون الحذف جزئيًا؛ راجع الجدول والنسخة الاحتياطية قبل إعادة المحاولة');}
 finally{lock.releaseLock();}
}


// MILO customer online ordering V1 — orders are NOT sales invoices.
const MILO_CUSTOMER_ORDER_HEADERS=['store_code','order_id','created_at','customer_name','customer_phone','fulfillment','address','notes','items_json','total','status','updated_at','requested_time','invoice_id','payment_method','completed_at'];
const MILO_CUSTOMER_STATUSES=['جديد','قيد التجهيز','جاهز للاستلام','في الطريق','مكتمل','ملغي'];
function miloOrdersSheet_(){return ensureSheet_(book_(),SHEETS.customerOrders,MILO_CUSTOMER_ORDER_HEADERS);}
function miloOrderPublicStore_(req){
 const store=str_(req.storeCode),key=str_(req.key);
 if(!store||!key||!/^[a-f0-9]{48}$/.test(key))return null;
 const acct=table_(SHEETS.accounts);const active=acct.values.slice(1).some(row=>str_(col_(acct,row,'store_code'))===store&&ACTIVE_VALUES.includes(str_(col_(acct,row,'status')).toLowerCase())&&daysLeft_(col_(acct,row,'subscription_end'))>=0);
 if(!active)return null;
 const settings=getStoreSettings_(store);
 if(settings.customer_orders_enabled!=='1'||settings.customer_orders_token!==key)return null;
 return {store,settings};
}
function miloPublicOrderAction_(action,req){
 const account=miloOrderPublicStore_(req);
 if(!account)return fail_('not_available','المتجر غير متاح لاستقبال الطلبات');
 const store=account.store;
 if(action==='publicCustomerCatalog')return {ok:true,storeName:account.settings.store_name||'متجر ميلو',products:products_(store).filter(p=>p.unlimitedStock||p.stock>0).map(p=>({barcode:p.barcode,name:p.name,price:p.price,category:p.category,description:p.description,imageUrl:p.imageUrl}))};
 if(action==='publicOrderStatus'){
  const id=str_(req.orderId),phone=str_(req.customerPhone);if(!id||!phone)return fail_('bad_request','بيانات الطلب ناقصة');
  const t=table_(SHEETS.customerOrders);
  for(let i=1;i<t.values.length;i++){const row=t.values[i];if(str_(col_(t,row,'store_code'))===store&&str_(col_(t,row,'order_id'))===id&&str_(col_(t,row,'customer_phone'))===phone)return {ok:true,orderId:id,status:str_(col_(t,row,'status'))};}
  return fail_('not_found','لم يتم العثور على الطلب');
 }
 const o=req.order||{},id=str_(o.orderId),name=str_(o.customerName),phone=str_(o.customerPhone),notes=str_(o.notes),address=str_(o.address),fulfillment=str_(o.fulfillment),items=o.items,requestedTime=str_(o.requestedTime);
 if(!/^[0-9a-f-]{36}$/i.test(id)||name.length<2||name.length>100||!/^\+?[0-9 ]{8,16}$/.test(phone)||notes.length>500||address.length>250||!['استلام من المحل','توصيل'].includes(fulfillment)||!Array.isArray(items)||!items.length||items.length>30)return fail_('invalid_order','بيانات الطلب غير مكتملة');
 if(fulfillment==='توصيل'&&address.length<5)return fail_('invalid_address','عنوان التوصيل مطلوب');
 // The requested appointment is Saudi local time (UTC+03), independent of the script timezone.
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(requestedTime))return fail_('invalid_time','حدد تاريخ ووقت الاستلام أو التوصيل');
 const appointment=new Date(requestedTime+':00+03:00'),gap=appointment.getTime()-Date.now();
 if(!Number.isFinite(appointment.getTime())||gap<10*60000||gap>30*86400000)return fail_('invalid_time','اختر موعدًا بعد 10 دقائق على الأقل وخلال 30 يومًا');
 const seen=new Set(),catalog=new Map(products_(store).map(x=>[x.barcode,x])),lines=[];let total=0;
 for(const it of items){const bc=str_(it.barcode),qty=Number(it.qty),p=catalog.get(bc);
  if(!p||!Number.isInteger(qty)||qty<1||qty>50||seen.has(bc)||(!p.unlimitedStock&&p.stock<qty))return fail_('invalid_product','منتج غير متاح أو كمية غير صحيحة');
  seen.add(bc);const sum=Math.round(p.price*qty*100)/100;total+=sum;lines.push({barcode:bc,name:p.name,qty,price:p.price,total:sum});
 }
 total=Math.round(total*100)/100;if(total>100000)return fail_('invalid_total','قيمة الطلب تتجاوز الحد المسموح');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{miloOrdersSheet_();const t=table_(SHEETS.customerOrders);for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===store&&str_(col_(t,t.values[i],'order_id'))===id)return {ok:true,duplicate:true,orderId:id,status:str_(col_(t,t.values[i],'status'))};
  const now=new Date().toISOString(),data={store_code:store,order_id:id,created_at:now,customer_name:safeCell_(name),customer_phone:phone,fulfillment,address:safeCell_(address),notes:safeCell_(notes),items_json:JSON.stringify(lines),total,status:'جديد',updated_at:now,requested_time:requestedTime};
  t.sh.appendRow(t.headers.map(h=>data[h]===undefined?'':data[h]));return {ok:true,orderId:id,status:'جديد',total};
 }finally{lock.releaseLock();}
}
function miloCustomerOrders_(store){miloOrdersSheet_();const t=table_(SHEETS.customerOrders),out=[];
 for(let i=1;i<t.values.length;i++){const row=t.values[i];if(str_(col_(t,row,'store_code'))!==store)continue;
  let items=[];try{items=JSON.parse(str_(col_(t,row,'items_json'))||'[]');}catch(_){}
  out.push({orderId:str_(col_(t,row,'order_id')),createdAt:str_(col_(t,row,'created_at')),customerName:str_(col_(t,row,'customer_name')),customerPhone:str_(col_(t,row,'customer_phone')),fulfillment:str_(col_(t,row,'fulfillment')),address:str_(col_(t,row,'address')),notes:str_(col_(t,row,'notes')),requestedTime:str_(col_(t,row,'requested_time')),items,total:num_(col_(t,row,'total')),status:str_(col_(t,row,'status')),updatedAt:str_(col_(t,row,'updated_at')),invoiceId:str_(col_(t,row,'invoice_id')),paymentMethod:str_(col_(t,row,'payment_method'))});
 }out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return {ok:true,orders:out.slice(0,250)};
}
function miloUpdateCustomerOrder_(store,req){const id=str_(req.orderId),status=str_(req.status);if(!id||!MILO_CUSTOMER_STATUSES.includes(status))return fail_('bad_request','رقم الطلب أو الحالة غير صحيحة');
 if(status==='مكتمل')return fail_('payment_required','لإكمال الطلب وتسجيل الفاتورة استخدم تأكيد التحصيل');
 const lock=LockService.getScriptLock();lock.waitLock(30000);try{miloOrdersSheet_();const t=table_(SHEETS.customerOrders);
  for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===store&&str_(col_(t,t.values[i],'order_id'))===id){if(str_(col_(t,t.values[i],'invoice_id')))return fail_('invoice_issued','لا يمكن تغيير حالة طلب صدر له فاتورة');t.sh.getRange(i+1,t.idx.status+1).setValue(status);t.sh.getRange(i+1,t.idx.updated_at+1).setValue(new Date().toISOString());return {ok:true,status};}
  return fail_('not_found','الطلب غير موجود');
 }finally{lock.releaseLock();}
}


// Completing a web order is a NEW and isolated sale path. Never change the
// legacy addInvoice_, ordinary checkout(), or receipt rendering logic.
// A deterministic invoice ID + script lock prevents a double sale on retries.
function miloCompleteCustomerOrder_(store,req,account){
 const id=str_(req.orderId),method=str_(req.paymentMethod),terminal=str_(req.terminal),cashier=str_(req.cashier);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['cash','card'].includes(method)||!terminal||terminal.length>120||cashier.length>120)
  return fail_('bad_request','بيانات الطلب أو التحصيل غير صحيحة');
 const invoiceId='MILO-WEB-'+id.toUpperCase();
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  miloOrdersSheet_();ensureSheet_(book_(),SHEETS.reports,REPORT_HEADERS);
  const orders=table_(SHEETS.customerOrders),reports=table_(SHEETS.reports);
  requireCols_(orders,['store_code','order_id','status','items_json','invoice_id','payment_method','completed_at']);
  requireCols_(reports,['store_code','invoice_id','terminal']);
  let rowNumber=-1,row=null;
  for(let i=1;i<orders.values.length;i++)if(str_(col_(orders,orders.values[i],'store_code'))===store&&str_(col_(orders,orders.values[i],'order_id'))===id){rowNumber=i+1;row=orders.values[i];break;}
  if(!row)return fail_('not_found','طلب الزبون غير موجود');
  const status=str_(col_(orders,row,'status')),savedInvoice=str_(col_(orders,row,'invoice_id'));
  if(status==='ملغي')return fail_('invalid_status','لا يمكن تحصيل طلب ملغي');
  if(savedInvoice&&savedInvoice!==invoiceId)return fail_('conflict','الطلب مرتبط بفاتورة أخرى، راجع المبيعات');
  if(status==='مكتمل'&&!savedInvoice)return fail_('conflict','الطلب مكتمل سابقاً بلا فاتورة؛ يلزم مراجعته يدوياً لتجنب التكرار');
  // Check an open shift for the actual POS terminal before accepting payment.
  const shifts=table_(SHEETS.shifts);
  const open=shifts.values.slice(1).some(v=>str_(col_(shifts,v,'store_code'))===store&&str_(col_(shifts,v,'terminal'))===terminal&&!str_(col_(shifts,v,'closed_at')));
  if(!open && !savedInvoice)return fail_('shift_closed','افتح وردية على هذا الجهاز أولاً');
  const previous=reports.values.slice(1).find(v=>str_(col_(reports,v,'store_code'))===store&&str_(col_(reports,v,'invoice_id'))===invoiceId);
  let items=[];try{items=JSON.parse(str_(col_(orders,row,'items_json')));}catch(_){}
  if(!Array.isArray(items)||!items.length||items.length>30)return fail_('invalid_order','أصناف الطلب غير صالحة');
  const total=num_(col_(orders,row,'total'));
  if(!(total>0)||total>100000)return fail_('invalid_total','إجمالي الطلب غير صحيح');
  const vatNumber=str_(account.vatNumber)||str_(getStoreSettings_(store).vat_number);
  const vat=vatNumber?Math.round(total*15/115*100)/100:0;
  const now=new Date().toISOString();
  const invoice={invoiceId,orderNumber:String(parseInt(id.replace(/-/g,'').slice(-8),16)),date:now,
   terminal,terminalName:safeCell_(str_(req.terminalName).slice(0,80)),cashier,
   customer:str_(col_(orders,row,'customer_name')),customerPhone:str_(col_(orders,row,'customer_phone')),serviceType:'سفري',fulfillment:str_(col_(orders,row,'fulfillment')),
   subtotal:total,discount:0,total,vat,cash:method==='cash'?total:0,card:method==='card'?total:0,change:0,
   items:items.map(it=>({barcode:str_(it.barcode),name:str_(it.name),qty:num_(it.qty),price:num_(it.price),total:num_(it.total)}))};
  if(!previous){
   // Revalidate stock, but preserve accepted online-order prices on the invoice.
   const catalog=new Map(products_(store).map(p=>[p.barcode,p]));
   for(const it of invoice.items){const p=catalog.get(it.barcode);
    if(!p||!Number.isInteger(it.qty)||it.qty<1||!Number.isFinite(it.total)||it.total<0||(!p.unlimitedStock&&p.stock<it.qty))
     return fail_('stock_unavailable','منتج غير متاح أو المخزون لا يكفي؛ لم يتم اعتماد الفاتورة');
   }
   const values={store_code:store,invoice_id:invoiceId,date:now,cashier:safeCell_(cashier),customer:safeCell_(invoice.customer),customer_phone:invoice.customerPhone,
    subtotal:total,discount:0,total,vat,cash:invoice.cash,card:invoice.card,change:0,
    terminal,terminal_name:invoice.terminalName,items_count:invoice.items.length,service_type:invoice.serviceType||'سفري',
    items:invoice.items.map(it=>safeCell_(it.name)+' ×'+it.qty+' = '+it.total).join(' | ')};
   // Reports remains the original accounting sheet with its existing schema.
   reports.sh.appendRow(reports.headers.map(h=>values[h]===undefined?'':values[h]));
   SpreadsheetApp.flush();
   // The invoice's presence is the stock-deduction idempotency marker.
   // If deduction fails, manual inventory reconciliation may be necessary.
   const productTable=table_(SHEETS.products);
   for(const it of invoice.items){const p=catalog.get(it.barcode);if(p.unlimitedStock)continue;
    for(let j=1;j<productTable.values.length;j++)if(str_(col_(productTable,productTable.values[j],'store_code'))===store&&str_(col_(productTable,productTable.values[j],'barcode'))===it.barcode){
     productTable.sh.getRange(j+1,productTable.idx.stock+1).setValue(Math.max(0,num_(col_(productTable,productTable.values[j],'stock'))-it.qty));break;
    }
   }
  }
  orders.sh.getRange(rowNumber,orders.idx.invoice_id+1).setValue(invoiceId);
  orders.sh.getRange(rowNumber,orders.idx.payment_method+1).setValue(method);
  orders.sh.getRange(rowNumber,orders.idx.completed_at+1).setValue(now);
  orders.sh.getRange(rowNumber,orders.idx.status+1).setValue('مكتمل');
  orders.sh.getRange(rowNumber,orders.idx.updated_at+1).setValue(now);
  return {ok:true,invoice,duplicate:!!previous,status:'مكتمل',invoiceId};
 }finally{lock.releaseLock();}
}

function miloGetCustomerOrderInvoice_(store,req){
 const id=str_(req.orderId);
 if(!/^[0-9a-f-]{36}$/i.test(id))return fail_('bad_request','رقم الطلب غير صالح');
 miloOrdersSheet_();const t=table_(SHEETS.customerOrders);
 let order=null;for(let i=1;i<t.values.length;i++)if(str_(col_(t,t.values[i],'store_code'))===store&&str_(col_(t,t.values[i],'order_id'))===id){order=t.values[i];break;}
 if(!order||!str_(col_(t,order,'invoice_id')))return fail_('not_found','لا توجد فاتورة معتمدة لهذا الطلب');
 const invoiceId=str_(col_(t,order,'invoice_id'));
 const reports=table_(SHEETS.reports);
 let sale=null;for(let i=1;i<reports.values.length;i++)if(str_(col_(reports,reports.values[i],'store_code'))===store&&str_(col_(reports,reports.values[i],'invoice_id'))===invoiceId){sale=reports.values[i];break;}
 if(!sale)return fail_('not_found','سجل الفاتورة غير موجود؛ لا يمكن إعادة الطباعة');
 let items=[];try{items=JSON.parse(str_(col_(t,order,'items_json')));}catch(_){}
 const get=k=>col_(reports,sale,k);
 return {ok:true,invoice:{invoiceId,orderNumber:String(parseInt(id.replace(/-/g,'').slice(-8),16)),date:str_(get('date')),
  cashier:str_(get('cashier')),customer:str_(get('customer')),customerPhone:str_(get('customer_phone')),serviceType:str_(get('service_type'))||'سفري',fulfillment:str_(col_(t,order,'fulfillment')),
  terminal:str_(get('terminal')),terminalName:str_(get('terminal_name')),subtotal:num_(get('subtotal')),
  discount:num_(get('discount')),total:num_(get('total')),vat:num_(get('vat')),
  cash:num_(get('cash')),card:num_(get('card')),change:num_(get('change')),items}};
}
