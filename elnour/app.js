import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, increment, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
let DB = { customers: [], moves: [], members: [], items: [], invoices: [] };
let ME = null, unsubs = [];
let route = { v: 'home' }, filter = 'all', q = '', HIST = [];

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
const MT = { d: 'سحب بضاعة / فلوس', p: 'دفعة', x: 'خصم', r: 'مرتجع بضاعة', s: 'بيع كاش (عميل نقدي)', o: 'رد فلوس مرتجع' };
const MCOL = { d: 'var(--red2)', p: 'var(--green)', x: 'var(--gold2)', r: 'var(--blue)', s: 'var(--green)', o: 'var(--red2)' };
const DOT = { d: '＋', p: '－', x: '٪', r: '↩', s: '＋', o: '－' };
const ROLES = { owner: 'صاحب البرنامج', acc: 'يسجّل ويعدّل', view: 'مشاهدة بس' };
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2000) }
function parseAmt(v) { return Number(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/[,،\s]/g, '')) || 0 }
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
  const live = (name, key, quiet) => unsubs.push(onSnapshot(collection(fs, name), snap => {
    DB[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    $('#sync').textContent = snap.metadata.fromCache && !navigator.onLine ? '● بدون نت — هيتزامن لما النت يرجع' : '';
    render();
  }, quiet ? e => console.warn(name, e) : fail));
  live('customers', 'customers'); live('moves', 'moves'); live('items', 'items', 1); live('invoices', 'invoices', 1);
  if (isOwner()) live('members', 'members');
  go('home');
}

