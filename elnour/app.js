import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ====== إعدادات مشروع Firebase الخاص بالنور والفتح ====== */
const firebaseConfig = {
  apiKey: "AIzaSyCwi-TlAeyCXV9APKNApt8q90szWXLGlIM",
  authDomain: "elnour-elfath.firebaseapp.com",
  projectId: "elnour-elfath",
  storageBucket: "elnour-elfath.firebasestorage.app",
  messagingSenderId: "927844663367",
  appId: "1:927844663367:web:91e1cebadcc10a60d3b162"
};
if (!firebaseConfig.apiKey) { document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px;font-family:Cairo,sans-serif;color:#e7b53c"><div><img src="logo.jpg" style="max-width:280px;width:100%;border-radius:12px"><p style="margin-top:16px">البرنامج بيتجهّز — قريب جداً</p></div></div>'; throw new Error('no config'); }
/* ====== أصحاب البرنامج (يدخلوا دايماً ويضيفوا مستخدمين) ====== */
const OWNERS = ['diaakhan84@gmail.com', 'yousefabod10@gmail.com'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

/* ====== حالة البرنامج ====== */
let DB = { customers: [], moves: [], members: [] };
let ME = null, unsubs = [];
let route = { v: 'home' }, filter = 'all', q = '';

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) };
const dshow = d => { const [y, m, dd] = d.split('-'); return `${+dd}/${+m}/${y}` };
const canEdit = () => ME && (ME.role === 'owner' || ME.role === 'acc');
const isOwner = () => ME && ME.role === 'owner';
const ROLES = { owner: 'صاحب البرنامج', acc: 'يسجّل ويعدّل', view: 'مشاهدة بس' };
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2000) }
function parseAmt(v) { return Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '')) || 0 }
function liveComma(el) { const p = parseAmt(el.value); el.value = p ? fmt(p) : '' }
function balance(cid) { return DB.moves.filter(m => m.cid === cid).reduce((s, m) => s + (m.type === 'd' ? m.amt : -m.amt), 0) }
const ord = (a, b) => (a.date + a.ts).localeCompare(b.date + b.ts);
function lastMove(cid) { return DB.moves.filter(m => m.cid === cid).sort(ord).pop() }
function fail(e) { console.error(e); toast(e && e.code === 'permission-denied' ? 'مش مسموحلك بالعملية دي' : 'حصلت مشكلة، جرّب تاني') }

/* ====== الدخول بحساب Gmail ====== */
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
async function doLogin() {
  $('#lerr').textContent = 'جاري الدخول...';
  try { await signInWithPopup(auth, provider) }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return signInWithRedirect(auth, provider);
    $('#lerr').textContent = e.code === 'auth/network-request-failed' ? 'مفيش إنترنت — أول دخول محتاج نت' : e.code === 'auth/popup-closed-by-user' ? '' : 'حصلت مشكلة: ' + (e.code || '');
  }
}
getRedirectResult(auth).catch(e => { $('#lerr').textContent = 'حصلت مشكلة: ' + (e.code || '') });
async function logout() { unsubs.forEach(f => f()); unsubs = []; ME = null; await signOut(auth); location.reload() }

