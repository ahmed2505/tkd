(function(){
var KEY='tkd2026_v1';
var CR={ky:[["الهجوم",20],["الهجوم المضاد",20],["الدفاع",10],["التوقيت والمسافة",15],["السرعة ورد الفعل",15],["التكتيك واتخاذ القرار",10],["التحكم في المباراة",10]],
po:[["دقة التقنيات",20],["الثبات والوقفات",20],["التوازن",10],["القوة والسرعة",15],["الإيقاع والتوقيت",15],["التركيز والتعبير",10],["الانضباط والكيهاب",10]]};
var TYPES={ky:"القتال – Kyorugi",po:"الفورمات – Poomsae"};
var STAGES={initial:"التقييم الأولي",mid:"تقييم منتصف الموسم",final:"التقييم النهائي"};
var REG=[["Tunis", "تونس"], ["Ariana", "أريانة"], ["Ben Arous", "بن عروس"], ["Manouba", "منوبة"], ["Nabeul", "نابل"], ["Zaghouan", "زغوان"], ["Bizerte", "بنزرت"], ["Béja", "باجة"], ["Jendouba", "جندوبة"], ["Le Kef", "الكاف"], ["Siliana", "سليانة"], ["Sousse", "سوسة"], ["Monastir", "المنستير"], ["Mahdia", "المهدية"], ["Sfax", "صفاقس"], ["Kairouan", "القيروان"], ["Kasserine", "القصرين"], ["Sidi Bouzid", "سيدي بوزيد"], ["Gabès", "قابس"], ["Médenine", "مدنين"], ["Tataouine", "تطاوين"], ["Gafsa", "قفصة"], ["Tozeur", "توزر"], ["Kébili", "قبلي"]],BELTS=[["White", "أبيض"], ["Yellow", "أصفر"], ["Orange", "برتقالي"], ["Green", "أخضر"], ["Blue", "أزرق"], ["Red", "أحمر"], ["Black Poom", "أسود بوم"], ["Black 1st Dan", "أسود دان 1"], ["Black 2nd Dan", "أسود دان 2"], ["Black 3rd Dan", "أسود دان 3"], ["Black 4th Dan", "أسود دان 4"], ["Black 5th Dan+", "أسود دان 5+"]],SPECS=[["Kyorugi", "قتال"], ["Poomsae", "فورمات"], ["Freestyle", "فري ستايل"]],CATS=[["Cadet", "كاديت"], ["Junior", "جونيور"], ["Senior", "سينيور"]];
function lab(l,v){var x=l.filter(function(y){return y[0]===v})[0];return x?x[1]:(v||'—')}
var S={players:[],evals:[]},authed=false,loading=true;
var view='home',draft=null,logF={p:'',t:''},progP='',dbRef=null,dbReq=[],isCoach=true,msg='';
var app=document.getElementById('app');
var regMode=false;

function save(){}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fmt(iso){if(!iso)return'';var a=iso.split('-');return a[2]+'/'+a[1]+'/'+a[0]}
function pname(id){var p=S.players.filter(function(x){return x.id===id})[0];return p?p.name:'(محذوف)'}
function toast(t){var d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.remove()},2400)}
function opts(arr,sel,ph){return(ph?'<option value="">'+ph+'</option>':'')+arr.map(function(a){var v=Array.isArray(a)?a[0]:a,l=Array.isArray(a)?a[1]:a;return'<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(l)+'</option>'}).join('')}
function playerOpts(sel,ph){return opts(S.players.map(function(p){return[p.id,p.name]}),sel,ph)}
function $(id){return document.getElementById(id)}
function go(v){view=v;render();window.scrollTo(0,0)}

function api(m,u,b){return fetch(u,{method:m,credentials:'same-origin',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.status===401&&u.indexOf('login')<0){authed=false;render()}if(!r.ok){var e=new Error(j.message||'');e.errors=j.errors||{};throw e}return j})})}
function reload(){return api('GET','/api/admin/data').then(function(d){S.players=d.athletes;S.evals=d.evaluations;authed=true})}
function errMsg(e){var k=Object.keys(e.errors||{});return k.length?e.errors[k[0]]:(e.message||'صار مشكل في الاتصال، عاود المحاولة')}
function tags(p){return'<span class="tag">'+esc(lab(CATS,p.cat))+'</span><span class="tag">'+esc(p.weight)+' kg</span><span class="tag">'+esc(lab(BELTS,p.belt))+'</span><span class="tag">'+esc(lab(SPECS,p.spec))+'</span><span class="tag">'+esc(lab(REG,p.region))+'</span>'}
function header(){return'<div class="head"><div><h1>TKD_2026 🥋</h1><small>TAEKWONDO TEAM • COACH TOOL</small></div><button class="pill" id="logout">خروج</button></div>'}
function tabs(){var T=[['home','الرئيسية'],['eval','تقييم جديد'],['log','السجل'],['reg','إضافة لاعب'],['req','التسجيلات']];
return'<div class="tabs">'+T.map(function(t){var on=(view===t[0])||(t[0]==='home'&&['players','backup','prog'].indexOf(view)>-1);return'<button class="tab'+(on?' on':'')+'" data-v="'+t[0]+'">'+t[1]+'</button>'}).join('')+'</div>'}
function regLink(){return location.origin+'/'}
function statusCard(){var l=S.players.filter(function(p){return p.source==='link'});return'<button class="tile" data-go="req" style="width:100%;margin-bottom:16px"><i>📥</i><b>سجّلوا عبر الرابط: '+l.length+'</b><span>'+(l.length?'آخر تسجيل: '+fmt(new Date(l[0].ts).toISOString().slice(0,10)):'ما فماش تسجيلات بعد')+'</span></button>'}
function homeV(){
var last=S.evals.slice().sort(function(a,b){return b.ts-a.ts}).slice(0,3);
return statusCard()+'<div class="card"><h2>إدارة الفريق</h2><div class="grid2">'+
'<button class="tile" data-go="players"><i>👥</i><b>اللاعبون</b><span>'+S.players.length+' لاعب</span></button>'+
'<button class="tile" data-go="eval"><i>📋</i><b>تقييم سريع</b><span style="direction:ltr;display:block">Kyorugi / Poomsae</span></button>'+
'<button class="tile" data-go="prog"><i>📈</i><b>التطور</b><span>تاريخ ومقارنة</span></button>'+
'<button class="tile" data-go="backup"><i>📊</i><b>Excel</b><span>تصدير اللاعبين والتقييمات</span></button></div></div>'+
'<div class="card"><h2>🔗 رابط تسجيل اللاعبين</h2><p class="muted">ابعث هذا الرابط للاعبين في WhatsApp أو Instagram. اللاعب يفتح صفحة التسجيل فقط، وما يشوفش لوحة المدرب. كل تسجيل يوصلك على طول ويتحط في ملف Excel.</p><input class="link" id="rl" readonly value="'+esc(regLink())+'"><button class="btn" id="copyRl">نسخ رابط التسجيل</button><button class="btn sec" id="shRl">مشاركة الرابط</button></div>'+
'<div class="card"><h2>آخر التقييمات</h2>'+(last.length?last.map(evItem).join(''):'<p class="muted">ابدأ بإضافة لاعب ثم سجّل أول تقييم.</p>')+'</div>'+
'<div class="card"><h2>طريقة العمل</h2><ol><li>ابعث رابط التسجيل للاعبين (أو أضفهم بنفسك).</li><li>حمّل ملف Excel في أي وقت، دايمًا محدّث.</li><li>اختر لاعب ونوع التقييم وحرّك المؤشرات.</li><li>المجموع من 100 يتحدّث آليًا ويتحفظ في قاعدة البيانات.</li></ol></div>'}
function evItem(e){return'<div class="item"><div class="top"><div><b>'+esc(pname(e.pid))+'</b><div><span class="tag">'+esc(STAGES[e.stage])+'</span><span class="tag">'+esc(TYPES[e.type])+'</span><span class="tag">'+fmt(e.date)+'</span></div></div><div class="sc">'+e.total+'/100</div></div>'+
(e.goal?'<p class="muted" style="margin:8px 0 0">🎯 '+esc(e.goal)+'</p>':'')+'</div>'}