/* ====== التنقل ====== */
const TAB_OF = { cust: 'home', inv: 'invs', newinv: 'invs' };
const FAB = { home: ['＋ عميل جديد', () => openCustomerForm()], items: ['＋ صنف جديد', () => openItem()], invs: ['＋ فاتورة بيع', () => newInv('sale')] };
function go(v, arg, replace) {
  if (!replace && (route.v !== v || route.arg !== arg)) HIST.push(route);
  route = { v, arg }; $('#view').innerHTML = ''; render(); window.scrollTo(0, 0);
}
function tab(v) { if (route.v === 'newinv' && !leaveEditor()) return; HIST = []; go(v, undefined, true) }
function back() {
  if (route.v === 'newinv' && !leaveEditor()) return;
  let r = HIST.pop(); while (r && r.v === 'newinv') r = HIST.pop();
  route = r || { v: 'home' }; $('#view').innerHTML = ''; render(); window.scrollTo(0, 0);
}
function fabAct() { FAB[route.v] && FAB[route.v][1]() }
function render() {
  if (!ME) return;
  const t = TAB_OF[route.v] || route.v;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#backBtn').classList.toggle('hidden', !TAB_OF[route.v]);
  const f = FAB[route.v]; $('#fab').classList.toggle('hidden', !(f && canEdit())); if (f) $('#fab').textContent = f[0];
  const foc = document.activeElement && document.activeElement.id;
  if (route.v === 'home' && foc === 'qbox') return renderList();
  if (route.v === 'items' && foc === 'iqbox') return renderItems();
  if (route.v === 'invs' && foc === 'vqbox') return renderInvs();
  if (route.v === 'newinv' && $('#invEd')) return; // متقاطعش الفاتورة وهي بتتكتب
  ({ home: viewHome, cust: viewCust, log: viewLog, more: viewMore, items: viewItems, invs: viewInvs, inv: viewInv, newinv: viewNewInv })[route.v]();
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
    if ((m.type === 'p' || m.type === 's') && (m.method || 'غير محدد') === w) return s + m.amt;
    if (m.type === 'o' && (m.method || 'غير محدد') === w) return s - m.amt;
    if (m.type === 't') { if (m.to === w) s += m.amt; if (m.from === w) s -= m.amt }
    return s;
  }, 0);
}
function walletList() {
  return [...PAY, 'غير محدد'].filter(w => PAY.includes(w) || DB.moves.some(m => ((m.type === 'p' || m.type === 's' || m.type === 'o') && !m.method) || (m.type === 't' && (m.from === w || m.to === w))));
}
function wallets() {
  const mo = today().slice(0, 7);
  const list = walletList().map(w => ({ w, bal: walletBal(w), mon: DB.moves.filter(m => (m.type === 'p' || m.type === 's') && (m.method || 'غير محدد') === w && m.date.startsWith(mo)).reduce((s, m) => s + m.amt, 0) }));
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
  const td = mv.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), tp = mv.filter(m => m.type === 'p').reduce((s, m) => s + m.amt, 0), tx = mv.filter(m => m.type === 'x').reduce((s, m) => s + m.amt, 0), tr = mv.filter(m => m.type === 'r').reduce((s, m) => s + m.amt, 0);
  const nInv = DB.invoices.filter(v => v.cid === c.id).length;
  $('#view').innerHTML = `
  <div class="cbox">
    <div class="nm">${esc(c.name)}</div>
    <div class="ph num">${esc(c.phone || 'بدون رقم')}</div>
    <div class="bl ${b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero'}"><span class="num">${fmt(Math.abs(b))}</span> <span style="font-size:18px">ج</span></div>
    <small style="color:var(--muted)">${b > 0 ? 'الرصيد اللي عليه' : b < 0 ? 'ليه عندنا (دافع زيادة)' : 'خالص — مفيش عليه حاجة'}</small>
    ${c.note ? `<div style="color:var(--muted);font-size:13px;margin-top:6px">${esc(c.note)}</div>` : ''}
    <div class="stats" style="margin-top:14px;grid-template-columns:repeat(${2 + !!tx + !!tr},1fr)">
      <div class="stat"><b class="num pos">${fmt(td)}</b><small>إجمالي اللي أخده</small></div>
      <div class="stat"><b class="num" style="color:var(--green)">${fmt(tp)}</b><small>إجمالي اللي دفعه</small></div>
      ${tx ? `<div class="stat"><b class="num" style="color:var(--gold2)">${fmt(tx)}</b><small>إجمالي الخصومات</small></div>` : ''}
      ${tr ? `<div class="stat"><b class="num" style="color:var(--blue)">${fmt(tr)}</b><small>إجمالي المرتجع</small></div>` : ''}
    </div>
    ${canEdit() ? `<div class="acts">
      <button class="btn btn-gold" onclick="newInv('sale',{cid:'${c.id}'})">🧾 فاتورة بيع</button>
      <button class="btn btn-ghost" style="color:var(--blue)" onclick="newInv('ret',{cid:'${c.id}'})">↩ مرتجع</button>
    </div>
    <div class="acts" style="margin-top:8px">
      <button class="btn btn-red" onclick="openMove('${c.id}','d')">＋ سحب جديد (يزوّد)</button>
      <button class="btn btn-green" onclick="openMove('${c.id}','p')">－ دفعة (تقلّل)</button>
    </div>
    <button class="btn btn-ghost" style="margin-top:8px;color:var(--gold2);border-color:#4a3a14" onclick="openDiscount('${c.id}')">٪ عمل خصم للعميل</button>` : ''}
    <div class="acts2">
      <button class="btn btn-ghost" onclick="sendWA('${c.id}')">كشف حساب واتساب</button>
      ${canEdit() ? `<button class="btn btn-ghost" onclick="openCustomerForm('${c.id}')">تعديل بيانات العميل</button>` : `<button class="btn btn-ghost" onclick="callC('${c.id}')">اتصال</button>`}
    </div>
    ${nInv ? `<button class="btn btn-ghost" style="margin-top:8px" onclick="custInvs('${c.id}')">🧾 فواتير العميل وعروض الأسعار (${nInv})</button>` : ''}
  </div>
  <div class="sec-t"><span>سجل الحركات (${mv.length})</span></div>
  ${rows.length ? rows.map(m => `
    <div class="mv">
      <div class="dot ${m.type}">${DOT[m.type]}</div>
      <div class="i"><b>${m.inv && m.type === 'd' ? 'فاتورة بيع' : MT[m.type]}</b>
        <small>${dshow(m.date)}${mdesc(m) ? ' — ' + esc(mdesc(m)) : ''}</small>
        <small>سجّلها: ${esc(m.by)}</small>
        ${m.inv ? `<button class="x" style="color:var(--gold)" onclick="go('inv','${m.inv}')">عرض الفاتورة ←</button>` : canEdit() ? `<button class="x" onclick="delMove('${m.id}')">حذف الحركة</button>` : ''}</div>
      <div class="a"><span class="num" style="color:${MCOL[m.type]}">${m.type === 'd' ? '+' : '−'}${fmt(m.amt)}</span>
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
function openDiscount(cid) {
  const c = DB.customers.find(x => x.id === cid), b = balance(cid);
  sheet(`<h3>خصم لـ ${esc(c.name)}</h3>
    <div class="note">الرصيد الحالي: <b class="num">${fmt(b)}</b> ج — الخصم هيتطرح من رصيده، ومش هيدخل أي محفظة (لأنه مش فلوس اتحصّلت).</div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:2"><span>مبلغ الخصم</span><input id="xa" inputmode="numeric" oninput="liveComma(this);$('#xp').value='';discHint()" style="font-size:22px;font-weight:800"></label>
      <label class="field" style="flex:1"><span>أو نسبة ٪</span><input id="xp" inputmode="decimal" placeholder="مثلاً 10" oninput="discPct(${b})" style="font-size:22px;font-weight:800"></label>
    </div>
    <div class="note" id="xh">الرصيد بعد الخصم: <b class="num">${fmt(b)}</b> ج</div>
    <label class="field"><span>التاريخ</span><input id="xd" type="date" value="${today()}"></label>
    <label class="field"><span>سبب الخصم (اختياري)</span><input id="xn" placeholder="مثلاً: خصم تسوية حساب"></label>
    <button class="btn btn-gold" onclick="saveDiscount('${cid}')">تسجيل الخصم</button>`);
  $('#xa').dataset.b = b;
  setTimeout(() => $('#xa').focus(), 50);
}
function discPct(b) { const p = parseAmt($('#xp').value); $('#xa').value = p > 0 && b > 0 ? fmt(b * p / 100) : ''; discHint() }
function discHint() { const b = +$('#xa').dataset.b, a = parseAmt($('#xa').value); $('#xh').innerHTML = `الرصيد بعد الخصم: <b class="num">${fmt(b - a)}</b> ج` }
function saveDiscount(cid) {
  once(async () => {
    const amt = Math.round(parseAmt($('#xa').value)); if (amt <= 0) return toast('اكتب مبلغ الخصم');
    const b = balance(cid);
    if (amt > b && !confirm('الخصم أكبر من الرصيد اللي عليه، والعميل هيبقى ليه فلوس عندكم. تسجّله برضه؟')) return;
    const p = parseAmt($('#xp').value), n = $('#xn').value.trim();
    const note = [p > 0 ? `خصم ${p}٪` : '', n].filter(Boolean).join(' — ');
    setDoc(doc(fs, 'moves', uid()), { cid, type: 'x', amt, date: $('#xd').value || today(), note, by: ME.name, ts: Date.now() + '' }).catch(fail);
    closeM(); toast('تم تسجيل خصم ' + fmt(amt) + ' ج');
  });
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
function delMove(id) {
  const m = DB.moves.find(x => x.id === id);
  if (m && m.inv) return toast('الحركة دي تبع فاتورة — افتح الفاتورة وعدّلها أو احذفها');
  if (!confirm('متأكد إنك عايز تحذف الحركة دي؟')) return; deleteDoc(doc(fs, 'moves', id)).catch(fail)
}

/* ====== كشف حساب واتساب (صورة بلوجو الشركة) ====== */
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src });
function fitText(ctx, t, w) { t = String(t || ''); if (ctx.measureText(t).width <= w) return t; while (t.length && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…' }
async function statementImage(c) {
  const b = balance(c.id), mv = DB.moves.filter(m => m.cid === c.id).sort(ord);
  let run = 0; const all = mv.map(m => { run += m.type === 'd' ? m.amt : -m.amt; return { ...m, run } });
  const MAX = 30, rows = all.slice(-MAX), cut = all.length > MAX;
  const td = mv.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), tp = mv.filter(m => m.type === 'p').reduce((s, m) => s + m.amt, 0), tx = mv.filter(m => m.type === 'x').reduce((s, m) => s + m.amt, 0), tr = mv.filter(m => m.type === 'r').reduce((s, m) => s + m.amt, 0);
  try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(w + ' 30px Cairo'))) } catch (e) { }
  const logo = await loadImg('logo.jpg').catch(() => null);
  const W = 1080, P = 50, RH = 64, F = 'Cairo, sans-serif';
  const lw = logo ? Math.min(W - 2 * P - 380, 340 * logo.width / logo.height) : 0, logoH = logo ? Math.round(lw * logo.height / logo.width) : 0;
  const top = P + Math.max(logoH, 0) + 75;
  const H = top + 150 + 230 + 70 + 20 + Math.max(rows.length, 1) * RH + (cut ? 50 : 0) + 230;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const GOLD = '#e7b53c', TXT = '#f4f1ea', MUT = '#9b978e', RED = '#ff4a52', GRN = '#2fbf71', LINE = '#2c2c31';
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = GOLD; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10);
  if (logo) x.drawImage(logo, (W - lw) / 2, P, lw, logoH);
  const T = (t, px, py, o = {}) => { x.font = `${o.w || 700} ${o.s || 30}px ${F}`; x.fillStyle = o.c || TXT; x.textAlign = o.a || 'right'; x.direction = o.ltr ? 'ltr' : 'rtl'; x.fillText(o.max ? fitText(x, t, o.max) : t, px, py) };
  let y = top;
  T('كشف حساب', W / 2, y, { a: 'center', s: 46, w: 800, c: GOLD }); y += 62;
  T(c.name, W / 2, y, { a: 'center', s: 38, w: 700, max: W - 2 * P }); y += 46;
  T(`بتاريخ ${dshow(today())}${c.phone ? '   •   ' + c.phone : ''}`, W / 2, y, { a: 'center', s: 26, w: 400, c: MUT }); y += 40;
  // البوكس الرئيسي
  x.fillStyle = '#17171a'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 200, 22); x.fill();
  T(b > 0 ? 'الرصيد المستحق عليكم' : b < 0 ? 'رصيد لكم عندنا' : 'الحساب خالص', W / 2, y + 50, { a: 'center', s: 28, c: MUT });
  T(fmt(Math.abs(b)) + ' ج', W / 2, y + 128, { a: 'center', s: 66, w: 800, c: b > 0 ? RED : b < 0 ? GRN : TXT });
  T(`إجمالي السحب ${fmt(td)}   •   إجمالي المدفوع ${fmt(tp)}${tx ? '   •   الخصومات ' + fmt(tx) : ''}${tr ? '   •   المرتجع ' + fmt(tr) : ''}`, W / 2, y + 178, { a: 'center', s: 22, w: 400, c: MUT });
  y += 230;
  // رأس الجدول
  const cols = { date: W - P - 20, note: W - P - 210, d: P + 380, p: P + 220, r: P + 20 };
  x.fillStyle = '#202024'; x.beginPath(); x.roundRect(P, y, W - 2 * P, 58, 14); x.fill();
  [['التاريخ', cols.date, 'right'], ['البيان', cols.note, 'right'], ['سحب', cols.d, 'left'], ['دفعة / مرتجع', cols.p, 'left'], ['الرصيد', cols.r, 'left']]
    .forEach(([t, px, a]) => T(t, px, y + 39, { s: 24, c: GOLD, a }));
  y += 70;
  if (!rows.length) { T('لا توجد حركات', W / 2, y + 40, { a: 'center', s: 26, c: MUT }); y += RH }
  rows.forEach((m, i) => {
    if (i % 2) { x.fillStyle = '#121214'; x.fillRect(P, y, W - 2 * P, RH) }
    const cy = y + 42;
    T(dshow(m.date), cols.date, cy, { s: 24, w: 400, ltr: false });
    T(m.type === 'x' ? ['خصم', m.note].filter(Boolean).join(' — ') : mdesc(m) || (m.type === 'd' ? 'سحب' : m.type === 'r' ? 'مرتجع' : 'دفعة'), cols.note, cy, { s: 24, w: 400, max: cols.note - (cols.d + 150) });
    T(m.type === 'd' ? fmt(m.amt) : '', cols.d, cy, { a: 'left', s: 26, c: RED, ltr: true });
    T(m.type !== 'd' ? fmt(m.amt) : '', cols.p, cy, { a: 'left', s: 26, c: m.type === 'x' ? GOLD : m.type === 'r' ? '#7fb3ff' : GRN, ltr: true });
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
    const d = ms.filter(m => m.type === 'd').reduce((s, m) => s + m.amt, 0), p = ms.filter(m => m.type === 'p' || m.type === 'x' || m.type === 'r').reduce((s, m) => s + m.amt, 0);
    return { name: c.name, d, p, bal: d - p };
  }).sort((a, b) => b.bal - a.bal);
  const owe = list.filter(x => x.bal > 0), tot = owe.reduce((s, x) => s + x.bal, 0);
  const TD = list.reduce((s, x) => s + x.d, 0), TP = list.reduce((s, x) => s + x.p, 0);
  try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(w + ' 30px Cairo'))) } catch (e) { }
  const logo = await loadImg('logo.jpg').catch(() => null);
  const W = 1080, P = 50, RH = 60, F = 'Cairo, sans-serif';
  const lw = logo ? Math.min(W - 2 * P - 380, 340 * logo.width / logo.height) : 0, logoH = logo ? Math.round(lw * logo.height / logo.width) : 0;
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
  [['#', cols.n, 'right'], ['العميل', cols.name, 'right'], ['السحب', cols.d, 'left'], ['المدفوع والخصم والمرتجع', cols.p, 'left'], ['الرصيد', cols.r, 'left']].forEach(([t, px, a]) => T(t, px, y + 39, { s: 24, c: GOLD, a }));
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
  ph = (ph || '').replace(/\D/g, ''); if (ph.startsWith('0')) ph = '2' + ph;
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
    <div class="a"><span class="num" style="color:var(--gold)">${fmt(m.amt)}</span></div></div>` : !m.cid ? `<div class="mv" onclick="go('inv','${m.inv}')" style="cursor:pointer">
    <div class="dot ${m.type}">${DOT[m.type]}</div>
    <div class="i"><b>${MT[m.type]}</b><small>${dshow(m.date)}${mdesc(m) ? ' — ' + esc(mdesc(m)) : ''}</small><small>سجّلها: ${esc(m.by)}</small></div>
    <div class="a"><span class="num" style="color:${MCOL[m.type]}">${m.type === 's' ? '+' : '−'}${fmt(m.amt)}</span></div></div>` : `<div class="mv" onclick="go('cust','${m.cid}')" style="cursor:pointer">
    <div class="dot ${m.type}">${DOT[m.type]}</div>
    <div class="i"><b>${esc(name(m.cid))}</b><small>${{ d: 'سحب', x: 'خصم', r: 'مرتجع', p: 'دفعة' }[m.type]} — ${dshow(m.date)}${mdesc(m) ? ' — ' + esc(mdesc(m)) : ''}</small><small>سجّلها: ${esc(m.by)}</small></div>
    <div class="a"><span class="num" style="color:${MCOL[m.type]}">${m.type === 'd' ? '+' : '−'}${fmt(m.amt)}</span></div></div>`).join('') : '<div class="empty">لسه مفيش حركات</div>'}`;
}

