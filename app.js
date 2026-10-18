/* ระบบเอกสารงานวัสดุการแพทย์ — หน้าจอหลัก (C9)
   - ข้อมูลที่มาจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น (ไม่ใส่ HTML จากข้อมูล)
   - ปุ่มที่แก้ข้อมูลกดแล้วปิดชั่วคราวจนเซิร์ฟเวอร์ตอบ (guard) และแสดง "สำเร็จ" เฉพาะเมื่อได้ ok:true
   - ซ่อนปุ่มตามสิทธิ์เป็นเพียงความสะดวก Backend ตรวจสิทธิ์ซ้ำทุกคำสั่ง */
(function () {
  'use strict';
  var CFG = window.MEDSUP_CONFIG;
  var session = null, me = null, rolesAvailable = [], viewToken = 0;

  /* ---------- ตัวช่วย ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls, attrs) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function hasRole(r) { return !!me && me.roles.indexOf(r) >= 0; }
  function isAdmin() { return hasRole('ADMIN'); }

  var BKK = { timeZone: 'Asia/Bangkok' };
  function fmtDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d.getTime())) return '-';
    try { return new Intl.DateTimeFormat('th-TH', { timeZone: BKK.timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d); }
    catch (e) { return d.toISOString(); }
  }
  function fmtBytes(n) {
    if (n === null || n === undefined) return '-';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  /* ป้ายภาษาไทยของสถานะ/คำสั่ง — ถ้อยคำชั่วคราว รอผู้ใช้ยืนยันตอนกำหนดขั้นตอนของแต่ละ Menu */
  var STATUS_LABEL = { DRAFT: 'แบบร่าง', SUBMITTED: 'ส่งแล้ว', IN_REVIEW: 'กำลังตรวจสอบ', RETURNED: 'ส่งกลับแก้ไข', APPROVED: 'อนุมัติแล้ว',
                       COMPLETED: 'เสร็จสิ้น', REJECTED: 'ไม่อนุมัติ', CANCELLED: 'ยกเลิก' };
  var ACTION_LABEL = { SUBMIT: 'ส่ง', RECEIVE: 'รับเรื่อง', RETURN: 'ส่งกลับ', COMPLETE: 'ปิดงาน', CANCEL: 'ยกเลิก', APPROVE: 'อนุมัติ', REJECT: 'ไม่อนุมัติ' };
  function statusLabel(s) { return STATUS_LABEL[s] || s; }
  function actionLabel(a) { return ACTION_LABEL[a] || a; }
  function moduleLabel(m) { return m ? 'Menu ' + m.replace(/^M/, '') + ' (' + m + ')' : '-'; }
  function badge(status) { return el('span', statusLabel(status), 'badge s-' + String(status).replace(/[^A-Z_]/g, '')); }
  function chip(text) { return el('span', text, 'chip'); }

  var toastTimer = null;
  function toast(msg, bad) {
    var area = clear($('toast-area'));
    var t = el('div', msg, 'toast' + (bad ? ' bad' : ''), { role: bad ? 'alert' : 'status' });
    area.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { clear(area); }, bad ? 8000 : 3500);
  }

  var FIELD_MSG = { required: 'ต้องกรอก', invalid_email: 'รูปแบบอีเมลไม่ถูกต้อง', too_long: 'ยาวเกินไป', must_be_text: 'ต้องเป็นข้อความ', unknown_field: 'ช่องไม่ถูกต้อง',
                    bad_item: 'ค่าไม่ถูกต้อง', invalid_chars: 'มีตัวอักษรที่ไม่อนุญาต', too_small: 'น้อยเกินไป', too_large: 'มากเกินไป', must_be_integer: 'ต้องเป็นจำนวนเต็ม',
                    invalid_date: 'วันที่ไม่ถูกต้อง', type_not_allowed: 'ชนิดไฟล์ไม่รองรับ (รับ PDF, JPG, PNG)', type_mismatch: 'เนื้อไฟล์ไม่ตรงกับนามสกุล',
                    bad_base64: 'อ่านไฟล์ไม่สำเร็จ', empty: 'ไฟล์ว่าง', too_many: 'แนบไฟล์ครบจำนวนสูงสุดแล้ว' };
  function fieldText(code) { return FIELD_MSG[code] || 'ไม่ถูกต้อง'; }

  /* ---------- เรียก API ---------- */
  var stats = { busyRetries: 0 }, MAX_BUSY_RETRIES = 8;
  /* คำสั่งที่แก้ข้อมูลและกันบันทึกซ้ำด้วย request_id (สร้างครั้งเดียวต่อการกระทำ ใช้ซ้ำเมื่อลองใหม่) */
  var WRITE_ACTIONS = ['users.upsert', 'users.set_active', 'users.grant_role', 'users.revoke_role', 'workflow.transition', 'attachments.remove', 'config.docnumber.update'];
  function newRequestId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function callOnce(action, payload, requestId, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000);
    var body = { action: action, session: session, payload: payload || {} };
    if (requestId) body.request_id = requestId;
    return fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: 'เชื่อมต่อไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่' }; })
      .finally(function () { clearTimeout(timer); });
  }

  /* BUSY: เซิร์ฟเวอร์ตอบก่อนเขียนอะไร จึงลองซ้ำได้ · NETWORK กับคำสั่งเขียน: ลองใหม่ด้วย request_id เดิม (Backend คืนผลเดิมถ้าครั้งแรกสำเร็จไปแล้ว) */
  function callApi(action, payload, opts) {
    opts = opts || {};
    var isWrite = WRITE_ACTIONS.indexOf(action) >= 0;
    var requestId = isWrite ? newRequestId() : null, netRetries = 0;
    function attempt(n) {
      return callOnce(action, payload, requestId, opts.timeout).then(function (r) {
        if (!r.ok && r.code === 'BUSY' && n < MAX_BUSY_RETRIES) {
          stats.busyRetries++;
          return new Promise(function (res) { setTimeout(res, 800 + Math.random() * 2200); }).then(function () { return attempt(n + 1); });
        }
        if (!r.ok && r.code === 'NETWORK' && isWrite && netRetries < 2) {
          netRetries++;
          return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return attempt(n); });
        }
        if (!r.ok && r.code === 'UNAUTHENTICATED' && session) signedOut('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
        return r;
      });
    }
    return attempt(0);
  }
  function errText(r) { return r.message + (r.ref ? ' (รหัสอ้างอิง ' + r.ref + ')' : ''); }

  /* กันกดซ้ำ: ปุ่มปิดระหว่างทำงาน · ผิดพลาดแล้วกดใหม่ได้ · fn ต้องคืน Promise */
  function guard(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    Promise.resolve().then(fn).catch(function (e) { toast('เกิดข้อผิดพลาดที่หน้าจอ: ' + (e && e.message), true); })
      .finally(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); });
  }
  function reportFail(r) { toast(errText(r), true); }

  /* ---------- เข้าสู่ระบบ ---------- */
  window.MedsupInitGoogle = function () {
    if (!CFG.GOOGLE_CLIENT_ID) { $('login-area').textContent = 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID'; return; }
    try {
      google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential });
      clear($('login-area'));
      google.accounts.id.renderButton($('login-area'), { theme: 'outline', size: 'large', locale: 'th' });
    } catch (e) { $('login-area').textContent = 'โหลดปุ่ม Google ไม่สำเร็จ: ' + e.message; }
  };

  function onCredential(resp) {
    $('login-result').textContent = 'กำลังตรวจสอบ...'; $('login-result').className = '';
    callApi('auth.login', { id_token: resp.credential }).then(function (r) {
      if (!r.ok) { $('login-result').textContent = errText(r); $('login-result').className = 'fail'; return; }
      session = r.data.session; me = r.data.profile;
      $('login-result').textContent = '';
      enterApp();
    });
  }

  function signedOut(msg) {
    session = null; me = null; rolesAvailable = []; viewToken++;
    ['who', 'logout', 'nav', 'view'].forEach(function (id) { $(id).classList.add('hidden'); });
    $('login-view').classList.remove('hidden');
    $('login-result').textContent = msg || ''; $('login-result').className = msg ? 'fail' : '';
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  $('logout').addEventListener('click', function () {
    guard(this, function () {
      return callApi('auth.logout').then(function () { signedOut(''); if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); });
    });
  });

  function enterApp() {
    $('login-view').classList.add('hidden');
    var who = clear($('who'));
    add(who, el('b', me.full_name), me.position ? el('span', ' · ' + me.position) : null, el('br'), el('span', me.email));
    ['who', 'logout', 'nav', 'view'].forEach(function (id) { $(id).classList.remove('hidden'); });
    buildNav();
    if (!location.hash) location.hash = '#/';
    route();
  }

  /* ---------- เมนู / เส้นทาง ---------- */
  var PAGES = [
    { path: '', label: 'หน้าหลัก', render: pageDashboard },
    { path: 'documents', label: 'เอกสาร', render: pageDocuments },
    { path: 'master', label: 'ข้อมูลหลัก', render: pageMaster },
    { path: 'users', label: 'ผู้ใช้', roles: ['ADMIN'], render: pageUsers },
    { path: 'settings', label: 'ตั้งค่า', roles: ['ADMIN'], render: pageSettings },
    { path: 'system', label: 'ทดสอบระบบ', roles: ['ADMIN'], render: pageSystem }
  ];
  function allowed(p) { return !p.roles || p.roles.some(hasRole); }

  function buildNav() {
    var nav = clear($('nav'));
    PAGES.filter(allowed).forEach(function (p) {
      var a = el('a', p.label, '', { href: '#/' + p.path }); a.dataset.path = p.path; nav.appendChild(a);
    });
  }

  function route() {
    if (!me) return;
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    var page = PAGES.filter(function (p) { return p.path === parts[0]; })[0];
    if (!page || !allowed(page)) { location.hash = '#/'; return; }
    [].forEach.call($('nav').querySelectorAll('a'), function (a) { if (a.dataset.path === page.path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var view = clear($('view')); var token = ++viewToken;
    page.render(view, parts.slice(1), function () { return token === viewToken; });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  function pageTitle(view, title, sub) {
    var c = el('div', null, 'card'); add(c, el('h1', title)); if (sub) add(c, el('div', sub, 'muted')); view.appendChild(c); return c;
  }
  function loading(view, text) { var n = el('div', text || 'กำลังโหลด...', 'muted card', { role: 'status' }); view.appendChild(n); return n; }

  /* ---------- หน้าหลัก (Dashboard) ---------- */
  function statLink(label, value, href, alert) {
    var box = el('div', null, 'stat' + (alert && value > 0 ? ' alert' : ''));
    var a = el('a', null, '', { href: href }); add(a, el('b', String(value)), el('span', label, 'muted')); box.appendChild(a); return box;
  }

  function docTable(rows, withActions) {
    var wrap = el('div', null, 'scroll'), t = el('table', null, 'stack'), head = el('tr');
    var heads = ['เลขที่', 'เรื่อง', 'Menu', 'สถานะ', 'หน่วยงาน', withActions ? 'ต้องทำ' : 'อัปเดตล่าสุด'];
    heads.forEach(function (h) { head.appendChild(el('th', h)); });
    add(t, add(el('thead'), head));
    var tb = el('tbody');
    rows.forEach(function (d) {
      var tr = el('tr', null, 'click', { tabindex: '0', role: 'link' });
      var go = function () { location.hash = '#/documents/' + encodeURIComponent(d.id); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
      add(tr, el('td', d.doc_no || '(ยังไม่มีเลขที่)'), el('td', d.title), el('td', moduleLabel(d.module)), add(el('td'), badge(d.status)), el('td', d.department_name || '-'),
          el('td', withActions ? (d.actions || []).map(actionLabel).join(', ') : fmtDate(d.updated_at)));
      [].forEach.call(tr.children, function (td, i) { td.setAttribute('data-label', heads[i]); });
      tb.appendChild(tr);
    });
    add(t, tb); wrap.appendChild(t); return wrap;
  }

  function pageDashboard(view, args, alive) {
    pageTitle(view, 'หน้าหลัก', 'สวัสดี ' + me.full_name);
    var box = loading(view);
    callApi('dashboard.summary').then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(view, add(el('div', null, 'card'), el('span', errText(r), 'fail'))); return; }
      var d = r.data;
      var grid = el('div', null, 'grid');
      add(grid, statLink('เอกสารที่ฉันเห็น', d.totals.documents, '#/documents'), statLink('ของฉัน', d.totals.mine, '#/documents'),
          statLink('งานรอฉัน', d.totals.my_tasks, '#/', true), statLink('ค้างนาน (เกิน ' + d.stale.days + ' วัน)', d.stale.count, '#/', true));
      view.appendChild(grid);

      var tasks = add(el('div', null, 'card'), el('h2', 'งานรอฉัน'));
      if (d.my_tasks.length) {
        add(tasks, docTable(d.my_tasks, true));
        if (d.totals.my_tasks > d.my_tasks.length) add(tasks, el('div', 'แสดง ' + d.my_tasks.length + ' จาก ' + d.totals.my_tasks + ' รายการ', 'muted'));
      } else add(tasks, el('div', 'ไม่มีงานค้างที่ต้องทำ', 'muted'));
      view.appendChild(tasks);

      var br = add(el('div', null, 'card'), el('h2', 'จำนวนเอกสาร'));
      var byS = Object.keys(d.by_status), byM = Object.keys(d.by_module).sort();
      if (!byS.length) add(br, el('div', 'ยังไม่มีเอกสารที่คุณเห็น', 'muted'));
      else {
        add(br, el('h3', 'ตามสถานะ'));
        byS.forEach(function (s) { var a = el('a', statusLabel(s) + ' ' + d.by_status[s], 'chip', { href: '#/documents' }); a.addEventListener('click', function () { sessionStorageSafe('docfilter', JSON.stringify({ status: s })); }); br.appendChild(a); });
        add(br, el('h3', 'ตาม Menu'));
        byM.forEach(function (m) { var a = el('a', moduleLabel(m) + ' ' + d.by_module[m], 'chip', { href: '#/documents' }); a.addEventListener('click', function () { sessionStorageSafe('docfilter', JSON.stringify({ module: m })); }); br.appendChild(a); });
      }
      view.appendChild(br);

      if (d.stale.count) {
        var st = add(el('div', null, 'card'), el('h2', 'เอกสารค้างนาน'), el('div', 'ไม่ใช่แบบร่าง ยังไม่ปิด และไม่มีความเคลื่อนไหวเกิน ' + d.stale.days + ' วัน (ค่าเริ่มต้นชั่วคราว)', 'muted'));
        add(st, docTable(d.stale.rows, false)); view.appendChild(st);
      }

      if (d.admin) {
        var ad = add(el('div', null, 'card'), el('h2', 'ภาพรวมระบบ (ผู้ดูแลระบบ)'));
        var kv = el('dl', null, 'kv');
        add(kv, el('dt', 'ผู้ใช้ที่ใช้งานอยู่'), el('dd', String(d.admin.users)),
            el('dt', 'ข้อมูลหลัก'), el('dd', 'วัสดุ ' + d.admin.master.items + ' · ผู้ขาย ' + d.admin.master.vendors + ' · หน่วยงาน ' + d.admin.master.departments + ' · ยังไม่มีรหัส ' + d.admin.master.pending_items));
        if (d.admin.storage) {
          var pct = Math.min(100, Math.round(d.admin.storage.used_bytes * 100 / d.admin.storage.limit_bytes));
          var bar = el('div', null, 'bar'); var fill = el('i'); fill.style.width = pct + '%'; bar.appendChild(fill);
          add(kv, el('dt', 'พื้นที่ Drive'), add(el('dd'), el('span', fmtBytes(d.admin.storage.used_bytes) + ' จาก ' + fmtBytes(d.admin.storage.limit_bytes) + ' (' + pct + '%)'), bar));
        }
        add(ad, kv); view.appendChild(ad);
      }
    });
  }

  function sessionStorageSafe(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ไม่มีที่เก็บก็ไม่เป็นไร */ } }
  function sessionStorageTake(k) { try { var v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch (e) { return null; } }

  /* ---------- เอกสาร: รายการ + ค้นหา ---------- */
  function pageDocuments(view, args, alive) {
    if (args[0]) return pageDocumentDetail(view, decodeURIComponent(args[0]), alive);
    pageTitle(view, 'เอกสาร', 'ค้นหาจากเลขที่ ชื่อเรื่อง ชื่อหน่วยงาน หรือชื่อผู้ขอ — เห็นเฉพาะเอกสารที่คุณมีสิทธิ์');
    var f = { q: '', module: '', status: '', from: '', to: '', mine_only: false, page: 1 };
    var pre = sessionStorageTake('docfilter'); if (pre) { try { var o = JSON.parse(pre); Object.keys(o).forEach(function (k) { f[k] = o[k]; }); } catch (e) { /* ข้าม */ } }

    var card = el('div', null, 'card'), form = el('form', null, '', { autocomplete: 'off' });
    var row = el('div', null, 'row');
    function field(label, input) { var d = el('div'); var l = el('label', label); input.id = 'f-' + label; l.setAttribute('for', input.id); add(d, l, input); return d; }
    var q = el('input', null, '', { type: 'search', placeholder: 'พิมพ์คำค้น', maxlength: '100' }); q.value = f.q;
    var mod = el('select'); add(mod, el('option', 'ทุก Menu')); mod.firstChild.value = '';
    ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].forEach(function (m) { var o = el('option', moduleLabel(m)); o.value = m; mod.appendChild(o); }); mod.value = f.module;
    var st = el('select'); var all = el('option', 'ทุกสถานะ'); all.value = ''; st.appendChild(all);
    Object.keys(STATUS_LABEL).forEach(function (s) { var o = el('option', STATUS_LABEL[s]); o.value = s; st.appendChild(o); }); st.value = f.status;
    var from = el('input', null, '', { type: 'date' }), to = el('input', null, '', { type: 'date' }); from.value = f.from; to.value = f.to;
    add(row, field('คำค้น', q), field('Menu', mod), field('สถานะ', st), field('สร้างตั้งแต่', from), field('ถึงวันที่', to));
    var mineL = el('label'); var mine = el('input', null, '', { type: 'checkbox' }); mine.checked = !!f.mine_only; add(mineL, mine, document.createTextNode(' เฉพาะของฉัน'));
    var go = el('button', 'ค้นหา', '', { type: 'submit' }), reset = el('button', 'ล้างตัวกรอง', 'secondary', { type: 'button' });
    add(form, row, mineL, add(el('div', null, 'actions'), go, reset)); card.appendChild(form); view.appendChild(card);

    var result = el('div'); view.appendChild(result);
    function load() {
      f.q = q.value.trim(); f.module = mod.value; f.status = st.value; f.from = from.value; f.to = to.value; f.mine_only = mine.checked;
      var p = { page: f.page, page_size: 20 };
      ['q', 'module', 'status', 'from', 'to'].forEach(function (k) { if (f[k]) p[k] = f[k]; });
      if (f.mine_only) p.mine_only = true;
      clear(result); loading(result);
      return callApi('documents.list', p).then(function (r) {
        if (!alive()) return; clear(result);
        var c = el('div', null, 'card');
        if (!r.ok) { add(c, el('span', errText(r), 'fail')); result.appendChild(add(c)); return; }
        var d = r.data;
        add(c, el('div', 'พบ ' + d.total + ' รายการ', 'muted'));
        if (d.rows.length) add(c, docTable(d.rows, false)); else add(c, el('p', 'ไม่พบเอกสารตามเงื่อนไข', 'muted'));
        var pages = Math.max(1, Math.ceil(d.total / d.page_size)), pager = el('div', null, 'pager');
        var prev = el('button', 'ก่อนหน้า', 'secondary small', { type: 'button' }), next = el('button', 'ถัดไป', 'secondary small', { type: 'button' });
        prev.disabled = d.page <= 1; next.disabled = d.page >= pages;
        prev.addEventListener('click', function () { f.page--; load(); }); next.addEventListener('click', function () { f.page++; load(); });
        add(pager, prev, el('span', 'หน้า ' + d.page + ' / ' + pages), next); if (d.total > d.page_size) c.appendChild(pager);
        result.appendChild(c);
      });
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); f.page = 1; guard(go, load); });
    reset.addEventListener('click', function () { q.value = ''; mod.value = ''; st.value = ''; from.value = ''; to.value = ''; mine.checked = false; f.page = 1; load(); });
    load();
  }

  /* ---------- เอกสาร: รายละเอียด ---------- */
  function pageDocumentDetail(view, id, alive) {
    var back = el('a', '← กลับไปรายการเอกสาร', '', { href: '#/documents' }); add(view, add(el('p'), back));
    var box = loading(view);
    function refresh() {
      return callApi('documents.get', { id: id }).then(function (r) {
        if (!alive()) return; box.remove();
        [].slice.call(view.querySelectorAll('.doc-part')).forEach(function (n) { n.remove(); });
        if (!r.ok) { add(view, add(el('div', null, 'card doc-part'), el('span', errText(r), 'fail'))); return; }
        renderDetail(view, r.data, refresh);
      });
    }
    refresh();
  }

  function renderDetail(view, data, refresh) {
    var d = data.document;
    var head = el('div', null, 'card doc-part');
    add(head, el('h1', d.title), add(el('div'), badge(d.status), el('span', ' ' + (d.doc_no || '(ยังไม่มีเลขที่)') + (d.revision ? ' · แก้ไขครั้งที่ ' + d.revision : ''), 'muted')));
    var kv = el('dl', null, 'kv');
    add(kv, el('dt', 'Menu'), el('dd', moduleLabel(d.module)), el('dt', 'หน่วยงาน'), el('dd', d.department_name || '-'), el('dt', 'ผู้ขอ'), el('dd', d.requester_name || '-'),
        el('dt', 'สร้างเมื่อ'), el('dd', fmtDate(d.created_at)), el('dt', 'ส่งเมื่อ'), el('dd', fmtDate(d.submitted_at)), el('dt', 'ปิดเมื่อ'), el('dd', fmtDate(d.closed_at)));
    head.appendChild(kv);

    if (data.actions.length) {
      var acts = el('div', null, 'actions');
      data.actions.forEach(function (a) {
        var b = el('button', actionLabel(a.action), a.action === 'CANCEL' || a.action === 'REJECT' ? 'danger' : '', { type: 'button' });
        b.addEventListener('click', function () { runAction(b, d, a, refresh); });
        acts.appendChild(b);
      });
      add(head, el('h3', 'ดำเนินการ'), acts);
    }
    view.appendChild(head);

    var att = el('div', null, 'card doc-part'); add(att, el('h2', 'ไฟล์แนบ (' + data.attachments.length + ')'));
    if (data.attachments.length) {
      var t = el('table', null, 'stack'), tr = el('tr'), ah = ['ชื่อไฟล์', 'ขนาด', 'แนบเมื่อ', ''];
      ah.forEach(function (h) { tr.appendChild(el('th', h)); });
      add(t, add(el('thead'), tr)); var tb = el('tbody');
      data.attachments.forEach(function (a) {
        var row = el('tr'), act = el('td');
        var dl = el('button', 'ดาวน์โหลด', 'secondary small', { type: 'button' }); dl.addEventListener('click', function () { guard(dl, function () { return downloadAttachment(a); }); });
        add(act, dl);
        if (data.can_attach) { var rm = el('button', 'ลบ', 'danger small', { type: 'button' }); rm.style.marginLeft = '6px'; rm.addEventListener('click', function () { removeAttachment(rm, a, refresh); }); act.appendChild(rm); }
        add(row, el('td', a.original_filename), el('td', fmtBytes(a.file_size)), el('td', fmtDate(a.uploaded_at)), act);
        [].forEach.call(row.children, function (td, i) { if (ah[i]) td.setAttribute('data-label', ah[i]); }); tb.appendChild(row);
      });
      add(t, tb); add(att, add(el('div', null, 'scroll'), t));
    } else add(att, el('div', 'ยังไม่มีไฟล์แนบ', 'muted'));
    if (data.can_attach) att.appendChild(uploadBox(d.id, refresh));
    view.appendChild(att);

    var hist = el('div', null, 'card doc-part'); add(hist, el('h2', 'ประวัติการดำเนินการ'));
    if (data.history.length) {
      var ul = el('ul', null, 'timeline');
      data.history.forEach(function (h) {
        var li = el('li'); add(li, el('b', actionLabel(h.action)), el('span', ' · ' + statusLabel(h.from_status) + ' → ' + statusLabel(h.to_status), 'muted'),
          el('div', (h.acted_by_name || '-') + ' · ' + fmtDate(h.acted_at), 'muted'));
        if (h.comment) li.appendChild(el('div', h.comment)); ul.appendChild(li);
      });
      hist.appendChild(ul);
    } else add(hist, el('div', 'ยังไม่มีประวัติ', 'muted'));
    view.appendChild(hist);
  }

  /* ถามความเห็น (ถ้าคำสั่งต้องมี) แล้วส่งคำสั่ง — แสดงผลสำเร็จเมื่อเซิร์ฟเวอร์ยืนยันเท่านั้น */
  function runAction(btn, doc, action, refresh) {
    function send(comment) {
      var payload = { document_id: doc.id, action: action.action, version: doc.version };
      if (comment) payload.comment = comment;
      return callApi('workflow.transition', payload).then(function (r) {
        if (!r.ok) { reportFail(r); return false; }
        toast('ดำเนินการสำเร็จ: ' + actionLabel(action.action)); return refresh().then(function () { return true; });
      });
    }
    if (!action.comment_required) { guard(btn, function () { return send(''); }); return; }
    askComment('ความเห็น/เหตุผล (ต้องระบุ) — ' + actionLabel(action.action), function (text, dialogBtn) { return send(text).then(function (ok) { return ok; }); });
  }

  function askComment(title, onSubmit) {
    var bg = el('div', null, 'dialog-bg'), dlg = el('div', null, 'dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    var ta = el('textarea', null, '', { maxlength: '2000', 'aria-label': 'ความเห็น' }), err = el('div', null, 'fail', { role: 'alert' });
    var ok = el('button', 'ยืนยัน', '', { type: 'button' }), cancel = el('button', 'ยกเลิก', 'secondary', { type: 'button' });
    add(dlg, el('h2', title), ta, err, add(el('div', null, 'actions'), ok, cancel)); bg.appendChild(dlg); document.body.appendChild(bg); ta.focus();
    function close() { bg.remove(); }
    cancel.addEventListener('click', close);
    bg.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
    ok.addEventListener('click', function () {
      var text = ta.value.trim(); if (!text) { err.textContent = 'ต้องระบุความเห็น'; return; }
      guard(ok, function () { return onSubmit(text, ok).then(function (done) { if (done) close(); }); });
    });
  }

  /* ---------- ไฟล์แนบ ---------- */
  var ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'], MAX_FILE = 10 * 1024 * 1024;
  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
      fr.readAsDataURL(file);
    });
  }

  function uploadBox(docId, refresh) {
    var box = el('div'); add(box, el('h3', 'แนบไฟล์'), el('div', 'รับ PDF, JPG, PNG ขนาดไม่เกิน 10 MB ต่อไฟล์ · เลือกได้หลายไฟล์ · ไฟล์ที่ล้มเหลวลองใหม่ได้ทีละไฟล์', 'muted'));
    var input = el('input', null, '', { type: 'file', multiple: 'multiple', accept: '.pdf,.jpg,.jpeg,.png', 'aria-label': 'เลือกไฟล์แนบ' });
    var list = el('div'), anyOk = false, retryable = 0;
    add(box, add(el('p'), input), list);
    function uploadOne(file, status, retryBtn) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ALLOWED_EXT.indexOf(ext) < 0) { status.textContent = 'ชนิดไฟล์ไม่รองรับ'; status.className = 'fail'; return Promise.resolve(); }
      if (file.size > MAX_FILE) { status.textContent = 'ไฟล์ใหญ่เกิน 10 MB'; status.className = 'fail'; return Promise.resolve(); }
      if (file.size === 0) { status.textContent = 'ไฟล์ว่าง'; status.className = 'fail'; return Promise.resolve(); }
      status.textContent = 'กำลังอัปโหลด...'; status.className = 'muted'; retryBtn.classList.add('hidden');
      return readBase64(file).then(function (b64) {
        return callApi('attachments.upload', { document_id: docId, filename: file.name, data_base64: b64 }, { timeout: 180000 });
      }).then(function (r) {
        if (!r.ok) {
          var why = r.fields ? Object.keys(r.fields).map(function (k) { return fieldText(r.fields[k]); }).join(', ') : '';
          status.textContent = 'ไม่สำเร็จ: ' + r.message + (why ? ' (' + why + ')' : '') + (r.ref ? ' [' + r.ref + ']' : ''); status.className = 'fail';
          if (retryBtn.classList.contains('hidden')) retryable++;
          retryBtn.classList.remove('hidden'); return;
        }
        if (!retryBtn.classList.contains('hidden')) { retryable--; retryBtn.classList.add('hidden'); }
        status.textContent = r.data.duplicate ? 'มีไฟล์เนื้อหาเดียวกันอยู่แล้ว (ไม่แนบซ้ำ)' : 'อัปโหลดสำเร็จ'; status.className = 'pass'; anyOk = true;
      }).catch(function (e) { status.textContent = 'ไม่สำเร็จ: ' + e.message; status.className = 'fail'; if (retryBtn.classList.contains('hidden')) retryable++; retryBtn.classList.remove('hidden'); });
    }
    input.addEventListener('change', function () {
      var files = [].slice.call(input.files); input.value = ''; if (!files.length) return;
      input.disabled = true;
      /* ทีละไฟล์ตามลำดับ (เซิร์ฟเวอร์เขียนทีละคำสั่ง ส่งพร้อมกันหลายไฟล์ใหญ่เสี่ยงหมดเวลา) */
      var chain = Promise.resolve();
      files.forEach(function (file) {
        var row = el('div'), name = el('span', file.name + ' (' + fmtBytes(file.size) + ') '), status = el('b'), retry = el('button', 'ลองใหม่', 'secondary small hidden', { type: 'button' });
        retry.style.marginLeft = '8px'; add(row, name, status, retry); list.appendChild(row);
        retry.addEventListener('click', function () { guard(retry, function () { return uploadOne(file, status, retry).then(function () { if (anyOk && retryable === 0) refresh(); }); }); });
        chain = chain.then(function () { return uploadOne(file, status, retry); });
      });
      chain.then(function () {
        input.disabled = false;
        /* ถ้ายังมีไฟล์ที่ลองใหม่ได้ ไม่โหลดหน้าใหม่ (จะทำให้ปุ่ม "ลองใหม่" หายไป) — โหลดหลังลองใหม่ครบ */
        if (anyOk && retryable === 0) { toast('อัปโหลดเสร็จ'); refresh(); }
        else if (retryable > 0) toast('มีไฟล์ที่อัปโหลดไม่สำเร็จ ลองใหม่ได้ทีละไฟล์', true);
      });
    });
    return box;
  }

  function downloadAttachment(a) {
    return callApi('attachments.download', { attachment_id: a.id }, { timeout: 180000 }).then(function (r) {
      if (!r.ok) { reportFail(r); return; }
      var bin = atob(r.data.data_base64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([bytes], { type: r.data.file_type }));
      var link = el('a', null, '', { href: url, download: r.data.filename }); document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      toast('ดาวน์โหลด ' + r.data.filename);
    });
  }

  function removeAttachment(btn, a, refresh) {
    if (!window.confirm('ลบไฟล์ "' + a.original_filename + '" ออกจากเอกสาร?\n(ไฟล์ยังถูกเก็บไว้ในระบบ ไม่ถูกลบถาวร)')) return;
    guard(btn, function () {
      return callApi('attachments.remove', { attachment_id: a.id, version: a.version }).then(function (r) {
        if (!r.ok) { reportFail(r); return; }
        toast('ลบไฟล์แล้ว'); return refresh();
      });
    });
  }

  /* ---------- ข้อมูลหลัก (อ่านอย่างเดียว) ---------- */
  var MASTER_KINDS = [
    { key: 'items', label: 'วัสดุ', action: 'master.items', cols: [['รหัส', 'code'], ['ชื่อรายการ', 'name']] },
    { key: 'vendors', label: 'ผู้ขาย', action: 'master.vendors', cols: [['ชื่อ', 'name']] },
    { key: 'departments', label: 'หน่วยงาน', action: 'master.departments', cols: [['ชื่อ', 'name']] },
    { key: 'pending_items', label: 'ยังไม่มีรหัส', action: 'master.pending_items', roles: ['ADMIN', 'OFFICER'], cols: [['ชื่อรายการ', 'name'], ['หน่วยงานที่ขอ (ตามไฟล์เดิม)', 'requested_by_text']] }
  ];
  var masterCache = {}, MASTER_SHOW = 100;

  function pageMaster(view, args, alive) {
    pageTitle(view, 'ข้อมูลหลัก (อ่านอย่างเดียว)', 'วัสดุ ผู้ขาย หน่วยงาน ที่นำเข้าจากไฟล์ Excel · ค้นหาจากรหัสหรือชื่อได้');
    var card = el('div', null, 'card'), tabs = el('div'), q = el('input', null, '', { type: 'search', placeholder: 'ค้นหา...', 'aria-label': 'ค้นหาข้อมูลหลัก' });
    q.style.width = '100%'; q.style.maxWidth = '420px'; q.style.margin = '8px 0';
    var count = el('div', null, 'muted'), wrap = el('div', null, 'scroll'), msg = el('p', null, '', { role: 'status' });
    add(card, tabs, q, count, wrap, msg); view.appendChild(card);
    var kind = MASTER_KINDS[0];

    function renderTabs() {
      clear(tabs);
      MASTER_KINDS.filter(function (k) { return !k.roles || k.roles.some(hasRole); }).forEach(function (k) {
        var b = el('button', k.label, k.key === kind.key ? '' : 'secondary', { type: 'button' }); b.style.marginRight = '6px';
        b.addEventListener('click', function () { kind = k; q.value = ''; renderTabs(); open(); }); tabs.appendChild(b);
      });
    }
    function rows() {
      var all = masterCache[kind.key] || [], s = q.value.trim().toLowerCase();
      var list = s ? all.filter(function (r) { return kind.cols.some(function (c) { return String(r[c[1]] || '').toLowerCase().indexOf(s) >= 0; }); }) : all;
      var t = el('table'), tr = el('tr'); kind.cols.forEach(function (c) { tr.appendChild(el('th', c[0])); }); add(t, add(el('thead'), tr));
      var tb = el('tbody'); list.slice(0, MASTER_SHOW).forEach(function (r) { var x = el('tr'); kind.cols.forEach(function (c) { x.appendChild(el('td', r[c[1]])); }); tb.appendChild(x); });
      t.appendChild(tb); clear(wrap).appendChild(t);
      count.textContent = 'ทั้งหมด ' + all.length + ' รายการ' + (s ? ' · พบ ' + list.length : '') + (list.length > MASTER_SHOW ? ' · แสดง ' + MASTER_SHOW + ' รายการแรก (พิมพ์ค้นหาเพื่อกรอง)' : '');
    }
    function open() {
      if (masterCache[kind.key]) { rows(); return; }
      msg.textContent = 'กำลังโหลด...'; clear(wrap);
      callApi(kind.action).then(function (r) {
        if (!alive()) return;
        if (!r.ok) { msg.textContent = errText(r); msg.className = 'fail'; return; }
        msg.textContent = ''; msg.className = ''; masterCache[kind.key] = r.data.rows; rows();
      });
    }
    q.addEventListener('input', function () { if (masterCache[kind.key]) rows(); });
    renderTabs(); open();
  }

  /* ---------- ผู้ใช้ (ADMIN) ---------- */
  function pageUsers(view, args, alive) {
    pageTitle(view, 'จัดการผู้ใช้', 'เพิ่มผู้ใช้ด้วยอีเมล Google ของเขา แล้วกำหนดบทบาท ผู้ที่ไม่อยู่ในรายชื่อจะเข้าสู่ระบบไม่ได้');
    var card = el('div', null, 'card'), form = el('form', null, '', { autocomplete: 'off' }), row = el('div', null, 'row');
    function field(label, input, errId) { var d = el('div'), l = el('label', label); input.id = 'u-' + errId; l.setAttribute('for', input.id); add(d, l, input, el('div', null, 'fail', { id: 'ue-' + errId })); return d; }
    var email = el('input', null, '', { type: 'email', placeholder: 'name@gmail.com' }), fname = el('input', null, '', { type: 'text' }), pos = el('input', null, '', { type: 'text' });
    add(row, field('อีเมล Google *', email, 'email'), field('ชื่อ-สกุล *', fname, 'full_name'), field('ตำแหน่ง', pos, 'position'));
    var rolesBox = el('div'), addBtn = el('button', 'เพิ่มผู้ใช้', '', { type: 'submit' }), msg = el('span', null, '', { role: 'status' });
    add(form, row, el('label', 'บทบาท (ไม่เลือก = USER)'), rolesBox, add(el('p'), addBtn, document.createTextNode(' '), msg)); card.appendChild(form); view.appendChild(card);
    var listCard = el('div', null, 'card'), listBox = el('div', null, 'scroll'), listMsg = el('p', null, '', { role: 'status' }); add(listCard, listBox, listMsg); view.appendChild(listCard);

    function loadUsers() {
      listMsg.textContent = 'กำลังโหลดรายชื่อ...';
      return callApi('users.list').then(function (r) {
        if (!alive()) return;
        if (!r.ok) { listMsg.textContent = errText(r); listMsg.className = 'fail'; return; }
        listMsg.textContent = ''; listMsg.className = ''; rolesAvailable = r.data.roles_available; renderRoleBoxes(); renderUsers(r.data.users);
      });
    }
    function renderRoleBoxes() {
      if (rolesBox.childNodes.length) return;
      rolesAvailable.forEach(function (role) { var l = el('label'); l.style.display = 'inline-block'; l.style.marginRight = '12px'; var c = el('input', null, '', { type: 'checkbox', value: role }); add(l, c, document.createTextNode(' ' + role)); rolesBox.appendChild(l); });
    }
    function act(btn, action, payload) {
      guard(btn, function () { return callApi(action, payload).then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกสำเร็จ'); return loadUsers(); }); });
    }
    function renderUsers(users) {
      var t = el('table'), hr = el('tr'); ['อีเมล / ชื่อ', 'บทบาท', 'สถานะ', 'จัดการ'].forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      users.forEach(function (u) {
        var tr = el('tr', null, u.is_active ? '' : 'off'), c1 = el('td'), c2 = el('td'), c4 = el('td');
        add(c1, el('b', u.full_name), el('div', u.email, 'muted')); if (u.position) c1.appendChild(el('div', u.position, 'muted'));
        u.roles.forEach(function (r) { c2.appendChild(chip(r)); });
        var sel = el('select', null, '', { 'aria-label': 'เลือกบทบาท' }); rolesAvailable.forEach(function (r) { var o = el('option', r); o.value = r; sel.appendChild(o); });
        var grant = el('button', 'ให้บทบาท', 'secondary small', { type: 'button' }), revoke = el('button', 'ถอนบทบาท', 'secondary small', { type: 'button' }), tog = el('button', u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน', 'secondary small', { type: 'button' });
        [grant, revoke, tog].forEach(function (b) { b.style.margin = '2px'; });
        grant.addEventListener('click', function () { act(grant, 'users.grant_role', { user_id: u.id, role: sel.value }); });
        revoke.addEventListener('click', function () { act(revoke, 'users.revoke_role', { user_id: u.id, role: sel.value }); });
        tog.addEventListener('click', function () { act(tog, 'users.set_active', { id: u.id, version: u.version, is_active: !u.is_active }); });
        [sel, grant, revoke, tog].forEach(function (x) { c4.appendChild(x); });
        add(tr, c1, c2, el('td', u.is_active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'), c4); tb.appendChild(tr);
      });
      t.appendChild(tb); clear(listBox).appendChild(t);
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      ['email', 'full_name', 'position'].forEach(function (f) { $('ue-' + f).textContent = ''; });
      var roles = [].slice.call(rolesBox.querySelectorAll('input:checked')).map(function (c) { return c.value; });
      var payload = { email: email.value, full_name: fname.value, position: pos.value }; if (roles.length) payload.roles = roles;
      msg.textContent = 'กำลังบันทึก...'; msg.className = 'muted';
      guard(addBtn, function () {
        return callApi('users.upsert', payload).then(function (r) {
          if (!r.ok) {
            msg.textContent = r.message; msg.className = 'fail';
            if (r.fields) Object.keys(r.fields).forEach(function (f) { var e = $('ue-' + f); if (e) e.textContent = fieldText(r.fields[f]); });
            return;                                  // ข้อมูลที่กรอกไม่ถูกล้าง
          }
          msg.textContent = 'เพิ่มผู้ใช้สำเร็จ'; msg.className = 'pass'; form.reset(); return loadUsers();
        });
      });
    });
    loadUsers();
  }

  /* ---------- ตั้งค่าเลขที่เอกสาร (ADMIN) ---------- */
  function pageSettings(view, args, alive) {
    pageTitle(view, 'ตั้งค่า', 'รูปแบบเลขที่เอกสาร: {คำนำหน้า}{เลขลำดับเติมศูนย์}/{ปีงบประมาณ พ.ศ.} · นับใหม่ทุกปีงบประมาณ (1 ต.ค. – 30 ก.ย.) · ตัวนับแยกต่อ Menu');
    add(view, el('div', 'คำนำหน้าเลขที่ M1–M6 เป็นค่าชั่วคราว ยังรอกำหนดคำนำหน้าจริงของแต่ละ Menu — แก้ได้ที่นี่ การแก้มีผลกับเลขที่ที่ออกใหม่เท่านั้น เลขที่ที่ออกไปแล้วและตัวนับไม่เปลี่ยน', 'notice', { role: 'note' }));
    var card = el('div', null, 'card'), box = loading(card); view.appendChild(card);
    callApi('config.docnumber.list').then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(card, el('span', errText(r), 'fail')); return; }
      var t = el('table'), hr = el('tr'); ['Menu', 'คำนำหน้า', 'จำนวนหลัก', 'ตัวอย่างเลขแรกของปีงบ', ''].forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      r.data.rows.forEach(function (c) {
        var tr = el('tr'), prefix = el('input', null, '', { type: 'text', maxlength: '12', 'aria-label': 'คำนำหน้าของ ' + c.module }), pad = el('select', null, '', { 'aria-label': 'จำนวนหลักของ ' + c.module });
        prefix.value = c.prefix; prefix.style.width = '8em';
        for (var i = 1; i <= 6; i++) { var o = el('option', String(i)); o.value = String(i); pad.appendChild(o); } pad.value = String(c.pad);
        var prev = el('td', c.preview), save = el('button', 'บันทึก', 'small', { type: 'button' }), msg = el('div', null, '', { role: 'status' }), cur = c;
        add(tr, el('td', moduleLabel(c.module)), add(el('td'), prefix), add(el('td'), pad), prev, add(el('td'), save, msg)); tb.appendChild(tr);
        save.addEventListener('click', function () {
          msg.textContent = ''; msg.className = '';
          guard(save, function () {
            return callApi('config.docnumber.update', { id: cur.id, version: cur.version, prefix: prefix.value, pad: parseInt(pad.value, 10) }).then(function (u) {
              if (!u.ok) { msg.textContent = u.message + (u.fields && u.fields.prefix ? ' (' + fieldText(u.fields.prefix) + ')' : ''); msg.className = 'fail'; return; }
              cur = { id: u.data.id, version: u.data.version }; prev.textContent = u.data.preview; msg.textContent = 'บันทึกสำเร็จ'; msg.className = 'pass';
            });
          });
        });
      });
      t.appendChild(tb); add(card, add(el('div', null, 'scroll'), t));
    });
  }

  /* ---------- ทดสอบระบบ (ADMIN): บันทึกพร้อมกัน ---------- */
  function pageSystem(view) {
    pageTitle(view, 'ทดสอบบันทึกพร้อมกัน', 'ส่งคำสั่งบันทึกพร้อมกันหลายรายการ แล้วตรวจว่าไม่มีรายการซ้ำหรือหาย (ใช้ข้อมูลทดสอบเท่านั้น)');
    var card = el('div', null, 'card'), n = el('input', null, '', { type: 'number', min: '1', max: '200', value: '50', 'aria-label': 'จำนวนรายการ' }), run = el('button', 'เริ่มทดสอบ', '', { type: 'button' }), out = el('div', null, '', { role: 'status' });
    add(card, add(el('p'), document.createTextNode('จำนวน: '), n, document.createTextNode(' '), run), out); view.appendChild(card);
    run.addEventListener('click', function () {
      var count = Math.max(1, Math.min(200, parseInt(n.value, 10) || 50)), runId = newRequestId();
      guard(run, function () {
        out.textContent = 'กำลังส่ง ' + count + ' รายการพร้อมกัน...'; stats.busyRetries = 0;
        var started = Date.now(), calls = [];
        for (var i = 1; i <= count; i++) calls.push(callApi('spike.write', { run_id: runId, client_seq: i }));
        return Promise.all(calls).then(function (results) {
          var seconds = ((Date.now() - started) / 1000).toFixed(1), ok = results.filter(function (r) { return r.ok; }).length, errors = {};
          results.forEach(function (r) { if (!r.ok) errors[r.code] = (errors[r.code] || 0) + 1; });
          return callApi('spike.stats', { run_id: runId }).then(function (s) {
            if (!s.ok) { out.textContent = 'อ่านผลไม่สำเร็จ (' + s.code + ')'; out.className = 'fail'; return; }
            var d = s.data, pass = ok === count && d.run_rows === ok && d.duplicate_seq_all === 0 && d.out_of_order_all === 0 && d.run_duplicate_client_seq === 0;
            clear(out); out.className = '';
            add(out, el('p', pass ? 'ผ่าน' : 'ไม่ผ่าน', pass ? 'pass' : 'fail'), el('pre', JSON.stringify({ run_id: runId, sent: count, success: ok, errors: errors, busy_retries: stats.busyRetries, seconds: seconds, sheet: d }, null, 2)));
          });
        });
      });
    });
  }
})();