function newDraft(){return{pid:'',date:today(),stage:'initial',type:'ky',sc:[0,0,0,0,0,0,0],st:'',im:'',goal:'',nt:'',by:'المدرب'}}
function evalV(){
if(!draft)draft=newDraft();var d=draft,c=CR[d.type];
var h='<div class="card"><h2>تقييم لاعب</h2>';
if(!S.players.length)h+='<p class="muted">ما عندكش لاعبين بعد. سجّل لاعب أولًا من تبويب «تسجيل لاعب».</p>';
h+='<label>اللاعب</label><select id="e_p">'+playerOpts(d.pid,'اختر لاعبًا')+'</select>'+
'<div class="row2"><div><label>المرحلة</label><select id="e_s">'+opts(Object.keys(STAGES).map(function(k){return[k,STAGES[k]]}),d.stage)+'</select></div><div><label>التاريخ</label><input type="date" id="e_d" value="'+d.date+'"></div></div>'+
'<label>نوع التقييم</label><select id="e_t">'+opts(Object.keys(TYPES).map(function(k){return[k,TYPES[k]]}),d.type)+'</select>';
c.forEach(function(x,i){h+='<div class="sl"><label style="margin:0">'+x[0]+'</label><span class="n" id="n'+i+'">'+d.sc[i]+'/'+x[1]+'</span></div><input type="range" min="0" max="'+x[1]+'" step="1" value="'+d.sc[i]+'" data-i="'+i+'">'});
h+='<div class="total"><div class="muted">المجموع</div><big id="tot">'+sum(d)+'/100</big><div class="muted">يتحدّث آليًا</div></div>'+
'<label>نقاط القوة</label><textarea id="e_st" placeholder="ما الذي أتقنه اللاعب؟">'+esc(d.st)+'</textarea>'+
'<label>نقاط التحسين</label><textarea id="e_im" placeholder="ما الذي يحتاج إلى تطوير؟">'+esc(d.im)+'</textarea>'+
'<label>الهدف القادم</label><textarea id="e_g" placeholder="هدف واضح للتقييم القادم">'+esc(d.goal)+'</textarea>'+
'<label>ملاحظات المدرب / المساعد</label><textarea id="e_n" placeholder="ملاحظات إضافية">'+esc(d.nt)+'</textarea>'+
'<label>اسم من أجرى التقييم</label><select id="e_b">'+opts(['المدرب','المساعد'],d.by)+'</select>'+
'<button class="btn" id="saveEval">حفظ التقييم الجديد</button><p class="muted">كل معيار له وزن معلوم ومجموع كل نوع = 100. استعمل نفس طريقة التنقيط في كل مرة للمقارنة العادلة.</p></div>';
return h}
function sum(d){return d.sc.reduce(function(a,b){return a+b},0)}