/* =====================================================================
   الأصناف والمخزون والفواتير
   - الصنف: سعر جملة + سعر قطاعي + الكمية في المخزن (من غير موردين)
   - أنواع الفواتير: بيع (آجل/كاش) — مرتجع — عرض سعر — إضافة بضاعة
   - فاتورة البيع لعميل متسجل: قيمتها بتتزوّد على حسابه، واللي اندفع معاها بيتخصم
     (يعني الزيادة في الدفع بتنزل من القديم، والناقص بيتضاف عليه)
   ===================================================================== */
const KIND = { sale: 'فاتورة بيع', ret: 'مرتجع', quote: 'عرض سعر', in: 'إضافة بضاعة' };
const KCOL = { sale: 'var(--red2)', ret: 'var(--blue)', quote: 'var(--gold2)', in: 'var(--green)' };
const KBG = { sale: 'rgba(214,34,42,.15)', ret: 'rgba(90,160,255,.15)', quote: 'rgba(231,181,60,.15)', in: 'rgba(47,191,113,.15)' };
const KSIGN = { sale: -1, ret: 1, in: 1, quote: 0 }; // أثر كل نوع على المخزن
const fmtP = n => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const item = id => DB.items.find(i => i.id === id);
const invOf = id => DB.invoices.find(v => v.id === id);
const paidSum = v => (v.paid || []).reduce((s, p) => s + p.amt, 0);
const custName = id => DB.customers.find(c => c.id === id)?.name;
const invWho = v => v.kind === 'in' ? 'المخزن' : v.cid ? (custName(v.cid) || v.cname || 'عميل اتحذف') : (v.cname || (v.kind === 'quote' ? 'عميل' : 'عميل نقدي'));
const invOrd = (a, b) => (a.date + a.ts).localeCompare(b.date + b.ts);
function nextNo(kind) { return DB.invoices.filter(v => v.kind === kind).reduce((m, v) => Math.max(m, v.no || 0), 0) + 1 }
let iq = '', ifilter = 'all', vq = '', vfilter = 'all', vcust = '';