function denied(msg) {
  unsubs.forEach(f => f()); unsubs = []; ME = null; signOut(auth);
  $('#app').classList.add('hidden'); $('#splash').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#lerr').textContent = msg;
}
onAuthStateChanged(auth, async user => {
  if (!user) { $('#splash').classList.add('hidden'); $('#login').classList.remove('hidden'); return }
  const email = (user.email || '').toLowerCase();
  if (OWNERS.includes(email)) { ME = { id: user.uid, name: user.displayName || email, email, role: 'owner' }; start(); return }
  unsubs.push(onSnapshot(doc(fs, 'members', email), s => {
    if (!s.exists()) return denied('الإيميل ده (' + email + ') مش مسموحله يدخل البرنامج');
    const first = !ME; ME = { id: user.uid, email, ...s.data(), name: s.data().name || user.displayName || email };
    if (first) start(); else { $('#who').textContent = whoText(); render() }
  }, e => denied('الإيميل ده (' + email + ') مش مسموحله يدخل البرنامج')));
});
const whoText = () => ME.name + ' — ' + ROLES[ME.role];
function start() {
  $('#splash').classList.add('hidden'); $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#who').textContent = whoText();
  const live = (name, key) => unsubs.push(onSnapshot(collection(fs, name), snap => {
    DB[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    $('#sync').textContent = snap.metadata.fromCache && !navigator.onLine ? '● بدون نت — هيتزامن لما النت يرجع' : '';
    render();
  }, fail));
  live('customers', 'customers'); live('moves', 'moves');
  if (isOwner()) live('members', 'members');
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
  <div class="cbox"><img src="logo.jpg" style="width:100%;max-width:280px;border-radius:12px">
    <div style="margin-top:8px"><b>${esc(ME.name)}</b> — ${ROLES[ME.role]}</div>
    <div class="num" style="color:var(--muted);font-size:13px">${esc(ME.email)}</div></div>
  ${isOwner() ? `<div class="sec-t"><span>المستخدمين (${DB.members.length})</span><span class="chip on" onclick="openMember()">＋ إضافة مستخدم</span></div>
  ${DB.members.length ? DB.members.map(m => `<div class="list-item"><div class="av" style="width:36px;height:36px">${esc((m.name || m.id)[0])}</div>
    <div class="f"><b>${esc(m.name || '—')}</b><small class="num" style="text-align:right">${esc(m.id)}</small></div>
    <span class="badge">${ROLES[m.role] || ''}</span>
    <button class="iconbtn" onclick="openMember('${esc(m.id)}')">تعديل</button></div>`).join('') : '<div class="empty">مفيش مستخدمين غيرك. دوس «إضافة مستخدم» وحط إيميل Gmail بتاعه.</div>'}` : ''}
  <button class="btn btn-ghost" style="margin-top:12px" onclick="logout()">تسجيل خروج</button>`;
}
function openMember(id) {
  const m = id ? DB.members.find(x => x.id === id) : null;
  sheet(`<h3>${m ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3>
    <label class="field"><span>الاسم</span><input id="mbn" value="${esc(m?.name || '')}"></label>
    ${m ? `<div class="note">الإيميل: <b class="num">${esc(m.id)}</b></div>` : `<label class="field"><span>إيميل Gmail بتاعه</span><input id="mbe" type="email" inputmode="email" class="num" style="text-align:left;direction:ltr" autocapitalize="none" placeholder="name@gmail.com"></label>`}
    <label class="field"><span>الصلاحية</span><select id="mbr">
      <option value="view" ${m?.role !== 'acc' ? 'selected' : ''}>مشاهدة بس</option>
      <option value="acc" ${m?.role === 'acc' ? 'selected' : ''}>يسجّل ويعدّل</option></select></label>
    <div class="err" id="mberr"></div>
    <button class="btn btn-gold" onclick="saveMember('${m ? esc(m.id) : ''}')">حفظ</button>
    ${m ? `<button class="btn btn-ghost" style="margin-top:8px;color:var(--red2)" onclick="delMember('${esc(m.id)}')">شيل المستخدم ده</button>` : ''}`);
}
function saveMember(id) {
  once(async () => {
    const name = $('#mbn').value.trim(), role = $('#mbr').value;
    if (!name) return $('#mberr').textContent = 'اكتب الاسم';
    let email = id;
    if (!id) {
      email = $('#mbe').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return $('#mberr').textContent = 'اكتب إيميل صحيح';
      if (OWNERS.includes(email)) return $('#mberr').textContent = 'الإيميل ده صاحب البرنامج أصلاً';
      if (DB.members.some(x => x.id === email)) return $('#mberr').textContent = 'الإيميل ده متضاف قبل كده';
    }
    setDoc(doc(fs, 'members', email), { name, role, by: ME.email, at: Date.now() }).catch(fail);
    closeM(); toast(id ? 'تم الحفظ' : 'تمت الإضافة — يقدر يدخل بإيميله دلوقتي');
  });
}
function delMember(id) { if (!confirm('متأكد؟ المستخدم ده مش هيقدر يدخل تاني.')) return; deleteDoc(doc(fs, 'members', id)).catch(fail); closeM() }

Object.assign(window, { doLogin, logout, go, setQ, setFilter, openCustomerForm, saveCustomer, delCustomer, openMove, saveMove, delMove, sendWA, callC, closeM, liveComma, openMember, saveMember, delMember });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
