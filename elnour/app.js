import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ====== إعدادات مشروع Firebase الخاص بالنور والفتح ====== */
const firebaseConfig = {};
if (!firebaseConfig.apiKey) { document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px;font-family:Cairo,sans-serif;color:#e7b53c"><div><img src="logo.jpg" style="max-width:280px;width:100%;border-radius:12px"><p style="margin-top:16px">البرنامج بيتجهّز — قريب جداً</p></div></div>'; throw new Error('no config'); }
const DOMAIN = '@elnour-elfath.app';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

/* ====== حالة البرنامج ====== */
let DB = { users: [], customers: [], moves: [] };
let ME = null, unsubs = [];
let route = { v: 'home' }, filter = 'all', q = '';

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) };
const dshow = d => { const [y, m, dd] = d.split('-'); return `${+dd}/${+m}/${y}` };
const canEdit = () => ME && ME.role === 'acc';
const toEmail = u => u.trim().toLowerCase().replace(/\s+/g, '') + DOMAIN;
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2000) }
function parseAmt(v) { return Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '')) || 0 }
function liveComma(el) { const p = parseAmt(el.value); el.value = p ? fmt(p) : '' }
function balance(cid) { return DB.moves.filter(m => m.cid === cid).reduce((s, m) => s + (m.type === 'd' ? m.amt : -m.amt), 0) }
const ord = (a, b) => (a.date + a.ts).localeCompare(b.date + b.ts);
function lastMove(cid) { return DB.moves.filter(m => m.cid === cid).sort(ord).pop() }
function fail(e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'مش مسموحلك بالعملية دي' : 'حصلت مشكلة، جرّب تاني') }

/* ====== الدخول ====== */
async function boot() {
  let setupDone = true;
  try { const s = await getDoc(doc(fs, 'meta', 'setup')); setupDone = s.exists() } catch (e) { }
  $('#setupBox').classList.toggle('hidden', setupDone);
  $('#loginBox').classList.toggle('hidden', !setupDone);
}
async function doLogin() {
  const u = $('#lu').value, p = $('#lp').value;
  if (!u || !p) { $('#lerr').textContent = 'اكتب اسم المستخدم وكلمة السر'; return }
  $('#lerr').textContent = 'جاري الدخول...';
  try { await signInWithEmailAndPassword(auth, toEmail(u), p) }
  catch (e) { $('#lerr').textContent = e.code === 'auth/network-request-failed' ? 'مفيش إنترنت — أول دخول محتاج نت' : 'اسم المستخدم أو كلمة السر غلط' }
}
async function doSetup() {
  const name = $('#sn').value.trim(), user = $('#su').value.trim(), pass = $('#sp').value;
  if (!name || !user) return $('#serr').textContent = 'كمّل البيانات';
  if (pass.length < 6) return $('#serr').textContent = 'كلمة السر لازم 6 حروف أو أرقام على الأقل';
  $('#serr').textContent = 'جاري الإنشاء...';
  try {
    const c = await createUserWithEmailAndPassword(auth, toEmail(user), pass);
    const b = writeBatch(fs);
    b.set(doc(fs, 'users', c.user.uid), { name, user: user.toLowerCase(), role: 'acc' });
    b.set(doc(fs, 'meta', 'setup'), { done: true, at: Date.now() });
    await b.commit();
    location.reload();
  } catch (e) { console.error(e); $('#serr').textContent = e.code === 'auth/email-already-in-use' ? 'اسم الدخول ده موجود' : 'حصلت مشكلة: ' + (e.code || '') }
}
async function logout() { unsubs.forEach(f => f()); unsubs = []; ME = null; await signOut(auth); location.reload() }