/* ---------- صفحة الأصناف ---------- */
function viewItems() {
  const val = DB.items.reduce((s, i) => s + Math.max(i.qty || 0, 0) * (i.w || 0), 0);
  const out = DB.items.filter(i => (i.qty || 0) <= 0).length;
  $('#view').innerHTML = `
  <div class="hero">
    <small>قيمة البضاعة اللي في المخزن (بسعر الجملة)</small>
    <div class="big"><span class="num">${fmt(val)}</span> <span style="font-size:16px">ج</span></div>
    <div class="stats" style="grid-template-columns:1fr 1fr">
      <div class="stat"><b class="num">${DB.items.length}</b><small>صنف متسجل</small></div>
      <div class="stat"><b class="num" style="color:${out ? 'var(--red2)' : 'var(--green)'}">${out}</b><small>صنف خلصان</small></div>
    </div>
  </div>
  ${canEdit() && DB.items.length ? `<button class="btn btn-ghost" style="margin-top:12px;color:var(--green)" onclick="newInv('in')">📦 دخول بضاعة للمخزن (كذا صنف مرة واحدة)</button>` : ''}
  <div class="search"><input id="iqbox" placeholder="ابحث باسم الصنف أو الكود" value="${esc(iq)}" oninput="setIQ(this.value)"></div>
  <div class="sec-t"><span>الأصناف (${DB.items.length})</span>
    <div class="chips">${[['all', 'الكل'], ['out', 'خلصان']].map(([k, l]) => `<span class="chip ${ifilter === k ? 'on' : ''}" onclick="setIF('${k}')">${l}</span>`).join('')}</div></div>
  <div id="ilist"></div>`;
  renderItems();
}
function setIQ(v) { iq = v.trim(); renderItems() }
function setIF(k) { ifilter = k; viewItems() }
const itemMatch = (i, s) => !s || i.name.includes(s) || (i.code || '').toLowerCase().includes(s.toLowerCase());
function renderItems() {
  const el = $('#ilist'); if (!el) return;
  let list = DB.items.filter(i => itemMatch(i, iq));
  if (ifilter === 'out') list = list.filter(i => (i.qty || 0) <= 0);
  list.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  el.innerHTML = list.length ? list.map(i => `
    <div class="cust" onclick="openItem('${i.id}')">
      <div class="av" style="border-radius:12px">${esc(i.name.trim()[0] || '؟')}</div>
      <div class="n"><b>${esc(i.name)}</b><small>جملة <span class="num">${fmtP(i.w)}</span> • قطاعي <span class="num">${fmtP(i.r)}</span>${i.code ? ' • ' + esc(i.code) : ''}</small></div>
      <div class="bal ${(i.qty || 0) <= 0 ? 'pos' : 'zero'}"><span class="num">${fmtP(i.qty || 0)}</span><small>${esc(i.unit || 'قطعة')}</small></div>
    </div>`).join('') : `<div class="empty">${DB.items.length ? 'مفيش نتايج' : 'لسه مفيش أصناف'}${canEdit() && !DB.items.length ? '<br>دوس «صنف جديد» تحت عشان تبدأ' : ''}</div>`;
}
function itemHist(id) {
  const h = DB.invoices.filter(v => v.kind !== 'quote' && v.lines.some(l => l.iid === id)).sort(invOrd).reverse().slice(0, 8);
  if (!h.length) return '';
  return `<div class="sec-t"><span>آخر حركات الصنف</span></div>${h.map(v => {
    const q = v.lines.filter(l => l.iid === id).reduce((s, l) => s + l.qty, 0);
    return `<div class="list-item" style="cursor:pointer" onclick="closeM();go('inv','${v.id}')">
      <div class="f"><b style="color:${KCOL[v.kind]}">${KIND[v.kind]} #${v.no}</b><small>${dshow(v.date)} — ${esc(invWho(v))}</small></div>
      <b class="num" style="color:${KSIGN[v.kind] < 0 ? 'var(--red2)' : 'var(--green)'}">${KSIGN[v.kind] < 0 ? '−' : '+'}${fmtP(q)}</b></div>`
  }).join('')}`;
}
function openItem(id) {
  const i = id ? item(id) : null;
  if (i && !canEdit()) return sheet(`<h3>${esc(i.name)}</h3>
    <div class="note">جملة: <b class="num">${fmtP(i.w)}</b> — قطاعي: <b class="num">${fmtP(i.r)}</b><br>في المخزن: <b class="num">${fmtP(i.qty || 0)}</b> ${esc(i.unit || 'قطعة')}</div>${itemHist(i.id)}`);
  sheet(`<h3>${i ? 'تعديل صنف' : 'صنف جديد'}</h3>
    <label class="field"><span>اسم الصنف</span><input id="in_n" value="${esc(i?.name || '')}" placeholder="مثلاً: ريموت كيا سيراتو 3 زرار"></label>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span>سعر الجملة</span><input id="in_w" inputmode="decimal" value="${i ? fmtP(i.w) : ''}" style="font-size:20px;font-weight:800"></label>
      <label class="field" style="flex:1"><span>سعر القطاعي</span><input id="in_r" inputmode="decimal" value="${i ? fmtP(i.r) : ''}" style="font-size:20px;font-weight:800"></label>
    </div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span>${i ? 'الكمية في المخزن' : 'الكمية الموجودة دلوقتي'}</span><input id="in_q" inputmode="decimal" value="${i ? fmtP(i.qty || 0) : ''}" placeholder="0" style="font-size:20px;font-weight:800"></label>
      <label class="field" style="flex:1"><span>الوحدة</span><input id="in_u" value="${esc(i?.unit || 'قطعة')}"></label>
    </div>
    <label class="field"><span>كود الصنف (اختياري)</span><input id="in_c" value="${esc(i?.code || '')}"></label>
    ${i ? `<div class="note">لو جاتلك بضاعة جديدة من الصنف ده دوس «دخول كمية» تحت. تغيير الكمية فوق للجرد بس.</div>` : ''}
    <button class="btn btn-gold" onclick="saveItem('${id || ''}')">حفظ</button>
    ${i ? `<button class="btn btn-green" style="margin-top:8px" onclick="quickIn('${i.id}')">＋ دخول كمية للمخزن</button>
    ${itemHist(i.id)}
    <button class="btn btn-ghost" style="margin-top:12px;color:var(--red2)" onclick="delItem('${i.id}')">حذف الصنف</button>` : ''}`);
  if (!i) setTimeout(() => $('#in_n').focus(), 50);
}
function saveItem(id) {
  once(async () => {
    const name = $('#in_n').value.trim(); if (!name) return toast('اكتب اسم الصنف');
    const d = { name, w: parseAmt($('#in_w').value), r: parseAmt($('#in_r').value), unit: $('#in_u').value.trim() || 'قطعة', code: $('#in_c').value.trim() };
    const qv = parseAmt($('#in_q').value);
    if (DB.items.some(x => x.name === name && x.id !== id)) return toast('في صنف تاني بنفس الاسم');
    if (id) {
      const i = item(id);
      if (qv !== (i.qty || 0)) { if (!confirm(`هتغيّر كمية المخزن من ${fmtP(i.qty || 0)} لـ ${fmtP(qv)} (جرد). متأكد؟`)) return; d.qty = qv }
      updateDoc(doc(fs, 'items', id), d).catch(fail);
    } else setDoc(doc(fs, 'items', uid()), { ...d, qty: qv, created: today() }).catch(fail);
    closeM(); toast('تم الحفظ');
  });
}
function delItem(id) {
  const i = item(id);
  if (!confirm(`متأكد إنك عايز تحذف «${i.name}»؟ الفواتير القديمة هتفضل زي ما هي.`)) return;
  deleteDoc(doc(fs, 'items', id)).catch(fail); closeM();
}
function quickIn(id) {
  const i = item(id);
  sheet(`<h3>دخول كمية — ${esc(i.name)}</h3>
    <div class="note">الموجود دلوقتي: <b class="num">${fmtP(i.qty || 0)}</b> ${esc(i.unit || 'قطعة')}</div>
    <label class="field"><span>الكمية اللي دخلت</span><input id="qi_q" inputmode="decimal" style="font-size:22px;font-weight:800"></label>
    <label class="field"><span>التاريخ</span><input id="qi_d" type="date" value="${today()}"></label>
    <label class="field"><span>ملاحظة (اختياري)</span><input id="qi_n"></label>
    <button class="btn btn-green" onclick="saveQuickIn('${id}')">تسجيل</button>`);
  setTimeout(() => $('#qi_q').focus(), 50);
}
function saveQuickIn(id) {
  once(async () => {
    const i = item(id), q = parseAmt($('#qi_q').value); if (q <= 0) return toast('اكتب الكمية');
    const v = { no: nextNo('in'), kind: 'in', cid: null, cname: '', pt: 'w', lines: [{ iid: id, name: i.name, qty: q, price: i.w || 0 }], sub: q * (i.w || 0), disc: 0, total: q * (i.w || 0), paid: [], date: $('#qi_d').value || today(), note: $('#qi_n').value.trim(), by: ME.name, ts: Date.now() + '' };
    const b = writeBatch(fs), vid = uid(); b.set(doc(fs, 'invoices', vid), v); applyInv(b, vid, v); b.commit().catch(fail);
    closeM(); toast(`اتضاف ${fmtP(q)} على المخزن`);
  });
}

/* ---------- صفحة الفواتير ---------- */
function viewInvs() {
  const t = today(), mo = t.slice(0, 7);
  const net = f => DB.invoices.filter(v => f(v.date)).reduce((s, v) => s + (v.kind === 'sale' ? v.total : v.kind === 'ret' ? -v.total : 0), 0);
  const cnt = f => DB.invoices.filter(v => v.kind === 'sale' && f(v.date)).length;
  const vc = vcust && DB.customers.find(c => c.id === vcust);
  $('#view').innerHTML = `
  <div class="hero">
    <small>صافي المبيعات الشهر ده (بعد المرتجع)</small>
    <div class="big"><span class="num">${fmt(net(d => d.startsWith(mo)))}</span> <span style="font-size:16px">ج</span></div>
    <div class="stats">
      <div class="stat"><b class="num" style="color:var(--green)">${fmt(net(d => d === t))}</b><small>مبيعات النهارده</small></div>
      <div class="stat"><b class="num">${cnt(d => d === t)}</b><small>فاتورة النهارده</small></div>
      <div class="stat"><b class="num">${cnt(d => d.startsWith(mo))}</b><small>فاتورة الشهر ده</small></div>
    </div>
  </div>
  ${canEdit() ? `<div class="kgrid">
    <button onclick="newInv('sale')" style="color:var(--red2)"><i>🧾</i>فاتورة بيع</button>
    <button onclick="newInv('ret')" style="color:var(--blue)"><i>↩</i>مرتجع</button>
    <button onclick="newInv('quote')" style="color:var(--gold2)"><i>📋</i>عرض سعر</button>
    <button onclick="newInv('in')" style="color:var(--green)"><i>📦</i>دخول بضاعة</button>
  </div>` : ''}
  <div class="search"><input id="vqbox" placeholder="ابحث برقم الفاتورة أو اسم العميل" value="${esc(vq)}" oninput="setVQ(this.value)"></div>
  ${vc ? `<div class="note" style="display:flex;align-items:center;gap:8px"><span style="flex:1">فواتير <b>${esc(vc.name)}</b> بس</span><span class="chip on" onclick="custInvs('')">عرض الكل ✕</span></div>` : ''}
  <div class="sec-t"><span>الفواتير</span>
    <div class="chips" style="overflow-x:auto">${[['all', 'الكل'], ['sale', 'بيع'], ['ret', 'مرتجع'], ['quote', 'عروض'], ['in', 'دخول']].map(([k, l]) => `<span class="chip ${vfilter === k ? 'on' : ''}" onclick="setVF('${k}')">${l}</span>`).join('')}</div></div>
  <div id="vlist"></div>`;
  renderInvs();
}
function custInvs(cid) { vcust = cid; vfilter = 'all'; if (route.v === 'invs') viewInvs(); else go('invs') }
function setVQ(v) { vq = v.trim(); renderInvs() }
function setVF(k) { vfilter = k; viewInvs() }
function payLabel(v) {
  if (v.kind === 'quote') return v.done ? 'اتحوّل لفاتورة' : 'عرض سعر';
  if (v.kind === 'in') return v.lines.length + ' صنف';
  if (v.kind === 'ret') return v.cid ? 'اتخصم من حسابه' : 'رجّعله فلوس';
  const P = paidSum(v);
  return P <= 0 ? 'آجل' : P < v.total ? 'جزء آجل' : P > v.total ? 'دفع زيادة' : 'مدفوعة';
}
const invRow = v => `
  <div class="cust" onclick="go('inv','${v.id}')">
    <div class="av" style="border-radius:12px;background:${KBG[v.kind]};color:${KCOL[v.kind]};font-size:13px"><span class="num">#${v.no}</span></div>
    <div class="n"><b>${esc(invWho(v))}</b><small>${KIND[v.kind]} — ${dshow(v.date)}</small></div>
    <div class="bal"><span class="num" style="color:${KCOL[v.kind]}">${fmt(v.total)}</span><small>${payLabel(v)}</small></div>
  </div>`;
