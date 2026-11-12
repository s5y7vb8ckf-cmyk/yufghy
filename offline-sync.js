/* MILO LOCAL 2.9 — durable local pending invoices and account-scoped snapshots.
   IndexedDB is device-local, not a guarantee against disk/browser data eviction.
   No credentials are persisted. Never claim a pending invoice has been sold. */
'use strict';
window.MiloLocal = (() => {
 const DB='milo-local-outbox-v1',VER=1;
 let dbPromise;
 function open(){
  if(!('indexedDB' in window))return Promise.reject(Error('المتصفح لا يدعم التخزين المحلي المطلوب'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   const r=indexedDB.open(DB,VER);
   r.onupgradeneeded=()=>{const db=r.result;
    if(!db.objectStoreNames.contains('pending'))db.createObjectStore('pending',{keyPath:'id'});
    if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'key'});
   };
   r.onsuccess=()=>resolve(r.result);
   r.onerror=()=>reject(r.error||Error('تعذر فتح التخزين المحلي'));
   r.onblocked=()=>reject(Error('يرجى إغلاق النوافذ القديمة للكاشير وإعادة المحاولة'));
  });
  return dbPromise;
 }
 async function transact(store,mode,callback){const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode),obj=tx.objectStore(store);
  let result;
  try{result=callback(obj)}catch(e){try{tx.abort()}catch(_){}reject(e);return;}
  if(result && typeof result==='object' && 'onsuccess' in result){result.onsuccess=()=>{result=result.result};result.onerror=()=>reject(result.error||Error('تعذر قراءة البيانات'))}
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||Error('فشل التخزين على الجهاز'));
  tx.onabort=()=>reject(tx.error||Error('تعذّر اعتماد البيانات المحلية'));
 });}
 const scope = a => String(a?.storeCode||'')+'::'+String(a?.username||'').toLowerCase();
 async function queue(invoice,account){if(!invoice?.invoiceId||!account?.storeCode||!account?.username)throw Error('بيانات الفاتورة أو الحساب ناقصة');
  const old=await get(invoice.invoiceId);
  if(old){if(old.scope!==scope(account))throw Error('فاتورة مرتبطة بحساب آخر');return old;}
  const item={id:String(invoice.invoiceId),scope:scope(account),invoice:JSON.parse(JSON.stringify(invoice)),createdAt:new Date().toISOString(),status:'pending',lastError:'',attempts:0};
  await transact('pending','readwrite',s=>s.add(item));return item;
 }
 function get(id){return transact('pending','readonly',s=>s.get(id))}
 function save(item){return transact('pending','readwrite',s=>s.put(item))}
 function erase(id){return transact('pending','readwrite',s=>s.delete(id))}
 async function list(account){const all=await transact('pending','readonly',s=>s.getAll());return (all||[]).filter(x=>x.scope===scope(account)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}
 function cache(name,account,value){return transact('snapshots','readwrite',s=>s.put({key:scope(account)+'::'+name,value,at:new Date().toISOString()}))}
 async function cached(name,account){return (await transact('snapshots','readonly',s=>s.get(scope(account)+'::'+name)))?.value??null}
 async function requestDurableStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch(_){}}
 return {queue,get,save,erase,list,cache,cached,requestDurableStorage};
})();