onAuthStateChanged(auth, async user => {
  if (!user) { $('#splash').classList.add('hidden'); $('#login').classList.remove('hidden'); boot(); return }
  unsubs.push(onSnapshot(doc(fs, 'users', user.uid), s => {
    if (!s.exists()) { $('#lerr').textContent = 'الحساب ده متوقف'; signOut(auth); return }
    const first = !ME; ME = { id: user.uid, ...s.data() };
    if (first) start(); else { $('#who').textContent = whoText(); render() }
  }, e => { $('#lerr').textContent = 'الحساب ده متوقف'; signOut(auth) }));
});
const whoText = () => ME.name + (ME.role === 'acc' ? ' — محاسب' : ' — مشاهدة فقط');
function start() {
  $('#splash').classList.add('hidden'); $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#who').textContent = whoText();
  const live = (name, key) => unsubs.push(onSnapshot(collection(fs, name), snap => {
    DB[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    $('#sync').textContent = snap.metadata.fromCache && !navigator.onLine ? '● بدون نت — هيتزامن لما النت يرجع' : '';
    render();
  }, fail));
  live('users', 'users'); live('customers', 'customers'); live('moves', 'moves');
  go('home');
}

/* ====== التنقل ====== */
function go(v, arg) { route = { v, arg }; render(); window.scrollTo(0, 0) }
function render() {
  if (!ME) return;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === route.v));
  $('#backBtn').classList.toggle('hidden', route.v !== 'cust');
  $('#fab').classList.toggle('hidden', !(route.v === 'home' && canEdit()));
  if (route.v === 'home' && document.activeElement && document.activeElement.id === 'qbox') return renderList();
  ({ home: viewHome, cust: viewCust, log: viewLog, more: viewMore })[route.v]();
}

/* ====== الرئيسية ====== */
function custList() {
  let list = DB.customers.map(c => ({ ...c, bal: balance(c.id), lm: lastMove(c.id) }))
    .filter(c => !q || c.name.includes(q) || (c.phone || '').includes(q));
  if (filter === 'owe') list = list.filter(c => c.bal > 0);
  if (filter === 'clear') list = list.filter(c => c.bal <= 0);
  return list.sort((a, b) => b.bal - a.bal);
}
function viewHome() {
  const total = DB.customers.reduce((s, c) => s + Math.max(balance(c.id), 0), 0);
  const owing = DB.customers.filter(c => balance(c.id) > 0).length;
  const t = today(), mo = t.slice(0, 7);
  const paidToday = DB.moves.filter(m => m.type === 'p' && m.date === t).reduce((s, m) => s + m.amt, 0);
  const paidMonth = DB.moves.filter(m => m.type === 'p' && m.date.startsWith(mo)).reduce((s, m) => s + m.amt, 0);
  $('#view').innerHTML = `
  <div class="hero">
    <small>إجمالي الفلوس اللي برّه عند العملاء</small>
    <div class="big"><span class="num">${fmt(total)}</span> <span style="font-size:16px">ج</span></div>
    <div class="stats">
      <div class="stat"><b class="num">${owing}</b><small>عميل عليه فلوس</small></div>
      <div class="stat"><b class="num" style="color:var(--green)">${fmt(paidToday)}</b><small>اتحصّل النهارده</small></div>
      <div class="stat"><b class="num" style="color:var(--green)">${fmt(paidMonth)}</b><small>اتحصّل الشهر ده</small></div>
    </div>
  </div>
  <div class="search"><input id="qbox" placeholder="ابحث باسم العميل أو رقمه" value="${esc(q)}" oninput="setQ(this.value)"></div>
  <div class="sec-t"><span>العملاء (${DB.customers.length})</span>
    <div class="chips">${[['all', 'الكل'], ['owe', 'عليهم فلوس'], ['clear', 'خالصين']].map(([k, l]) => `<span class="chip ${filter === k ? 'on' : ''}" onclick="setFilter('${k}')">${l}</span>`).join('')}</div></div>
  <div id="clist"></div>`;
  renderList();
}
function setQ(v) { q = v.trim(); renderList() }
function setFilter(k) { filter = k; viewHome() }
function renderList() {
  const el = $('#clist'); if (!el) return; const list = custList();
  el.innerHTML = list.length ? list.map(c => `
    <div class="cust" onclick="go('cust','${c.id}')">
      <div class="av">${esc(c.name.trim()[0] || '؟')}</div>
      <div class="n"><b>${esc(c.name)}</b><small>${c.lm ? 'آخر حركة ' + dshow(c.lm.date) : 'مفيش حركات'}</small></div>
      <div class="bal ${c.bal > 0 ? 'pos' : c.bal < 0 ? 'neg' : 'zero'}"><span class="num">${fmt(Math.abs(c.bal))}</span><small>${c.bal > 0 ? 'عليه' : c.bal < 0 ? 'ليه' : 'خالص'}</small></div>
    </div>`).join('') : `<div class="empty">${DB.customers.length ? 'مفيش نتايج' : 'لسه مفيش عملاء'}${canEdit() && !DB.customers.length ? '<br>دوس «عميل جديد» تحت عشان تبدأ' : ''}</div>`;
}