function renderInvs() {
  const el = $('#vlist'); if (!el) return;
  let list = DB.invoices;
  if (vcust) list = list.filter(v => v.cid === vcust);
  if (vfilter !== 'all') list = list.filter(v => v.kind === vfilter);
  if (vq) list = list.filter(v => String(v.no) === vq.replace('#', '') || invWho(v).includes(vq));
  list = [...list].sort(invOrd).reverse().slice(0, 200);
  el.innerHTML = list.length ? list.map(invRow).join('') : `<div class="empty">${DB.invoices.length ? 'مفيش نتايج' : 'لسه مفيش فواتير'}${canEdit() && !DB.items.length ? '<br>ابدأ بتسجيل الأصناف من تبويب «الأصناف»' : ''}</div>`;
}

/* ---------- تسجيل أثر الفاتورة (المخزن + حساب العميل + المحافظ) ---------- */
function applyInv(b, id, v) {
  const s = KSIGN[v.kind];
  if (s) v.lines.forEach(l => { if (item(l.iid)) b.update(doc(fs, 'items', l.iid), { qty: increment(s * l.qty) }) });
  const base = { date: v.date, inv: id, by: v.by }, ts = +v.ts || Date.now(), lbl = `${KIND[v.kind]} رقم ${v.no}`;
  if (v.kind === 'sale') {
    const parts = (v.paid || []).filter(p => p.amt > 0), grp = parts.length > 1 ? uid() : null;
    if (v.cid) {
      if (v.total > 0) b.set(doc(fs, 'moves', uid()), { ...base, cid: v.cid, type: 'd', amt: v.total, note: lbl, ts: ts + '' });
      parts.forEach((p, i) => b.set(doc(fs, 'moves', uid()), { ...base, cid: v.cid, type: 'p', amt: p.amt, method: p.method, note: 'دفعة مع ' + lbl, ...(grp ? { grp } : {}), ts: (ts + i + 1) + '' }));
    } else parts.forEach((p, i) => b.set(doc(fs, 'moves', uid()), { ...base, type: 's', amt: p.amt, method: p.method, note: lbl, ts: (ts + i) + '' }));
  }
  if (v.kind === 'ret' && v.total > 0) {
    if (v.cid) b.set(doc(fs, 'moves', uid()), { ...base, cid: v.cid, type: 'r', amt: v.total, note: lbl, ts: ts + '' });
    else b.set(doc(fs, 'moves', uid()), { ...base, type: 'o', amt: v.total, method: v.rm || PAY[0], note: lbl, ts: ts + '' });
  }
}
function undoInv(b, v) {
  const s = KSIGN[v.kind];
  if (s) v.lines.forEach(l => { if (item(l.iid)) b.update(doc(fs, 'items', l.iid), { qty: increment(-s * l.qty) }) });
  DB.moves.filter(m => m.inv === v.id).forEach(m => b.delete(doc(fs, 'moves', m.id)));
}