function logV(){
var l=S.evals.filter(function(e){return(!logF.p||e.pid===logF.p)&&(!logF.t||e.type===logF.t)}).sort(function(a,b){return b.ts-a.ts});
return'<div class="card"><h2>سجل التقييمات</h2><label>تصفية حسب اللاعب</label><select id="f_p">'+playerOpts(logF.p,'كل اللاعبين')+'</select><label>نوع التقييم</label><select id="f_t">'+opts([['ky',TYPES.ky],['po',TYPES.po]],logF.t,'الكل')+'</select><div style="margin-top:16px">'+
(l.length?l.map(function(e){return evItem(e)+'<div style="margin:-4px 0 12px;display:flex;gap:8px"><button class="btn sm sec" data-det="'+e.id+'">التفاصيل</button><button class="btn sm red" data-del="'+e.id+'">حذف</button></div><div id="det_'+e.id+'"></div>'}).join(''):'<p class="muted">لا توجد نتائج مطابقة.</p>')+'</div></div>'}

function detail(e){var c=CR[e.type];return'<div class="item">'+c.map(function(x,i){return'<div style="display:flex;justify-content:space-between"><span>'+x[0]+'</span><b style="direction:ltr">'+e.sc[i]+'/'+x[1]+'</b></div>'}).join('')+
(e.st?'<p><b>القوة:</b> '+esc(e.st)+'</p>':'')+(e.im?'<p><b>التحسين:</b> '+esc(e.im)+'</p>':'')+(e.nt?'<p><b>ملاحظات:</b> '+esc(e.nt)+'</p>':'')+'<p class="muted">أجراه: '+esc(e.by)+'</p></div>'}

