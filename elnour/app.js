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
const PAY = ['كاش في الخزنة', 'إنستاباي', 'فودافون كاش', 'اتصالات كاش', 'البريد'];
const mdesc = m => [m.method, m.note].filter(Boolean).join(' — ');
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
  ${wallets()}
  <div class="search"><input id="qbox" placeholder="ابحث باسم العميل أو رقمه" value="${esc(q)}" oninput="setQ(this.value)"></div>
  ${DB.customers.length ? `<button class="btn btn-ghost" style="margin-top:12px" onclick="sendAll()">📄 تقرير أرصدة كل العملاء (صورة)</button>` : ''}
  <div class="sec-t"><span>العملاء (${DB.customers.length})</span>
    <div class="chips">${[['all', 'الكل'], ['owe', 'عليهم فلوس'], ['clear', 'خالصين']].map(([k, l]) => `<span class="chip ${filter === k ? 'on' : ''}" onclick="setFilter('${k}')">${l}</span>`).join('')}</div></div>
  <div id="clist"></div>`;
  renderList();
}
const OUT = 'خرج برّه (مصروف / سحب)';
function walletBal(w) {
  return DB.moves.reduce((s, m) => {
    if (m.type === 'p' && (m.method || 'غير محدد') === w) return s + m.amt;
    if (m.type === 't') { if (m.to === w) s += m.amt; if (m.from === w) s -= m.amt }
    return s;
  }, 0);
}
function walletList() {
  return [...PAY, 'غير محدد'].filter(w => PAY.includes(w) || DB.moves.some(m => (m.type === 'p' && !m.method) || (m.type === 't' && (m.from === w || m.to === w))));
}
function wallets() {
  const mo = today().slice(0, 7);
  const list = walletList().map(w => ({ w, bal: walletBal(w), mon: DB.moves.filter(m => m.type === 'p' && (m.method || 'غير محدد') === w && m.date.startsWith(mo)).reduce((s, m) => s + m.amt, 0) }));
  return `<div class="sec-t"><span>الفلوس اللي في كل محفظة دلوقتي</span>${canEdit() ? `<span class="chip on" onclick="openTransfer()">⇄ تحويل / سحب</span>` : ''}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${list.map(x => `
    <div style="background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px">
      <small style="display:block;color:var(--muted)">${x.w}</small>
      <b class="num" style="display:block;font-size:20px;color:${x.bal < 0 ? 'var(--red2)' : 'var(--green)'};text-align:right">${fmt(x.bal)}</b>
      <small style="color:var(--muted)">اتحصّل الشهر ده: <span class="num">${fmt(x.mon)}</span></small></div>`).join('')}</div>`;
}
function openTransfer() {
  const ws = walletList(), opt = (arr, sel) => arr.map(w => `<option ${w === sel ? 'selected' : ''}>${w}</option>`).join('');
  sheet(`<h3>تحويل فلوس من محفظة</h3>
    <div class="note">مثلاً: سحبت فلوس الإنستاباي وحطيتها في الخزنة. الرقم هيتخصم من المحفظة الأولى ويتزوّد على التانية، ومش هيأثر على حسابات العملاء.</div>
    <label class="field"><span>من</span><select id="tf" onchange="trHint()">${opt(ws, ws.find(w => w !== PAY[0] && walletBal(w) > 0) || PAY[1])}</select></label>
    <label class="field"><span>إلى</span><select id="tt">${opt([...PAY, OUT], PAY[0])}</select></label>
    <label class="field"><span>المبلغ</span><input id="ta" inputmode="numeric" oninput="liveComma(this)" style="font-size:22px;font-weight:800"></label>
    <div class="note" id="thint"></div>
    <label class="field"><span>التاريخ</span><input id="tdt" type="date" value="${today()}"></label>
    <label class="field"><span>ملاحظة (اختياري)</span><input id="tn"></label>
    <button class="btn btn-gold" onclick="saveTransfer()">تسجيل</button>`);
  trHint();
}
function trHint() { const w = $('#tf').value, b = walletBal(w); $('#thint').innerHTML = `الموجود في ${esc(w)}: <b class="num">${fmt(b)}</b> ج — <span style="color:var(--gold);cursor:pointer" onclick="$('#ta').value='${fmt(Math.max(b, 0))}'">حوّل الكل</span>` }
function saveTransfer() {
  once(async () => {
    const from = $('#tf').value, to = $('#tt').value, amt = parseAmt($('#ta').value);
    if (from === to) return toast('اختار محفظتين مختلفين');
    if (amt <= 0) return toast('اكتب المبلغ');
    if (amt > walletBal(from) && !confirm('المبلغ أكبر من اللي في المحفظة. تسجّله برضه؟')) return;
    setDoc(doc(fs, 'moves', uid()), { type: 't', from, to, amt, date: $('#tdt').value || today(), note: $('#tn').value.trim(), by: ME.name, ts: Date.now() + '' }).catch(fail);
    closeM(); toast('تم التحويل');
  });
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
        <small>${dshow(m.date)}${mdesc(m) ? ' — ' + esc(mdesc(m)) : ''}</small>
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
    ${c ? '' : `<label class="field"><span>رصيد قديم عليه (لو في) — اختياري</span><input id="fo" inputmode="numeric" oninput="liveComma(this)" placeholder="0"></label>
    <label class="field"><span>تاريخ الرصيد القديم</span><input id="fod" type="date" value="${today()}" max="${today()}"></label>`}
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
        const o = parseAmt($('#fo').value), od = $('#fod').value || today();
        b.set(doc(fs, 'customers', id), { name, phone, note, created: o > 0 ? od : today() });
        if (o > 0) b.set(doc(fs, 'moves', uid()), { cid: id, type: 'd', amt: o, date: od, note: 'رصيد قديم', by: ME.name, ts: '0' });
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
    ${type === 'd' ? `<label class="field"><span>المبلغ</span><input id="ma" inputmode="numeric" oninput="liveComma(this)" style="font-size:22px;font-weight:800"></label>` : `
    <div class="field"><span>دفع كام في كل طريقة؟ (اكتب في اللي دفع بيه بس)</span>
      ${PAY.map((t, i) => `<div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <b style="flex:0 0 120px;font-size:15px">${t}</b>
        <input id="pa${i}" inputmode="numeric" oninput="liveComma(this);payTotal()" placeholder="0" style="flex:1;font-size:20px;font-weight:800"></div>`).join('')}
      <div class="note" style="margin-top:10px">إجمالي الدفعة: <b class="num" id="ptot" style="color:var(--green)">0</b> ج</div></div>`}
    <label class="field"><span>التاريخ</span><input id="md" type="date" value="${today()}"></label>
    <label class="field"><span>${type === 'd' ? 'البيان (أخد إيه؟)' : 'ملاحظة (اختياري)'}</span><input id="mn" placeholder="${type === 'd' ? 'مثلاً: 20 مفتاح خام + جهاز' : ''}"></label>
    <button class="btn ${type === 'd' ? 'btn-red' : 'btn-green'}" onclick="saveMove('${cid}','${type}')">تسجيل</button>`);
  setTimeout(() => $(type === 'd' ? '#ma' : '#pa0').focus(), 50);
}
function payTotal() { $('#ptot').textContent = fmt(PAY.reduce((s, _, i) => s + parseAmt($('#pa' + i).value), 0)) }
function saveMove(cid, type) {
  once(async () => {
    const date = $('#md').value || today(), note = $('#mn').value.trim(), ts = Date.now();
    if (type === 'd') {
      const amt = parseAmt($('#ma').value); if (amt <= 0) return toast('اكتب المبلغ');
      setDoc(doc(fs, 'moves', uid()), { cid, type, amt, date, note, by: ME.name, ts: ts + '' }).catch(fail);
      closeM(); return toast('تم تسجيل السحب');
    }
    const parts = PAY.map((method, i) => ({ method, amt: parseAmt($('#pa' + i).value) })).filter(x => x.amt > 0);
    if (!parts.length) return toast('اكتب المبلغ في طريقة دفع واحدة على الأقل');
    const b = writeBatch(fs), grp = parts.length > 1 ? uid() : null;
    parts.forEach((x, i) => b.set(doc(fs, 'moves', uid()), { cid, type, amt: x.amt, method: x.method, date, note, ...(grp ? { grp } : {}), by: ME.name, ts: (ts + i) + '' }));
    b.commit().catch(fail);
    closeM(); toast('تم تسجيل دفعة ' + fmt(parts.reduce((s, x) => s + x.amt, 0)) + ' ج');
  });
}
function delMove(id) { if (!confirm('متأكد إنك عايز تحذف الحركة دي؟')) return; deleteDoc(doc(fs, 'moves', id)).catch(fail) }