/* ---------- كتابة الفاتورة ---------- */
let ED = null;
function newInv(kind, opt = {}) {
  const src = opt.edit || opt.from ? invOf(opt.edit || opt.from) : null;
  const cid = src ? src.cid || '' : opt.cid || '';
  ED = {
    kind, id: opt.edit || null, no: opt.edit ? src.no : null, ts: opt.edit ? src.ts : null, from: opt.from || (opt.edit ? src.from : null) || null,
    cid, cname: src?.cname || '', pt: src?.pt || lastPT(cid),
    lines: src ? src.lines.map(l => ({ ...l })) : [], disc: kind === 'sale' || kind === 'quote' ? src?.disc || 0 : 0,
    date: opt.edit ? src.date : today(), note: opt.edit ? src.note || '' : '',
    paid: opt.edit ? PAY.map(m => ({ method: m, amt: (src.paid || []).filter(p => p.method === m).reduce((s, p) => s + p.amt, 0) })) : [], rm: src?.rm || PAY[0]
  };
  go('newinv');
}
function lastPT(cid) { const v = DB.invoices.filter(x => x.cid === cid && cid && x.kind !== 'in').sort(invOrd).pop(); return v ? v.pt : cid ? 'w' : 'r' }
function leaveEditor() { if (!ED || !ED.lines.length) { ED = null; return true } if (!confirm('هتخرج من غير ما تحفظ الفاتورة؟')) return false; ED = null; return true }
const priceOf = (it, pt) => it ? (pt === 'w' ? it.w : it.r) || 0 : 0;
function repriceAll() { ED.lines.forEach(l => { const it = item(l.iid); if (it) l.price = priceOf(it, ED.pt) }) }
const edSub = () => ED.lines.reduce((s, l) => s + l.qty * l.price, 0);
const edTot = () => Math.max(edSub() - (ED.disc || 0), 0);
const edPaid = () => (ED.paid || []).reduce((s, p) => s + p.amt, 0);
function oldQty(iid) { const o = ED.id && invOf(ED.id); return o && o.kind === 'sale' ? o.lines.filter(l => l.iid === iid).reduce((s, l) => s + l.qty, 0) : 0 }
function balBefore() { // رصيد العميل من غير الفاتورة دي (مهم وانت بتعدّل فاتورة قديمة)
  if (!ED.cid) return 0;
  return DB.moves.filter(m => m.cid === ED.cid && !(ED.id && m.inv === ED.id)).reduce((s, m) => s + (m.type === 'd' ? m.amt : -m.amt), 0);
}
function edSync() {
  if (!ED || !$('#invEd')) return;
  const v = id => $(id) ? $(id).value : null;
  if ($('#ed_d')) ED.date = v('#ed_d') || today();
  if ($('#ed_n')) ED.note = v('#ed_n').trim();
  if ($('#ed_cn')) ED.cname = v('#ed_cn').trim();
  if ($('#ed_x')) ED.disc = parseAmt(v('#ed_x'));
  if ($('#ed_rm')) ED.rm = v('#ed_rm');
  if ($('#ip0')) ED.paid = PAY.map((method, i) => ({ method, amt: parseAmt(v('#ip' + i)) }));
}
function viewNewInv() {
  if (!ED) return back();
  const k = ED.kind, cs = [...DB.customers].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  $('#view').innerHTML = `<div id="invEd">
  <div class="cbox" style="text-align:right">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span class="badge" style="background:${KBG[k]};color:${KCOL[k]};font-size:14px;padding:4px 12px">${KIND[k]}</span>
      <b style="flex:1">${ED.id ? 'تعديل رقم <span class="num">#' + ED.no + '</span>' : 'رقم <span class="num">#' + nextNo(k) + '</span>'}</b>
    </div>
    ${k !== 'in' ? `<label class="field"><span>العميل</span><select id="ed_c" onchange="edCust(this.value)">
      <option value="">${k === 'quote' ? '— عميل مش متسجل —' : '— عميل نقدي (من غير حساب) —'}</option>
      ${cs.map(c => `<option value="${c.id}" ${c.id === ED.cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    ${!ED.cid && k !== 'ret' ? `<label class="field"><span>اسم العميل (اختياري)</span><input id="ed_cn" value="${esc(ED.cname)}"></label>` : ''}
    <div class="field"><span>الأسعار</span><div class="seg">
      <button class="${ED.pt === 'w' ? 'on' : ''}" onclick="edPT('w')">جملة</button>
      <button class="${ED.pt === 'r' ? 'on' : ''}" onclick="edPT('r')">قطاعي</button></div></div>` : ''}
    <label class="field" style="margin-bottom:0"><span>التاريخ</span><input id="ed_d" type="date" value="${ED.date}"></label>
  </div>
  <div class="sec-t"><span>الأصناف</span><span id="edcnt"></span></div>
  <div class="search" style="margin-top:0"><input id="isrch" placeholder="🔍 اكتب اسم الصنف أو الكود وضيفه" autocomplete="off" oninput="edSug(this.value)"><div id="sug"></div></div>
  <div id="edl"></div>
  <div id="edt"></div>
  ${k === 'sale' ? `<div class="cbox" style="text-align:right">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><b style="flex:1">اللي اتدفع مع الفاتورة</b>
      <span class="chip on" onclick="edPayAll()">دفع كله كاش</span>${ED.cid ? `<span class="chip" onclick="edPayNone()">آجل كله</span>` : ''}</div>
    ${PAY.map((t, i) => `<div style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <b style="flex:0 0 112px;font-size:14px">${t}</b>
      <input id="ip${i}" inputmode="numeric" oninput="liveComma(this);edHint()" value="${ED.paid[i] && ED.paid[i].amt ? fmt(ED.paid[i].amt) : ''}" placeholder="0" style="flex:1;min-width:0;width:100%;font-size:19px;font-weight:800;background:var(--card2);border:1px solid var(--line);color:var(--text);border-radius:12px;padding:10px 12px"></div>`).join('')}
  </div>` : ''}
  ${k === 'ret' && !ED.cid ? `<label class="field" style="margin-top:14px"><span>رجّعتله الفلوس منين؟</span><select id="ed_rm">${PAY.map(p => `<option ${p === ED.rm ? 'selected' : ''}>${p}</option>`).join('')}</select></label>` : ''}
  <div class="note" id="edh"></div>
  <label class="field"><span>ملاحظة (اختياري)</span><input id="ed_n" value="${esc(ED.note)}"></label>
  <button class="btn btn-gold" style="padding:16px" onclick="saveInv()">${ED.id ? 'حفظ التعديل' : 'حفظ ' + KIND[k]}</button>
  </div>`;
  edDraw();
}
let drawing = false;
function edDraw() {
  if (drawing) return; drawing = true;
  try { const a = document.activeElement; if (a && a.closest && a.closest('#edl')) a.blur(); edLines(); edTotals(); edHint() } finally { drawing = false }
}
function edLines() {
  const k = ED.kind;
  $('#edcnt').textContent = ED.lines.length ? ED.lines.length + ' صنف' : '';
  $('#edl').innerHTML = ED.lines.length ? ED.lines.map((l, j) => {
    const it = item(l.iid), have = (it?.qty || 0) + oldQty(l.iid);
    const warn = k === 'sale' && it && l.qty > have;
    return `<div class="ln">
      <div class="ln1"><b>${esc(l.name)}</b><button class="x" onclick="edDel(${j})">✕</button></div>
      <div class="ln2">
        <div class="stp"><button onclick="edQ(${j},1)">＋</button><input inputmode="decimal" value="${fmtP(l.qty)}" onchange="edQv(${j},this.value)" onfocus="this.select()"><button onclick="edQ(${j},-1)">－</button></div>
        ${k !== 'in' ? `<span style="color:var(--muted)">×</span><input class="pr" inputmode="decimal" value="${fmtP(l.price)}" onchange="edP(${j},this.value)" onfocus="this.select()">
        <b class="num lt">${fmtP(l.qty * l.price)}</b>` : `<small style="color:var(--muted);flex:1;text-align:left">في المخزن دلوقتي: <span class="num">${fmtP(it?.qty || 0)}</span></small>`}
      </div>
      ${warn ? `<small style="color:var(--red2)">⚠ المخزن فيه <span class="num">${fmtP(have)}</span> بس</small>` : ''}
    </div>`;
  }).join('') : '<div class="empty" style="padding:22px">لسه مضفتش أصناف — ابحث فوق ودوس على الصنف</div>';
}
function edTotals() {
  const k = ED.kind;
  if (k === 'in') { $('#edt').innerHTML = ''; return }
  const sub = edSub(), canDisc = k === 'sale' || k === 'quote';
  $('#edt').innerHTML = `<div class="tot">
    ${canDisc ? `<div class="r"><span>الإجمالي قبل الخصم</span><b class="num">${fmtP(sub)}</b></div>
    <div class="r"><span>خصم على الفاتورة</span><input id="ed_x" inputmode="decimal" placeholder="0" value="${ED.disc ? fmtP(ED.disc) : ''}" oninput="edDisc(this.value)"></div>` : ''}
    <div class="r big"><span>${k === 'ret' ? 'قيمة المرتجع' : 'الإجمالي'}</span><b class="num" id="edtot">${fmtP(edTot())}</b></div></div>`;
}
function edDisc(v) { ED.disc = parseAmt(v); edTotalOnly() }
function edTotalOnly() { $('#edtot').textContent = fmtP(edTot()); edHint() }
function edHint() {
  edSync(); const k = ED.kind, T = edTot(), el = $('#edh');
  if (k === 'in') { el.innerHTML = 'الكميات دي هتتزوّد على المخزن.'; return }
  if (k === 'quote') { el.innerHTML = 'عرض السعر مش بيأثّر على المخزن ولا على حساب العميل — تقدر تحوّله لفاتورة بيع بعدين بدوسة.'; return }
  const b0 = balBefore();
  if (k === 'ret') {
    el.innerHTML = ED.cid ? `حسابه دلوقتي: <b class="num">${fmt(b0)}</b> — المرتجع <b class="num">${fmt(T)}</b> هيتخصم منه<br>حسابه بعد المرتجع: <b class="num" style="color:var(--gold2)">${fmt(b0 - T)}</b> ج`
      : `المخزن هيزيد بالأصناف دي، و<b class="num">${fmt(T)}</b> ج هيتخصموا من المحفظة اللي هتختارها فوق.`;
    return;
  }
  const P = edPaid();
  if (!ED.cid) {
    el.innerHTML = !T ? 'عميل نقدي: لازم يدفع الفاتورة كلها.' : Math.round(P) === Math.round(T) ? `<span style="color:var(--green)">✓ الفاتورة متدفعة كلها</span>`
      : P < T ? `<span style="color:var(--red2)">عميل نقدي لازم يدفع الفاتورة كلها — فاضل <b class="num">${fmt(T - P)}</b></span><br>لو هياخد آجل اختار اسمه من فوق.`
        : `<span style="color:var(--red2)">المدفوع أكتر من الفاتورة بـ <b class="num">${fmt(P - T)}</b></span>`;
    return;
  }
  const after = b0 + T - P;
  el.innerHTML = `حسابه قبل الفاتورة: <b class="num">${fmt(b0)}</b> ج<br>
    الفاتورة <b class="num">${fmt(T)}</b> − اللي دفعه <b class="num">${fmt(P)}</b>
    ${P < T ? ` = <b class="num" style="color:var(--red2)">${fmt(T - P)}</b> هيتضاف على حسابه` : P > T ? ` = الزيادة <b class="num" style="color:var(--green)">${fmt(P - T)}</b> هتنزل من حسابه القديم` : ' — متدفعة كلها'}<br>
    حسابه بعد الفاتورة: <b class="num" style="font-size:16px;color:${after > 0 ? 'var(--red2)' : 'var(--green)'}">${fmt(after)}</b> ج ${after < 0 ? '(ليه عندكم)' : ''}`;
}
function edCust(v) { edSync(); const pt = lastPT(v); ED.cid = v; if (pt !== ED.pt) { ED.pt = pt; repriceAll() } if (!v) ED.paid = []; viewNewInv() }
function edPT(pt) { edSync(); if (ED.pt === pt) return; ED.pt = pt; repriceAll(); viewNewInv() }
function edSug(s) {
  s = s.trim(); const el = $('#sug');
  if (!s) { el.innerHTML = ''; return }
  const list = DB.items.filter(i => itemMatch(i, s)).sort((a, b) => a.name.localeCompare(b.name, 'ar')).slice(0, 8);
  el.innerHTML = `<div class="sug">${list.length ? list.map(i => `<button onclick="edAdd('${i.id}')"><b>${esc(i.name)}</b>
    <small>${ED.kind === 'in' ? '' : (ED.pt === 'w' ? 'جملة ' : 'قطاعي ') + '<span class="num">' + fmtP(priceOf(i, ED.pt)) + '</span> • '}في المخزن <span class="num">${fmtP(i.qty || 0)}</span></small></button>`).join('')
      : `<div style="padding:12px;color:var(--muted);font-size:13px">مفيش صنف بالاسم ده — سجّله الأول من تبويب «الأصناف»</div>`}</div>`;
}
function edAdd(id) {
  const it = item(id), ex = ED.lines.find(l => l.iid === id);
  if (ex) ex.qty += 1; else ED.lines.push({ iid: id, name: it.name, qty: 1, price: ED.kind === 'in' ? it.w || 0 : priceOf(it, ED.pt) });
  $('#isrch').value = ''; $('#sug').innerHTML = ''; edDraw(); toast('اتضاف: ' + it.name);
}
function edDel(j) { ED.lines.splice(j, 1); edDraw() }
function edQ(j, d) { const l = ED.lines[j]; l.qty = Math.max(1, l.qty + d); edDraw() }
function edQv(j, v) { const q = parseAmt(v); if (q > 0) ED.lines[j].qty = q; edDraw() }
function edP(j, v) { ED.lines[j].price = parseAmt(v); edDraw() }
function edPayAll() { const T = edTot(); PAY.forEach((_, i) => $('#ip' + i).value = i ? '' : T ? fmt(T) : ''); edHint() }
function edPayNone() { PAY.forEach((_, i) => $('#ip' + i).value = ''); edHint() }
function saveInv() {
  once(async () => {
    edSync(); const k = ED.kind;
    if (!ED.lines.length) return toast('ضيف صنف واحد على الأقل');
    const T = edTot(), paid = k === 'sale' ? ED.paid.filter(p => p.amt > 0) : [], P = paid.reduce((s, p) => s + p.amt, 0);
    if (k === 'sale' && !ED.cid && Math.round(P) !== Math.round(T)) return toast(P < T ? 'العميل النقدي لازم يدفع الفاتورة كلها — أو اختار اسمه' : 'المدفوع أكتر من الفاتورة');
    if (k === 'sale') {
      const short = ED.lines.filter(l => { const it = item(l.iid); return it && l.qty > (it.qty || 0) + oldQty(l.iid) });
      if (short.length && !confirm(`الكمية أكبر من المخزن في: ${short.map(l => l.name).join('، ')}\nالمخزن هيبقى بالسالب. تكمّل؟`)) return;
    }
    const old = ED.id && invOf(ED.id);
    if (ED.id && !old) return toast('الفاتورة دي اتحذفت');
    const id = ED.id || uid(), no = ED.no || nextNo(k);
    const v = {
      no, kind: k, cid: ED.cid || null, cname: ED.cid ? custName(ED.cid) : ED.cname, pt: ED.pt,
      lines: ED.lines.map(l => ({ iid: l.iid, name: l.name, qty: l.qty, price: l.price })),
      sub: edSub(), disc: ED.disc || 0, total: T, paid, ...(k === 'ret' && !ED.cid ? { rm: ED.rm } : {}),
      date: ED.date || today(), note: ED.note, by: ME.name, ts: ED.ts || Date.now() + '', ...(ED.from ? { from: ED.from } : {}), ...(old && old.done ? { done: old.done } : {})
    };
    const b = writeBatch(fs);
    if (old) undoInv(b, old);
    b.set(doc(fs, 'invoices', id), v);
    applyInv(b, id, v);
    if (ED.from && invOf(ED.from) && !(old && old.from)) b.update(doc(fs, 'invoices', ED.from), { done: id });
    b.commit().catch(fail);
    ED = null; JUST = id; toast(old ? 'تم حفظ التعديل' : `تم حفظ ${KIND[k]} #${no}`);
    go('inv', id, true);
  });
}

