/* MILO opening slides. Shown once per desktop window, not on page navigation. */
(()=>{'use strict';
if(!window.miloDesktop?.isDesktop || sessionStorage.getItem('milo_intro_seen')==='1')return;
const root=document.createElement('div');root.className='milo-intro';root.setAttribute('role','dialog');root.setAttribute('aria-label','الافتتاحية');
root.innerHTML='<button type="button" class="milo-intro-skip" aria-label="تخطي المقدمة">تخطي</button><div class="milo-intro-panel" aria-live="polite"></div><div class="milo-intro-progress"><span></span><span></span></div>';
document.body.appendChild(root);
const panel=root.querySelector('.milo-intro-panel'), dots=[...root.querySelectorAll('.milo-intro-progress span')];
const slides=[
'<div class="milo-intro-mark" aria-hidden="true">✦</div><div class="milo-intro-kicker">MILO CASHIER · SAUDI ARABIA</div><h1 class="milo-intro-heading">صُنع في <strong>السعودية</strong></h1><p class="milo-intro-sub">حلول نقاط بيع عربية بهوية وطنية وطموح يتطلع إلى المستقبل</p><div class="milo-intro-line"></div>',
'<div class="milo-intro-mark" aria-hidden="true">M</div><div class="milo-intro-kicker">تصميم وتطوير</div><h1 class="milo-intro-heading">المبرمج<br><strong>عبد الملك بدر محمد هزازي</strong></h1><p class="milo-intro-sub">MILO CASHIER · نظام نقاط البيع وإدارة الأعمال</p><div class="milo-intro-line"></div>'
];
let current=0,done=false,timer;
function finish(){if(done)return;done=true;clearTimeout(timer);sessionStorage.setItem('milo_intro_seen','1');root.classList.add('exit');setTimeout(()=>root.remove(),510);}
function show(i){if(done)return;current=i;if(i>=slides.length){finish();return;}panel.style.animation='none';void panel.offsetWidth;panel.style.animation='';panel.innerHTML=slides[i];dots.forEach((d,n)=>d.classList.toggle('active',n===i));timer=setTimeout(()=>show(i+1),2300);}
root.querySelector('.milo-intro-skip').addEventListener('click',finish);
show(0);
})();
