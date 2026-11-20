(function(){
var KEY='tkd2026_v1';
var C=TKD_CRITERIA,V=TKD_VIEW,N=TKD_NOTES,AGE=TKD_AGE,VIEW=C.VIEWS.COACH; // role context: coach screens never show metric descriptions
var STAGES={initial:"التقييم الأولي",mid:"تقييم منتصف الموسم",final:"التقييم النهائي"};
var REG=[["Tunis", "تونس"], ["Ariana", "أريانة"], ["Ben Arous", "بن عروس"], ["Manouba", "منوبة"], ["Nabeul", "نابل"], ["Zaghouan", "زغوان"], ["Bizerte", "بنزرت"], ["Béja", "باجة"], ["Jendouba", "جندوبة"], ["Le Kef", "الكاف"], ["Siliana", "سليانة"], ["Sousse", "سوسة"], ["Monastir", "المنستير"], ["Mahdia", "المهدية"], ["Sfax", "صفاقس"], ["Kairouan", "القيروان"], ["Kasserine", "القصرين"], ["Sidi Bouzid", "سيدي بوزيد"], ["Gabès", "قابس"], ["Médenine", "مدنين"], ["Tataouine", "تطاوين"], ["Gafsa", "قفصة"], ["Tozeur", "توزر"], ["Kébili", "قبلي"]],BELTS=[["White", "أبيض"], ["Yellow", "أصفر"], ["Orange", "برتقالي"], ["Green", "أخضر"], ["Blue", "أزرق"], ["Red", "أحمر"], ["Black Poom", "أسود بوم"], ["Black 1st Dan", "أسود دان 1"], ["Black 2nd Dan", "أسود دان 2"], ["Black 3rd Dan", "أسود دان 3"], ["Black 4th Dan", "أسود دان 4"], ["Black 5th Dan+", "أسود دان 5+"]],SPECS=[["Kyorugi", "قتال"], ["Poomsae", "فورمات"], ["Freestyle", "فري ستايل"]],CATS=AGE.CATEGORIES.map(function(c){return[c.id,c.ar]}); // Kids/Cadet/Junior/Senior, defined in age-category.js
var GENS=[["Male","ذكر"],["Female","أنثى"]];
function age(d){return d?AGE.ageOn(d,AGE.todayISO(),'exact'):''}
function lab(l,v){var x=l.filter(function(y){return y[0]===v})[0];return x?x[1]:(v||'—')}
var S={players:[],evals:[],pend:[],me:{role:'coach',name:'',slug:''},coaches:[],unassigned:0},authed=false,loading=true,newCoach=null;
var creds=[],editId='';
var view='home',draft=null,logF={p:'',m:''},progP='',progM=C.DEFAULT_MODE,dbRef=null,dbReq=[],isCoach=true,msg='';
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
function go(v){view=v;if(v!=='coaches')newCoach=null;render();window.scrollTo(0,0)}

function api(m,u,b){return fetch(u,{method:m,credentials:'same-origin',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.status===401&&u.indexOf('login')<0){authed=false;render()}if(!r.ok){var e=new Error(j.message||'');e.errors=j.errors||{};throw e}return j})})}
function reload(){return api('GET','/api/admin/data').then(function(d){S.players=d.athletes;S.evals=d.evaluations;S.pend=d.pending||[];S.me=d.me;S.coaches=d.coaches||[];S.unassigned=d.unassigned||0;authed=true})}
function errMsg(e){var k=Object.keys(e.errors||{});return k.length?e.errors[k[0]]:(e.message||'صار مشكل في الاتصال، عاود المحاولة')}
function tags(p){return(S.me.role==='owner'?'<span class="tag">👤 '+esc(p.coachName||'بلا مدرب')+'</span>':'')+'<span class="tag">'+esc(lab(CATS,p.cat))+'</span><span class="tag">'+esc(p.weight)+' kg</span><span class="tag">'+esc(lab(BELTS,p.belt))+'</span><span class="tag">'+esc(lab(SPECS,p.spec))+'</span><span class="tag">'+esc(lab(REG,p.region))+'</span>'+(p.gender?'<span class="tag">'+esc(lab(GENS,p.gender))+'</span>':'')+(p.dob?'<span class="tag">'+age(p.dob)+' سنة</span>':'')}
function header(){return'<div class="head"><div><h1>TKD_2026 🥋</h1><small>'+esc(S.me.name)+'</small></div><button class="pill" id="logout">خروج</button></div>'}
function tabs(){var T=[['home','الرئيسية'],['eval','تقييم جديد'],['log','السجل'],['reg','إضافة لاعب'],['req','التسجيلات']];if(S.me.role==='owner')T.push(['coaches','المدربون']);T.push(['acct','حسابي']);
return'<div class="tabs">'+T.map(function(t){var on=(view===t[0])||(t[0]==='home'&&['players','backup','prog','editP','creds'].indexOf(view)>-1);return'<button class="tab'+(on?' on':'')+'" data-v="'+t[0]+'">'+t[1]+(t[0]==='req'?badge():'')+'</button>'}).join('')+'</div>'}
function badge(){return S.pend.length?'<span class="bdg">'+S.pend.length+'</span>':''}
function regLink(){return location.origin+'/?c='+encodeURIComponent(S.me.slug||'')}
function linkCard(){if(S.me.role==='owner')return'';return'<div class="card"><h2>🔗 رابط تسجيل لاعبيك</h2><p class="muted">ابعث هذا الرابط للاعبين في WhatsApp أو Instagram. اللاعبون اللي يسجلوا منه يتضافوا لقائمتك أنت فقط، وما يشوفوش لوحة المدرب.</p><input class="link" id="rl" readonly value="'+esc(regLink())+'"><button class="btn" id="copyRl">نسخ رابط التسجيل</button><button class="btn sec" id="shRl">مشاركة الرابط</button></div>'}
function statusCard(){var l=S.players.filter(function(p){return p.source==='link'});return(S.pend.length?'<button class="tile" data-go="req" style="width:100%;margin-bottom:12px;border-color:#b58900"><i>⏳</i><b>طلبات تسجيل في انتظار موافقتك: '+S.pend.length+'</b><span>افتح لقبول أو رفض الطلبات</span></button>':'')+'<button class="tile" data-go="req" style="width:100%;margin-bottom:16px"><i>📥</i><b>سجّلوا عبر الرابط: '+l.length+'</b><span>'+(l.length?'آخر تسجيل: '+fmt(new Date(l[0].ts).toISOString().slice(0,10)):'ما فماش تسجيلات بعد')+'</span></button>'}
function homeV(){
var last=S.evals.slice().sort(function(a,b){return b.ts-a.ts}).slice(0,3);
return statusCard()+'<div class="card"><h2>إدارة الفريق</h2><div class="grid2">'+
'<button class="tile" data-go="players"><i>👥</i><b>اللاعبون</b><span>'+S.players.length+' لاعب</span></button>'+
'<button class="tile" data-go="eval"><i>📋</i><b>تقييم سريع</b><span style="direction:ltr;display:block">Kyorugi / Poomsae / Freestyle</span></button>'+
'<button class="tile" data-go="prog"><i>📈</i><b>التطور</b><span>تاريخ ومقارنة</span></button>'+
'<button class="tile" data-go="backup"><i>📊</i><b>Excel</b><span>تصدير اللاعبين والتقييمات</span></button></div></div>'+
linkCard()+athCard()+
'<div class="card"><h2>آخر التقييمات</h2>'+(last.length?last.map(evItem).join(''):'<p class="muted">ابدأ بإضافة لاعب ثم سجّل أول تقييم.</p>')+'</div>'+
'<div class="card"><h2>طريقة العمل</h2><ol><li>ابعث رابط التسجيل للاعبين (أو أضفهم بنفسك).</li><li>حمّل ملف Excel في أي وقت، دايمًا محدّث.</li><li>اختر لاعب ونوع التقييم وحرّك المؤشرات.</li><li>المجموع يتحدّث آليًا حسب نوع التقييم ويتحفظ في قاعدة البيانات.</li></ol></div>'}
function evItem(e){var v=C.describe(e,VIEW);return'<div class="item"><div class="top"><div><b>'+esc(pname(e.pid))+'</b><div><span class="tag">'+esc(STAGES[e.stage])+'</span><span class="tag">'+esc(C.modeTitle(v.mode))+(v.legacy?' · قديم':'')+'</span><span class="tag">'+fmt(e.date)+'</span></div></div><div class="sc">'+v.total+'/'+v.max+'</div></div>'+
(e.goal?'<p class="muted" style="margin:8px 0 0">🎯 '+esc(e.goal)+'</p>':'')+'</div>'}
function newDraft(){return{pid:'',date:today(),stage:'initial',id:'',legacy:false,mode:C.DEFAULT_MODE,r:C.emptyRatings(C.DEFAULT_MODE),nf:N.empty(),by:'المدرب'}}
function metricRow(m,val){return'<div class="metric"><div class="metric-h"><div>'+V.metricName(m,VIEW)+'</div><span class="n" id="n_'+m.id+'">'+val+'/'+m.max+'</span></div><input type="range" min="'+m.min+'" max="'+m.max+'" step="1" value="'+val+'" data-m="'+m.id+'" aria-label="'+esc(m.title)+'"></div>'}
function notesForm(d){return N.FIELDS.map(function(f){return'<div class="nfield"><label for="nf_'+f.key+'">'+esc(f.label)+'</label>'+(f.athlete?'':'<span class="fhint">خاصة بالمدرب، ما تظهرش للاعب</span>')+'<textarea id="nf_'+f.key+'" maxlength="'+N.MAX_LEN+'" placeholder="'+esc(f.hint)+'">'+esc(d.nf[f.key])+'</textarea></div>'}).join('')}
function modeOpts(sel,ph){return opts(C.FILTER_MODES.map(function(id){return[id,C.modeTitle(id)]}),sel,ph)}
function modePicker(d){return'<fieldset class="field"><legend>نوع التقييم</legend><div class="seg two">'+C.MODE_IDS.map(function(id){var i=C.MODE_INFO[id];return'<label><input type="radio" name="e_m" value="'+id+'"'+(d.mode===id?' checked':'')+(d.id?' disabled':'')+'><span>'+esc(i.title)+'<small>'+esc(i.en)+'</small></span></label>'}).join('')+'</div>'+(d.id?'<p class="muted">نوع التقييم ما يتبدّلش بعد الحفظ.</p>':'')+'</fieldset>'}
function evalV(){
if(!draft)draft=newDraft();var d=draft;
var h='<div class="card"><h2>'+(d.id?'تعديل تقييم':'تقييم لاعب')+'</h2>';
if(!S.players.length)h+='<p class="muted">ما عندكش لاعبين بعد. سجّل لاعب أولًا من تبويب «تسجيل لاعب».</p>';
h+='<label>اللاعب</label><select id="e_p"'+(d.id?' disabled':'')+'>'+playerOpts(d.pid,'اختر لاعبًا')+'</select>'+
'<div class="row2"><div><label>المرحلة</label><select id="e_s">'+opts(Object.keys(STAGES).map(function(k){return[k,STAGES[k]]}),d.stage)+'</select></div><div><label>التاريخ</label><input type="date" id="e_d" value="'+d.date+'"></div></div>';
if(!d.legacy)h+=modePicker(d);
if(d.legacy){h+='<p class="muted">هذا تقييم قديم (قبل نظام الـ20 معيار). نقاطه ما تتبدّلش، تنجم تعدّل التاريخ والنصوص فقط.</p><div class="item">'+V.groups(d.ev,VIEW)+'</div>'}
else{var md=C.getMode(d.mode),s=C.scoreRatings(d.r,d.mode);md.categories.forEach(function(cat,i){var cl=C.categoryLabel(cat,VIEW);h+='<section class="cat"><div class="cat-h"><div><h3>'+esc(cl.title)+'</h3>'+(cl.description?'<small>'+esc(cl.description)+'</small>':'')+'</div><span class="n" id="c_'+cat.id+'">'+s.categories[i].score+'/'+cat.max+'</span></div>'+cat.metrics.map(function(m){return metricRow(m,d.r[m.id])}).join('')+'</section>'});
h+='<div class="total"><div class="muted">المجموع</div><big id="tot">'+s.total+'/'+s.max+'</big><div class="muted" id="totp">'+s.pct+'%</div></div>'}
h+=notesForm(d)+
'<label>اسم من أجرى التقييم</label><select id="e_b">'+opts(['المدرب','المساعد'],d.by)+'</select>'+
'<button class="btn" id="saveEval">'+(d.id?'حفظ التعديلات':'حفظ التقييم الجديد')+'</button>'+(d.id?'<button class="btn sec" id="cancelEdit">إلغاء</button>':'')+'<p class="muted">كل معيار من '+C.SCALE.min+' إلى '+C.SCALE.max+(md?'، و'+md.metrics.length+' معيار = '+md.max:'')+'. استعمل نفس طريقة التنقيط في كل مرة للمقارنة العادلة.</p></div>';
return h}
function refresh(d){var md=C.getMode(d.mode),s=C.scoreRatings(d.r,d.mode);s.categories.forEach(function(x){var el=$('c_'+x.id);if(el)el.textContent=x.score+'/'+x.max});md.metrics.forEach(function(m){var el=$('n_'+m.id);if(el)el.textContent=d.r[m.id]+'/'+m.max});$('tot').textContent=s.total+'/'+s.max;$('totp').textContent=s.pct+'%'}
function sum(d){return d.legacy?0:C.scoreRatings(d.r,d.mode).total}
function logV(){
var l=S.evals.filter(function(e){return(!logF.p||e.pid===logF.p)&&(!logF.m||C.modeOf(e)===logF.m)}).sort(function(a,b){return b.ts-a.ts});
return'<div class="card"><h2>سجل التقييمات</h2><label>تصفية حسب اللاعب</label><select id="f_p">'+playerOpts(logF.p,'كل اللاعبين')+'</select><label>تصفية حسب النوع</label><select id="f_m">'+modeOpts(logF.m,'كل الأنواع')+'</select><div style="margin-top:16px">'+
(l.length?l.map(function(e){return evItem(e)+'<div style="margin:-4px 0 12px;display:flex;gap:8px"><button class="btn sm sec" data-det="'+e.id+'">التفاصيل</button><button class="btn sm sec" data-edev="'+e.id+'">تعديل</button><button class="btn sm red" data-del="'+e.id+'">حذف</button></div><div id="det_'+e.id+'"></div>'}).join(''):'<p class="muted">لا توجد نتائج مطابقة.</p>')+'</div></div>'}
function detail(e){return'<div class="item">'+V.groups(e,VIEW)+V.notes(N.fromApi(e),VIEW)+'<p class="muted">أجراه: '+esc(e.by)+'</p></div>'}
function formFields(v){v=v||{};return(S.me.role==='owner'?'<label>المدرب *</label><select id="r_co">'+opts(S.coaches.map(function(x){return[x.id,x.name]}),v.coach||'','اختار المدرب')+'</select>':'')+'<div class="row2"><div><label>الاسم *</label><input id="r_f" maxlength="40" autocomplete="off" value="'+esc(v.firstName)+'"></div><div><label>اللقب *</label><input id="r_l" maxlength="40" autocomplete="off" value="'+esc(v.lastName)+'"></div></div>'+
'<div class="row2"><div><label>الجنس *</label><select id="r_g">'+opts(GENS,v.gender||'','اختار')+'</select></div><div><label>تاريخ الميلاد *</label><input type="date" id="r_d" max="'+today()+'" value="'+esc(v.dob)+'"></div></div>'+
'<label>الولاية *</label><select id="r_rg">'+opts(REG,v.region||'','اختار')+'</select>'+
'<div class="row2"><div><label>الحزام *</label><select id="r_bl">'+opts(BELTS,v.belt||'','اختار')+'</select></div><div><label>الوزن (kg) *</label><input type="number" inputmode="decimal" id="r_w" min="10" max="200" step="0.1" placeholder="مثال: 55" value="'+esc(v.weight)+'"></div></div>'+
'<div class="row2"><div><label>الاختصاص *</label><select id="r_sp">'+opts(SPECS,v.spec||'','اختار')+'</select></div><div><label>الفئة (آليًا من تاريخ الميلاد)</label><select id="r_c"'+(AGE.assess(v.dob).ok?' disabled':'')+'>'+opts(CATS,v.cat||'','اختار')+'</select></div></div><small class="muted" id="r_ch"></small>'+
'<label>رقم الهاتف *</label><input id="r_ph" type="tel" inputmode="tel" dir="ltr" placeholder="22 123 456" value="'+esc(v.phone)+'">'}
function readForm(){return{gender:$('r_g').value,dob:$('r_d').value,coach:$('r_co')?$('r_co').value:'',firstName:$('r_f').value.trim(),lastName:$('r_l').value.trim(),region:$('r_rg').value,belt:$('r_bl').value,weight:$('r_w').value,specialty:$('r_sp').value,category:$('r_c').value,phone:$('r_ph').value.trim()}}
function valid(f){if(S.me.role==='owner'&&!f.coach){toast('اختار المدرب');return false}
var ep=view==='editP'?S.players.filter(function(x){return x.id===editId})[0]:null,leg=ep&&!ep.gender&&!ep.dob;
if(!leg&&(!f.gender||!f.dob)){toast('اختار الجنس واكتب تاريخ الميلاد');return false}
if(f.dob){var ad=AGE.assess(f.dob);if(!ad.ok){toast(ad.message);return false}} // the server re-checks and re-derives the category
if(!f.firstName||!f.lastName||!f.region||!f.belt||!f.weight||!f.specialty||!f.category||!f.phone){toast('عمّر كل الخانات اللي فيها *');return false}
var w=parseFloat(f.weight);if(!(w>=10&&w<=200)){toast('الوزن غير صحيح');return false}
if(!/^(?:\+216|00216)?[2-9]\d{7}$/.test(f.phone.replace(/[\s.-]/g,''))){toast('رقم الهاتف غير صحيح (8 أرقام)');return false}return true}
// Live hint: the category follows the date of birth (the server recomputes it, so this is display only)
function syncCat(){var d=$('r_d'),c=$('r_c'),h=$('r_ch');if(!d||!c||!h)return;var a=AGE.assess(d.value);if(d.value&&a.ok){c.value=a.category;c.disabled=true;h.textContent=AGE.describe(a)}else{c.disabled=false;h.textContent=d.value?a.message:''}}
function regV(){return'<div class="card"><h2>إضافة لاعب</h2><p class="muted">تسجيل مباشر من المدرب: اللاعب يتحفظ في قاعدة البيانات ويدخل في ملف Excel.</p>'+formFields()+'<button class="btn" id="addPlayer">إضافة اللاعب</button></div>'}
function reqV(){var l=S.players.filter(function(p){return p.source==='link'});
return pendCard()+'<div class="card"><h2>التسجيلات عبر الرابط ('+l.length+')</h2><p class="muted">اللاعب يسجّل من الرابط، وبعد ما تقبله يتضاف هنا. اللي ترفضو ما يتسجّلش.</p><a class="btn" href="/admin/export.xlsx">⬇ تحميل ملف Excel</a></div>'+
linkCard()+athCard()+
'<div class="card"><h2>آخر التسجيلات</h2>'+(l.length?l.map(function(p){return'<div class="item"><div class="top"><b>'+esc(p.name)+'</b><span class="muted">'+fmt(new Date(p.ts).toISOString().slice(0,10))+'</span></div><div>'+tags(p)+'</div><p class="muted link" style="margin:6px 0 0">'+esc(p.phone)+'</p></div>'}).join(''):'<p class="muted">ما فماش تسجيلات بعد. ابعث الرابط للاعبين.</p>')+'</div>'}
function athCard(){var n=S.players.filter(function(p){return p.hasPw}).length;return'<div class="card"><h2>🔑 دخول اللاعبين لتقييماتهم</h2><p class="muted">كل لاعب يدخل برقم هاتفه وكلمة سر خاصة به، ويشوف تقييماته هو فقط. عندهم كلمة سر: '+n+' من '+S.players.length+'.</p><input class="link" readonly value="'+esc(location.origin+'/athlete')+'"><button class="btn" id="bulkPw">توليد كلمات السر للّي ما عندهمش</button></div>'}
function waLink(c){var d=String(c.phone).replace(/\D/g,''),t='مرحبا '+c.name+'، هذا دخولك لمتابعة تقييماتك في فريق التايكوندو:\nالرابط: '+location.origin+'/athlete\nرقم الهاتف: '+d.slice(-8)+'\nكلمة السر: '+c.password;return'https://wa.me/'+d+'?text='+encodeURIComponent(t)}
function credsV(){return'<div class="card"><h2>كلمات السر ('+creds.length+')</h2><p class="muted">⚠ كلمة السر تظهر مرة وحدة فقط. انسخها أو ابعثها للاعب الآن. إذا ضاعت تنجم تولّد وحدة جديدة.</p><button class="btn" id="copyCreds">نسخ الكل</button><button class="btn sec" id="csvCreds">تحميل CSV</button></div>'+creds.map(function(c){return'<div class="item"><div class="top"><b>'+esc(c.name)+'</b><a class="btn sm" href="'+esc(waLink(c))+'" target="_blank" rel="noopener">واتساب</a></div><p class="muted link" style="margin:6px 0 0">'+esc(c.phone)+'</p><p class="link" style="margin:4px 0 0;font-size:22px;font-weight:800;letter-spacing:2px">'+esc(c.password)+'</p></div>'}).join('')}
function editPV(){var p=S.players.filter(function(x){return x.id===editId})[0];if(!p)return playersV();return'<div class="card"><h2>تعديل: '+esc(p.name)+'</h2>'+formFields(p)+'<button class="btn" id="saveP">حفظ التعديلات</button><button class="btn sec" id="cancelP">إلغاء</button></div>'}
function playersV(){return'<div class="card"><h2>اللاعبون ('+S.players.length+')</h2><a class="btn sec" href="/admin/export.xlsx" style="margin:0 0 14px">⬇ تحميل Excel</a>'+(S.players.length?S.players.map(function(p){return'<div class="item"><div class="top"><div><b>'+esc(p.name)+'</b><div>'+tags(p)+'</div><p class="muted link" style="margin:6px 0 0">'+esc(p.phone)+(p.hasPw?' 🔑':' (بلا كلمة سر)')+'</p></div></div><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm sec" data-ep="'+esc(p.id)+'">تعديل</button><button class="btn sm sec" data-pw="'+esc(p.id)+'">كلمة سر</button><button class="btn sm red" data-dp="'+esc(p.id)+'">حذف</button></div></div>'}).join(''):'<p class="muted">لا يوجد لاعبون بعد.</p>')+'</div>'}
function coachMsg(c){return'مرحبا '+c.name+'، هذا حسابك كمدرب في تطبيق فريق التايكوندو:\nرابط الدخول: '+location.origin+'/coach\nاسم المستخدم: '+c.username+'\nكلمة السر: '+c.password+'\nرابط تسجيل لاعبيك: '+location.origin+'/?c='+c.slug+'\nغيّر كلمة السر من تبويب «حسابي» بعد أول دخول.'}
function coachWa(c){return'https://wa.me/'+String(c.phone||'').replace(/\D/g,'')+'?text='+encodeURIComponent(coachMsg(c))}
function coachesV(){
var h='';
if(newCoach)h+='<div class="card"><h2>بيانات دخول المدرب ✓</h2><p class="muted">⚠ كلمة السر تظهر مرة وحدة فقط. انسخها وابعثها للمدرب الآن.</p><div class="item"><b>'+esc(newCoach.name)+'</b><p class="muted link" style="margin:6px 0 0">اسم المستخدم: '+esc(newCoach.username)+'</p><p class="link" style="margin:4px 0 0;font-size:22px;font-weight:800;letter-spacing:2px">'+esc(newCoach.password)+'</p><p class="muted link" style="margin:6px 0 0">'+esc(location.origin+'/coach')+'</p></div><a class="btn" href="'+esc(coachWa(newCoach))+'" target="_blank" rel="noopener">إرسال عبر واتساب</a><button class="btn sec" id="copyCoach">نسخ البيانات</button></div>';
h+='<div class="card"><h2>إضافة مدرب</h2><label>الاسم *</label><input id="c_n" maxlength="60" autocomplete="off"><label>اسم المستخدم * (حروف إنجليزية صغيرة وأرقام)</label><input id="c_u" dir="ltr" maxlength="30" autocomplete="off" autocapitalize="none"><label>رقم هاتف المدرب (اختياري، باش يفتح واتساب مباشرة)</label><input id="c_p" type="tel" inputmode="tel" dir="ltr" placeholder="22 123 456"><button class="btn" id="addCoach">إنشاء حساب المدرب</button></div>';
h+='<div class="card"><h2>المدربون ('+S.coaches.length+')</h2>'+(S.unassigned?'<p class="muted">⚠ '+S.unassigned+' لاعب بلا مدرب (تسجيلات قديمة). افتح «اللاعبون» ثم «تعديل» واختار لهم مدربًا.</p>':'')+(S.coaches.length?S.coaches.map(function(x){return'<div class="item"><div class="top"><div><b>'+esc(x.name)+'</b>'+(x.active?'':' <span class="tag">موقوف</span>')+'<p class="muted link" style="margin:4px 0">'+esc(x.username)+' · '+x.n+' لاعب</p></div></div><input class="link sel" readonly value="'+esc(location.origin+'/?c='+x.slug)+'"><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'+(S.unassigned?'<button class="btn sm" data-cclaim="'+esc(x.id)+'">نقل اللاعبين بلا مدرب إليه ('+S.unassigned+')</button>':'')+'<button class="btn sm sec" data-cpw="'+esc(x.id)+'">كلمة سر جديدة</button><button class="btn sm sec" data-ctog="'+esc(x.id)+'">'+(x.active?'إيقاف':'تفعيل')+'</button><button class="btn sm red" data-cdel="'+esc(x.id)+'">حذف</button></div></div>'}).join(''):'<p class="muted">ما فماش مدربين بعد.</p>')+'</div>';
return h}
function acctV(){
if(S.me.role==='owner')return'<div class="card"><h2>حساب المسؤول</h2><p class="muted">دخولك بالمفتاح ADMIN_KEY الموجود في ملف .env. لتغييره بدّل القيمة هناك ثم أعد تشغيل التطبيق.</p></div>';
return'<div class="card"><h2>حسابي</h2><p class="muted">'+esc(S.me.name)+' · '+esc(S.me.username||'')+'</p><label>كلمة السر الحالية</label><input id="cp" type="password" dir="ltr" autocomplete="current-password"><label>كلمة السر الجديدة (6 أحرف على الأقل)</label><input id="np" type="password" dir="ltr" autocomplete="new-password"><button class="btn" id="chgPw">تغيير كلمة السر</button></div>'}
function progV(){
var h='<div class="card"><h2>التطور</h2><label>اللاعب</label><select id="p_p">'+playerOpts(progP,'اختر لاعبًا')+'</select><label>النوع</label><select id="p_m">'+modeOpts(progM)+'</select>';
if(progP){var l=S.evals.filter(function(e){return e.pid===progP&&C.modeOf(e)===progM}).sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:a.ts-b.ts});
if(!l.length)h+='<p class="muted">لا توجد تقييمات من هذا النوع لهذا اللاعب.</p>';
else{var vs=l.map(function(e){return C.describe(e,VIEW)}),d=vs[vs.length-1].pct-vs[0].pct;
h+=l.length>1?'<p>الفرق بين أول وآخر تقييم: <b class="'+(d>=0?'up':'down')+'" style="direction:ltr;display:inline-block">'+(d>0?'+':'')+d+'%</b></p>':'<p class="muted">تقييم واحد فقط حتى الآن.</p>';
var n=vs.filter(function(v){return!v.legacy});
if(n.length>1)h+='<h3 style="margin:18px 0 8px">التطور حسب الفئة</h3>'+n[0].groups.map(function(g,i){var x=n[n.length-1].groups[i].pct-g.pct;return'<div class="gv-i"><span>'+esc(g.title)+'</span><b class="'+(x>=0?'up':'down')+'" style="direction:ltr">'+(x>0?'+':'')+x+'%</b></div>'}).join('');
h+=l.map(function(e,i){return'<div class="item"><div class="top"><span>'+fmt(e.date)+' · '+esc(STAGES[e.stage])+'</span><span class="sc">'+vs[i].total+'/'+vs[i].max+'</span></div><div class="bar"><i style="width:'+vs[i].pct+'%"></i></div></div>'}).join('')}}
return h+'</div>'}
function backupV(){return'<div class="card"><h2>تصدير Excel</h2><p class="muted">الملف يتولّد من قاعدة البيانات في كل مرة، فيه ورقتين: اللاعبون والتقييمات.</p><a class="btn" href="/admin/export.xlsx">⬇ تحميل ملف Excel</a></div>'}
function loginV(){return'<div class="head"><div><h1>TKD_2026 🥋</h1><small>COACH LOGIN</small></div></div><div class="card"><h2>دخول المدرب</h2><p class="muted">سجّل دخولك بحسابك الخاص.</p><label>اسم المستخدم</label><input id="lu" class="link" dir="ltr" autocomplete="username" autocapitalize="none" autocorrect="off"><label>كلمة السر</label><input id="lk" type="password" class="link" dir="ltr" autocomplete="current-password"><button class="btn" id="lg">دخول</button></div>'}