/* ---------- عرض الفاتورة ---------- */
let JUST = null; // فاتورة لسه متحفظة ومستنية ترجع من قاعدة البيانات
function viewInv() {
  const v = invOf(route.arg);
  if (!v) { if (route.arg === JUST) { $('#view').innerHTML = '<div class="empty">جاري الحفظ...</div>'; return } return back() }
  const P = paidSum(v), c = v.cid && DB.customers.find(x => x.id === v.cid);
  const conv = v.done && invOf(v.done), src = v.from && invOf(v.from);
  $('#view').innerHTML = `
  <div class="cbox" style="text-align:right">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="badge" style="background:${KBG[v.kind]};color:${KCOL[v.kind]};font-size:14px;padding:4px 12px">${KIND[v.kind]}</span>
      <b class="num" style="flex:1;font-size:18px">#${v.no}</b><span style="color:var(--muted);font-size:13px">${dshow(v.date)}</span>
    </div>
    <div style="margin-top:12px;font-size:18px;font-weight:800">${c ? `<span style="cursor:pointer" onclick="go('cust','${c.id}')">${esc(c.name)} ←</span>` : esc(invWho(v))}</div>
    ${v.kind !== 'in' ? `<small style="color:var(--muted)">بأسعار ${v.pt === 'w' ? 'الجملة' : 'القطاعي'}${c && c.phone ? ' • <span class="num">' + esc(c.phone) + '</span>' : ''}</small>` : ''}
    ${src ? `<div class="note" style="margin:10px 0 0;cursor:pointer" onclick="go('inv','${src.id}')">اتعملت من عرض سعر #${src.no} ←</div>` : ''}
    ${conv ? `<div class="note" style="margin:10px 0 0;cursor:pointer" onclick="go('inv','${conv.id}')">✓ العرض ده اتحوّل لفاتورة بيع #${conv.no} ←</div>` : ''}
  </div>
  <div class="sec-t"><span>الأصناف (${v.lines.length})</span></div>
  <div class="tbl">${v.lines.map(l => `<div class="tr">
    <div class="tn"><b>${esc(l.name)}</b>${v.kind !== 'in' ? `<small><span class="num">${fmtP(l.qty)}</span> × <span class="num">${fmtP(l.price)}</span></small>` : ''}</div>
    <b class="num">${v.kind === 'in' ? '+' + fmtP(l.qty) : fmtP(l.qty * l.price)}</b></div>`).join('')}</div>
  ${v.kind !== 'in' ? `<div class="tot">
    ${v.disc ? `<div class="r"><span>قبل الخصم</span><b class="num">${fmtP(v.sub)}</b></div><div class="r"><span>خصم</span><b class="num" style="color:var(--gold2)">− ${fmtP(v.disc)}</b></div>` : ''}
    <div class="r big"><span>${v.kind === 'ret' ? 'قيمة المرتجع' : 'الإجمالي'}</span><b class="num" style="color:${KCOL[v.kind]}">${fmtP(v.total)}</b></div>
    ${v.kind === 'sale' ? `${(v.paid || []).map(p => `<div class="r"><span>دفع ${esc(p.method)}</span><b class="num" style="color:var(--green)">${fmt(p.amt)}</b></div>`).join('') || `<div class="r"><span>المدفوع</span><b>آجل بالكامل</b></div>`}
      ${v.cid && P < v.total ? `<div class="r"><span>اتضاف على حسابه</span><b class="num" style="color:var(--red2)">${fmt(v.total - P)}</b></div>` : ''}
      ${v.cid && P > v.total ? `<div class="r"><span>نزل من حسابه القديم</span><b class="num" style="color:var(--green)">${fmt(P - v.total)}</b></div>` : ''}` : ''}
    ${v.kind === 'ret' ? `<div class="r"><span>${v.cid ? 'اتخصم من حسابه' : 'رجّعله فلوس من'}</span><b>${v.cid ? '✓' : esc(v.rm || '')}</b></div>` : ''}
    ${c && v.kind !== 'quote' ? `<div class="r" style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><span>حسابه دلوقتي</span><b class="num ${balance(c.id) > 0 ? 'pos' : 'zero'}">${fmt(balance(c.id))}</b></div>` : ''}
  </div>` : ''}
  ${v.note ? `<div class="note">${esc(v.note)}</div>` : ''}
  <small style="display:block;color:var(--muted);margin:10px 2px">سجّلها: ${esc(v.by)}</small>
  ${v.kind !== 'in' ? `<button class="btn btn-gold" onclick="sendInv('${v.id}')">📤 ابعت ${KIND[v.kind]} واتساب (صورة)</button>` : ''}
  ${canEdit() ? `${v.kind === 'quote' && !conv ? `<button class="btn btn-green" style="margin-top:8px" onclick="newInv('sale',{from:'${v.id}'})">🧾 حوّل العرض لفاتورة بيع</button>` : ''}
  <div class="acts2"><button class="btn btn-ghost" onclick="newInv('${v.kind}',{edit:'${v.id}'})">تعديل</button>
  <button class="btn btn-ghost" style="color:var(--red2)" onclick="delInv('${v.id}')">حذف</button></div>` : ''}`;
}
function delInv(id) {
  const v = invOf(id);
  const eff = { sale: 'هترجع الكميات للمخزن' + (v.cid ? ' وهتتشال من حساب العميل هي واللي اندفع معاها' : ' والفلوس هتتشال من المحفظة'), ret: 'الكميات هتتخصم من المخزن تاني' + (v.cid ? ' والمرتجع هيتشال من حساب العميل' : ''), in: 'الكميات هتتخصم من المخزن', quote: '' }[v.kind];
  if (!confirm(`متأكد إنك عايز تحذف ${KIND[v.kind]} #${v.no}؟${eff ? '\n' + eff + '.' : ''}`)) return;
  const b = writeBatch(fs); undoInv(b, v); b.delete(doc(fs, 'invoices', id));
  if (v.from && invOf(v.from)) b.update(doc(fs, 'invoices', v.from), { done: deleteField() });
  if (v.done && invOf(v.done)) b.update(doc(fs, 'invoices', v.done), { from: deleteField() });
  b.commit().catch(fail); back();
}