function formFields(){return'<div class="row2"><div><label>الاسم *</label><input id="r_f" maxlength="40" autocomplete="off"></div><div><label>اللقب *</label><input id="r_l" maxlength="40" autocomplete="off"></div></div>'+
'<label>الولاية *</label><select id="r_rg">'+opts(REG,'','اختار')+'</select>'+
'<div class="row2"><div><label>الحزام *</label><select id="r_bl">'+opts(BELTS,'','اختار')+'</select></div><div><label>الوزن (kg) *</label><input type="number" inputmode="decimal" id="r_w" min="10" max="200" step="0.1" placeholder="مثال: 55"></div></div>'+
'<div class="row2"><div><label>الاختصاص *</label><select id="r_sp">'+opts(SPECS,'','اختار')+'</select></div><div><label>الفئة *</label><select id="r_c">'+opts(CATS,'','اختار')+'</select></div></div>'+
'<label>رقم الهاتف *</label><input id="r_ph" type="tel" inputmode="tel" dir="ltr" placeholder="22 123 456">'}
function readForm(){return{firstName:$('r_f').value.trim(),lastName:$('r_l').value.trim(),region:$('r_rg').value,belt:$('r_bl').value,weight:$('r_w').value,specialty:$('r_sp').value,category:$('r_c').value,phone:$('r_ph').value.trim()}}
function valid(f){if(!f.firstName||!f.lastName||!f.region||!f.belt||!f.weight||!f.specialty||!f.category||!f.phone){toast('عمّر كل الخانات اللي فيها *');return false}
var w=parseFloat(f.weight);if(!(w>=10&&w<=200)){toast('الوزن غير صحيح');return false}
if(!/^(?:\+216|00216)?[2-9]\d{7}$/.test(f.phone.replace(/[\s.-]/g,''))){toast('رقم الهاتف غير صحيح (8 أرقام)');return false}return true}
function regV(){return'<div class="card"><h2>إضافة لاعب</h2><p class="muted">تسجيل مباشر من المدرب: اللاعب يتحفظ في قاعدة البيانات ويدخل في ملف Excel.</p>'+formFields()+'<button class="btn" id="addPlayer">إضافة اللاعب</button></div>'}
function reqV(){var l=S.players.filter(function(p){return p.source==='link'});
return'<div class="card"><h2>التسجيلات عبر الرابط ('+l.length+')</h2><p class="muted">كل لاعب يسجّل من الرابط يتضاف هنا تلقائيًا.</p><a class="btn" href="/admin/export.xlsx">⬇ تحميل ملف Excel</a></div>'+
'<div class="card"><h2>🔗 رابط تسجيل اللاعبين</h2><p class="muted">ابعث هذا الرابط للاعبين في WhatsApp أو Instagram. اللاعب يفتح صفحة التسجيل فقط، وما يشوفش لوحة المدرب. كل تسجيل يوصلك على طول ويتحط في ملف Excel.</p><input class="link" id="rl" readonly value="'+esc(regLink())+'"><button class="btn" id="copyRl">نسخ رابط التسجيل</button><button class="btn sec" id="shRl">مشاركة الرابط</button></div>'+
'<div class="card"><h2>آخر التسجيلات</h2>'+(l.length?l.map(function(p){return'<div class="item"><div class="top"><b>'+esc(p.name)+'</b><span class="muted">'+fmt(new Date(p.ts).toISOString().slice(0,10))+'</span></div><div>'+tags(p)+'</div><p class="muted link" style="margin:6px 0 0">'+esc(p.phone)+'</p></div>'}).join(''):'<p class="muted">ما فماش تسجيلات بعد. ابعث الرابط للاعبين.</p>')+'</div>'}
function playersV(){return'<div class="card"><h2>اللاعبون ('+S.players.length+')</h2><a class="btn sec" href="/admin/export.xlsx" style="margin:0 0 14px">⬇ تحميل Excel</a>'+(S.players.length?S.players.map(function(p){return'<div class="item"><div class="top"><div><b>'+esc(p.name)+'</b><div>'+tags(p)+'</div><p class="muted link" style="margin:6px 0 0">'+esc(p.phone)+'</p></div><button class="btn sm red" data-dp="'+esc(p.id)+'">حذف</button></div></div>'}).join(''):'<p class="muted">لا يوجد لاعبون بعد.</p>')+'</div>'}
function progV(){
var h='<div class="card"><h2>التطور</h2><label>اللاعب</label><select id="p_p">'+playerOpts(progP,'اختر لاعبًا')+'</select>';
if(progP){['ky','po'].forEach(function(t){var l=S.evals.filter(function(e){return e.pid===progP&&e.type===t}).sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:a.ts-b.ts});
if(!l.length)return;var d=l[l.length-1].total-l[0].total;
h+='<h3 style="margin:22px 0 8px">'+TYPES[t]+'</h3>'+(l.length>1?'<p>الفرق بين أول وآخر تقييم: <b class="'+(d>=0?'up':'down')+'" style="direction:ltr;display:inline-block">'+(d>0?'+':'')+d+'</b></p>':'<p class="muted">تقييم واحد فقط حتى الآن.</p>')+
l.map(function(e){return'<div class="item"><div class="top"><span>'+fmt(e.date)+' · '+STAGES[e.stage]+'</span><span class="sc">'+e.total+'</span></div><div class="bar"><i style="width:'+e.total+'%"></i></div></div>'}).join('')});
if(!S.evals.some(function(e){return e.pid===progP}))h+='<p class="muted">لا توجد تقييمات لهذا اللاعب.</p>'}
return h+'</div>'}