/* ====== صفحة العميل ====== */
function viewCust() {
  const c = DB.customers.find(x => x.id === route.arg); if (!c) return go('home');
  const b = balance(c.id);
  const mv = DB.moves.filter(m => m.cid === c.id).sort(ord);
  let run = 0; const rows = mv.map(m => { run += m.type === 'd' ? m.amt : -m.amt; return { ...m, run } }).reverse();
  const td = mv.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), tp = mv.filter(m => m.type === 'p').reduce((s, m) => s + m.amt, 0);
  $('#view').innerHTML = `
  <div class="cbox">
    <div class="nm">${esc(c.name)}</div>
    <div class="ph num">${esc(c.phone || 'بدون رقم')}</div>
    <div class="bl ${b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero'}"><span class="num">${fmt(Math.abs(b))}</span> <span style="font-size:18px">ج</span></div>
    <small style="color:var(--muted)">${b > 0 ? 'الرصيد اللي عليه' : b < 0 ? 'ليه عندنا (دافع زيادة)' : 'خالص — مفيش عليه حاجة'}</small>
    ${c.note ? `<div style="color:var(--muted);font-size:13px;margin-top:6px">${esc(c.note)}</div>` : ''}
    <div class="stats" style="margin-top:14px;grid-template-columns:1fr 1fr">
      <div class="stat"><b class="num pos">${fmt(td)}</b><small>إجمالي اللي أخده</small></div>
      <div class="stat"><b class="num" style="color:var(--green)">${fmt(tp)}</b><small>إجمالي اللي دفعه</small></div>
    </div>
    ${canEdit() ? `<div class="acts">
      <button class="btn btn-red" onclick="openMove('${c.id}','d')">＋ سحب جديد (يزوّد)</button>
      <button class="btn btn-green" onclick="openMove('${c.id}','p')">－ دفعة (تقلّل)</button>
    </div>` : ''}
    <div class="acts2">
      <button class="btn btn-ghost" onclick="sendWA('${c.id}')">كشف حساب واتساب</button>
      ${canEdit() ? `<button class="btn btn-ghost" onclick="openCustomerForm('${c.id}')">تعديل بيانات العميل</button>` : `<button class="btn btn-ghost" onclick="callC('${c.id}')">اتصال</button>`}
    </div>
  </div>
  <div class="sec-t"><span>سجل الحركات (${mv.length})</span></div>
  ${rows.length ? rows.map(m => `
    <div class="mv">
      <div class="dot ${m.type}">${m.type === 'd' ? '＋' : '－'}</div>
      <div class="i"><b>${m.type === 'd' ? 'سحب بضاعة / فلوس' : 'دفعة'}</b>
        <small>${dshow(m.date)}${m.note ? ' — ' + esc(m.note) : ''}</small>
        <small>سجّلها: ${esc(m.by)}</small>
        ${canEdit() ? `<button class="x" onclick="delMove('${m.id}')">حذف الحركة</button>` : ''}</div>
      <div class="a"><span class="num" style="color:${m.type === 'd' ? 'var(--red2)' : 'var(--green)'}">${m.type === 'd' ? '+' : '−'}${fmt(m.amt)}</span>
        <small>الرصيد بعدها <span class="num">${fmt(m.run)}</span></small></div>
    </div>`).join('') : '<div class="empty">لسه مفيش حركات على العميل ده</div>'}`;
}
function callC(id) { const c = DB.customers.find(x => x.id === id); if (c && c.phone) location.href = 'tel:' + c.phone }

/* ====== النوافذ ====== */
function closeM() { $('#modal').innerHTML = '' }
function sheet(html) { $('#modal').innerHTML = `<div class="ov" onclick="if(event.target===this)closeM()"><div class="sheet">${html}</div></div>` }
let busy = false;
async function once(fn) { if (busy) return; busy = true; try { await fn() } finally { busy = false } }