/* ---------- صورة الفاتورة للواتساب ---------- */
async function invImage(v) {
  const c = v.cid ? DB.customers.find(x => x.id === v.cid) : null, P = paidSum(v);
  try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(w + ' 30px Cairo'))) } catch (e) { }
  const logo = await loadImg('logo.jpg').catch(() => null);
  const W = 1080, P0 = 50, RH = 66, F = 'Cairo, sans-serif';
  const lw = logo ? Math.min(W - 2 * P0 - 380, 340 * logo.width / logo.height) : 0, logoH = logo ? Math.round(lw * logo.height / logo.width) : 0;
  const tl = [];
  if (v.disc) tl.push(['الإجمالي قبل الخصم', fmtP(v.sub)], ['خصم', '− ' + fmtP(v.disc), '#e7b53c']);
  tl.push([v.kind === 'ret' ? 'قيمة المرتجع' : 'الإجمالي', fmtP(v.total) + ' ج', '#ffd76a', 1]);
  if (v.kind === 'sale') {
    tl.push(['المدفوع', fmt(P), '#2fbf71']);
    if (c && P < v.total) tl.push(['الباقي (اتضاف على الحساب)', fmt(v.total - P), '#ff4a52']);
    if (c && P > v.total) tl.push(['الزيادة (اتخصمت من الحساب)', fmt(P - v.total), '#2fbf71']);
  }
  if (c && v.kind !== 'quote') { const b = balance(c.id); tl.push([b < 0 ? 'رصيد لكم عندنا' : 'إجمالي حسابكم دلوقتي', fmt(Math.abs(b)) + ' ج', b > 0 ? '#ff4a52' : '#2fbf71', 1]) }
  const top = P0 + logoH + 75;
  const H = top + 150 + 70 + v.lines.length * RH + 40 + tl.length * 62 + 40 + (v.kind === 'quote' ? 50 : 0) + 170;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const GOLD = '#e7b53c', TXT = '#f4f1ea', MUT = '#9b978e', LINE = '#2c2c31';
  x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
  x.fillStyle = GOLD; x.fillRect(0, 0, W, 10); x.fillRect(0, H - 10, W, 10);
  if (logo) x.drawImage(logo, (W - lw) / 2, P0, lw, logoH);
  const T = (t, px, py, o = {}) => { x.font = `${o.w || 700} ${o.s || 30}px ${F}`; x.fillStyle = o.c || TXT; x.textAlign = o.a || 'right'; x.direction = o.ltr ? 'ltr' : 'rtl'; x.fillText(o.max ? fitText(x, t, o.max) : t, px, py) };
  let y = top;
  T(`${KIND[v.kind]} رقم ${v.no}`, W / 2, y, { a: 'center', s: 46, w: 800, c: GOLD }); y += 58;
  T(invWho(v), W / 2, y, { a: 'center', s: 36, w: 700, max: W - 2 * P0 }); y += 44;
  T(`بتاريخ ${dshow(v.date)}${c && c.phone ? '   •   ' + c.phone : ''}`, W / 2, y, { a: 'center', s: 25, w: 400, c: MUT }); y += 48;
  const cols = { name: W - P0 - 20, q: P0 + 520, pr: P0 + 260, t: P0 + 20 };
  x.fillStyle = '#202024'; x.beginPath(); x.roundRect(P0, y, W - 2 * P0, 58, 14); x.fill();
  [['الصنف', cols.name, 'right'], ['الكمية', cols.q, 'center'], ['السعر', cols.pr, 'left'], ['الإجمالي', cols.t, 'left']].forEach(([t, px, a]) => T(t, px, y + 39, { s: 24, c: GOLD, a }));
  y += 70;
  v.lines.forEach((l, i) => {
    if (i % 2) { x.fillStyle = '#121214'; x.fillRect(P0, y, W - 2 * P0, RH) }
    const cy = y + 43;
    T(l.name, cols.name, cy, { s: 25, w: 700, max: cols.name - (cols.q + 70) });
    T(fmtP(l.qty), cols.q, cy, { a: 'center', s: 25, w: 400, ltr: true });
    T(fmtP(l.price), cols.pr, cy, { a: 'left', s: 25, w: 400, c: MUT, ltr: true });
    T(fmtP(l.qty * l.price), cols.t, cy, { a: 'left', s: 26, ltr: true });
    x.fillStyle = LINE; x.fillRect(P0, y + RH - 1, W - 2 * P0, 1);
    y += RH;
  });
  y += 30;
  x.fillStyle = '#17171a'; x.beginPath(); x.roundRect(P0, y, W - 2 * P0, tl.length * 62 + 20, 20); x.fill();
  y += 10;
  tl.forEach(([l, val, col, big]) => {
    T(l, W - P0 - 30, y + 42, { s: big ? 30 : 26, w: big ? 800 : 400, c: big ? TXT : MUT });
    T(val, P0 + 30, y + 42, { a: 'left', s: big ? 36 : 28, w: 800, c: col || TXT, ltr: true });
    y += 62;
  });
  y += 10;
  if (v.kind === 'quote') { y += 40; T('عرض سعر — الأسعار قابلة للتغيير', W / 2, y, { a: 'center', s: 22, w: 400, c: MUT }) }
  y += 80;
  T('شكراً لتعاملكم معنا', W / 2, y, { a: 'center', s: 32, w: 700, c: GOLD }); y += 50;
  T('شركة النور والفتح', W / 2, y, { a: 'center', s: 26, w: 400, c: MUT });
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
function sendInv(id) {
  once(async () => {
    const v = invOf(id); if (!v) return;
    toast('بتتجهّز الصورة...');
    let blob; try { blob = await invImage(v) } catch (e) { console.error(e); return toast('حصلت مشكلة في تجهيز الصورة') }
    const c = v.cid && DB.customers.find(x => x.id === v.cid);
    await shareImage(blob, `${KIND[v.kind]} ${v.no} - ${invWho(v)}.png`, c && c.phone);
  });
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

Object.assign(window, { tab, back, fabAct, setIQ, setIF, openItem, saveItem, delItem, quickIn, saveQuickIn, setVQ, setVF, custInvs, newInv, edCust, edPT, edSug, edAdd, edDel, edQ, edQv, edP, edDisc, edHint, edPayAll, edPayNone, saveInv, delInv, sendInv, doLogin, logout, go, setQ, setFilter, openCustomerForm, saveCustomer, delCustomer, openMove, saveMove, delMove, sendWA, callC, closeM, liveComma, openMember, saveMember, delMember, payTotal, openDiscount, discPct, discHint, saveDiscount, openTransfer, trHint, saveTransfer, sendAll });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