function backupV(){return'<div class="card"><h2>تصدير Excel</h2><p class="muted">الملف يتولّد من قاعدة البيانات في كل مرة، فيه ورقتين: اللاعبون والتقييمات.</p><a class="btn" href="/admin/export.xlsx">⬇ تحميل ملف Excel</a></div>'}
function loginV(){return'<div class="head"><div><h1>TKD_2026 🥋</h1><small>COACH LOGIN</small></div></div><div class="card"><h2>دخول المدرب</h2><p class="muted">اكتب مفتاح المدرب باش تفتح لوحة التحكم.</p><label>المفتاح</label><input id="lk" type="password" class="link" autocomplete="current-password"><button class="btn" id="lg">دخول</button></div>'}
function render(){
if(loading){app.innerHTML='<p class="muted" style="text-align:center;margin-top:35vh">…</p>';return}
if(!authed){app.innerHTML=loginV();var lg=$('lg'),lk=$('lk');var doLogin=function(){lg.disabled=true;api('POST','/api/admin/login',{key:lk.value}).then(reload).then(render).catch(function(e){lg.disabled=false;toast(errMsg(e))})};lg.onclick=doLogin;lk.onkeydown=function(e){if(e.key==='Enter')doLogin()};return}
var v={home:homeV,eval:evalV,log:logV,reg:regV,req:reqV,players:playersV,prog:progV,backup:backupV}[view]||homeV;
app.innerHTML=header()+tabs()+v();bind()}
function bind(){
var q=function(s,f){Array.prototype.forEach.call(app.querySelectorAll(s),f)};
q('.tab',function(b){b.onclick=function(){go(b.dataset.v)}});
q('[data-go]',function(b){b.onclick=function(){go(b.dataset.go)}});
var lo=$('logout');if(lo)lo.onclick=function(){api('POST','/api/admin/logout').then(function(){authed=false;S.players=[];S.evals=[];render()})};
var cr=$('copyRl');if(cr)cr.onclick=function(){var i=$('rl');i.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}
if(navigator.clipboard)navigator.clipboard.writeText(i.value).then(function(){toast('تم نسخ الرابط ✓')},function(){toast(ok?'تم نسخ الرابط ✓':'انسخ الرابط يدويًا')});else toast(ok?'تم نسخ الرابط ✓':'انسخ الرابط يدويًا')};
var sh=$('shRl');if(sh)sh.onclick=function(){var u=regLink(),t='سجّل معلوماتك في فريق التايكوندو من هنا:';if(navigator.share)navigator.share({text:t,url:u}).catch(function(){});else window.open('https://wa.me/?text='+encodeURIComponent(t+' '+u),'_blank','noopener')};
if(view==='eval'&&!regMode){
var d=draft;
$('e_p').onchange=function(){d.pid=this.value};$('e_s').onchange=function(){d.stage=this.value};$('e_d').onchange=function(){d.date=this.value};
$('e_t').onchange=function(){d.type=this.value;d.sc=[0,0,0,0,0,0,0];render()};
$('e_st').oninput=function(){d.st=this.value};$('e_im').oninput=function(){d.im=this.value};$('e_g').oninput=function(){d.goal=this.value};$('e_n').oninput=function(){d.nt=this.value};$('e_b').onchange=function(){d.by=this.value};
q('input[type=range]',function(r){r.oninput=function(){var i=+r.dataset.i;d.sc[i]=+r.value;$('n'+i).textContent=r.value+'/'+CR[d.type][i][1];$('tot').textContent=sum(d)+'/100'}});
$('saveEval').onclick=function(){if(!d.pid){toast('اختر لاعبًا أولًا');return}if(!d.date){toast('اختر التاريخ');return}
if(sum(d)===0&&!confirm('المجموع 0. تحب تحفظ كيما هو؟'))return;
var b=this;b.disabled=true;
api('POST','/api/admin/evaluations',{pid:d.pid,date:d.date,stage:d.stage,type:d.type,sc:d.sc,st:d.st,im:d.im,goal:d.goal,nt:d.nt,by:d.by}).then(reload).then(function(){draft=null;toast('تم حفظ التقييم ✓');go('log')}).catch(function(e){b.disabled=false;toast(errMsg(e))})}}
var fp=$('f_p');if(fp){fp.onchange=function(){logF.p=this.value;render()};$('f_t').onchange=function(){logF.t=this.value;render()}}
q('[data-det]',function(b){b.onclick=function(){var e=S.evals.filter(function(x){return x.id===b.dataset.det})[0],t=$('det_'+e.id);t.innerHTML=t.innerHTML?'':detail(e)}});
q('[data-del]',function(b){b.onclick=function(){if(confirm('حذف هذا التقييم نهائيًا؟')){api('DELETE','/api/admin/evaluations/'+encodeURIComponent(b.dataset.del)).then(reload).then(render).catch(function(e){toast(errMsg(e))})}}});
var ap=$('addPlayer');if(ap)ap.onclick=function(){var f=readForm();if(!valid(f))return;ap.disabled=true;api('POST','/api/admin/athletes',f).then(reload).then(function(){toast('تمت إضافة اللاعب ✓');go('players')}).catch(function(e){ap.disabled=false;toast(errMsg(e))})};
q('[data-dp]',function(b){b.onclick=function(){if(confirm('حذف اللاعب وكل تقييماته؟')){api('DELETE','/api/admin/athletes/'+encodeURIComponent(b.dataset.dp)).then(reload).then(render).catch(function(e){toast(errMsg(e))})}}});
var pp=$('p_p');if(pp)pp.onchange=function(){progP=this.value;render()};
}

api('GET','/api/admin/data').then(function(d){S.players=d.athletes;S.evals=d.evaluations;authed=true}).catch(function(){authed=false}).then(function(){loading=false;render()});
})();