/* ---------- Coach Approval Gate: pending-registration pop-up ----------
 * S.pend comes from /api/admin/data (first load) and /api/admin/registrations (polled every 15s while the tab is visible).
 * The modal lives in #pmodal, outside #app, so polling never wipes a form the coach is typing in. */
var snoozed={},busy='',denyArm='',modalSig='',modalId='',polling=false,pollTimer=null;
function nextPending(){return S.pend.filter(function(r){return!snoozed[r.id]})[0]}
function pendItem(r){return'<div class="item"><div class="top"><b>'+esc(r.name)+'</b><span class="muted">'+fmt(new Date(r.ts).toISOString().slice(0,10))+'</span></div><div>'+tags(r)+'</div><p class="muted link" style="margin:6px 0 0">'+esc(r.phone)+'</p><div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm ok" data-qa="'+esc(r.id)+'">قبول</button><button class="btn sm red" data-qd="'+esc(r.id)+'">رفض</button></div></div>'}
function pendCard(){return S.pend.length?'<div class="card"><h2>⏳ في انتظار موافقتك ('+S.pend.length+')</h2><p class="muted">ما يدخلوش لقائمة اللاعبين إلا بعد القبول.</p>'+S.pend.map(pendItem).join('')+'</div>':''}
function row(k,v){return'<dt>'+k+'</dt><dd>'+v+'</dd>'}
function modalHtml(r){var cl=AGE.label(r.cat),isBusy=busy===r.id,armed=denyArm===r.id;
return'<div class="pm-box" role="dialog" aria-modal="true" aria-labelledby="pm_t"><div class="pm-top"><h2 id="pm_t">طلب تسجيل جديد</h2><span class="pm-count">'+(S.pend.indexOf(r)+1)+' من '+S.pend.length+'</span></div>'+
'<div class="pm-who">'+esc(r.name)+'</div><dl class="pm-dl">'+
row('الجنس',esc(lab(GENS,r.gender)))+
row('تاريخ الميلاد',r.dob?esc(fmt(r.dob))+(r.age!=null?' ('+r.age+' سنة)':''):'—')+
row('الفئة',cl?esc(cl.ar)+' <span class="muted">('+esc(cl.en)+')</span>':esc(r.cat||'—'))+
row('الوزن',esc(r.weight)+' kg')+row('الحزام',esc(lab(BELTS,r.belt)))+row('الاختصاص',esc(lab(SPECS,r.spec)))+row('الولاية',esc(lab(REG,r.region)))+
row('الهاتف','<span class="link">'+esc(r.phone)+'</span>')+(S.me.role==='owner'?row('المدرب',esc(r.coachName||'—')):'')+'</dl>'+
'<div class="pm-actions"><button class="btn ok" data-pa="accept"'+(isBusy?' disabled':'')+'>قبول (Accept)</button><button class="btn red'+(armed?' arm':'')+'" data-pa="deny"'+(isBusy?' disabled':'')+'>'+(armed?'تأكيد الرفض':'رفض (Deny)')+'</button></div>'+
'<button class="pm-later" data-pa="later"'+(isBusy?' disabled':'')+'>لاحقًا</button></div>'}
function hideModal(){var pm=$('pmodal');pm.hidden=true;pm.innerHTML='';modalSig='';modalId='';app.removeAttribute('inert')}
function paintBadge(){Array.prototype.forEach.call(app.querySelectorAll('.tab[data-v="req"]'),function(b){b.innerHTML='التسجيلات'+badge()})}
function syncModal(){
paintBadge();
var r=authed?nextPending():null;if(!r){hideModal();return}
var sig=[r.id,S.pend.length,busy,denyArm].join('|');if(sig===modalSig)return;
var first=modalId!==r.id;modalSig=sig;modalId=r.id;
var pm=$('pmodal');pm.innerHTML=modalHtml(r);pm.hidden=false;app.setAttribute('inert','');
Array.prototype.forEach.call(pm.querySelectorAll('[data-pa]'),function(b){b.onclick=function(){
var a=b.dataset.pa;
if(a==='accept')decide(r.id,'accept');
else if(a==='deny'){if(denyArm===r.id)decide(r.id,'deny');else{denyArm=r.id;syncModal()}} // 2-step: the first tap arms it
else snooze(r.id)}});
if(first){var f=pm.querySelectorAll('[data-pa="accept"]')[0];if(f&&f.focus)f.focus()}}
function snooze(id){snoozed[id]=true;denyArm='';syncModal()} // hides it for this session only; it stays in the badge and in «التسجيلات»
function decide(id,action){
if(busy)return;busy=id;modalSig='';syncModal();
api('POST','/api/admin/registrations/'+encodeURIComponent(id)+'/'+action,{})
.then(function(){toast(action==='accept'?'تم قبول اللاعب ✓ وتضاف لقائمتك':'تم رفض الطلب')})
.catch(function(e){toast(errMsg(e))})                                  // e.g. already handled on another device: the reload below shows the truth
.then(function(){return reload().catch(function(){})})
.then(function(){busy='';denyArm='';modalSig='';if(['home','players','req'].indexOf(view)>-1)render();else syncModal()})}
function pollPending(){
if(!authed||busy||polling||document.hidden)return Promise.resolve();
polling=true;
return api('GET','/api/admin/registrations').then(function(d){
var ids=function(l){return l.map(function(x){return x.id}).join(',')},changed=ids(d.pending)!==ids(S.pend);
S.pend=d.pending;
if(changed){if(['home','req'].indexOf(view)>-1)render();else syncModal()}
}).catch(function(){}).then(function(){polling=false})}
function startPoll(){
if(pollTimer)return;
pollTimer=setInterval(pollPending,15000);if(pollTimer&&pollTimer.unref)pollTimer.unref();
document.addEventListener('visibilitychange',function(){if(!document.hidden)pollPending()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modalId)snooze(modalId)})}
function render(){
if(loading){app.innerHTML='<p class="muted" style="text-align:center;margin-top:35vh">…</p>';return}
if(!authed){hideModal();app.innerHTML=loginV();var lg=$('lg'),lk=$('lk');var doLogin=function(){lg.disabled=true;api('POST','/api/admin/login',{username:$('lu').value,password:lk.value}).then(reload).then(render).catch(function(e){lg.disabled=false;toast(errMsg(e))})};lg.onclick=doLogin;lk.onkeydown=function(e){if(e.key==='Enter')doLogin()};return}
var v={home:homeV,eval:evalV,log:logV,reg:regV,req:reqV,players:playersV,prog:progV,backup:backupV,editP:editPV,creds:credsV,coaches:coachesV,acct:acctV}[view]||homeV;
app.innerHTML=header()+tabs()+v();bind();syncModal()}
function bind(){
var q=function(s,f){Array.prototype.forEach.call(app.querySelectorAll(s),f)};
q('.tab',function(b){b.onclick=function(){go(b.dataset.v)}});
q('[data-go]',function(b){b.onclick=function(){go(b.dataset.go)}});
var lo=$('logout');if(lo)lo.onclick=function(){api('POST','/api/admin/logout').then(function(){authed=false;S.players=[];S.evals=[];S.coaches=[];view='home';draft=null;render()})};
var cr=$('copyRl');if(cr)cr.onclick=function(){var i=$('rl');i.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}
if(navigator.clipboard)navigator.clipboard.writeText(i.value).then(function(){toast('تم نسخ الرابط ✓')},function(){toast(ok?'تم نسخ الرابط ✓':'انسخ الرابط يدويًا')});else toast(ok?'تم نسخ الرابط ✓':'انسخ الرابط يدويًا')};
var sh=$('shRl');if(sh)sh.onclick=function(){var u=regLink(),t='سجّل معلوماتك في فريق التايكوندو من هنا:';if(navigator.share)navigator.share({text:t,url:u}).catch(function(){});else window.open('https://wa.me/?text='+encodeURIComponent(t+' '+u),'_blank','noopener')};
if(view==='eval'&&!regMode){
var d=draft;
$('e_p').onchange=function(){d.pid=this.value};$('e_s').onchange=function(){d.stage=this.value};$('e_d').onchange=function(){d.date=this.value};
N.FIELDS.forEach(function(f){$('nf_'+f.key).oninput=function(){d.nf[f.key]=this.value}});$('e_b').onchange=function(){d.by=this.value};
q('input[name=e_m]',function(r){r.onchange=function(){if(d.mode===r.value)return;if(sum(d)>0&&!confirm('تبديل نوع التقييم يمسح النقاط المدخلة. تكمل؟')){render();return}d.mode=r.value;d.r=C.emptyRatings(d.mode);render()}});
q('input[type=range]',function(r){r.oninput=function(){d.r[r.dataset.m]=+r.value;refresh(d)}});
var ce=$('cancelEdit');if(ce)ce.onclick=function(){draft=null;go('log')};
$('saveEval').onclick=function(){if(!d.pid){toast('اختر لاعبًا أولًا');return}if(!d.date){toast('اختر التاريخ');return}
if(!d.legacy&&sum(d)===0&&!confirm('المجموع 0. تحب تحفظ كيما هو؟'))return;
var b=this;b.disabled=true;
api(d.id?'PUT':'POST','/api/admin/evaluations'+(d.id?'/'+encodeURIComponent(d.id):''),Object.assign({pid:d.pid,date:d.date,stage:d.stage,mode:d.legacy?undefined:d.mode,r:d.legacy?undefined:d.r,by:d.by},N.toApi(d.nf))).then(reload).then(function(){draft=null;toast('تم حفظ التقييم ✓');go('log')}).catch(function(e){b.disabled=false;toast(errMsg(e))})}}
var fp=$('f_p');if(fp){fp.onchange=function(){logF.p=this.value;render()}}
var fm=$('f_m');if(fm)fm.onchange=function(){logF.m=this.value;render()};
q('[data-det]',function(b){b.onclick=function(){var e=S.evals.filter(function(x){return x.id===b.dataset.det})[0],t=$('det_'+e.id);t.innerHTML=t.innerHTML?'':detail(e)}});
q('[data-del]',function(b){b.onclick=function(){if(confirm('حذف هذا التقييم نهائيًا؟')){api('DELETE','/api/admin/evaluations/'+encodeURIComponent(b.dataset.del)).then(reload).then(render).catch(function(e){toast(errMsg(e))})}}});
var ap=$('addPlayer');if(ap)ap.onclick=function(){var f=readForm();if(!valid(f))return;ap.disabled=true;api('POST','/api/admin/athletes',f).then(function(r){creds=[{name:r.name,phone:r.phone,password:r.password}];return reload()}).then(function(){toast('تمت إضافة اللاعب ✓ هذه كلمة سره');go('creds')}).catch(function(e){ap.disabled=false;toast(errMsg(e))})};
q('[data-dp]',function(b){b.onclick=function(){if(confirm('حذف اللاعب وكل تقييماته؟')){api('DELETE','/api/admin/athletes/'+encodeURIComponent(b.dataset.dp)).then(reload).then(render).catch(function(e){toast(errMsg(e))})}}});
q('[data-edev]',function(b){b.onclick=function(){var e=S.evals.filter(function(x){return x.id===b.dataset.edev})[0];if(!e)return;draft={id:e.id,pid:e.pid,date:e.date,stage:e.stage,legacy:(e.v||1)===1,ev:e,mode:C.modeOf(e),r:e.r?Object.assign({},e.r):C.emptyRatings(C.modeOf(e)),nf:N.fromApi(e),by:e.by||'المدرب'};go('eval')}});
q('[data-ep]',function(b){b.onclick=function(){editId=b.dataset.ep;go('editP')}});
var svp=$('saveP');if(svp)svp.onclick=function(){var f=readForm();if(!valid(f))return;svp.disabled=true;api('PUT','/api/admin/athletes/'+encodeURIComponent(editId),f).then(reload).then(function(){toast('تم حفظ التعديلات ✓');go('players')}).catch(function(e){svp.disabled=false;toast(errMsg(e))})};
var cnp=$('cancelP');if(cnp)cnp.onclick=function(){go('players')};
q('[data-pw]',function(b){b.onclick=function(){if(confirm('توليد كلمة سر جديدة؟ الكلمة القديمة تتبطّل.')){api('POST','/api/admin/athletes/'+encodeURIComponent(b.dataset.pw)+'/password').then(function(r){creds=[r];return reload()}).then(function(){go('creds')}).catch(function(e){toast(errMsg(e))})}}});
var bk=$('bulkPw');if(bk)bk.onclick=function(){bk.disabled=true;api('POST','/api/admin/athletes/passwords').then(function(r){bk.disabled=false;if(!r.list.length){toast('كل اللاعبين عندهم كلمة سر');return}creds=r.list;return reload().then(function(){go('creds')})}).catch(function(e){bk.disabled=false;toast(errMsg(e))})};
var cc=$('copyCreds');if(cc)cc.onclick=function(){var t=creds.map(function(c){return c.name+' | '+c.phone+' | '+c.password}).join('\n');if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){toast('تم النسخ ✓')},function(){toast('ما تنسخش')});else toast('ما تنسخش')};
var cv=$('csvCreds');if(cv)cv.onclick=function(){var q2=function(x){return'"'+String(x).replace(/"/g,'""')+'"'};var t='\ufeff'+['الاسم','الهاتف','كلمة السر','الرابط'].map(q2).join(',')+'\n'+creds.map(function(c){return[c.name,c.phone,c.password,location.origin+'/athlete'].map(q2).join(',')}).join('\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv;charset=utf-8'}));a.download='tkd-passwords.csv';document.body.appendChild(a);a.click();a.remove()};
var ac=$('addCoach');if(ac)ac.onclick=function(){ac.disabled=true;api('POST','/api/admin/coaches',{name:$('c_n').value.trim(),username:$('c_u').value.trim(),phone:$('c_p').value.trim()}).then(function(r){newCoach=r;return reload()}).then(function(){toast('تم إنشاء الحساب ✓');render();window.scrollTo(0,0)}).catch(function(e){ac.disabled=false;toast(errMsg(e))})};
q('[data-cpw]',function(b){b.onclick=function(){if(confirm('توليد كلمة سر جديدة للمدرب؟ القديمة تتبطّل.')){api('POST','/api/admin/coaches/'+encodeURIComponent(b.dataset.cpw)+'/password').then(function(r){newCoach=r;return reload()}).then(function(){render();window.scrollTo(0,0)}).catch(function(e){toast(errMsg(e))})}}});
q('[data-ctog]',function(b){b.onclick=function(){var x=S.coaches.filter(function(y){return y.id===b.dataset.ctog})[0];if(!x)return;api('PUT','/api/admin/coaches/'+encodeURIComponent(x.id),{active:!x.active}).then(reload).then(render).catch(function(e){toast(errMsg(e))})}});
q('[data-cclaim]',function(b){b.onclick=function(){if(confirm('نقل كل اللاعبين اللي بلا مدرب ('+S.unassigned+') لهذا المدرب؟')){b.disabled=true;api('POST','/api/admin/coaches/'+encodeURIComponent(b.dataset.cclaim)+'/claim').then(function(r){return reload().then(function(){toast('تم نقل '+r.moved+' لاعب ✓');render()})}).catch(function(e){b.disabled=false;toast(errMsg(e))})}}});
q('[data-cdel]',function(b){b.onclick=function(){if(confirm('حذف حساب المدرب نهائيًا؟')){api('DELETE','/api/admin/coaches/'+encodeURIComponent(b.dataset.cdel)).then(reload).then(render).catch(function(e){toast(errMsg(e))})}}});
var cpy=$('copyCoach');if(cpy)cpy.onclick=function(){if(navigator.clipboard)navigator.clipboard.writeText(coachMsg(newCoach)).then(function(){toast('تم النسخ ✓')},function(){toast('ما تنسخش')});else toast('ما تنسخش')};
q('.sel',function(i){i.onclick=function(){i.select()}});
var rd=$('r_d');if(rd){rd.oninput=syncCat;rd.onchange=syncCat;syncCat()}
q('[data-qa]',function(b){b.onclick=function(){decide(b.dataset.qa,'accept')}});
q('[data-qd]',function(b){b.onclick=function(){if(confirm('رفض هذا الطلب؟ ما يتضافش اللاعب.'))decide(b.dataset.qd,'deny')}});
var cg=$('chgPw');if(cg)cg.onclick=function(){api('POST','/api/admin/me/password',{current:$('cp').value,next:$('np').value}).then(function(){$('cp').value='';$('np').value='';toast('تم تغيير كلمة السر ✓')}).catch(function(e){toast(errMsg(e))})};
var pp=$('p_p');if(pp)pp.onchange=function(){progP=this.value;render()};
var pm=$('p_m');if(pm)pm.onchange=function(){progM=this.value;render()};
}

api('GET','/api/admin/data').then(function(d){S.players=d.athletes;S.evals=d.evaluations;S.pend=d.pending||[];S.me=d.me;S.coaches=d.coaches||[];S.unassigned=d.unassigned||0;authed=true}).catch(function(){authed=false}).then(function(){loading=false;render();startPoll()});
})();