function openCustomerForm(id) {
  const c = id ? DB.customers.find(x => x.id === id) : null;
  sheet(`<h3>${c ? 'تعديل بيانات العميل' : 'عميل جديد'}</h3>
    <label class="field"><span>اسم العميل</span><input id="fn" value="${esc(c?.name || '')}"></label>
    <label class="field"><span>رقم الموبايل (واتساب)</span><input id="fp" inputmode="tel" class="num" style="text-align:right" value="${esc(c?.phone || '')}" placeholder="01xxxxxxxxx"></label>
    ${c ? '' : `<label class="field"><span>رصيد قديم عليه (لو في) — اختياري</span><input id="fo" inputmode="numeric" oninput="liveComma(this)" placeholder="0"></label>`}
    <label class="field"><span>ملاحظات (اختياري)</span><input id="fnote" value="${esc(c?.note || '')}"></label>
    <button class="btn btn-gold" onclick="saveCustomer('${id || ''}')">حفظ</button>
    ${c ? `<button class="btn btn-ghost" style="margin-top:8px;color:var(--red2)" onclick="delCustomer('${c.id}')">حذف العميل وكل حركاته</button>` : ''}`);
  setTimeout(() => $('#fn').focus(), 50);
}
function saveCustomer(id) {
  once(async () => {
    const name = $('#fn').value.trim(), phone = $('#fp').value.replace(/[^\d+]/g, ''), note = $('#fnote').value.trim();
    if (!name) return toast('اكتب اسم العميل');
    try {
      if (id) { updateDoc(doc(fs, 'customers', id), { name, phone, note }).catch(fail) }
      else {
        id = uid(); const b = writeBatch(fs);
        b.set(doc(fs, 'customers', id), { name, phone, note, created: today() });
        const o = parseAmt($('#fo').value);
        if (o > 0) b.set(doc(fs, 'moves', uid()), { cid: id, type: 'd', amt: o, date: today(), note: 'رصيد قديم', by: ME.name, ts: Date.now() + '' });
        b.commit().catch(fail);
      }
      closeM(); toast('تم الحفظ'); go('cust', id);
    } catch (e) { fail(e) }
  });
}
function delCustomer(id) {
  const c = DB.customers.find(x => x.id === id);
  if (!confirm(`متأكد إنك عايز تحذف «${c.name}» وكل حركاته؟`)) return;
  const b = writeBatch(fs); b.delete(doc(fs, 'customers', id));
  DB.moves.filter(m => m.cid === id).forEach(m => b.delete(doc(fs, 'moves', m.id)));
  b.commit().catch(fail); closeM(); go('home');
}
function openMove(cid, type) {
  const c = DB.customers.find(x => x.id === cid);
  sheet(`<h3>${type === 'd' ? 'سحب جديد على' : 'دفعة من'} ${esc(c.name)}</h3>
    <div class="note">الرصيد الحالي: <b class="num">${fmt(balance(cid))}</b> ج — ${type === 'd' ? 'المبلغ ده هيتزوّد على رصيده' : 'المبلغ ده هيتخصم من رصيده'}</div>
    <label class="field"><span>المبلغ</span><input id="ma" inputmode="numeric" oninput="liveComma(this)" style="font-size:22px;font-weight:800"></label>
    <label class="field"><span>التاريخ</span><input id="md" type="date" value="${today()}"></label>
    <label class="field"><span>${type === 'd' ? 'البيان (أخد إيه؟)' : 'ملاحظة (كاش / إنستاباي ...)'}</span><input id="mn" placeholder="${type === 'd' ? 'مثلاً: 20 مفتاح خام + جهاز' : 'مثلاً: كاش'}"></label>
    <button class="btn ${type === 'd' ? 'btn-red' : 'btn-green'}" onclick="saveMove('${cid}','${type}')">تسجيل</button>`);
  setTimeout(() => $('#ma').focus(), 50);
}
function saveMove(cid, type) {
  once(async () => {
    const amt = parseAmt($('#ma').value); if (amt <= 0) return toast('اكتب المبلغ');
    setDoc(doc(fs, 'moves', uid()), { cid, type, amt, date: $('#md').value || today(), note: $('#mn').value.trim(), by: ME.name, ts: Date.now() + '' }).catch(fail);
    closeM(); toast(type === 'd' ? 'تم تسجيل السحب' : 'تم تسجيل الدفعة');
  });
}
function delMove(id) { if (!confirm('متأكد إنك عايز تحذف الحركة دي؟')) return; deleteDoc(doc(fs, 'moves', id)).catch(fail) }