/* ====== كشف حساب واتساب (صورة بلوجو الشركة) ====== */
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src });
function fitText(ctx, t, w) { t = String(t || ''); if (ctx.measureText(t).width <= w) return t; while (t.length && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…' }
async function statementImage(c) {
  const b = balance(c.id), mv = DB.moves.filter(m => m.cid === c.id).sort(ord);
  let run = 0; const all = mv.map(m => { run += m.type === 'd' ? m.amt : -m.amt; return { ...m, run } });
  const MAX = 30, rows = all.slice(-MAX), cut = all.length > MAX;
  const td = mv.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), tp = mv.filter(m => m.type === 'p').reduce((s, m) => s + m.amt, 0);
  try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(w + ' 30px Cairo'))) } catch (e) { }
  const logo = await loadImg('logo.jpg').catch(() => null);
  const W = 1080, P = 50, RH = 64, F = 'Cairo, sans-serif';
  const logoH = logo ? Math.round((W - 2 * P - 380) * logo.height / logo.width) : 0;
  const top = P + Math.max(logoH, 0) + 75;
  const H = top + 150 + 230 + 70 + 20 + Math.max(rows.length, 1) * RH + (cut ? 50 : 0) + 230;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const GOLD = '#e7b53c', TXT = '#f4f1ea', MUT = '#9b978e', RED = '#ff4a52', GRN = '#2fbf71', LINE = '#2c2c31';
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = GOLD; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10);
  if (logo) x.drawImage(logo, (W - (W - 2 * P - 380)) / 2, P, W - 2 * P - 380, logoH);
  const T = (t, px, py, o = {}) => { x.font = `${o.w || 700} ${o.s || 30}px ${F}`; x.fillStyle = o.c || TXT; x.textAlign = o.a || 'right'; x.direction = o.ltr ? 'ltr' : 'rtl'; x.fillText(o.max ? fitText(x, t, o.max) : t, px, py) };
  let y = top;
  T('كشف حساب', W / 2, y, { a: 'center', s: 46, w: 800, c: GOLD }); y += 62;
  T(c.name, W / 2, y, { a: 'center', s: 38, w: 700, max: W - 2 * P }); y += 46;
  T(`بتاريخ ${dshow(today())}${c.phone ? '   •   ' + c.phone : ''}`, W / 2, y, { a: 'center', s: 26, w: 400, c: MUT }); y += 40;
  // البوكس الرئيسي
  x.fillStyle = '#17171a'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 200, 22); x.fill();
  T(b > 0 ? 'الرصيد المستحق عليكم' : b < 0 ? 'رصيد لكم عندنا' : 'الحساب خالص', W / 2, y + 50, { a: 'center', s: 28, c: MUT });
  T(fmt(Math.abs(b)) + ' ج', W / 2, y + 128, { a: 'center', s: 66, w: 800, c: b > 0 ? RED : b < 0 ? GRN : TXT });
  T(`إجمالي السحب ${fmt(td)}   •   إجمالي المدفوع ${fmt(tp)}`, W / 2, y + 178, { a: 'center', s: 22, w: 400, c: MUT });
  y += 230;
  // رأس الجدول
  const cols = { date: W - P - 20, note: W - P - 210, d: P + 380, p: P + 220, r: P + 20 };
  x.fillStyle = '#202024'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 58, 14); x.fill();
  [['التاريخ', cols.date, 'right'], ['البيان', cols.note, 'right'], ['سحب', cols.d, 'left'], ['دفعة', cols.p, 'left'], ['الرصيد', cols.r, 'left']]
    .forEach(([t, px, a]) => T(t, px, y + 39, { s: 24, c: GOLD, a }));
  y += 70;
  if (!rows.length) { T('لا توجد حركات', W / 2, y + 40, { a: 'center', s: 26, c: MUT }); y += RH }
  rows.forEach((m, i) => {
    if (i % 2) { x.fillStyle = '#121214'; x.fillRect(P, y, W - 2 * P, RH) }
    const cy = y + 42;
    T(dshow(m.date), cols.date, cy, { s: 24, w: 400, ltr: false });
    T(mdesc(m) || (m.type === 'd' ? 'سحب' : 'دفعة'), cols.note, cy, { s: 24, w: 400, max: cols.note - (cols.d + 150) });
    T(m.type === 'd' ? fmt(m.amt) : '', cols.d, cy, { a: 'left', s: 26, c: RED, ltr: true });
    T(m.type === 'p' ? fmt(m.amt) : '', cols.p, cy, { a: 'left', s: 26, c: GRN, ltr: true });
    T(fmt(m.run), cols.r, cy, { a: 'left', s: 26, ltr: true });
    x.fillStyle = LINE; x.fillRect(P, y + RH - 1, W - 2 * P, 1);
    y += RH;
  });
  if (cut) { T(`(آخر ${MAX} حركة من ${all.length})`, W / 2, y + 36, { a: 'center', s: 22, c: MUT }); y += 50 }
  y += 70;
  T('شكراً لتعاملكم معنا', W / 2, y, { a: 'center', s: 32, w: 700, c: GOLD }); y += 50;
  T('شركة النور والفتح', W / 2, y, { a: 'center', s: 26, w: 400, c: MUT });
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
async function allImage() {
  const list = DB.customers.map(c => {
    const ms = DB.moves.filter(m => m.cid === c.id);
    const d = ms.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), p = ms.filter(m => m.type === 'p').reduce((s, m) => s + m.amt, 0);
    return { name: c.name, d, p, bal: d - p };
  }).sort((a, b) => b.bal - a.bal);
  const owe = list.filter(x => x.bal > 0), tot = owe.reduce((s, x) => s + x.bal, 0);
  const TD = list.reduce((s, x) => s + x.d, 0), TP = list.reduce((s, x) => s + x.p, 0);
  try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(w + ' 30px Cairo'))) } catch (e) { }
  const logo = await loadImg('logo.jpg').catch(() => null);
  const W = 1080, P = 50, RH = 60, F = 'Cairo, sans-serif';
  const lw = W - 2 * P - 380, logoH = logo ? Math.round(lw * logo.height / logo.width) : 0;
  const top = P + logoH + 75;
  const H = top + 120 + 230 + 70 + list.length * RH + 90 + 160;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const GOLD = '#e7b53c', TXT = '#f4f1ea', MUT = '#9b978e', RED = '#ff4a52', GRN = '#2fbf71', LINE = '#2c2c31';
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = GOLD; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10);
  if (logo) x.drawImage(logo, (W - lw) / 2, P, lw, logoH);
  const T = (t, px, py, o = {}) => { x.font = `${o.w || 700} ${o.s || 30}px ${F}`; x.fillStyle = o.c || TXT; x.textAlign = o.a || 'right'; x.direction = 'rtl'; x.fillText(o.max ? fitText(x, t, o.max) : t, px, py) };
  let y = top;
  T('تقرير أرصدة العملاء', W / 2, y, { a: 'center', s: 46, w: 800, c: GOLD }); y += 50;
  T(`بتاريخ ${dshow(today())}   •   ${list.length} عميل`, W / 2, y, { a: 'center', s: 26, w: 400, c: MUT }); y += 40;
  x.fillStyle = '#17171a'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 200, 22); x.fill();
  T('إجمالي الفلوس اللي برّه', W / 2, y + 50, { a: 'center', s: 28, c: MUT });
  T(fmt(tot) + ' ج', W / 2, y + 128, { a: 'center', s: 66, w: 800, c: RED });
  T(`${owe.length} عميل عليهم فلوس   •   إجمالي السحب ${fmt(TD)}   •   إجمالي المدفوع ${fmt(TP)}`, W / 2, y + 178, { a: 'center', s: 21, w: 400, c: MUT });
  y += 230;
  const cols = { n: W - P - 20, name: W - P - 80, d: P + 420, p: P + 230, r: P + 20 };
  x.fillStyle = '#202024'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 58, 14); x.fill();
  [['#', cols.n, 'right'], ['العميل', cols.name, 'right'], ['السحب', cols.d, 'left'], ['المدفوع', cols.p, 'left'], ['الرصيد', cols.r, 'left']].forEach(([t, px, a]) => T(t, px, y + 39, { s: 24, c: GOLD, a }));
  y += 70;
  list.forEach((c, i) => {
    if (i % 2) { x.fillStyle = '#121214'; x.fillRect(P, y, W - 2 * P, RH) }
    const cy = y + 40;
    T(String(i + 1), cols.n, cy, { s: 22, w: 400, c: MUT });
    T(c.name, cols.name, cy, { s: 25, w: 700, max: cols.name - (cols.d + 150) });
    T(fmt(c.d), cols.d, cy, { a: 'left', s: 24, w: 400, c: MUT });
    T(fmt(c.p), cols.p, cy, { a: 'left', s: 24, w: 400, c: GRN });
    T(fmt(Math.abs(c.bal)) + (c.bal < 0 ? ' ليه' : ''), cols.r, cy, { a: 'left', s: 26, c: c.bal > 0 ? RED : c.bal < 0 ? GRN : MUT });
    x.fillStyle = LINE; x.fillRect(P, y + RH - 1, W - 2 * P, 1);
    y += RH;
  });
  x.fillStyle = '#202024'; x.beginPath(); x.roundRect(P, y + 10, W - 2 * P, 62, 14); x.fill();
  T('الإجمالي', cols.name, y + 52, { s: 26, c: GOLD });
  T(fmt(TD), cols.d, y + 52, { a: 'left', s: 24, c: TXT });
  T(fmt(TP), cols.p, y + 52, { a: 'left', s: 24, c: GRN });
  T(fmt(TD - TP), cols.r, y + 52, { a: 'left', s: 26, w: 800, c: RED });
  y += 150;
  T('شركة النور والفتح', W / 2, y, { a: 'center', s: 28, w: 700, c: GOLD });
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
async function shareImage(blob, name, ph) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }) } catch (e) { if (e.name !== 'AbortError') toast('ماقدرتش أفتح المشاركة') }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('الصورة نزلت');
  if (ph) window.open('https://wa.me/' + ph, '_blank');
}
function sendAll() {
  once(async () => {
    toast('بيتجهّز التقرير...');
    let blob; try { blob = await allImage() } catch (e) { console.error(e); return toast('حصلت مشكلة في تجهيز التقرير') }
    await shareImage(blob, `تقرير أرصدة العملاء ${today()}.png`);
  });
}
function sendWA(cid) {
  once(async () => {
    const c = DB.customers.find(x => x.id === cid); if (!c) return;
    toast('بيتجهّز كشف الحساب...');
    let blob; try { blob = await statementImage(c) } catch (e) { console.error(e); return toast('حصلت مشكلة في تجهيز الصورة') }
    const file = new File([blob], `كشف حساب - ${c.name}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }) } catch (e) { if (e.name !== 'AbortError') toast('ماقدرتش أفتح المشاركة') }
      return;
    }
    // الكمبيوتر: نزّل الصورة وافتح واتساب على رقم العميل
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    let ph = (c.phone || '').replace(/\D/g, ''); if (ph.startsWith('0')) ph = '2' + ph;
    toast('الصورة نزلت — ابعتها في الشات');
    if (ph) window.open('https://wa.me/' + ph, '_blank');
  });
}

/* ====== كل الحركات ====== */
function viewLog() {
  const mv = [...DB.moves].sort(ord).reverse().slice(0, 300);
  const name = id => DB.customers.find(c => c.id === id)?.name || '—';
  $('#view').innerHTML = `<div class="sec-t" style="margin-top:18px"><span>كل الحركات (آخر 300)</span></div>
  ${mv.length ? mv.map(m => m.type === 't' ? `<div class="mv">
    <div class="dot" style="background:var(--card2);color:var(--gold)">⇄</div>
    <div class="i"><b>${m.to === OUT ? 'سحب من ' + esc(m.from) : 'تحويل: ' + esc(m.from) + ' ← ' + esc(m.to)}</b><small>${dshow(m.date)}${m.note ? ' — ' + esc(m.note) : ''}</small><small>سجّلها: ${esc(m.by)}</small>
      ${canEdit() ? `<button class="x" onclick="delMove('${m.id}')">حذف</button>` : ''}</div>
    <div class="a"><span class="num" style="color:var(--gold)">${fmt(m.amt)}</span></div></div>` : `<div class="mv" onclick="go('cust','${m.cid}')" style="cursor:pointer">
    <div class="dot ${m.type}">${m.type === 'd' ? '＋' : '－'}</div>
    <div class="i"><b>${esc(name(m.cid))}</b><small>${m.type === 'd' ? 'سحب' : 'دفعة'} — ${dshow(m.date)}${mdesc(m) ? ' — ' + esc(mdesc(m)) : ''}</small><small>سجّلها: ${esc(m.by)}</small></div>
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

Object.assign(window, { doLogin, logout, go, setQ, setFilter, openCustomerForm, saveCustomer, delCustomer, openMove, saveMove, delMove, sendWA, callC, closeM, liveComma, openMember, saveMember, delMember, payTotal, openTransfer, trHint, saveTransfer, sendAll });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
