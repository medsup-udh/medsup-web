/* บัญชีหน่วยงาน (u001 + รหัสผ่าน) — ส่วนขยายของ app.js
   - หน้าเข้าสู่ระบบ: เพิ่มช่องชื่อผู้ใช้/รหัสผ่านของหน่วยงาน ใต้ปุ่ม Google
   - เข้าครั้งแรก/หลังตั้งรหัสใหม่ ต้องเปลี่ยนรหัสก่อนใช้งาน
   - ผู้ดูแลระบบ: สร้างบัญชีหน่วยงาน ตั้งรหัสชั่วคราวใหม่ (เห็นรหัสครั้งเดียว) */
(window.MEDSUP_PLUGINS = window.MEDSUP_PLUGINS || []).push(function (X) {
  'use strict';
  var el = X.el, add = X.add, clear = X.clear, callApi = X.callApi, guard = X.guard, toast = X.toast, reportFail = X.reportFail, A = X.app;
  if (!A) return;
  Object.assign(X.FIELD_MSG, { wrong: 'ไม่ถูกต้อง', locked: 'ใส่รหัสผิดหลายครั้ง ระบบล็อก 15 นาที หรือแจ้งผู้ดูแลระบบตั้งรหัสใหม่', too_short: 'อย่างน้อย 8 ตัวอักษร',
    need_letter_digit: 'ต้องมีทั้งตัวอักษรและตัวเลข', contains_username: 'ห้ามมีชื่อผู้ใช้อยู่ในรหัส', same_as_old: 'ต้องไม่ซ้ำรหัสเดิม' });
  Object.assign(X.FIELD_LABEL, { password: 'รหัสผ่าน', old_password: 'รหัสผ่านเดิม', new_password: 'รหัสผ่านใหม่' });
  ['unit.password.change'].forEach(function (a) { X.WRITE_ACTIONS.push(a); });
  var MUST = 'medsup.unit_must_change';
  function must(v) { try { if (v === undefined) return sessionStorage.getItem(MUST) === '1'; if (v) sessionStorage.setItem(MUST, '1'); else sessionStorage.removeItem(MUST); } catch (e) { return false; } }
  function pwInput(id, auto) { return el('input', null, '', { type: 'password', id: id, maxlength: '100', autocomplete: auto }); }
  function showToggle(inputs) {
    var c = el('input', null, '', { type: 'checkbox' }), l = add(el('label', null, 'check'), c, document.createTextNode(' แสดงรหัสผ่าน'));
    c.addEventListener('change', function () { inputs.forEach(function (i) { i.type = c.checked ? 'text' : 'password'; }); });
    return l;
  }

  /* ---------- หน้าเข้าสู่ระบบ ---------- */
  var lv = document.getElementById('login-view');
  if (lv) {
    var f = el('form', null, 'unitlogin', { autocomplete: 'on', novalidate: 'novalidate' });
    var u = el('input', null, '', { type: 'text', id: 'ul-user', maxlength: '20', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: 'เช่น u001' });
    var p = pwInput('ul-pass', 'current-password'), msg = el('p', null, '', { role: 'status', 'aria-live': 'polite' }), go = el('button', 'เข้าสู่ระบบ', '', { type: 'submit' });
    add(f, el('h3', 'หรือ เข้าสู่ระบบด้วยบัญชีหน่วยงาน'), el('p', 'ใช้ร่วมกันในหน่วยงาน (ชื่อผู้ใช้และรหัสผ่านได้จากผู้ดูแลระบบ)', 'muted'),
        add(el('div', null, 'row'), add(el('div'), el('label', 'ชื่อผู้ใช้', '', { for: 'ul-user' }), u), add(el('div'), el('label', 'รหัสผ่าน', '', { for: 'ul-pass' }), p)),
        showToggle([p]), add(el('div', null, 'actions'), go), msg);
    lv.appendChild(f);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!u.value.trim() || !p.value) { msg.textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน'; msg.className = 'fail'; return; }
      msg.textContent = 'กำลังตรวจสอบ...'; msg.className = '';
      guard(go, function () {
        return callApi('auth.unit_login', { username: u.value.trim(), password: p.value }).then(function (r) {
          if (!r.ok) {
            msg.textContent = r.fields && r.fields.password === 'locked' ? X.FIELD_MSG.locked : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'; msg.className = 'fail';
            p.value = ''; p.focus(); return;
          }
          p.value = ''; msg.textContent = '';
          must(!!r.data.must_change);
          A.startSession(r.data);
          if (r.data.must_change) location.hash = '#/unitpw';
        });
      });
    });
  }
  window.addEventListener('hashchange', function () { if (must() && !/^#\/unitpw/.test(location.hash)) location.hash = '#/unitpw'; });

  /* ---------- เปลี่ยนรหัสผ่าน (บัญชีหน่วยงาน) ---------- */
  function pagePw(view) {
    var me = X.me(), isUnit = /@unit\.medsup\.local$/.test(me.email || '');
    var card = X.pageTitle(view, 'เปลี่ยนรหัสผ่านบัญชีหน่วยงาน', must() ? 'เข้าครั้งแรกหรือได้รหัสชั่วคราว ต้องเปลี่ยนรหัสก่อนใช้งาน' : 'รหัสใหม่อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข');
    if (!isUnit) { card.appendChild(el('div', 'หน้านี้สำหรับบัญชีหน่วยงานเท่านั้น', 'notice')); return; }
    var f = el('form', null, 'card', { novalidate: 'novalidate' }), o = pwInput('pw-old', 'current-password'), n1 = pwInput('pw-new', 'new-password'), n2 = pwInput('pw-new2', 'new-password');
    var e = el('div', null, 'ferr'), b = el('button', 'บันทึกรหัสใหม่', '', { type: 'submit' });
    add(f, add(el('div', null, 'f'), el('label', 'รหัสผ่านเดิม (หรือรหัสชั่วคราว)', '', { for: 'pw-old' }), o),
        add(el('div', null, 'row'), add(el('div'), el('label', 'รหัสผ่านใหม่', '', { for: 'pw-new' }), n1), add(el('div'), el('label', 'ยืนยันรหัสผ่านใหม่', '', { for: 'pw-new2' }), n2)),
        showToggle([o, n1, n2]), el('div', 'แจ้งรหัสใหม่เฉพาะคนในหน่วยงานที่ต้องประเมินหรือแจ้งปัญหา · เปลี่ยนรหัสเมื่อมีคนย้ายออก', 'muted'), e, add(el('div', null, 'actions'), b));
    view.appendChild(f);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); e.textContent = '';
      if (!o.value || !n1.value) { e.textContent = 'กรอกให้ครบ'; return; }
      if (n1.value !== n2.value) { e.textContent = 'รหัสใหม่สองช่องไม่ตรงกัน'; n2.focus(); return; }
      guard(b, function () {
        return callApi('unit.password.change', { old_password: o.value, new_password: n1.value }).then(function (r) {
          if (!r.ok) { e.textContent = r.fields ? Object.keys(r.fields).map(function (k) { return (X.FIELD_LABEL[k] || k) + ': ' + (X.FIELD_MSG[r.fields[k]] || r.fields[k]); }).join(' · ') : X.errText(r); return; }
          must(false); o.value = n1.value = n2.value = ''; toast('เปลี่ยนรหัสผ่านแล้ว'); location.hash = '#/';
        });
      });
    });
  }

  /* ---------- ผู้ดูแลระบบ: บัญชีหน่วยงาน ---------- */
  function pageUnits(view, args, alive) {
    var top = X.pageTitle(view, 'บัญชีหน่วยงาน', 'หน่วยงานละ 1 บัญชี ใช้ร่วมกันหลายเครื่องได้ · รหัสชั่วคราวแสดงครั้งเดียว ให้ส่งถึงหัวหน้าหน่วยงานโดยตรง');
    var dep = el('select', null, '', { 'aria-label': 'หน่วยงาน' }), mk = el('button', 'สร้างบัญชี', '', { type: 'button' }), secret = el('div');
    add(top, add(el('div', null, 'actions'), dep, mk), secret);
    var list = el('div', 'กำลังโหลด...', 'card muted'); view.appendChild(list);
    function showSecret(d) {
      clear(secret);
      add(secret, add(el('div', null, 'notice'), el('b', 'ชื่อผู้ใช้ ' + d.username + ' · รหัสชั่วคราว '), el('code', d.temp_password, 'secret'),
        el('div', (d.department_name ? d.department_name + ' · ' : '') + 'จดหรือคัดลอกตอนนี้ ปิดหน้านี้แล้วดูอีกไม่ได้ · เข้าครั้งแรกระบบบังคับเปลี่ยนรหัส')));
    }
    function load() {
      return Promise.all([callApi('unit.account.list', {}), A.loadMaster('departments')]).then(function (res) {
        if (!alive()) return;
        clear(list); list.className = 'card';
        if (!res[0].ok) { add(list, el('span', X.errText(res[0]), 'fail')); return; }
        var has = {}; res[0].data.forEach(function (a) { has[a.department_id] = true; });
        clear(dep); add(dep, el('option', '— เลือกหน่วยงาน —', '', { value: '' }));
        (res[1].ok ? res[1].data.rows : []).filter(function (d) { return d.is_active !== false && !has[d.id]; })
          .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); }).forEach(function (d) { dep.appendChild(el('option', d.name, '', { value: d.id })); });
        if (!res[0].data.length) { add(list, el('div', 'ยังไม่มีบัญชีหน่วยงาน', 'muted')); return; }
        var t = el('table', null, 'stack'), H = ['ชื่อผู้ใช้', 'หน่วยงาน', 'สถานะ', 'เข้าล่าสุด', ''], hr = el('tr');
        H.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
        var tb = el('tbody');
        res[0].data.forEach(function (a) {
          var rs = el('button', 'ตั้งรหัสใหม่', 'secondary small', { type: 'button' });
          rs.addEventListener('click', function () {
            if (!window.confirm('ตั้งรหัสชั่วคราวใหม่ให้ ' + a.username + '? รหัสเดิมใช้ไม่ได้ทันที (ทุกเครื่องในหน่วยงานต้องเข้าใหม่ด้วยรหัสใหม่)')) return;
            guard(rs, function () { return callApi('unit.account.reset', { username: a.username }).then(function (r) { if (!r.ok) { reportFail(r); return; } showSecret(Object.assign({ department_name: a.department_name }, r.data)); return load(); }); });
          });
          var stt = a.locked ? 'ล็อกอยู่' : a.must_change ? 'รอเปลี่ยนรหัส' : 'ใช้งาน';
          var tr = el('tr'); [a.username, a.department_name, stt, a.last_login_at ? X.fmtDate(a.last_login_at) : '-'].forEach(function (v, i) { var td = el('td', v); td.setAttribute('data-label', H[i]); tr.appendChild(td); });
          tr.appendChild(add(el('td'), rs)); tb.appendChild(tr);
        });
        add(t, tb); list.appendChild(add(el('div', null, 'scroll'), t));
      });
    }
    mk.addEventListener('click', function () {
      if (!dep.value) { dep.focus(); return; }
      guard(mk, function () { return callApi('unit.account.create', { department_id: dep.value }).then(function (r) { if (!r.ok) { reportFail(r); return; } showSecret(r.data); return load(); }); });
    });
    load();
  }

  // บัญชีหน่วยงาน: หน้า "ข้อมูลของฉัน" = เปลี่ยนรหัสผ่าน (ชื่อบัญชี/หน่วยงานผู้ดูแลระบบเป็นผู้กำหนด)
  X.pages.forEach(function (pg) {
    if (pg.path !== 'me') return;
    var orig = pg.render;
    pg.render = function (view, args, alive) { return /@unit\.medsup\.local$/.test(X.me().email || '') ? pagePw(view, args, alive) : orig(view, args, alive); };
  });
  var at = X.pages.map(function (p) { return p.path; }).indexOf('users');
  X.pages.splice(at < 0 ? X.pages.length : at + 1, 0, { path: 'units', label: 'บัญชีหน่วยงาน', roles: ['ADMIN', 'OFFICER'], render: pageUnits },
                 { path: 'unitpw', label: 'เปลี่ยนรหัสผ่าน', nav: false, render: pagePw });
});