/* ====== كشف حساب واتساب ====== */
function sendWA(cid) {
  const c = DB.customers.find(x => x.id === cid), b = balance(cid);
  const mv = DB.moves.filter(m => m.cid === cid).sort(ord);
  let run = 0; const lines = mv.map(m => { run += m.type === 'd' ? m.amt : -m.amt;
    return `${dshow(m.date)} | ${m.type === 'd' ? 'سحب' : 'دفعة'} ${fmt(m.amt)}${m.note ? ' (' + m.note + ')' : ''} | الرصيد ${fmt(run)}` });
  const txt = `*شركة النور والفتح*\nكشف حساب: ${c.name}\nبتاريخ: ${dshow(today())}\n\n${lines.length > 15 ? '(آخر 15 حركة)\n' : ''}${lines.slice(-15).join('\n') || 'لا توجد حركات'}\n\n*${b > 0 ? 'الرصيد المستحق عليكم' : b < 0 ? 'رصيد لكم عندنا' : 'الحساب خالص'}: ${fmt(Math.abs(b))} ج*\n\nشكراً لتعاملكم معنا`;
  let ph = (c.phone || '').replace(/\D/g, ''); if (ph.startsWith('0')) ph = '2' + ph;
  window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(txt), '_blank');
}

/* ====== كل الحركات ====== */
function viewLog() {
  const mv = [...DB.moves].sort(ord).reverse().slice(0, 300);
  const name = id => DB.customers.find(c => c.id === id)?.name || '—';
  $('#view').innerHTML = `<div class="sec-t" style="margin-top:18px"><span>كل الحركات (آخر 300)</span></div>
  ${mv.length ? mv.map(m => `<div class="mv" onclick="go('cust','${m.cid}')" style="cursor:pointer">
    <div class="dot ${m.type}">${m.type === 'd' ? '＋' : '－'}</div>
    <div class="i"><b>${esc(name(m.cid))}</b><small>${m.type === 'd' ? 'سحب' : 'دفعة'} — ${dshow(m.date)}${m.note ? ' — ' + esc(m.note) : ''}</small><small>سجّلها: ${esc(m.by)}</small></div>
    <div class="a"><span class="num" style="color:${m.type === 'd' ? 'var(--red2)' : 'var(--green)'}">${m.type === 'd' ? '+' : '−'}${fmt(m.amt)}</span></div></div>`).join('') : '<div class="empty">لسه مفيش حركات</div>'}`;
}

