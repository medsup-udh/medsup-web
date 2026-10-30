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
  var ACTION_LABEL = { SUBMIT: 'ส่ง', RECEIVE: 'รับเรื่อง', RETURN: 'ส่งกลับแก้ไข', COMPLETE: 'ปิดงาน', CANCEL: 'ยกเลิก', APPROVE: 'อนุมัติ', REJECT: 'ไม่อนุมัติ' };
  /* ชื่อ Menu ตาม SYSTEM_BLUEPRINT ข้อ 1.1 — Menu 2–6 ยังไม่เปิดใช้ */
  var MODULE_NAME = { M1: 'รายงานปัญหา', M2: 'สินค้าตัวอย่าง', M3: 'ประเมิน', M4: 'เบิกควบคุม', M5: 'จัดซื้อนอกแผน', M6: 'ยืนยันแผน' };
  function statusLabel(s) { return STATUS_LABEL[s] || s; }
  function actionLabel(a) { return ACTION_LABEL[a] || a; }
  function moduleLabel(m) { return m ? (MODULE_NAME[m] || m) : '-'; }
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
                    bad_base64: 'อ่านไฟล์ไม่สำเร็จ', empty: 'ไฟล์ว่าง', too_many: 'แนบไฟล์ครบจำนวนสูงสุดแล้ว',
                    not_found: 'ไม่พบในรายการ (อาจถูกปิดใช้งาน)', invalid_phone: 'รูปแบบเบอร์โทรไม่ถูกต้อง', future_date: 'เป็นวันในอนาคตไม่ได้',
                    not_allowed_value: 'ค่าไม่ถูกต้อง', pick_from_list: 'เลือกจากรายการ', too_short: 'สั้นเกินไป' };
  function fieldText(code) { return FIELD_MSG[code] || 'ไม่ถูกต้อง'; }
  var FIELD_LABEL = { department_id: 'หน่วยงาน', phone: 'เบอร์โทรศัพท์', item_id: 'วัสดุ', item_name: 'วัสดุที่พบปัญหา', vendor_id: 'บริษัท', vendor_text: 'บริษัท/ยี่ห้อ',
                      problem_type: 'ประเภทปัญหา', problem_1: 'ปัญหาที่พบ ๓.๑', problem_2: '๓.๒', problem_other: '๓.๓ อื่นๆ', suggestion: 'ข้อเสนอแนะ',
                      reporter_name: 'ชื่อผู้รายงาน', reporter_position: 'ตำแหน่งผู้รายงาน', head_name: 'ชื่อหัวหน้าหน่วยงาน', head_position: 'ตำแหน่งหัวหน้าหน่วยงาน',
                      problem_found_date: 'วันที่พบปัญหา', lot_no: 'เลข Lot', expiry_date: 'วันหมดอายุ', review_result: 'ผลการตรวจสอบ', reply_to_unit: 'ผลแจ้งกลับหน่วยงาน',
                      report: 'ข้อมูลรายงาน', comment: 'เหตุผล', note: 'บันทึก' };
  /** {ช่อง: รหัส} → "หน่วยงาน: ต้องกรอก, ..." */
  function describeFields(fields) {
    return Object.keys(fields || {}).map(function (k) { return (FIELD_LABEL[k] || k) + ': ' + fieldText(fields[k]); }).join(', ');
  }

  /* ---------- เรียก API ---------- */
  var stats = { busyRetries: 0 }, MAX_BUSY_RETRIES = 8;
  /* คำสั่งที่แก้ข้อมูลและกันบันทึกซ้ำด้วย request_id (สร้างครั้งเดียวต่อการกระทำ ใช้ซ้ำเมื่อลองใหม่) */
  var WRITE_ACTIONS = ['users.upsert', 'users.set_active', 'users.grant_role', 'users.revoke_role', 'workflow.transition', 'attachments.remove', 'config.docnumber.update',
                       'm1.save', 'm1.followup.add', 'm1.review.save', 'spike.demo.clear', 'users.update_me', 'join.rotate', 'join.off'];
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
    /* opts.requestId: ใช้รหัสเดิมเมื่อผู้ใช้กดซ้ำหลังเครือข่ายหลุด (Backend คืนผลเดิม ไม่สร้างซ้ำ) */
    var requestId = isWrite ? (opts.requestId || newRequestId()) : null, netRetries = 0;
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
  function reportFail(r) { toast(errText(r) + (r.fields ? ' — ' + describeFields(r.fields) : ''), true); }

  /* ---------- เข้าสู่ระบบ ---------- */
  /**
   * Google ไม่ให้เข้าสู่ระบบในเบราว์เซอร์ที่ฝังในแอปแชต (LINE/Facebook/Messenger/Instagram) — ขึ้น "disallowed_useragent"
   * ลิงก์ระบบมักถูกส่งในกลุ่ม LINE: เปิดจาก LINE → พาไปเบราว์เซอร์ของเครื่องให้เอง (openExternalBrowser=1 ของ LINE) · แอปอื่นบอกวิธีเปิด
   * คืน true = หยุด ไม่ต้องแสดงปุ่ม Google
   */
  function inAppKind() {
    var ua = navigator.userAgent || '';
    return / Line\//i.test(ua) ? 'line' : /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua) ? 'other' : null;
  }
  function inAppBrowserBlocked() {
    var kind = inAppKind(), isLine = kind === 'line';
    if (!kind) return false;
    if (isLine && !/[?&]openExternalBrowser=1/.test(location.search)) {
      var u = new URL(location.href); u.searchParams.set('openExternalBrowser', '1'); location.replace(u.toString());
    }
    var box = $('login-area'); clear(box);
    add(box, el('div', 'เปิดในแอปแชตเข้าสู่ระบบไม่ได้ — กดเมนู ⋮ หรือ ⋯ แล้วเลือก "เปิดในเบราว์เซอร์" (Chrome/Safari)', 'notice'));
    return true;
  }

  /**
   * ลิงก์ลงทะเบียน ...?j=<รหัส> — จำไว้ในแท็บนี้ แล้วลบออกจากแถบที่อยู่ (ไม่ติดไปกับภาพหน้าจอ/การแชร์ต่อ)
   * เปิดจากแอปแชตไม่ลบ เพราะต้องส่งต่อไปเบราว์เซอร์ของเครื่องพร้อมรหัส
   */
  var joinCode = (function () {
    var m = /[?&]j=([0-9a-f]{8,64})(?:&|$)/i.exec(location.search), code = m ? m[1].toLowerCase() : null;
    try { if (code) sessionStorage.setItem('medsup.join', code); else code = sessionStorage.getItem('medsup.join'); } catch (e) { /* ข้าม */ }
    if (m && !inAppKind() && window.history && history.replaceState) {
      var u = new URL(location.href); u.searchParams.delete('j'); u.searchParams.delete('openExternalBrowser');
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    }
    return code;
  })();
  var LOGIN_HINT = 'ครั้งแรก เปิดจากลิงก์ลงทะเบียนที่ได้จากงานพัสดุ';
  function forgetJoinCode() { joinCode = null; try { sessionStorage.removeItem('medsup.join'); } catch (e) { /* ข้าม */ } }

  function dataList(id, values) {
    var dl = el('datalist', null, '', { id: id });
    values.forEach(function (v) { var o = document.createElement('option'); o.value = v; dl.appendChild(o); });
    return dl;
  }
  var POSITIONS = ['พยาบาลวิชาชีพ', 'พยาบาลเทคนิค', 'ผู้ช่วยพยาบาล', 'พนักงานช่วยการพยาบาล', 'นักวิชาการพัสดุ', 'เจ้าพนักงานพัสดุ', 'เจ้าพนักงานธุรการ'];

  window.MedsupInitGoogle = function () {
    if (inAppBrowserBlocked()) return;
    if (!CFG.GOOGLE_CLIENT_ID) { $('login-area').textContent = 'ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID'; return; }
    try {
      google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential });
      clear($('login-area'));
      google.accounts.id.renderButton($('login-area'), { theme: 'outline', size: 'large', locale: 'th' });
    } catch (e) { $('login-area').textContent = 'โหลดปุ่ม Google ไม่สำเร็จ: ' + e.message; }
  };

  function onCredential(resp) {
    $('login-result').textContent = 'กำลังตรวจสอบ...'; $('login-result').className = '';
    callApi('auth.login', { id_token: resp.credential, join_code: joinCode || undefined }).then(function (r) {
      if (!r.ok) {
        if (r.code === 'JOIN_CODE_INVALID') forgetJoinCode();
        $('login-result').textContent = errText(r); $('login-result').className = 'fail'; return;
      }
      if (r.data.need_profile) { $('login-result').textContent = ''; joinForm(r.data); return; }
      startSession(r.data);
    });
  }
  function startSession(data) {
    session = data.session; me = data.profile; forgetJoinCode();
    $('login-result').textContent = '';
    if ($('login-area').querySelector('form.joinform')) { clear($('login-area')); window.MedsupInitGoogle(); }   // ออกจากระบบแล้วต้องเห็นปุ่ม Google ไม่ใช่ฟอร์มเดิม
    enterApp();
  }

  /** ลงทะเบียนครั้งแรก (มาจากลิงก์ลงทะเบียน) — กรอก 3 ช่อง ครั้งเดียว แล้วใช้งานได้ทันที */
  function joinForm(d) {
    var view = $('login-view'), area = clear($('login-area'));
    view.querySelector('h2').textContent = 'ลงทะเบียนครั้งแรก';
    view.querySelector('p').textContent = d.email;
    var byName = {}; d.departments.forEach(function (x) { byName[x.name] = x; });
    var form = el('form', null, 'joinform', { autocomplete: 'off', novalidate: 'novalidate' }), inputs = {}, errs = {};
    function f(key, label, input) {
      input.id = 'join-' + key; inputs[key] = input; errs[key] = el('div', null, 'ferr', { id: 'join-e-' + key });
      input.setAttribute('aria-describedby', errs[key].id); input.required = true;
      input.addEventListener('input', function () { errs[key].textContent = ''; input.removeAttribute('aria-invalid'); });
      return add(el('div', null, 'f'), el('label', label, '', { for: input.id }), input, errs[key]);
    }
    var name = el('input', null, '', { type: 'text', maxlength: '200', autocomplete: 'name' }); name.value = d.suggested_name || '';
    var pos = el('input', null, '', { type: 'text', maxlength: '200', list: 'dl-join-pos' });
    var dept = el('input', null, '', { type: 'text', maxlength: '200', list: 'dl-join-dept', placeholder: 'พิมพ์ชื่อหอ/หน่วยงานแล้วเลือก' });
    var btn = el('button', 'เริ่มใช้งาน', '', { type: 'submit' });
    add(form, f('full_name', 'ชื่อ-สกุล', name), f('position', 'ตำแหน่ง', pos), f('department_id', 'หน่วยงาน', dept),
        dataList('dl-join-pos', POSITIONS), dataList('dl-join-dept', d.departments.map(function (x) { return x.name; })),
        add(el('div', null, 'actions'), btn));
    area.appendChild(form);
    name.focus();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = { full_name: name.value.trim(), position: pos.value.trim(), department_id: '' }, bad = {};
      var dn = dept.value.trim(); if (byName[dn]) v.department_id = byName[dn].id;
      if (!v.full_name) bad.full_name = 'ต้องกรอก';
      if (!v.position) bad.position = 'ต้องกรอก';
      if (!dn) bad.department_id = 'ต้องกรอก'; else if (!v.department_id) bad.department_id = 'เลือกจากรายการ';
      Object.keys(errs).forEach(function (k) { errs[k].textContent = bad[k] || ''; if (bad[k]) inputs[k].setAttribute('aria-invalid', 'true'); });
      if (Object.keys(bad).length) { inputs[Object.keys(bad)[0]].focus(); return; }
      guard(btn, function () {
        v.reg_token = d.reg_token;
        return callApi('auth.register', v).then(function (r) {
          if (r.ok) { startSession(r.data); return; }
          if (r.fields) Object.keys(r.fields).forEach(function (k) { if (errs[k]) { errs[k].textContent = fieldText(r.fields[k]); inputs[k].setAttribute('aria-invalid', 'true'); } });
          $('login-result').textContent = errText(r); $('login-result').className = 'fail';
          if (['JOIN_EXPIRED', 'JOIN_CODE_INVALID', 'JOIN_PAUSED', 'ACCOUNT_DISABLED'].indexOf(r.code) >= 0) {
            if (r.code !== 'JOIN_EXPIRED') forgetJoinCode();
            view.querySelector('h2').textContent = 'เข้าสู่ระบบด้วยบัญชี Google'; view.querySelector('p').textContent = '';
            window.MedsupInitGoogle();
          }
        });
      });
    });
  }

  function signedOut(msg) {
    session = null; me = null; rolesAvailable = []; viewToken++;
    Object.keys(masterCache).forEach(function (k) { delete masterCache[k]; });
    ['who', 'logout', 'nav', 'view'].forEach(function (id) { $(id).classList.add('hidden'); });
    $('login-view').classList.remove('hidden');
    $('login-view').querySelector('h2').textContent = 'เข้าสู่ระบบด้วยบัญชี Google';
    $('login-view').querySelector('p').textContent = LOGIN_HINT;
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
    add(who, add(el('a', null, 'who-link', { href: '#/me', title: 'แก้ข้อมูลของฉัน' }), el('b', me.full_name), me.position ? el('span', ' · ' + me.position) : null), el('br'), el('span', me.email));
    ['who', 'logout', 'nav', 'view'].forEach(function (id) { $(id).classList.remove('hidden'); });
    buildNav();
    if (!location.hash) location.hash = '#/';
    route();
  }

  /* ---------- เมนู / เส้นทาง ---------- */
  var PAGES = [
    { path: '', label: 'หน้าหลัก', render: pageDashboard },
    { path: 'report', label: 'แจ้งปัญหา', roles: ['USER', 'OFFICER'], render: pageReportForm },
    { path: 'documents', label: 'เอกสาร', render: pageDocuments },
    { path: 'print', label: 'พิมพ์', nav: false, render: pagePrint },
    { path: 'me', label: 'ข้อมูลของฉัน', nav: false, render: pageMe },
    { path: 'master', label: 'ข้อมูลหลัก', render: pageMaster },
    { path: 'users', label: 'ผู้ใช้', roles: ['ADMIN'], render: pageUsers },
    { path: 'settings', label: 'ตั้งค่า', roles: ['ADMIN'], render: pageSettings },
    { path: 'system', label: 'ทดสอบระบบ', roles: ['ADMIN'], render: pageSystem }
  ];
  function allowed(p) { return !p.roles || p.roles.some(hasRole); }

  function buildNav() {
    var nav = clear($('nav'));
    PAGES.filter(function (p) { return allowed(p) && p.nav !== false; }).forEach(function (p) {
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
    var top = pageTitle(view, 'หน้าหลัก', 'สวัสดี ' + me.full_name);
    if (hasRole('USER') || hasRole('OFFICER')) add(top, add(el('div', null, 'actions'), el('a', '+ แจ้งปัญหาวัสดุ', 'btn', { href: '#/report' })));
    var box = loading(view);
    callApi('dashboard.summary').then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(view, add(el('div', null, 'card'), el('span', errText(r), 'fail'))); return; }
      var d = r.data;
      if (d.admin && d.admin.officers === 0) {
        var ow = add(el('div', null, 'notice', { role: 'alert' }), document.createTextNode('ยังไม่มีเจ้าหน้าที่พัสดุ (OFFICER) — รายงานที่ส่งมาจะไม่มีผู้รับเรื่อง · '), el('a', 'ให้บทบาทที่เมนูผู้ใช้', '', { href: '#/users' }));
        view.appendChild(ow);
      }
      (d.admin && d.admin.join_alerts || []).forEach(function (a) {
        var t = a.kind === 'JOIN_PAUSED' ? 'ลิงก์ลงทะเบียนหยุดรับเอง เพราะมีคนสมัครถี่ผิดปกติ — เปลี่ยนลิงก์ที่เมนูผู้ใช้'
          : a.kind === 'JOIN_BURST' ? 'มีคนสมัครผ่านลิงก์ ' + a.n + ' คนใน 1 ชั่วโมง — ถ้าไม่ได้เพิ่งประกาศลิงก์ ให้เปลี่ยนลิงก์'
          : a.kind === 'MANY_MOVES' ? 'ย้ายหน่วยงานบ่อย (3 ครั้งขึ้นไปใน 30 วัน): ' + (a.names || []).join(', ') : null;
        if (t) view.appendChild(add(el('div', null, 'notice', { role: 'alert' }), document.createTextNode(t + ' · '), el('a', 'ไปเมนูผู้ใช้', '', { href: '#/users' })));
      });
      if (d.admin && d.admin.backup && d.admin.backup.warn) {
        var W = { never: 'ยังไม่เคยสำรองข้อมูลอัตโนมัติ — ติดตั้งตัวตั้งเวลาตามคู่มือผู้ดูแลระบบ (docs/ADMIN_GUIDE.md)', failed: 'การสำรองข้อมูลครั้งล่าสุดล้มเหลว — ตรวจสอบโดยเร็ว', stale: 'ไม่มีการสำรองข้อมูลสำเร็จเกิน 2 วัน — ตรวจสอบตัวตั้งเวลา' };
        view.appendChild(el('div', W[d.admin.backup.warn] || 'ตรวจสอบการสำรองข้อมูล', 'notice', { role: 'alert' }));
      }
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
        add(kv, el('dt', 'ผู้ใช้ที่ใช้งานอยู่'), el('dd', String(d.admin.users) + (typeof d.admin.officers === 'number' ? ' (เจ้าหน้าที่พัสดุ ' + d.admin.officers + ')' : '')),
            el('dt', 'ข้อมูลหลัก'), el('dd', 'วัสดุ ' + d.admin.master.items + ' · ผู้ขาย ' + d.admin.master.vendors + ' · หน่วยงาน ' + d.admin.master.departments + ' · ยังไม่มีรหัส ' + d.admin.master.pending_items));
        if (d.admin.backup) {
          var bk = d.admin.backup, last = bk.last, btxt = !last ? 'ยังไม่เคยสำรอง' : last.ok ? fmtDate(last.at) + ' (สำเร็จ · วันที่ ' + last.date + ')' : 'ล้มเหลวเมื่อ ' + fmtDate(last.at) + (last.message ? ' — ' + last.message : '');
          add(kv, el('dt', 'สำรองข้อมูลล่าสุด'), el('dd', btxt, bk.warn ? 'fail' : ''));
        }
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
    var top = pageTitle(view, 'เอกสาร', 'ค้นจากเลขที่ ชื่อเรื่อง หน่วยงาน หรือชื่อผู้ขอ');
    if (hasRole('USER') || hasRole('OFFICER')) add(top, add(el('div', null, 'actions'), el('a', '+ แจ้งปัญหาวัสดุ', 'btn', { href: '#/report' })));
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
    var d = data.document, md = data.module_data;
    var isM1 = d.module === 'M1' && !!md;
    var head = el('div', null, 'card doc-part');
    add(head, el('h1', d.title), add(el('div'), badge(d.status), el('span', ' ' + (d.doc_no || '(ยังไม่มีเลขที่)') + (d.revision ? ' · แก้ไขครั้งที่ ' + d.revision : ''), 'muted')));
    var kv = el('dl', null, 'kv');
    if (isM1) {
      add(kv, el('dt', 'หน่วยงาน'), el('dd', d.department_name || '-'),
          el('dt', 'ผู้รายงาน'), el('dd', (md.report && md.report.reporter_name) || d.requester_name || '-'));
      if (md.submitted_at || d.submitted_at) add(kv, el('dt', 'ส่งเมื่อ'), el('dd', fmtDate(md.submitted_at || d.submitted_at)));
      if (md.received) add(kv, el('dt', 'รับเรื่อง'), el('dd', (md.received.by_name || '-') + ' · ' + fmtDate(md.received.at)));
      if (d.closed_at) add(kv, el('dt', d.status === 'CANCELLED' ? 'ยกเลิกเมื่อ' : 'ปิดงานเมื่อ'), el('dd', fmtDate(d.closed_at)));
    } else {
      add(kv, el('dt', 'Menu'), el('dd', moduleLabel(d.module)), el('dt', 'หน่วยงาน'), el('dd', d.department_name || '-'), el('dt', 'ผู้ขอ'), el('dd', d.requester_name || '-'),
          el('dt', 'สร้างเมื่อ'), el('dd', fmtDate(d.created_at)), el('dt', 'ส่งเมื่อ'), el('dd', fmtDate(d.submitted_at)), el('dt', 'ปิดเมื่อ'), el('dd', fmtDate(d.closed_at)));
    }
    head.appendChild(kv);

    var acts = el('div', null, 'actions');
    if (isM1 && md.can_edit) acts.appendChild(el('a', 'แก้ไข', 'btn secondary', { href: '#/report/' + encodeURIComponent(d.id) }));
    data.actions.forEach(function (a) {
      if (isM1 && a.action === 'COMPLETE') return;   // ปิดงานทำในกล่องงานพัสดุ (ต้องบันทึกผลก่อน)
      var b = el('button', actionLabel(a.action), a.action === 'CANCEL' || a.action === 'REJECT' ? 'danger' : (a.action === 'RETURN' ? 'secondary' : ''), { type: 'button' });
      b.addEventListener('click', function () { runAction(b, d, a, refresh); });
      acts.appendChild(b);
    });
    if (isM1 && d.doc_no && md.report && d.status !== 'CANCELLED') acts.appendChild(el('a', 'พิมพ์ / PDF', 'btn secondary', { href: '#/print/' + encodeURIComponent(d.id) }));
    if (acts.childNodes.length) head.appendChild(acts);
    if (isM1 && d.status === 'RETURNED' && md.can_edit) head.appendChild(el('div', 'พัสดุส่งกลับให้แก้ไข — ดูเหตุผลในประวัติด้านล่าง แก้แล้วกดส่งอีกครั้ง', 'notice'));
    view.appendChild(head);

    if (isM1) {
      if (md.reply && d.status === 'COMPLETED') {
        var rc = el('div', null, 'card doc-part reply');
        add(rc, el('h2', 'ผลแจ้งกลับจากพัสดุ'), el('div', md.reply.text, 'pre'), md.reply.at ? el('div', fmtDate(md.reply.at), 'muted') : null);
        view.appendChild(rc);
      }
      if (md.report) view.appendChild(m1ReportCard(md.report));
      else view.appendChild(el('div', 'ไม่พบข้อมูลรายงานของเอกสารนี้', 'card doc-part notice'));
      if (md.officer) view.appendChild(m1OfficerCard(d, md, refresh));
    }

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
  var CONFIRM_ACTION = { CANCEL: 'ยกเลิกเอกสารนี้? ยกเลิกแล้วย้อนกลับไม่ได้', SUBMIT: null };
  function runAction(btn, doc, action, refresh) {
    if (CONFIRM_ACTION[action.action] && !window.confirm(CONFIRM_ACTION[action.action])) return;
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
  var ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png'], MAX_FILE = 10 * 1024 * 1024, MAX_PHOTO_RAW = 30 * 1024 * 1024;
  var PHOTO = { MAX_EDGE: 2000, QUALITY: 0.85, SHRINK_ABOVE: 800 * 1024 };
  function isPhoto(name) { return /\.(jpe?g|png)$/i.test(name); }
  /** ขนาดเกินก่อนส่ง? รูปถ่ายรับไฟล์ดิบได้ใหญ่กว่า เพราะจะถูกย่อก่อนส่ง */
  function tooBig(file) { return file.size > (isPhoto(file.name) ? MAX_PHOTO_RAW : MAX_FILE); }
  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); resolve(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { reject(new Error('อ่านไฟล์ไม่สำเร็จ')); };
      fr.readAsDataURL(file);
    });
  }

  /**
   * รูปถ่ายจากมือถือ (3–8 MB) ย่อเหลือด้านยาว 2000 px JPEG ก่อนส่ง — เล็กลงราว 5–10 เท่า ยังอ่านฉลาก/Lot ได้
   * ลดพื้นที่ Drive (เต็มแล้วแนบไม่ได้ทั้งระบบ) และส่งเร็วขึ้นบนเน็ตหอผู้ป่วย · ย่อไม่ได้/ไม่เล็กลง → ส่งไฟล์เดิม
   * คืน { name, b64 }
   */
  function prepareUpload(file) {
    if (!isPhoto(file.name) || file.size <= PHOTO.SHRINK_ABOVE || !window.URL || !document.createElement('canvas').toBlob) {
      return readBase64(file).then(function (b64) { return { name: file.name, b64: b64 }; });
    }
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      function original() { URL.revokeObjectURL(url); readBase64(file).then(function (b64) { resolve({ name: file.name, b64: b64 }); }, function () { resolve(null); }); }
      img.onerror = original;
      img.onload = function () {
        var k = Math.min(1, PHOTO.MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return original();
          URL.revokeObjectURL(url);
          var name = file.name.replace(/\.(jpe?g|png)$/i, '.jpg');
          readBase64(blob).then(function (b64) { resolve({ name: name, b64: b64 }); }, original);
        }, 'image/jpeg', PHOTO.QUALITY);
      };
      img.src = url;
    }).then(function (r) { if (!r) throw new Error('อ่านไฟล์ไม่สำเร็จ'); return r; });
  }

  /** ไฟล์หลักฐานถูกเปิดดูได้หลายคน — ข้อมูลผู้ป่วยในรูป (ชื่อ, HN, สติกเกอร์ป้ายข้อมือ) ต้องไม่อยู่ในไฟล์ (PDPA) */
  function privacyNote() { return el('div', 'ถ่ายเฉพาะตัววัสดุ/ฉลาก/Lot — ห้ามมีชื่อ, HN หรือหน้าผู้ป่วยในภาพ', 'note-warn'); }

  function uploadBox(docId, refresh) {
    var box = el('div'); add(box, el('h3', 'แนบไฟล์'), el('div', 'รูปถ่าย (ระบบย่อให้) หรือ PDF ไม่เกิน 10 MB · เลือกได้หลายไฟล์', 'muted'), privacyNote());
    var input = el('input', null, '', { type: 'file', multiple: 'multiple', accept: '.pdf,.jpg,.jpeg,.png', 'aria-label': 'เลือกไฟล์แนบ' });
    var list = el('div'), anyOk = false, retryable = 0;
    add(box, add(el('p'), input), list);
    function uploadOne(file, status, retryBtn) {
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ALLOWED_EXT.indexOf(ext) < 0) { status.textContent = 'ชนิดไฟล์ไม่รองรับ'; status.className = 'fail'; return Promise.resolve(); }
      if (tooBig(file)) { status.textContent = 'ไฟล์ใหญ่เกินกำหนด'; status.className = 'fail'; return Promise.resolve(); }
      if (file.size === 0) { status.textContent = 'ไฟล์ว่าง'; status.className = 'fail'; return Promise.resolve(); }
      status.textContent = 'กำลังอัปโหลด...'; status.className = 'muted'; retryBtn.classList.add('hidden');
      return prepareUpload(file).then(function (f) {
        return callApi('attachments.upload', { document_id: docId, filename: f.name, data_base64: f.b64 }, { timeout: 180000 });
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

  /* ---------- Menu 1: รายงานปัญหาจากการใช้วัสดุการแพทย์ ---------- */
  var M1_TYPES = ['ชำรุด', 'หมดอายุ', 'อื่นๆ'];
  var M1_REQUIRED = ['department_id', 'phone', 'item_name', 'vendor_text', 'problem_1', 'reporter_name', 'reporter_position', 'problem_found_date'];
  var M1_PLAIN = ['phone', 'problem_1', 'problem_2', 'problem_other', 'suggestion', 'reporter_name', 'reporter_position', 'head_name', 'head_position',
                  'problem_found_date', 'lot_no', 'expiry_date'];
  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  function thaiDigits(s) { return String(s).replace(/[0-9]/g, function (c) { return '๐๑๒๓๔๕๖๗๘๙'.charAt(+c); }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /** ส่วนของวันเวลาตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) — ไม่ขึ้นกับเขตเวลาของเครื่องผู้ใช้ */
  function bkk(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return null;
    var t = new Date(d.getTime() + 7 * 3600 * 1000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), hh: t.getUTCHours(), mi: t.getUTCMinutes() };
  }
  function todayYmd() { var p = bkk(new Date().toISOString()); return p.y + '-' + pad2(p.m + 1) + '-' + pad2(p.d); }
  /** '2026-10-29' → '29 ตุลาคม 2569' · ISO datetime ก็ได้ (แปลงเป็นเวลาไทย) · thai=true → เลขไทย */
  function thaiDate(v, withTime, thai) {
    if (!v) return '';
    var p = /^\d{4}-\d{2}-\d{2}$/.test(v) ? { y: +v.slice(0, 4), m: +v.slice(5, 7) - 1, d: +v.slice(8, 10) } : bkk(v);
    if (!p) return '';
    var s = p.d + ' ' + TH_MONTHS[p.m] + ' ' + (p.y + 543) + (withTime && p.hh !== undefined ? ' เวลา ' + pad2(p.hh) + '.' + pad2(p.mi) + ' น.' : '');
    return thai ? thaiDigits(s) : s;
  }
  function storeGet(k) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function storeSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ไม่มีที่เก็บก็ไม่เป็นไร */ } }
  function storeDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ข้าม */ } }

  var MASTER_ACTION = { departments: 'master.departments', items: 'master.items', vendors: 'master.vendors' };
  /** ข้อมูลหลักโหลดครั้งเดียวต่อการเข้าสู่ระบบ (ใช้ร่วมกับหน้า "ข้อมูลหลัก") */
  function loadMaster(kind) {
    if (masterCache[kind]) return Promise.resolve({ ok: true, data: { rows: masterCache[kind] } });
    return callApi(MASTER_ACTION[kind]).then(function (r) { if (r.ok) masterCache[kind] = r.data.rows; return r; });
  }

  function pageReportForm(view, args, alive) {
    var docId = args[0] ? decodeURIComponent(args[0]) : null;
    pageTitle(view, docId ? 'แก้ไขรายงานปัญหา' : 'แจ้งปัญหาวัสดุการแพทย์', 'ช่องที่มี * ต้องกรอกก่อนส่ง');
    var box = loading(view);
    var loads = [loadMaster('departments'), loadMaster('items'), loadMaster('vendors')];
    if (docId) loads.push(callApi('documents.get', { id: docId }));
    Promise.all(loads).then(function (res) {
      if (!alive()) return; box.remove();
      for (var i = 0; i < res.length; i++) if (!res[i].ok) { add(view, add(el('div', null, 'card'), el('span', errText(res[i]), 'fail'))); return; }
      var detail = docId ? res[3].data : null;
      if (detail && (detail.document.module !== 'M1' || !detail.module_data || !detail.module_data.can_edit || !detail.module_data.report)) {
        add(view, add(el('div', null, 'notice'), document.createTextNode('รายงานนี้แก้ไขไม่ได้แล้ว · '), el('a', 'ดูรายละเอียด', '', { href: '#/documents/' + encodeURIComponent(docId) })));
        return;
      }
      m1Form(view, res[0].data.rows, res[1].data.rows, res[2].data.rows, detail, alive);
    });
  }

  function m1Form(view, depts, items, vendors, detail, alive) {
    var rep = detail ? detail.module_data.report : null;
    var st = { docId: detail ? detail.document.id : null, version: rep ? rep.version : null, docVersion: detail ? detail.document.version : null,
               createRid: null, createSig: null, busy: false, files: [] };
    var draftKey = 'm1form:' + (st.docId || 'new');
    var deptByName = {}, deptName = {}, itemByLabel = {}, itemById = {}, vendorByName = {};
    depts.forEach(function (x) { deptByName[x.name] = x; deptName[x.id] = x.name; });
    function itemLabel(it) { return it.name + ' · ' + it.code; }
    items.forEach(function (it) { itemByLabel[itemLabel(it)] = it; itemById[it.id] = it; });
    vendors.forEach(function (v) { vendorByName[v.name] = v; });

    var form = el('form', null, 'card m1form', { autocomplete: 'off', novalidate: 'novalidate' });
    var inputs = {}, errBox = {};
    function datalist(id, values) {
      var dl = el('datalist', null, '', { id: id });
      values.forEach(function (v) { var o = document.createElement('option'); o.value = v; dl.appendChild(o); });
      return dl;
    }
    function inp(name, type, max) { var i = el('input', null, '', { type: type || 'text', maxlength: String(max || 200) }); inputs[name] = i; return i; }
    function area(name, max, rows) { var t = el('textarea', null, '', { maxlength: String(max || 3000), rows: String(rows || 3) }); inputs[name] = t; return t; }
    function field(name, label, input, req, hint) {
      var wrap = el('div', null, 'f');
      input.id = 'm1-' + name;
      var e = el('div', null, 'ferr', { id: 'm1e-' + name });
      input.setAttribute('aria-describedby', e.id);
      add(wrap, el('label', label + (req ? ' *' : ''), '', { for: input.id }), input, hint ? el('div', hint, 'muted') : null, e);
      errBox[name] = e;
      return wrap;
    }
    function sec(title) { var s = el('fieldset', null, 'sec'); s.appendChild(el('legend', title)); form.appendChild(s); return s; }
    function row() { var r = el('div', null, 'row'); for (var i = 0; i < arguments.length; i++) r.appendChild(arguments[i]); return r; }

    var dept = inp('department_id', 'text', 200); dept.setAttribute('list', 'dl-m1-dept');
    var phone = inp('phone', 'tel', 50); phone.setAttribute('inputmode', 'tel');
    add(sec('หน่วยงาน'), row(field('department_id', 'ชื่อหน่วยงาน', dept, true, 'เลือกจากรายการ'), field('phone', 'เบอร์โทรศัพท์', phone, true)));

    var item = inp('item_name', 'text', 500); item.setAttribute('list', 'dl-m1-item');
    var lot = inp('lot_no', 'text', 100), exp = inp('expiry_date', 'date', 10);
    add(sec('๑. วัสดุที่พบปัญหา'), field('item_name', 'ชื่อวัสดุ', item, true, 'พิมพ์ชื่อหรือรหัสแล้วเลือก (ไม่มีในรายการ พิมพ์เองได้)'),
        row(field('lot_no', 'เลข Lot', lot), field('expiry_date', 'วันหมดอายุ', exp)));

    var vendor = inp('vendor_text', 'text', 1000); vendor.setAttribute('list', 'dl-m1-vendor');
    add(sec('๒. บริษัท ยี่ห้อ หรือผู้จัดจำหน่าย'), field('vendor_text', 'ชื่อบริษัท/ยี่ห้อ/ชื่อการค้า', vendor, true));

    var type = el('select'); inputs.problem_type = type;
    [''].concat(M1_TYPES).forEach(function (t) { var o = el('option', t || 'ไม่ระบุ'); o.value = t; type.appendChild(o); });
    var found = inp('problem_found_date', 'date', 10); found.max = todayYmd();
    add(sec('๓. ปัญหาที่พบ'), row(field('problem_type', 'ประเภทปัญหา', type), field('problem_found_date', 'วันที่พบปัญหา', found, true)),
        field('problem_1', '๓.๑ รายละเอียดปัญหา', area('problem_1', 3000, 4), true),
        field('problem_2', '๓.๒', area('problem_2', 3000, 2)), field('problem_other', '๓.๓ อื่นๆ', area('problem_other', 3000, 2)));

    add(sec('๔. ข้อเสนอแนะ'), field('suggestion', 'ข้อเสนอแนะ', area('suggestion', 3000, 3)));

    add(sec('ผู้รายงาน'), row(field('reporter_name', 'ชื่อ-สกุล', inp('reporter_name'), true), field('reporter_position', 'ตำแหน่ง', inp('reporter_position'), true)),
        row(field('head_name', 'หัวหน้าหน่วยงาน', inp('head_name')), field('head_position', 'ตำแหน่งหัวหน้า', inp('head_position'))));

    var fileIn = el('input', null, '', { type: 'file', multiple: 'multiple', accept: '.pdf,.jpg,.jpeg,.png', id: 'm1-files' });
    var fileList = el('div', null, 'muted');
    add(sec('ไฟล์หลักฐาน (ถ้ามี)'), add(el('div', null, 'f'), el('label', 'รูปถ่าย (ระบบย่อให้) หรือ PDF ไม่เกิน 10 MB', '', { for: 'm1-files' }), privacyNote(), fileIn, fileList));
    function showFiles() { fileList.textContent = st.files.length ? 'รอแนบ: ' + st.files.map(function (f) { return f.name; }).join(', ') : ''; }
    fileIn.addEventListener('change', function () {
      [].slice.call(fileIn.files).forEach(function (f) {
        var ext = (f.name.split('.').pop() || '').toLowerCase();
        if (ALLOWED_EXT.indexOf(ext) < 0) { toast(f.name + ': ชนิดไฟล์ไม่รองรับ', true); return; }
        if (tooBig(f)) { toast(f.name + ': ไฟล์ใหญ่เกินกำหนด', true); return; }
        if (f.size === 0) { toast(f.name + ': ไฟล์ว่าง', true); return; }
        st.files.push(f);
      });
      fileIn.value = ''; showFiles();
    });

    var send = el('button', 'ส่งรายงาน', '', { type: 'button' }), draft = el('button', 'บันทึกร่าง', 'secondary', { type: 'button' });
    var back = el('a', 'ยกเลิก', '', { href: st.docId ? '#/documents/' + encodeURIComponent(st.docId) : '#/' });
    var restored = el('div', null, 'notice hidden', { role: 'status' });
    add(form, add(el('div', null, 'actions'), send, draft, back));
    form.insertBefore(restored, form.firstChild);
    add(form, datalist('dl-m1-dept', depts.map(function (x) { return x.name; })), datalist('dl-m1-item', items.map(itemLabel)),
        datalist('dl-m1-vendor', vendors.map(function (v) { return v.name; })));
    view.appendChild(form);

    // ---- ค่าเริ่มต้น / ข้อมูลเดิม / ข้อความที่พิมพ์ค้าง ----
    function serverValues() {
      var v = {};
      if (rep) {
        M1_PLAIN.forEach(function (k) { v[k] = rep[k] || ''; });
        v.department_id = rep.department_id ? (deptName[rep.department_id] || '') : '';
        var it = rep.item_id ? itemById[rep.item_id] : null;
        v.item_name = it && it.name === rep.item_name ? itemLabel(it) : (rep.item_name || '');
        v.vendor_text = rep.vendor_text || ''; v.problem_type = rep.problem_type || '';
      } else {
        v.reporter_name = me.full_name || ''; v.reporter_position = me.position || '';
        v.department_id = me.department_id && deptName[me.department_id] ? deptName[me.department_id] : '';
      }
      return v;
    }
    function apply(v) { Object.keys(inputs).forEach(function (k) { inputs[k].value = v[k] || ''; }); }
    function snapshot() { var v = {}; Object.keys(inputs).forEach(function (k) { v[k] = inputs[k].value; }); return v; }
    apply(serverValues());
    var saved = storeGet(draftKey);
    if (saved && saved.values && (saved.version || null) === (st.version || null)) {
      apply(saved.values);
      clear(restored); restored.classList.remove('hidden');
      var undo = el('button', 'ล้าง', 'secondary small', { type: 'button' });
      undo.addEventListener('click', function () { storeDel(draftKey); apply(serverValues()); restored.classList.add('hidden'); });
      add(restored, document.createTextNode('กู้ข้อความที่พิมพ์ค้างไว้แล้ว '), undo);
    }
    var t = null;
    form.addEventListener('input', function (ev) {
      var k = ev.target && ev.target.id ? ev.target.id.replace(/^m1-/, '') : '';
      if (errBox[k]) { errBox[k].textContent = ''; ev.target.removeAttribute('aria-invalid'); }   // แก้ช่องไหน ข้อความเตือนของช่องนั้นหาย
      clearTimeout(t); t = setTimeout(function () { storeSet(draftKey, { version: st.version, values: snapshot() }); }, 400);
    });

    // ---- ตรวจ / รวบรวมข้อมูล ----
    function collect() {
      var p = {};
      var dn = dept.value.trim(); p.department_id = dn && deptByName[dn] ? deptByName[dn].id : '';
      var iv = item.value.trim(), it = itemByLabel[iv] || null;
      if (!it) { var same = items.filter(function (x) { return x.name === iv; }); if (same.length === 1) it = same[0]; }
      p.item_id = it ? it.id : ''; p.item_name = it ? it.name : iv;
      var vv = vendor.value.trim(); p.vendor_id = vendorByName[vv] ? vendorByName[vv].id : ''; p.vendor_text = vv;
      p.problem_type = type.value;
      M1_PLAIN.forEach(function (k) { p[k] = inputs[k].value.trim(); });
      return p;
    }
    function check(p, forSubmit) {
      var e = {};
      if (dept.value.trim() && !p.department_id) e.department_id = 'pick_from_list';
      if (p.phone && !/[0-9๐-๙]/.test(p.phone)) e.phone = 'invalid_phone';
      if (p.problem_found_date && p.problem_found_date > todayYmd()) e.problem_found_date = 'future_date';
      if (forSubmit) M1_REQUIRED.forEach(function (k) { if (!p[k] && !e[k]) e[k] = 'required'; });
      return e;
    }
    function showErrors(e) {
      Object.keys(errBox).forEach(function (k) { errBox[k].textContent = ''; inputs[k] && inputs[k].removeAttribute('aria-invalid'); });
      var first = null;
      Object.keys(e).forEach(function (k) {
        var key = k === 'item_id' ? 'item_name' : k === 'vendor_id' ? 'vendor_text' : k;
        if (errBox[key]) { errBox[key].textContent = fieldText(e[k]); inputs[key].setAttribute('aria-invalid', 'true'); if (!first) first = inputs[key]; }
      });
      if (first) { first.focus(); if (first.scrollIntoView) first.scrollIntoView({ block: 'center' }); }
      return Object.keys(e).length;
    }
    function serverFail(r) {
      if (r.fields) showErrors(r.fields);
      reportFail(r);
    }

    // ---- บันทึก → แนบไฟล์ → (ส่ง) ----
    function save() {
      var p = collect(), body = {}, opts = {};
      Object.keys(p).forEach(function (k) { body[k] = p[k]; });
      if (st.docId) { body.document_id = st.docId; body.version = st.version; }
      else {
        if (!st.createRid) { st.createRid = newRequestId(); st.createSig = JSON.stringify(p); }
        opts.requestId = st.createRid;
      }
      return callApi('m1.save', body, opts).then(function (r) {
        if (!r.ok) return r;
        var wasCreate = !st.docId;
        st.docId = r.data.document_id; st.version = r.data.version; st.docVersion = r.data.doc_version;
        storeDel(draftKey);
        if (wasCreate) {
          var sig = st.createSig; st.createRid = null; st.createSig = null;
          draftKey = 'm1form:' + st.docId;
          back.setAttribute('href', '#/documents/' + encodeURIComponent(st.docId));
          try { history.replaceState(null, '', '#/report/' + encodeURIComponent(st.docId)); } catch (e) { /* ข้าม */ }
          /* กดซ้ำหลังเครือข่ายหลุด: ระบบคืนผลการสร้างครั้งแรก ถ้าระหว่างนั้นแก้ข้อความ ต้องบันทึกทับอีกครั้ง */
          if (sig !== JSON.stringify(p)) return save();
        }
        return r;
      });
    }
    function uploadPending() {
      var failed = [], chain = Promise.resolve();
      st.files.slice().forEach(function (f) {
        chain = chain.then(function () {
          fileList.textContent = 'กำลังแนบ ' + f.name + ' ...';
          return prepareUpload(f).then(function (x) {
            return callApi('attachments.upload', { document_id: st.docId, filename: x.name, data_base64: x.b64 }, { timeout: 180000 });
          }).then(function (r) {
            if (r.ok) st.files.splice(st.files.indexOf(f), 1);
            else failed.push(f.name + (r.fields ? ' (' + describeFields(r.fields) + ')' : ''));
          }, function () { failed.push(f.name); });
        });
      });
      return chain.then(function () { showFiles(); return failed; });
    }
    function busy(btn, fn) {
      if (st.busy) return;
      st.busy = true; send.disabled = true; draft.disabled = true; btn.setAttribute('aria-busy', 'true');
      Promise.resolve().then(fn).catch(function (e) { toast('เกิดข้อผิดพลาดที่หน้าจอ: ' + (e && e.message), true); })
        .finally(function () { st.busy = false; send.disabled = false; draft.disabled = false; btn.removeAttribute('aria-busy'); });
    }
    function toDetail() { location.hash = '#/documents/' + encodeURIComponent(st.docId); }

    /* กด Enter ในช่องข้อความ (รวมตอนเลือกจากรายการ) ต้องไม่ส่งรายงานโดยไม่ตั้งใจ — ส่งได้ทางปุ่มเท่านั้น */
    form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    send.addEventListener('click', function () {
      busy(send, function () {
        var p = collect();
        if (showErrors(check(p, true))) { toast('กรอกช่องที่มี * ให้ครบ', true); return; }
        return save().then(function (r) {
          if (!r.ok) { serverFail(r); return; }
          return uploadPending().then(function (failed) {
            if (failed.length) { toast('บันทึกร่างแล้ว แต่แนบไฟล์ไม่สำเร็จ: ' + failed.join(', ') + ' — แนบใหม่ได้แล้วกดส่ง', true); toDetail(); return; }
            return callApi('workflow.transition', { document_id: st.docId, action: 'SUBMIT', version: st.docVersion }).then(function (x) {
              if (!x.ok) { serverFail(x); return; }
              toast('ส่งรายงานแล้ว เลขที่ ' + x.data.document.doc_no);
              toDetail();
            });
          });
        });
      });
    });
    draft.addEventListener('click', function () {
      busy(draft, function () {
        var p = collect();
        if (showErrors(check(p, false))) return;
        return save().then(function (r) {
          if (!r.ok) { serverFail(r); return; }
          return uploadPending().then(function (failed) {
            if (failed.length) toast('บันทึกร่างแล้ว แต่แนบไฟล์ไม่สำเร็จ: ' + failed.join(', '), true); else toast('บันทึกร่างแล้ว');
            toDetail();
          });
        });
      });
    });
  }

  /** รายละเอียดรายงาน (อ่านอย่างเดียว) — แสดงเฉพาะช่องที่มีค่า */
  function m1ReportCard(r) {
    var card = el('div', null, 'card doc-part'), kv = el('dl', null, 'kv m1kv');
    add(card, el('h2', 'รายละเอียดรายงาน'));
    function row(label, value, multi) { if (value) add(kv, el('dt', label), el('dd', value, multi ? 'pre' : '')); }
    row('๑. วัสดุ', r.item_name ? r.item_name + (r.item_code ? ' · ' + r.item_code : '') : '');
    row('เลข Lot', r.lot_no); row('วันหมดอายุ', thaiDate(r.expiry_date));
    row('๒. บริษัท/ยี่ห้อ', r.vendor_text);
    row('ประเภทปัญหา', r.problem_type); row('วันที่พบปัญหา', thaiDate(r.problem_found_date));
    row('๓.๑', r.problem_1, true); row('๓.๒', r.problem_2, true); row('๓.๓ อื่นๆ', r.problem_other, true);
    row('๔. ข้อเสนอแนะ', r.suggestion, true);
    row('โทร', r.phone);
    row('ผู้รายงาน', [r.reporter_name, r.reporter_position].filter(Boolean).join(' · '));
    row('หัวหน้าหน่วยงาน', [r.head_name, r.head_position].filter(Boolean).join(' · '));
    card.appendChild(kv);
    return card;
  }

  /** กล่องงานพัสดุ (เห็นเฉพาะ OFFICER): บันทึกการประสาน · ผลการตรวจสอบ · ผลแจ้งกลับ · ปิดงาน */
  function m1OfficerCard(d, md, refresh) {
    var o = md.officer, card = el('div', null, 'card doc-part officer');
    add(card, el('h2', 'งานพัสดุ'));
    if (d.status === 'SUBMITTED') card.appendChild(el('div', 'กด "รับเรื่อง" ด้านบนก่อน จึงบันทึกผลได้', 'muted'));

    add(card, el('h3', 'บันทึกการประสาน'));
    if (o.followups.length) {
      var ul = el('ul', null, 'timeline');
      o.followups.forEach(function (f) { add(ul, add(el('li'), el('div', f.note, 'pre'), el('div', (f.by_name || '-') + ' · ' + fmtDate(f.acted_at), 'muted'))); });
      card.appendChild(ul);
    } else if (!o.can_followup) card.appendChild(el('div', '-', 'muted'));
    if (o.can_followup) {
      var note = el('textarea', null, '', { maxlength: '2000', rows: '2', 'aria-label': 'บันทึกการประสาน', placeholder: 'เช่น โทรแจ้งบริษัทให้เข้าตรวจสอบ' });
      var addBtn = el('button', 'เพิ่มบันทึก', 'secondary small', { type: 'button' });
      addBtn.addEventListener('click', function () {
        var text = note.value.trim(); if (!text) { note.focus(); return; }
        guard(addBtn, function () {
          return callApi('m1.followup.add', { document_id: d.id, note: text }).then(function (r) {
            if (!r.ok) { reportFail(r); return; }
            toast('เพิ่มบันทึกแล้ว'); return refresh();
          });
        });
      });
      add(card, note, add(el('div', null, 'actions'), addBtn));
    }

    add(card, el('h3', 'ผลการตรวจสอบ และแจ้งกลับหน่วยงาน'));
    if (!o.can_review) {
      if (o.review_result) add(card, el('div', 'ผลการตรวจสอบ', 'muted'), el('div', o.review_result, 'pre'));
      if (o.reply_to_unit) add(card, el('div', 'ผลแจ้งกลับหน่วยงาน', 'muted'), el('div', o.reply_to_unit, 'pre'));
      if (!o.review_result && !o.reply_to_unit) card.appendChild(el('div', '-', 'muted'));
      return card;
    }
    var rr = el('textarea', null, '', { maxlength: '3000', rows: '3', id: 'm1-review' }), rp = el('textarea', null, '', { maxlength: '3000', rows: '3', id: 'm1-reply' });
    rr.value = o.review_result || ''; rp.value = o.reply_to_unit || '';
    var e1 = el('div', null, 'ferr'), e2 = el('div', null, 'ferr');
    add(card, el('label', 'ผลการตรวจสอบ (ภายในพัสดุ)', '', { for: 'm1-review' }), rr, e1,
        el('label', 'ผลแจ้งกลับหน่วยงาน (หน่วยงานเห็นเมื่อปิดงาน)', '', { for: 'm1-reply' }), rp, e2);
    var saveBtn = el('button', 'บันทึก', 'secondary', { type: 'button' }), closeBtn = el('button', 'บันทึกและปิดงาน', '', { type: 'button' });
    add(card, add(el('div', null, 'actions'), closeBtn, saveBtn));
    var ver = o.version;
    function changed() { return rr.value.trim() !== (o.review_result || '') || rp.value.trim() !== (o.reply_to_unit || ''); }
    function saveReview() {
      if (!changed()) return Promise.resolve({ ok: true });
      return callApi('m1.review.save', { document_id: d.id, version: ver, review_result: rr.value, reply_to_unit: rp.value }).then(function (r) {
        if (r.ok) { ver = r.data.version; o.review_result = rr.value.trim(); o.reply_to_unit = rp.value.trim(); }
        return r;
      });
    }
    saveBtn.addEventListener('click', function () {
      guard(saveBtn, function () { return saveReview().then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกแล้ว'); return refresh(); }); });
    });
    closeBtn.addEventListener('click', function () {
      e1.textContent = rr.value.trim() ? '' : 'ต้องกรอก'; e2.textContent = rp.value.trim() ? '' : 'ต้องกรอก';
      if (!rr.value.trim() || !rp.value.trim()) { (rr.value.trim() ? rp : rr).focus(); return; }
      if (!window.confirm('ปิดงานเรื่องนี้? หลังปิดแก้ไขไม่ได้ และหน่วยงานจะเห็นผลแจ้งกลับ')) return;
      guard(closeBtn, function () {
        return saveReview().then(function (r) {
          if (!r.ok) { reportFail(r); return; }
          return callApi('workflow.transition', { document_id: d.id, action: 'COMPLETE', version: d.version }).then(function (x) {
            if (!x.ok) { reportFail(x); return refresh(); }
            toast('ปิดงานแล้ว'); return refresh();
          });
        });
      });
    });
    return card;
  }

  /* ---------- พิมพ์ / บันทึก PDF (แบบฟอร์มตามฉบับกระดาษ) ---------- */
  function pagePrint(view, args, alive) {
    var id = decodeURIComponent(args[0] || '');
    var box = loading(view);
    callApi('documents.get', { id: id }).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(view, add(el('div', null, 'card'), el('span', errText(r), 'fail'))); return; }
      var d = r.data.document, md = r.data.module_data;
      var bar = el('div', null, 'card no-print actions');
      add(bar, el('a', '← กลับ', '', { href: '#/documents/' + encodeURIComponent(d.id) }));
      if (d.module !== 'M1' || !md || !md.report || !d.doc_no || d.status === 'CANCELLED') {
        add(bar, el('span', d.status === 'CANCELLED' ? 'เอกสารนี้ถูกยกเลิกแล้ว — ไม่มีให้พิมพ์' : 'พิมพ์ได้เฉพาะรายงานปัญหาที่ส่งแล้ว', 'muted')); view.appendChild(bar); return;
      }
      var pr = el('button', 'พิมพ์ / บันทึกเป็น PDF', '', { type: 'button' });
      pr.addEventListener('click', function () { window.print(); });
      add(bar, pr, el('span', 'เลือกเครื่องพิมพ์ "บันทึกเป็น PDF" เพื่อเก็บไฟล์', 'muted'));
      view.appendChild(bar);
      view.appendChild(m1Paper(d, md));
    });
  }

  function m1Paper(d, md) {
    var r = md.report, paper = el('article', null, 'paper', { 'aria-label': 'แบบฟอร์มสำหรับพิมพ์' });
    function lines(n, text, prefix) {
      var b = el('div', null, 'ruled'); b.style.setProperty('--n', String(n));
      if (prefix) b.appendChild(el('span', prefix + ' ', 'lbl'));
      b.appendChild(document.createTextNode(text || ''));
      return b;
    }
    add(paper, el('h1', md.form_title, 'p-title'));
    add(paper, add(el('p', null, 'p-line'), document.createTextNode('ชื่อหน่วยงาน '), el('span', r.department_name || d.department_name || '', 'fill grow'),
                   document.createTextNode(' เบอร์โทรศัพท์ '), el('span', r.phone || '', 'fill')));
    add(paper, el('p', 'ข้าพเจ้าพบว่าเวชภัณฑ์ที่มิใช่ยา หรือวัสดุการแพทย์ที่เบิกจากคลังวัสดุการแพทย์โรงพยาบาลอุดรธานี มีปัญหาในการใช้งานตามรายละเอียดดังนี้', 'p-lead'));
    add(paper, el('p', '๑. ชนิดของเวชภัณฑ์ที่มิใช่ยา หรือวัสดุการแพทย์', 'p-h'), lines(1, r.item_name));
    add(paper, el('p', '๒. ชื่อบริษัท ยี่ห้อ ชื่อการค้า หรือผู้จัดจำหน่าย', 'p-h'), lines(2, r.vendor_text));
    add(paper, el('p', '๓. ปัญหาที่พบ (ให้บรรยายรายละเอียดครบถ้วน)', 'p-h'),
        lines(2, r.problem_1, '๓.๑'), lines(2, r.problem_2, '๓.๒'), lines(2, r.problem_other, '๓.๓ อื่นๆ'));
    add(paper, el('p', '๔. ข้อเสนอแนะ', 'p-h'), lines(3, r.suggestion));
    function sig(name, position, role, dateText) {
      var s = el('div', null, 'sig');
      add(s, el('div', 'ลงชื่อ ' + '.'.repeat(34)),
          el('div', '( ' + (name || '.'.repeat(30)) + ' )'),
          el('div', 'ตำแหน่ง ' + (position || '.'.repeat(30))),
          el('div', role, 'role'),
          el('div', 'วัน/เดือน/ปี ' + (dateText || '.'.repeat(26))));
      return s;
    }
    var submitted = md.submitted_at || d.submitted_at;
    add(paper, add(el('div', null, 'sigs'), sig(r.reporter_name, r.reporter_position, 'ผู้รายงาน', thaiDate(submitted, false, true)),
                   sig(r.head_name, r.head_position, 'หัวหน้าหน่วยงาน', '')));
    add(paper, el('p', 'หมายเหตุ : ขอให้ส่งแบบฟอร์มนี้ที่ หัวหน้ากลุ่มงานพัสดุ รพ.อุดรธานี', 'p-note'));
    add(paper, el('p', 'เลขที่ ' + d.doc_no + ' · ส่งผ่านระบบเอกสารงานวัสดุการแพทย์เมื่อ ' + thaiDate(submitted, true, true), 'p-sys'));
    return paper;
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
  /** ลิงก์ลงทะเบียน: ส่งลิงก์เดียวในกลุ่มไลน์ คนในหอสมัครเองได้ (ได้บทบาท USER เท่านั้น) */
  function joinCard(view, alive) {
    var card = add(el('div', null, 'card'), el('h2', 'ลิงก์ลงทะเบียน')), body = el('div'); card.appendChild(body); view.appendChild(card);
    function linkOf(code) { return location.origin + location.pathname + '?j=' + code; }
    function run(btn, action, ask) {
      if (ask && !window.confirm(ask)) return;
      guard(btn, function () { return callApi(action, {}).then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกแล้ว'); show(r.data); }); });
    }
    function show(st) {
      clear(body);
      if (!st.code) {
        var on = el('button', 'เปิดรับลงทะเบียน', '', { type: 'button' });
        on.addEventListener('click', function () { run(on, 'join.rotate'); });
        add(body, el('p', 'ยังไม่เปิด — ตอนนี้ต้องเพิ่มผู้ใช้ทีละคนด้านล่าง', 'muted'), on);
        return;
      }
      if (st.paused_at) body.appendChild(el('div', 'หยุดรับเอง เพราะมีคนสมัครถี่ผิดปกติ — กด "เปลี่ยนลิงก์"', 'notice', { role: 'alert' }));
      var link = el('input', null, 'joinlink', { type: 'text', readonly: 'readonly', 'aria-label': 'ลิงก์ลงทะเบียน' }); link.value = linkOf(st.code);
      var copy = el('button', 'คัดลอก', '', { type: 'button' }), rot = el('button', 'เปลี่ยนลิงก์', 'secondary', { type: 'button' }), off = el('button', 'ปิดรับ', 'danger', { type: 'button' });
      copy.addEventListener('click', function () {
        link.select();
        var done = function () { toast('คัดลอกลิงก์แล้ว'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link.value).then(done, function () { document.execCommand('copy'); done(); });
        else { document.execCommand('copy'); done(); }
      });
      rot.addEventListener('click', function () { run(rot, 'join.rotate', 'เปลี่ยนลิงก์? ลิงก์เดิมจะใช้ไม่ได้ทันที (คนที่สมัครแล้วใช้ต่อได้)'); });
      off.addEventListener('click', function () { run(off, 'join.off', 'ปิดรับลงทะเบียนด้วยลิงก์? (คนที่สมัครแล้วใช้ต่อได้)'); });
      add(body, add(el('div', null, 'joinrow'), link, copy),
          el('p', 'สมัคร 7 วันล่าสุด ' + st.joins_7d + ' คน · ทั้งหมด ' + st.joins_total + ' คน · ได้บทบาท USER เท่านั้น', 'muted'),
          add(el('div', null, 'actions'), rot, off));
    }
    callApi('join.status').then(function (r) { if (!alive()) return; if (!r.ok) { body.appendChild(el('span', errText(r), 'fail')); return; } show(r.data); });
  }

  /** ข้อมูลของฉัน: แก้ชื่อ · ตำแหน่ง · ย้ายหน่วยงาน (ย้ายหอแล้วเห็นเอกสารของหอใหม่ เอกสารเดิมยังอยู่กับหอเดิม) */
  function pageMe(view, args, alive) {
    pageTitle(view, 'ข้อมูลของฉัน', me.email);
    var box = loading(view);
    loadMaster('departments').then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(view, add(el('div', null, 'card'), el('span', errText(r), 'fail'))); return; }
      var depts = r.data.rows.filter(function (x) { return x.is_active !== false; }), byName = {}, nameOf = {};
      depts.forEach(function (x) { byName[x.name] = x; nameOf[x.id] = x.name; });
      var form = el('form', null, 'card joinform', { autocomplete: 'off', novalidate: 'novalidate' }), inputs = {}, errs = {};
      function f(key, label, input, value) {
        input.id = 'me-' + key; input.value = value || ''; inputs[key] = input; errs[key] = el('div', null, 'ferr');
        input.addEventListener('input', function () { errs[key].textContent = ''; input.removeAttribute('aria-invalid'); });
        return add(el('div', null, 'f'), el('label', label, '', { for: input.id }), input, errs[key]);
      }
      var btn = el('button', 'บันทึก', '', { type: 'submit' });
      add(form, f('full_name', 'ชื่อ-สกุล', el('input', null, '', { type: 'text', maxlength: '200' }), me.full_name),
          f('position', 'ตำแหน่ง', el('input', null, '', { type: 'text', maxlength: '200', list: 'dl-me-pos' }), me.position),
          f('department_id', 'หน่วยงาน', el('input', null, '', { type: 'text', maxlength: '200', list: 'dl-me-dept' }), nameOf[me.department_id]),
          dataList('dl-me-pos', POSITIONS), dataList('dl-me-dept', depts.map(function (x) { return x.name; })),
          add(el('div', null, 'actions'), btn));
      view.appendChild(form);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = { full_name: inputs.full_name.value.trim(), position: inputs.position.value.trim() }, bad = {};
        var dn = inputs.department_id.value.trim();
        if (byName[dn]) v.department_id = byName[dn].id; else bad.department_id = dn ? 'เลือกจากรายการ' : 'ต้องกรอก';
        if (!v.full_name) bad.full_name = 'ต้องกรอก';
        if (!v.position) bad.position = 'ต้องกรอก';
        Object.keys(errs).forEach(function (k) { errs[k].textContent = bad[k] || ''; if (bad[k]) inputs[k].setAttribute('aria-invalid', 'true'); });
        if (Object.keys(bad).length) return;
        var moving = v.department_id !== me.department_id && me.department_id;
        if (moving && !window.confirm('ย้ายไป "' + dn + '"? จะเห็นเอกสารของหน่วยงานใหม่แทนหน่วยงานเดิม')) return;
        guard(btn, function () {
          return callApi('users.update_me', v).then(function (r) {
            if (!r.ok) { reportFail(r); return; }
            me = r.data; toast('บันทึกแล้ว'); enterApp();
          });
        });
      });
    });
  }

  function pageUsers(view, args, alive) {
    pageTitle(view, 'จัดการผู้ใช้');
    joinCard(view, alive);
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
    var demo = el('div', null, 'card'), clr = el('button', 'ซ่อนเอกสารตัวอย่าง', 'secondary', { type: 'button' }), dm = el('span', null, 'muted', { role: 'status' });
    add(demo, el('h2', 'เอกสารตัวอย่าง'), el('div', 'ซ่อนเอกสารที่ชื่อขึ้นต้น [ตัวอย่างทดสอบ] (ไม่ลบข้อมูล)', 'muted'), add(el('div', null, 'actions'), clr, dm));
    clr.addEventListener('click', function () {
      guard(clr, function () { return callApi('spike.demo.clear').then(function (r) { if (!r.ok) { reportFail(r); return; } dm.textContent = 'ซ่อนแล้ว ' + r.data.hidden + ' ฉบับ'; }); });
    });
    view.appendChild(demo);
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
