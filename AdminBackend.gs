/** MILO independent administration API. Append this file to the same bound Apps Script project.
 *  No cashier credentials, invoice/print flow, or existing report rows are modified here.
 *  Setup admin account using Script Properties, then run miloAdminSetupFromProperties().
 */
const MILO_ADMIN_SESS_SECONDS=21600;
const MILO_ADMIN_RECORDS={
 customers:{sheet:'customers',id:'contact_id',fields:['name','phone','address','notes']},
 suppliers:{sheet:'suppliers',id:'contact_id',fields:['name','phone','address','notes']},
 employees:{sheet:'employees',id:'record_id',fields:['name','username','role','enabled']},
 expenses:{sheet:'expenses',id:'record_id',fields:['date','category','description','amount','payment_method','created_by']},
 promotions:{sheet:'promotions',id:'record_id',fields:['name','discount_type','discount_value','barcode','start_date','end_date','enabled']},
 purchases:{sheet:'purchases',id:'record_id',fields:['supplier_id','supplier_name','invoice_number','date','total']},
 returns:{sheet:'returns',id:'record_id',fields:['invoice_id','date','items','total','reason','refund_method','created_by']},
 vouchers:{sheet:'vouchers',id:'record_id',fields:['kind','contact_type','contact_id','contact_name','date','amount','reference','notes']}
};
function miloAdminDigest_(str){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,str,Utilities.Charset.UTF_8)).replace(/=+$/,'');}
function miloAdminConfigKey_(store){if(!/^[a-z0-9_-]{1,70}$/i.test(store))throw Error('كود المتجر غير صالح');return 'MILO_ADMIN_CFG_'+store;}
function miloAdminHash_(salt,pass){let h=salt+'|'+pass;for(let i=0;i<1200;i++)h=miloAdminDigest_(salt+'|'+h);return h;}
function miloAdminSetupFromProperties(){
 const p=PropertiesService.getScriptProperties();const store=str_(p.getProperty('MILO_ADMIN_SETUP_STORE')),user=str_(p.getProperty('MILO_ADMIN_SETUP_USER')),pass=String(p.getProperty('MILO_ADMIN_SETUP_PASSWORD')||'');
 if(!store||!user||pass.length<12||pass.length>128)throw Error('اضبط MILO_ADMIN_SETUP_STORE وMILO_ADMIN_SETUP_USER وMILO_ADMIN_SETUP_PASSWORD (12 حرفًا على الأقل) في Script Properties');
 if(!/^[a-zA-Z0-9._@-]{3,80}$/.test(user))throw Error('اسم دخول الإدارة غير صالح');
 const t=table_(SHEETS.accounts);if(!t.values.slice(1).some(r=>str_(col_(t,r,'store_code'))===store))throw Error('كود المتجر غير موجود في Accounts');
 const key=miloAdminConfigKey_(store),salt=Utilities.getUuid()+Utilities.getUuid();
 p.setProperty(key,JSON.stringify({username:user.toLowerCase(),salt,hash:miloAdminHash_(salt,pass),version:Utilities.getUuid()}));
 p.deleteProperty('MILO_ADMIN_SETUP_PASSWORD');
 Logger.log('تم إعداد حساب مدير المتجر '+store+'. حُذفت كلمة المرور المؤقتة من Script Properties. ارفع إصدار نشر جديد.');
}
function miloAdminCfg_(store){try{return JSON.parse(PropertiesService.getScriptProperties().getProperty(miloAdminConfigKey_(store))||'null');}catch(_){return null;}}
function miloAdminTokenKey_(token){return 'milo-adm:'+miloAdminDigest_(token).slice(0,48);}
function miloAdminLogin_(req){
 const store=str_(req.storeCode),user=str_(req.username).toLowerCase(),pass=String(req.password||'');
 if(!store||!user||!pass||pass.length>128)return fail_('bad_credentials','أدخل اسم المستخدم وكلمة المرور');
 const cache=CacheService.getScriptCache(),throttle='adm-fails:'+miloAdminDigest_(store+'|'+user).slice(0,30),count=num_(cache.get(throttle));
 if(count>=6)return fail_('locked','محاولات كثيرة. حاول بعد 15 دقيقة');
 const cfg=miloAdminCfg_(store);
 if(!cfg||cfg.username!==user||miloAdminHash_(cfg.salt,pass)!==cfg.hash){cache.put(throttle,String(count+1),900);return fail_('bad_credentials','بيانات دخول الإدارة غير صحيحة');}
 const accountTable=table_(SHEETS.accounts),acc=accountTable.values.slice(1).find(r=>str_(col_(accountTable,r,'store_code'))===store);
 if(!acc||!ACTIVE_VALUES.includes(str_(col_(accountTable,acc,'status')).toLowerCase())||daysLeft_(col_(accountTable,acc,'subscription_end'))<0)return fail_('locked','الحساب غير متاح');
 cache.remove(throttle);
 const token=Utilities.getUuid()+Utilities.getUuid(),session={store,username:user,version:cfg.version};
 cache.put(miloAdminTokenKey_(token),JSON.stringify(session),MILO_ADMIN_SESS_SECONDS);
 return {ok:true,token,storeCode:store,username:user,storeName:str_(col_(accountTable,acc,'store_name')),expiresIn:MILO_ADMIN_SESS_SECONDS};
}
function miloAdminAuth_(req){
 const token=str_(req.token);if(!/^[0-9a-f-]{72}$/i.test(token))return null;
 const cache=CacheService.getScriptCache(),raw=cache.get(miloAdminTokenKey_(token));if(!raw)return null;
 try{const session=JSON.parse(raw),cfg=miloAdminCfg_(session.store);if(!cfg||cfg.version!==session.version||cfg.username!==session.username)return null;
  const a=table_(SHEETS.accounts),row=a.values.slice(1).find(r=>str_(col_(a,r,'store_code'))===session.store);
  if(!row||!ACTIVE_VALUES.includes(str_(col_(a,row,'status')).toLowerCase())||daysLeft_(col_(a,row,'subscription_end'))<0)return null;
  return session;
 }catch(_){return null;}
}
function miloAdminAction_(req){
 const action=str_(req.action);
 if(action==='adminLogin')return miloAdminLogin_(req);
 const auth=miloAdminAuth_(req);if(!auth)return fail_('admin_unauthorized','انتهت جلسة الإدارة. سجل الدخول مرة أخرى');
 const store=auth.store;
 if(action==='adminPing')return {ok:true,username:auth.username,storeCode:store};
 if(action==='adminLogout'){CacheService.getScriptCache().remove(miloAdminTokenKey_(str_(req.token)));return {ok:true};}
 if(action==='adminDashboard')return miloAdminDashboard_(store,req);
 if(action==='adminList')return miloAdminList_(store,req);
 if(action==='adminSaveProduct')return miloAdminSaveProduct_(store,req);
 if(action==='adminSaveRecord')return miloAdminSaveRecord_(store,req);
 if(action==='adminOrderStatus')return miloUpdateCustomerOrder_(store,{orderId:req.orderId,status:req.status});
 if(action==='adminSettings')return {ok:true,settings:getStoreSettings_(store)};
 if(action==='adminSaveSettings'){
  const allowed=['store_name','vat_number','phone','address','footer','invoice_header','restaurant_mode'];
  if(!req.settings||Object.keys(req.settings).some(k=>!allowed.includes(k)))return fail_('invalid','إعدادات غير مسموح بها');
  return saveStoreSettings_(store,req.settings);
 }
 if(action==='adminChangePassword')return miloAdminChangePassword_(auth,req);
 return fail_('bad_request','عملية إدارية غير معروفة');
}
function miloAdminDashboard_(store,req){
 const from=str_(req.from),to=str_(req.to);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return fail_('dates','الفترة يجب أن تكون صحيحة وأقل من سنة');
 const sales=reports_(store,from,to),daily=new Map(),totals={sales:0,cash:0,card:0,vat:0,discount:0,invoices:sales.length};
 sales.forEach(i=>{totals.sales+=num_(i.total);totals.cash+=Math.max(0,num_(i.cash)-num_(i.change));totals.card+=num_(i.card);totals.vat+=num_(i.vat);totals.discount+=num_(i.discount);const d=str_(i.date).slice(0,10);if(d>=from&&d<=to)daily.set(d,(daily.get(d)||0)+num_(i.total));});
 const out=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Math.round(v*100)/100]));
 const products=products_(store),orderSheet=book_().getSheetByName(SHEETS.customerOrders);
 const orders=orderSheet?miloCustomerOrders_(store).orders:[];
 return {ok:true,totals:out,days:Array.from(daily,([day,total])=>({day,total:Math.round(total*100)/100})).sort((a,b)=>a.day.localeCompare(b.day)),
  recent:sales.slice(0,40).map(i=>({invoiceId:i.invoiceId,date:i.date,customer:i.customer,total:i.total,cash:i.cash,card:i.card})),
  productCount:products.length,lowStock:products.filter(p=>!p.unlimitedStock&&p.stock<=p.minStock).length,pendingOrders:orders.filter(o=>!['ملغي','مكتمل'].includes(o.status)).length};
}
function miloAdminList_(store,req){
 const type=str_(req.type);
 if(type==='products')return {ok:true,items:products_(store)};
 if(type==='orders')return miloCustomerOrders_(store);
 if(type==='shifts')return {ok:true,items:readEntities_(SHEETS.shifts,SHIFT_HEADERS,store).slice(-150).reverse()};
 if(type==='customers'||type==='suppliers')return {ok:true,items:readEntities_(SHEETS[type],CONTACT_HEADERS,store).slice(-300).reverse()};
 const cfg=MILO_ADMIN_RECORDS[type];if(!cfg)return fail_('bad_request','القسم غير موجود');
 const sch=EXTRA_SCHEMAS[type];if(!sch)return fail_('bad_request','القسم غير متاح');
 return {ok:true,items:readEntities_(SHEETS[type],sch.headers,store).slice(-300).reverse()};
}
function miloAdminSaveProduct_(store,req){
 const p=req.product;if(!p||typeof p!=='object'||Array.isArray(p))return fail_('invalid','بيانات المنتج ناقصة');
 const bc=str_(p.barcode);if(!bc||bc.length>120)return fail_('invalid','باركود المنتج غير صالح');
 const existing=products_(store).find(x=>x.barcode===bc)||{};
 const fields=['name','price','wholesalePrice','costPrice','stock','category','unit','minStock','description','imageUrl','unlimitedStock','restaurantOptionsJson'];
 if(Object.keys(p).some(k=>!['barcode',...fields].includes(k)))return fail_('invalid','حقل منتج غير مسموح به');
 const merged={...existing,...p,barcode:bc,wholesalePrice:p.wholesalePrice??existing.wholesalePrice??0,costPrice:p.costPrice??existing.costPrice??0,stock:p.stock??existing.stock??0,minStock:p.minStock??existing.minStock??0,category:p.category??existing.category??'',unit:p.unit??existing.unit??'حبة',description:p.description??existing.description??'',imageUrl:p.imageUrl??existing.imageUrl??'',unlimitedStock:p.unlimitedStock===undefined?existing.unlimitedStock===true:p.unlimitedStock===true,restaurantOptionsJson:p.restaurantOptionsJson??existing.restaurantOptionsJson??''};
 return saveProducts_(store,[merged]);
}
function miloAdminSaveRecord_(store,req){
 const type=str_(req.type),cfg=MILO_ADMIN_RECORDS[type],raw=req.record;
 if(!cfg||!raw||typeof raw!=='object'||Array.isArray(raw))return fail_('invalid','سجل غير صالح');
 if(Object.keys(raw).some(k=>![cfg.id,...cfg.fields].includes(k)))return fail_('invalid','حقول غير مسموح بها');
 const id=str_(raw[cfg.id])||Utilities.getUuid();if(id.length>120)return fail_('invalid','معرف طويل جدًا');
 const item={[cfg.id]:id};for(const f of cfg.fields)if(raw[f]!==undefined)item[f]=raw[f];
 if(type==='customers'||type==='suppliers'){
  if(!str_(item.name))return fail_('invalid','الاسم مطلوب');
  // Preserve other columns on existing contacts, including balances/tax IDs.
  const old=readEntities_(SHEETS[type],CONTACT_HEADERS,store).find(r=>str_(r.contact_id)===id)||{};
  return saveEntities_(SHEETS[type],CONTACT_HEADERS,store,[{...old,...item}],cfg.id,[cfg.id]);
 }
 const sch=EXTRA_SCHEMAS[type];const old=readEntities_(SHEETS[type],sch.headers,store).find(r=>str_(r.record_id)===id)||{};
 return saveExtraRecords_(SHEETS[type],sch,store,[{...old,...item}]);
}
function miloAdminChangePassword_(auth,req){
 const old=String(req.oldPassword||''),next=String(req.newPassword||'');if(next.length<12||next.length>128)return fail_('invalid','كلمة المرور الجديدة لا تقل عن 12 حرفًا');
 const cfg=miloAdminCfg_(auth.store);if(!cfg||miloAdminHash_(cfg.salt,old)!==cfg.hash)return fail_('bad_credentials','كلمة المرور الحالية غير صحيحة');
 const salt=Utilities.getUuid()+Utilities.getUuid();PropertiesService.getScriptProperties().setProperty(miloAdminConfigKey_(auth.store),JSON.stringify({username:auth.username,salt,hash:miloAdminHash_(salt,next),version:Utilities.getUuid()}));
 return {ok:true,message:'تم تغيير كلمة المرور وإلغاء الجلسات القديمة. سجل الدخول مرة أخرى'};
}