/* ====== الإعدادات والمستخدمين ====== */
function viewMore() {
  $('#view').innerHTML = `
  <div class="cbox"><img src="logo.jpg" style="width:100%;max-width:280px;border-radius:12px"><div style="margin-top:8px;color:var(--muted)">${esc(ME.name)} — ${ME.role === 'acc' ? 'محاسب (يسجّل ويعدّل)' : 'شريك (مشاهدة فقط)'}</div></div>
  ${canEdit() ? `<div class="sec-t"><span>المستخدمين</span><span class="chip on" onclick="openUser()">＋ إضافة مستخدم</span></div>
  ${DB.users.map(u => `<div class="list-item"><div class="av" style="width:36px;height:36px">${esc(u.name[0])}</div>
    <div class="f"><b>${esc(u.name)}</b><small class="num" style="text-align:right">${esc(u.user)}</small></div>
    <span class="badge">${u.role === 'acc' ? 'محاسب' : 'مشاهدة'}</span>
    <button class="iconbtn" onclick="openUser('${u.id}')">تعديل</button></div>`).join('')}` : ''}
  <button class="btn btn-ghost" style="margin-top:12px" onclick="openPass()">تغيير كلمة السر بتاعتي</button>
  <button class="btn btn-ghost" style="margin-top:8px" onclick="logout()">تسجيل خروج</button>`;
}
function openUser(id) {
  const u = id ? DB.users.find(x => x.id === id) : null;
  sheet(`<h3>${u ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
    <label class="field"><span>الاسم</span><input id="un" value="${esc(u?.name || '')}"></label>
    ${u ? `<div class="note">اسم الدخول: <b class="num">${esc(u.user)}</b> — كلمة السر يغيّرها صاحب الحساب من الإعدادات عنده</div>` : `
    <label class="field"><span>اسم الدخول (إنجليزي أو أرقام)</span><input id="uu" class="num" style="text-align:right" autocapitalize="none"></label>
    <label class="field"><span>كلمة السر (6 على الأقل)</span><input id="up"></label>`}
    <label class="field"><span>الصلاحية</span><select id="ur" ${u && u.id === ME.id ? 'disabled' : ''}>
      <option value="view" ${u?.role !== 'acc' ? 'selected' : ''}>شريك — مشاهدة فقط</option>
      <option value="acc" ${u?.role === 'acc' ? 'selected' : ''}>محاسب — يسجّل ويعدّل</option></select></label>
    <div class="err" id="uerr"></div>
    <button class="btn btn-gold" onclick="saveUser('${id || ''}')">حفظ</button>
    ${u && u.id !== ME.id ? `<button class="btn btn-ghost" style="margin-top:8px;color:var(--red2)" onclick="delUser('${u.id}')">إيقاف الحساب ده</button>` : ''}`);
}
function saveUser(id) {
  once(async () => {
    const name = $('#un').value.trim(), role = $('#ur').value;
    if (!name) return $('#uerr').textContent = 'اكتب الاسم';
    if (id) { const data = id === ME.id ? { name } : { name, role }; updateDoc(doc(fs, 'users', id), data).catch(fail); closeM(); toast('تم الحفظ'); return }
    const user = $('#uu').value.trim().toLowerCase().replace(/\s+/g, ''), pass = $('#up').value;
    if (!/^[a-z0-9._-]+$/.test(user)) return $('#uerr').textContent = 'اسم الدخول حروف إنجليزي أو أرقام بس';
    if (pass.length < 6) return $('#uerr').textContent = 'كلمة السر 6 على الأقل';
    $('#uerr').textContent = 'جاري الإنشاء...';
    try {
      const sec = initializeApp(firebaseConfig, 'sec' + Date.now());
      const sa = getAuth(sec);
      const cr = await createUserWithEmailAndPassword(sa, toEmail(user), pass);
      await setDoc(doc(fs, 'users', cr.user.uid), { name, user, role });
      await signOut(sa);
      closeM(); toast('تم إنشاء الحساب');
    } catch (e) { console.error(e); $('#uerr').textContent = e.code === 'auth/email-already-in-use' ? 'اسم الدخول ده مستخدم قبل كده' : e.code === 'auth/network-request-failed' ? 'محتاج نت لإنشاء حساب' : 'حصلت مشكلة: ' + (e.code || '') }
  });
}
function delUser(id) { if (!confirm('إيقاف الحساب ده؟ صاحبه مش هيقدر يدخل تاني.')) return; deleteDoc(doc(fs, 'users', id)).catch(fail); closeM() }
function openPass() {
  sheet(`<h3>تغيير كلمة السر</h3>
    <label class="field"><span>كلمة السر الحالية</span><input id="po" type="password"></label>
    <label class="field"><span>كلمة السر الجديدة (6 على الأقل)</span><input id="pn" type="password"></label>
    <div class="err" id="perr"></div>
    <button class="btn btn-gold" onclick="savePass()">حفظ</button>`);
}
function savePass() {
  once(async () => {
    const o = $('#po').value, n = $('#pn').value;
    if (n.length < 6) return $('#perr').textContent = 'كلمة السر الجديدة 6 على الأقل';
    try { await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, o)); await updatePassword(auth.currentUser, n); closeM(); toast('تم تغيير كلمة السر') }
    catch (e) { $('#perr').textContent = 'كلمة السر الحالية غلط' }
  });
}

$('#lp').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() });
Object.assign(window, { doLogin, doSetup, logout, go, setQ, setFilter, openCustomerForm, saveCustomer, delCustomer, openMove, saveMove, delMove, sendWA, callC, closeM, openUser, saveUser, delUser, openPass, savePass, liveComma });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
