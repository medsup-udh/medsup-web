/* Menu 5 ขอซื้อนอกแผน · Menu 6 ยืนยันแผน · รายงานแผน/นำเข้าแผน — ส่วนขยายของ app.js
   - ลงทะเบียนผ่าน window.MEDSUP_PLUGINS (app.js เรียกพร้อมตัวช่วย) ไม่แก้ app.js เพิ่ม
   - ข้อมูลจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น · ยอดเงินที่บันทึกคำนวณที่เซิร์ฟเวอร์ หน้าจอคำนวณให้ดูระหว่างกรอกด้วยสูตรเดียวกัน
   - Excel สร้างในเบราว์เซอร์ (SheetJS ใน web/vendor) ไม่ใช้โควตา Google */
(window.MEDSUP_PLUGINS = window.MEDSUP_PLUGINS || []).push(function (X) {
  'use strict';
  var el = X.el, add = X.add, clear = X.clear, callApi = X.callApi, guard = X.guard, toast = X.toast, reportFail = X.reportFail;

  /* ---------- ป้าย ---------- */
  Object.assign(X.STATUS_LABEL, { WAIT_HEAD: 'รอหัวหน้าหน่วยงานยืนยัน', WAIT_NURSE: 'รอหัวหน้าพยาบาลยืนยัน', WAIT_EXEC: 'รอผู้บริหารพิจารณา' });
  Object.assign(X.ACTION_LABEL, { HEAD_CONFIRM: 'หัวหน้าหน่วยงานยืนยัน', HEAD_CONFIRM_N: 'หัวหน้าหน่วยงานยืนยัน', HEAD_RETURN: 'ส่งกลับแก้ไข',
    NURSE_CONFIRM: 'หัวหน้าพยาบาลยืนยัน', NURSE_RETURN: 'ส่งกลับแก้ไข', SEND_EXEC: 'เสนอผู้บริหาร', EXEC_APPROVE: 'อนุมัติ', EXEC_REJECT: 'ไม่อนุมัติ' });
  Object.assign(X.FIELD_MSG, { not_in_plan: 'ไม่อยู่ในแผน', too_few: 'จำนวนกรรมการไม่ครบ', too_many: 'จำนวนกรรมการเกินที่กำหนดตามวงเงิน', eval_overlap: 'ซ้ำกับคณะกรรมการพิจารณาผล', file_required: 'ยังไม่ได้แนบไฟล์',
    locked: 'แก้ไขในขั้นนี้ไม่ได้', mismatch: 'ไม่ตรงกัน', needs_nurse_head: 'หน่วยงานพยาบาลต้องผ่านหัวหน้าพยาบาล', not_nursing_unit: 'ไม่ใช่หน่วยงานพยาบาล',
    use_exec_record: 'ใช้ปุ่ม "บันทึกผลการพิจารณา"', must_be_list: 'ไม่ถูกต้อง' });
  Object.assign(X.FIELD_LABEL, { lines: 'รายการ', committees: 'คณะกรรมการ', committee_tor: 'คณะกรรมการกำหนด TOR/ราคากลาง', committee_eval: 'คณะกรรมการพิจารณาผล',
    committee_inspect: 'คณะกรรมการตรวจรับ', attach_pp: 'ใบแจ้งความประสงค์ (PP)', attach_spec: 'รายละเอียดคุณลักษณะเฉพาะ', attach_quotation: 'ใบเสนอราคา', attach_checks: 'เอกสารแนบ', quotation_count: 'จำนวนใบเสนอราคา',
    reason_codes: 'เหตุผลความจำเป็น', reason_text: 'รายละเอียดความจำเป็น', reimburse: 'การเบิกคืน', schemes: 'สิทธิ์การรักษา', scheme_other: 'สิทธิ์อื่นๆ',
    funding_source: 'แหล่งเงิน', officer_opinion: 'ความเห็นพัสดุ', exec_name: 'ผู้พิจารณา', exec_date: 'วันที่พิจารณา', line_status: 'สถานะจัดซื้อ', background: 'ความเป็นมา' });
  var LINE_FIELD = { item: 'รายการ', qty: 'จำนวน', unit_price: 'ราคา/หน่วย', stock_on_hand: 'คงคลัง', use_per_month: 'ใช้ต่อเดือน', item_name: 'ชื่อรายการ', unit: 'หน่วยนับ', spec: 'คุณลักษณะ' };
  X.label = function (k) {
    var m = /^line_(\d+)_(\w+)$/.exec(k);
    return m ? 'รายการที่ ' + m[1] + ' ' + (LINE_FIELD[m[2]] || m[2]) : k;
  };
  ['m5.save', 'm5.officer.save', 'm5.exec.record', 'm6.save', 'm6.officer.save', 'purchase.plan.import'].forEach(function (a) { X.WRITE_ACTIONS.push(a); });

  var LINE_STATUS = { PENDING: 'รอดำเนินการ', BUYING: 'กำลังจัดซื้อ', BOUGHT: 'ซื้อแล้ว' };
  var SETS = { tor: 'คณะกรรมการกำหนดรายละเอียดคุณลักษณะเฉพาะ (TOR) และราคากลาง', eval: 'คณะกรรมการพิจารณาผล', inspect: 'คณะกรรมการตรวจรับพัสดุ' };
  var METHODS = { SPECIFIC: 'วิธีเฉพาะเจาะจง', SELECTION: 'วิธีคัดเลือก', E_BIDDING: 'วิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)' };
  // [รหัส, ชื่อ, บังคับ(M6), หมวด, เฉพาะเมนู] · PP เฉพาะขอซื้อนอกแผน (ในแผนอนุมัติวงเงินแล้วตั้งแต่ต้นปี ผู้ใช้กำหนด 26 พ.ย. 22:22) — หมวด "อื่นๆ" รวม PP และแค็ตตาล็อก (ผู้ใช้กำหนด 26 พ.ย. 2569)
  var CHECKS = [['spec', 'รายละเอียดคุณลักษณะเฉพาะ (Spec)'], ['quotation', 'ใบเสนอราคา (ไม่จำเป็นต้องครบ 3 บริษัท)'],
                ['pp', 'PP ใบแจ้งความประสงค์ (พิมพ์จาก Nextgov) — แนบไฟล์ในหน้าเอกสาร', 'M5', 'other', 'M5'], ['catalog', 'แค็ตตาล็อก', false, 'other'], ['other', 'เอกสารอื่น', false, 'other']];
  var SUPPLY_HEAD = { name: 'นางสาวรุ่งไพลิน จะนันท์', position: 'นักวิชาการพัสดุชำนาญการ' };
  var DIRECTOR = { name: 'นายสุรพงศ์ แสนโภชน์', position: 'ผู้อำนวยการโรงพยาบาลอุดรธานี' };   // แก้บนหน้าพิมพ์ได้
  var MONTHS_WARN = 6;

  /* ---------- ตัวช่วย ---------- */
  function money(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function qtyText(n) { return n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : NaN; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('medsup.' + k) || 'null'); localStorage.setItem('medsup.' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function thaiDay(iso) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); } catch (e) { return iso; }
  }
  function ymdThai(ymd) { return ymd ? thaiDay(ymd + 'T05:00:00Z') : ''; }
  function fieldBox(label, input, req, hint) {
    var w = el('div', null, 'f'); var id = 'f56-' + Math.random().toString(36).slice(2, 9); input.id = id;
    add(w, el('label', label + (req ? ' *' : ''), '', { for: id }), input, hint ? el('div', hint, 'muted') : null); return w;
  }
  function input(type, attrs) { var i = el('input', null, '', Object.assign({ type: type || 'text' }, attrs || {})); return i; }
  /* ช่องตัวเงิน: กรอกเสร็จ (ออกจากช่อง) ระบบใส่คอมมาและ .๐๐ ให้เอง · ทศนิยมสูงสุด ๓ ตำแหน่งตามราคาในแผน */
  function moneyFmt(v) { var n = num(v); return n === null || isNaN(n) ? String(v || '') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }); }
  function moneyInput(v) {
    var i = numInput(null); i.className += ' money56';
    if (v !== null && v !== undefined && v !== '') i.value = moneyFmt(v);
    i.addEventListener('blur', function () { if (i.value.trim()) i.value = moneyFmt(i.value.trim()); });
    i.addEventListener('focus', function () { if (i.value) { i.value = i.value.replace(/,/g, ''); try { i.select(); } catch (e) {} } });
    return i;
  }
  function numInput(v) { var i = input('text', { inputmode: 'decimal', class: 'n56' }); if (v !== null && v !== undefined) i.value = String(v); return i; }
  function sec(form, title) { var s = el('fieldset', null, 'sec'); s.appendChild(el('legend', title)); form.appendChild(s); return s; }
  function check(label, checked) { var l = el('label', null, 'check'), c = input('checkbox'); c.checked = !!checked; add(l, c, document.createTextNode(' ' + label)); l.box = c; return l; }
  function showErrors(box, fields) {
    clear(box); if (!fields) return;
    var ul = el('ul'); Object.keys(fields).forEach(function (k) { ul.appendChild(el('li', (X.FIELD_LABEL[k] || X.label(k)) + ': ' + (X.FIELD_MSG[fields[k]] || fields[k]))); });
    add(box, el('b', 'ยังส่งไม่ได้ กรุณาแก้ไข'), ul);
  }

  /* ธงแดง: ห้ามใส่ข้อมูลระบุตัวผู้ป่วย (ผู้ใช้กำหนด 26 พ.ย. 2569) */
  var FLAG_TEXT = '⚑ ห้ามใส่ HN ชื่อ-สกุล หรือข้อมูลที่ระบุตัวผู้ป่วย ทั้งในช่องข้อความและไฟล์แนบ — เขียนเป็นจำนวนผู้ป่วยหรือกลุ่มโรคแทน (เช่น "ผู้ป่วยแผลกดทับ 3 ราย")';
  function redFlag() { return el('div', FLAG_TEXT, 'flag56', { role: 'note' }); }
  /** ตรวจข้อความที่น่าจะเป็น HN/ชื่อผู้ป่วย — เตือนก่อนบันทึก (ไม่ใช่การตรวจที่สมบูรณ์) */
  function looksLikePatient(texts) {
    var t = texts.filter(Boolean).join(' ');
    return /\bHN\b|เอชเอ็น|\b\d{6,10}\b|(^|\s)(ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|นาย|นางสาว|นาง)\s*[ก-๙]{2,}/i.test(t);
  }

  /* ---------- Excel (SheetJS โหลดเมื่อใช้ครั้งแรก) ---------- */
  var xlsxReady = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxReady) xlsxReady = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';   // SheetJS 0.18.5 เก็บในเว็บเอง (ไม่พึ่ง CDN ภายนอก)
      s.onload = function () { res(window.XLSX); }; s.onerror = function () { xlsxReady = null; rej(new Error('โหลดตัวสร้าง Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
    return xlsxReady;
  }
  /** sheets = [{ name, rows: [[หัวตาราง...], [ค่า...]] }] */
  function exportXlsx(filename, sheets) {
    return loadXlsx().then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      sheets.forEach(function (s) { var ws = XLSX.utils.aoa_to_sheet(s.rows); ws['!cols'] = s.rows[0].map(function () { return { wch: 16 }; }); XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); });
      XLSX.writeFile(wb, filename);
      toast('สร้างไฟล์ Excel แล้ว');
    });
  }
  function exportBtn(label, fn) { var b = el('button', label, 'secondary', { type: 'button' }); b.addEventListener('click', function () { guard(b, fn); }); return b; }

  /* ---------- แผน (โหลดครั้งเดียวต่อ 5 นาที) ---------- */
  var planCache = null;
  function loadPlan(force) {
    if (!force && planCache && Date.now() - planCache.at < 300000) return Promise.resolve(planCache.data);
    return callApi('purchase.plan.list', {}).then(function (r) {
      if (!r.ok) throw new Error(X.errText(r));
      planCache = { at: Date.now(), data: r.data }; MONTHS_WARN = r.data.months_warn || 6; return r.data;
    });
  }

  /* ---------- คณะกรรมการ (แนะนำก่อนกรอก) ---------- */
  function advice(total, method) {
    var size = total <= 100000 ? 1 : 3, big = total > 500000;
    var m = big ? (method === 'SELECTION' ? 'SELECTION' : 'E_BIDDING') : 'SPECIFIC';
    return { size: size, big: big, method: m, sets: big ? ['tor', 'eval', 'inspect'] : ['tor', 'inspect'] };
  }
  function nameKey(s) { return String(s || '').replace(/\s+/g, '').replace(/^(นาย|นางสาว|นาง|น\.ส\.|ดร\.|นพ\.|พญ\.)/, ''); }

  function committeeBox(container, init, initMethod) {
    var data = { tor: (init && init.tor) || [], eval: (init && init.eval) || [], inspect: (init && init.inspect) || [] };
    var method = initMethod || null, total = 0, sameTor = false;
    var adv = el('div', null, 'notice'), body = el('div'), warn = el('div', null, 'ferr');
    var reuse = el('button', 'ใช้รายชื่อกรรมการชุดล่าสุด', 'secondary small', { type: 'button' });
    reuse.addEventListener('click', function () { var last = store('committees'); if (!last) { toast('ยังไม่มีรายชื่อที่เคยใช้'); return; } collect(); data = last; render(); });
    add(container, adv, add(el('div', null, 'actions'), reuse), body, warn);
    function collect() {
      [].forEach.call(body.querySelectorAll('[data-set]'), function (box) {
        var k = box.getAttribute('data-set'); data[k] = [];
        [].forEach.call(box.querySelectorAll('.mrow'), function (r) {
          var n = r.querySelector('.mn').value.trim(), p = r.querySelector('.mp').value.trim();
          if (n) data[k].push({ name: n, position: p });
        });
      });
      if (sameTor && data.eval.length) data.tor = data.eval.slice();
    }
    function render() {
      var a = advice(total, method);
      clear(adv); add(adv, el('b', 'คำแนะนำ: วงเงิน ' + money(total) + ' บาท · คณะกรรมการ ' + a.sets.length + ' ชุด ชุดละ ' + a.size + ' ท่าน'));
      add(adv, el('div', 'วิธีจัดซื้อจัดจ้าง กลุ่มงานพัสดุเป็นผู้พิจารณา (ไม่ต้องระบุในเอกสาร)', 'muted'));
      add(adv, el('div', a.size === 1 ? 'วงเงินไม่เกิน 100,000 บาท ใช้กรรมการ 1 ท่านได้' : 'วงเงินเกิน 100,000 บาท ใช้กรรมการชุดละ 3 ท่าน ท่านแรกเป็นประธาน'));
      if (a.big) {
        add(adv, el('div', 'คณะกรรมการพิจารณาผลเป็นคณะกรรมการตรวจรับไม่ได้ · ถ้าเจ้าหน้าที่ไม่พอ ใช้คณะกรรมการกำหนด TOR ชุดเดียวกับพิจารณาผลได้'));
      }
      clear(body);
      a.sets.forEach(function (k) {
        var box = el('div', null, 'cset', { 'data-set': k }); add(box, el('div', SETS[k], 'lbl-sm'));
        if (k === 'tor' && a.big) {
          var same = check('ใช้ชุดเดียวกับคณะกรรมการพิจารณาผล', sameTor);
          same.box.addEventListener('change', function () { collect(); sameTor = same.box.checked; render(); });
          box.appendChild(same);
          if (sameTor) { body.appendChild(box); return; }
        }
        var n = a.size;   // วงเงิน ≤100,000 = 1 ท่าน · เกิน = 3 ท่าน (ไม่ให้เกิน)
        if (data[k].length > n) data[k] = data[k].slice(0, n);
        for (var i = 0; i < n; i++) {
          var m = data[k][i] || {}, row = el('div', null, 'row mrow');
          var nm = input('text', { maxlength: '150', class: 'mn', placeholder: (i === 0 && a.size > 1 ? 'ประธาน: ' : 'กรรมการ: ') + 'ชื่อ-สกุล' }); nm.value = m.name || '';
          var ps = input('text', { maxlength: '150', class: 'mp', placeholder: 'ตำแหน่ง' }); ps.value = m.position || '';
          nm.setAttribute('aria-label', SETS[k] + ' ท่านที่ ' + (i + 1)); ps.setAttribute('aria-label', 'ตำแหน่ง ท่านที่ ' + (i + 1));
          nm.addEventListener('change', checkOverlap);
          add(row, nm, ps); box.appendChild(row);
        }
        body.appendChild(box);
      });
      checkOverlap();
    }
    function checkOverlap() {
      collect(); clear(warn);
      if (!advice(total, method).big) return;
      var ev = {}; data.eval.forEach(function (m) { ev[nameKey(m.name)] = true; });
      var dup = data.inspect.filter(function (m) { return ev[nameKey(m.name)]; });
      if (dup.length) warn.textContent = 'ซ้ำกันระหว่างพิจารณาผลกับตรวจรับ: ' + dup.map(function (m) { return m.name; }).join(', ');
    }
    render();
    return {
      setTotal: function (t) { collect(); total = t; render(); },
      get: function () {
        collect(); var a = advice(total, method), out = { tor: [], eval: [], inspect: [] };
        a.sets.forEach(function (k) { out[k] = data[k].slice(0, a.size); });
        if (out.tor.length || out.inspect.length) store('committees', out);
        return out;
      },
      method: function () { return null; }   // วิธีจัดซื้อ: พัสดุพิจารณาเอง
    };
  }

  function checksBox(container, init, module) {
    var boxes = {}, otherHead = false;
    CHECKS.forEach(function (c) {
      if (c[4] && c[4] !== module) return;   // PP ใช้เฉพาะขอซื้อนอกแผน · ขอซื้อในแผนอนุมัติวงเงินแล้วตั้งแต่ต้นปี ไม่มี PP
      if (c[3] === 'other' && !otherHead) { otherHead = true; container.appendChild(el('div', 'อื่นๆ', 'lbl-sm')); }
      var l = check(c[1] + (c[2] === module ? ' *' : ''), init && init[c[0]]); boxes[c[0]] = l.box; container.appendChild(l);
    });
    return { get: function () { var o = {}; Object.keys(boxes).forEach(function (k) { o[k] = boxes[k].checked; }); return o; } };
  }

  /* ---------- Menu 6 ยืนยันแผน: แบบฟอร์ม ---------- */
  /* กันข้อมูลหาย: กรอกแล้วยังไม่บันทึก แล้วปิดแท็บ/รีเฟรช → เบราว์เซอร์ถามก่อน (ไม่เก็บร่างในเครื่อง เพราะเครื่องในหอผู้ป่วยใช้ร่วมกัน) */
  function guardLeave(view, alive) {
    var dirty = false;
    view.addEventListener('input', function () { dirty = true; }); view.addEventListener('change', function () { dirty = true; });
    function h(e) { if (!alive()) { window.removeEventListener('beforeunload', h); return; } if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', h);
  }
  function pagePlanForm(view, parts, alive) {
    guardLeave(view, alive);
    var docId = parts[0] ? decodeURIComponent(parts[0]) : null;
    X.pageTitle(view, docId ? 'แก้ไขแบบยืนยันขอซื้อในแผน' : 'ขอซื้อในแผน', 'ยืนยันความต้องการใช้วัสดุที่อยู่ในแผนจัดซื้อปีนี้ · กรอกคงคลังและยอดใช้ต่อเดือน ระบบคำนวณจำนวนเงินและระยะเวลาที่พอใช้ให้');
    var box = X.loading(view);
    Promise.all([loadPlan(true), docId ? callApi('documents.get', { id: docId }) : Promise.resolve(null)]).then(function (res) {
      if (!alive()) return; box.remove();
      var plan = res[0], det = res[1];
      if (det && (!det.ok || det.data.document.module !== 'M6' || !det.data.module_data || !det.data.module_data.can_edit)) {
        add(view, el('div', det.ok ? 'เอกสารนี้แก้ไขไม่ได้แล้ว' : X.errText(det), 'card fail')); return;
      }
      var cur = det ? det.data.module_data.data : null;
      var byId = {}; plan.rows.forEach(function (p) { byId[p.id] = p; });
      if (!plan.rows.length) { add(view, el('div', 'ยังไม่มีแผนจัดซื้อปี ' + plan.fiscal_year + ' ในระบบ — แจ้งงานพัสดุให้นำเข้าแผน', 'card notice')); return; }

      var form = el('form', null, 'card m1form', { novalidate: 'novalidate', autocomplete: 'off' });
      form.appendChild(redFlag()); if (!docId) form.appendChild(menuGuide('M6'));
      var phone = input('tel', { maxlength: '50', inputmode: 'tel' }); phone.value = (cur && cur.phone) || store('phone') || '';
      var udn = input('text', { maxlength: '100', placeholder: 'เช่น อด 0033.301.5/123' }); udn.value = (cur && cur.unit_doc_no) || '';
      add(sec(form, 'หน่วยงาน'), el('div', 'หน่วยงาน: ' + (plan.department_name || 'ยังไม่ระบุ — แก้ที่ "ข้อมูลของฉัน" ก่อนส่ง'), 'muted'), fieldBox('เบอร์โทรศัพท์', phone, true),
          fieldBox('เลขที่หนังสือของหน่วยงาน (ช่อง "ที่")', udn, false, 'เลขทะเบียนหนังสือส่งของหน่วยงาน · เว้นว่างได้ แล้วเขียนบนกระดาษหลังพิมพ์'));

      var linesSec = sec(form, 'รายการตามแผน');
      var search = input('search', { placeholder: 'พิมพ์รหัสหรือชื่อรายการ', 'aria-label': 'ค้นหารายการในแผน' });
      var hits = el('div', null, 'hits56');
      var tbl = el('div', null, 'scroll'), sumLine = el('div', null, 'p-sum56');
      add(linesSec, fieldBox('ค้นหารายการในแผนปี ' + plan.fiscal_year, search, false, 'เลือกแล้วรายการจะเพิ่มในตารางด้านล่าง'), hits, tbl, sumLine);
      var lines = (cur ? cur.lines : []).map(function (l) { return { plan_item_id: l.plan_item_id, qty: l.qty, unit_price: l.unit_price, stock_on_hand: l.stock_on_hand, use_per_month: l.use_per_month }; });

      search.addEventListener('input', function () {
        clear(hits); var q = search.value.trim().toLowerCase(); if (q.length < 2) return;
        var found = plan.rows.filter(function (p) { return (p.code || '').toLowerCase().indexOf(q) >= 0 || (p.name || '').toLowerCase().indexOf(q) >= 0 || (p.old_name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 15);
        if (!found.length) { add(hits, el('div', 'ไม่พบในแผน — ถ้าจำเป็นต้องซื้อ ใช้เมนู "ขอซื้อนอกแผน"', 'muted')); return; }
        found.forEach(function (p) {
          var b = el('button', null, 'secondary small hit', { type: 'button' });
          add(b, el('b', (p.code || '(ไม่มีรหัส)') + ' '), document.createTextNode(p.name + ' · ' + p.unit + ' · ' + money(p.price) + ' บาท · คงเหลือในแผน ' + qtyText(p.remaining)));
          b.addEventListener('click', function () {
            if (lines.some(function (l) { return l.plan_item_id === p.id; })) { toast('มีรายการนี้แล้ว'); return; }
            lines.push({ plan_item_id: p.id, qty: null, unit_price: p.price, stock_on_hand: null, use_per_month: null });
            search.value = ''; clear(hits); renderLines();
          });
          hits.appendChild(b);
        });
      });

      var comm, total = 0;
      function renderLines() {
        clear(tbl);
        if (!lines.length) { tbl.appendChild(el('div', 'ยังไม่ได้เลือกรายการ', 'muted')); recalc(); return; }
        var t = el('table', null, 'stack t56'), hr = el('tr');
        var heads = ['ลำดับ', 'รายการ', 'คงเหลือในแผน', 'คงคลัง', 'ใช้/เดือน', 'จำนวนสั่ง', 'ราคา/หน่วย', 'จำนวนเงิน', 'พอใช้ (เดือน)', ''];
        heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
        var tb = el('tbody');
        lines.forEach(function (l, i) {
          var p = byId[l.plan_item_id] || {}, tr = el('tr');
          var st = numInput(l.stock_on_hand), use = numInput(l.use_per_month), q = numInput(l.qty), pr = moneyInput(l.unit_price);
          var amt = el('td', null, 'num'), cover = el('td', null, 'num');
          function upd() {
            l.stock_on_hand = num(st.value); l.use_per_month = num(use.value); l.qty = num(q.value); l.unit_price = num(pr.value);
            var a = l.qty > 0 && l.unit_price >= 0 ? r2(l.qty * l.unit_price) : null; amt.textContent = a === null ? '-' : money(a);
            var c = l.use_per_month > 0 ? Math.round(((l.stock_on_hand || 0) + (l.qty || 0)) / l.use_per_month * 10) / 10 : null;
            clear(cover); cover.appendChild(document.createTextNode(c === null ? '-' : String(c)));
            if (c !== null && c > MONTHS_WARN) cover.appendChild(el('div', 'เกิน ' + MONTHS_WARN + ' เดือน', 'warn56'));
            if (l.qty > p.remaining) amt.appendChild(el('div', 'เกินคงเหลือในแผน', 'warn56'));
            if (l.unit_price > p.price) amt.appendChild(el('div', 'ราคาสูงกว่าแผน', 'warn56'));
            recalc();
          }
          [st, use, q, pr].forEach(function (x) { x.addEventListener('input', upd); });
          var rm = el('button', 'ลบ', 'danger small', { type: 'button' }); rm.addEventListener('click', function () { lines.splice(i, 1); renderLines(); });
          var name = el('td'); add(name, el('b', p.code || '(ไม่มีรหัส)'), el('div', (p.name || '(รายการนี้ไม่อยู่ในแผนแล้ว)') + ' · ' + (p.unit || '')));
          add(tr, el('td', String(i + 1)), name, el('td', qtyText(p.remaining), 'num'), add(el('td'), st), add(el('td'), use), add(el('td'), q), add(el('td'), pr), amt, cover, add(el('td'), rm));
          [].forEach.call(tr.children, function (td, k) { if (heads[k]) td.setAttribute('data-label', heads[k]); });
          tb.appendChild(tr); upd();
        });
        add(t, tb); tbl.appendChild(t);
      }
      function recalc() {
        total = lines.reduce(function (s, l) { return r2(s + (l.qty > 0 && l.unit_price >= 0 ? r2(l.qty * l.unit_price) : 0)); }, 0);
        sumLine.textContent = 'รวม ' + lines.length + ' รายการ · ' + money(total) + ' บาท';
        if (comm) comm.setTotal(total);
      }
      renderLines();

      var cs = sec(form, 'คณะกรรมการ');
      comm = committeeBox(cs, cur && cur.committees, cur && cur.purchase_method); comm.setTotal(total);

      var as = sec(form, 'เอกสารประกอบ');
      var qc = numInput(cur ? cur.quotation_count : null);
      as.appendChild(fieldBox('ใบเสนอราคา (จำนวนบริษัท)', qc));
      var checks = checksBox(as, cur ? cur.attach_checks : {}, 'M6');
      var note = el('textarea', null, '', { rows: '2', maxlength: '2000' }); note.value = (cur && cur.note) || '';
      as.appendChild(fieldBox('หมายเหตุ', note)); as.appendChild(redFlag());

      var errs = el('div', null, 'ferr'); form.appendChild(errs);
      var save = el('button', 'บันทึกร่าง', 'secondary', { type: 'button' }), next = el('button', 'บันทึกแล้วไปแนบไฟล์และส่ง', '', { type: 'submit' });
      add(form, add(el('div', null, 'actions'), save, next));
      view.appendChild(form);

      var st = { id: docId, version: cur ? cur.version : null, rid: null };
      function payload() {
        var p = { phone: phone.value.trim(), unit_doc_no: udn.value.trim(), lines: lines.map(function (l) { return { plan_item_id: l.plan_item_id, qty: l.qty, unit_price: l.unit_price, stock_on_hand: l.stock_on_hand, use_per_month: l.use_per_month }; }),
                  committees: comm.get(), purchase_method: comm.method(), quotation_count: num(qc.value) === null ? null : Math.round(num(qc.value)),
                  attach_checks: checks.get(), note: note.value.trim() };
        if (st.id) { p.document_id = st.id; p.version = st.version; }
        return p;
      }
      function doSave(go) {
        var p = payload();
        if (p.lines.some(function (l) { return isNaN(l.qty) || isNaN(l.unit_price) || isNaN(l.stock_on_hand) || isNaN(l.use_per_month); })) { toast('มีช่องตัวเลขที่ไม่ถูกต้อง', true); return Promise.resolve(); }
        if (looksLikePatient([p.note]) && !window.confirm('ข้อความอาจมี HN หรือชื่อผู้ป่วย — ห้ามใส่ข้อมูลระบุตัวผู้ป่วย\nกด "ยกเลิก" เพื่อกลับไปแก้ · กด "ตกลง" ถ้าตรวจแล้วไม่มี')) return Promise.resolve();
        store('phone', p.phone);
        return callApi('m6.save', p).then(function (r) {
          if (!r.ok) { showErrors(errs, r.fields); reportFail(r); return; }
          clear(errs); st.id = r.data.document_id; st.version = r.data.version; toast('บันทึกแล้ว');
          if (go) location.hash = '#/documents/' + encodeURIComponent(st.id);
          else if (!docId) history.replaceState(null, '', '#/plan/' + encodeURIComponent(st.id));
        });
      }
      save.addEventListener('click', function () { guard(save, function () { return doSave(false); }); });
      form.addEventListener('submit', function (ev) { ev.preventDefault(); guard(next, function () { return doSave(true); }); });
    }).catch(function (e) { box.textContent = e.message; });
  }

  /* ---------- Menu 5 ขอซื้อนอกแผน: แบบฟอร์ม ---------- */
  var REASONS = ['บริการหรือหัตถการใหม่', 'ผู้ป่วยเฉพาะราย', 'ทดแทนรายการเดิมที่ยกเลิกหรือขาดตลาด', 'ใช้เกินจากที่ประมาณการในแผน', 'ตามมาตรฐานหรือข้อกำหนดวิชาชีพ', 'อื่นๆ'];
  var REIMBURSE = { YES: 'เบิกคืนได้', PARTIAL: 'เบิกคืนได้บางส่วน', NO: 'เบิกคืนไม่ได้' };
  var SCHEMES = { SSO: 'ประกันสังคม', UC: 'บัตรทอง (หลักประกันสุขภาพแห่งชาติ)', CSMBS: 'จ่ายตรง (ข้าราชการ/รัฐวิสาหกิจ)', LGO: 'อปท.', OTHER: 'อื่นๆ' };

  /* คำอธิบายก่อนเลือกเมนู: ขอซื้อในแผน vs ขอซื้อนอกแผน */
  function menuGuide(cur) {
    var d = el('details', null, 'route56 guide56'); d.open = true;
    d.appendChild(el('summary', 'เลือกเมนูให้ถูก: ขอซื้อในแผน หรือ ขอซื้อนอกแผน'));
    var g = el('div', null, 'g2-56');
    function col(key, title, when, need, out) {
      var c = el('div', null, 'gcol56' + (key === cur ? ' on' : ''));
      add(c, el('b', title + (key === cur ? ' (หน้านี้)' : '')), el('div', 'ใช้เมื่อ: ' + when), el('div', 'ต้องเตรียม: ' + need), el('div', 'ได้เอกสาร: ' + out, 'muted'));
      if (key !== cur) c.appendChild(el('a', 'ไปที่' + title + ' →', '', { href: '#/' + (key === 'M6' ? 'plan' : 'oop') }));
      return c;
    }
    add(g, col('M6', 'ขอซื้อในแผน', 'วัสดุอยู่ในแผนจัดซื้อประจำปีของโรงพยาบาล (ค้นหาเจอในแผน) เพื่อยืนยันว่าหน่วยงานจะเบิกใช้จริง พัสดุจะได้ไม่ซื้อแล้วค้างจนหมดอายุ',
              'คงคลังและยอดใช้ต่อเดือน · รายชื่อกรรมการ (ไม่ต้องใช้ PP เพราะรายการในแผนอนุมัติวงเงินแล้วตั้งแต่ต้นปีงบประมาณ)', 'แบบยืนยันการจัดซื้อตามแผน + เอกสาร ๑ รายชื่อกรรมการ เสนอหัวหน้ากลุ่มงานพัสดุ'),
           col('M5', 'ขอซื้อนอกแผน', 'วัสดุไม่อยู่ในแผน หรือเป็นรายการใหม่ ต้องขออนุมัติผู้อำนวยการ',
              'PP ใบแจ้งความประสงค์ (บังคับ ใช้อ้างอิงขอเพิ่มวงเงินกลางปี) · เหตุผลความจำเป็น · การเบิกคืน/สิทธิ์ · ยอดใช้ต่อเดือน · คุณลักษณะเฉพาะ · ใบเสนอราคา · รายชื่อกรรมการ', 'บันทึกข้อความเรียนผู้อำนวยการ + เอกสาร ๑ รายชื่อกรรมการ'));
    add(d, g, el('div', 'ไม่แน่ใจ: เริ่มที่ "ขอซื้อในแผน" แล้วค้นหาชื่อหรือรหัสวัสดุ ถ้าไม่เจอจึงใช้ "ขอซื้อนอกแผน"', 'muted'));
    return d;
  }

  /* เส้นทางเอกสารที่แนะนำ — แสดงเป็นคำแนะนำเท่านั้น ระบบยังเดินตามขั้นตอนเดิม (ผู้ใช้สั่ง 26 พ.ย. 2569) */
  var ROUTE_STEPS = [
    ['หน่วยงานจัดทำ', 'กรอกในระบบ แนบเอกสาร'],
    ['หัวหน้ากลุ่มงานอนุมัติ', 'กดยืนยันในระบบ'],
    ['กลุ่มงานยุทธศาสตร์และแผนงานโครงการ', 'ส่งต่อพัสดุ ระบุ "นำเข้าคณะกรรมการเวชภัณฑ์มิใช่ยา"'],
    ['กลุ่มงานพัสดุรับเรื่อง', 'นำเข้าคณะกรรมการเวชภัณฑ์มิใช่ยา'],
    ['คณะกรรมการพิจารณา', 'หน่วยงานที่ขอชี้แจงเหตุผลในกลุ่ม LINE'],
    ['อนุมัติ', 'ผู้แทนคณะกรรมการลงนาม แล้วพัสดุจัดซื้อตามกระบวนการ']
  ];
  function routeGuide(open) {
    var d = el('details', null, 'route56'); if (open) d.open = true;
    d.appendChild(el('summary', 'เส้นทางเอกสารที่แนะนำ (ขอซื้อนอกแผน)'));
    var ol = el('ol', null, 'flow56');
    ROUTE_STEPS.forEach(function (x, i) { ol.appendChild(add(el('li'), el('b', (i + 1) + '. ' + x[0]), el('span', x[1]))); });
    add(d, ol, el('div', 'คำแนะนำเพื่อเตรียมเอกสาร ระบบยังไม่บังคับขั้นตอนนี้', 'muted'));
    return d;
  }

  function pageOopForm(view, parts, alive) {
    guardLeave(view, alive);
    var docId = parts[0] ? decodeURIComponent(parts[0]) : null;
    X.pageTitle(view, docId ? 'แก้ไขบันทึกขอซื้อนอกแผน' : 'ขอซื้อนอกแผน', 'แทนบันทึกข้อความเรียนผู้อำนวยการ · ระบุเหตุผลความจำเป็น การเบิกคืน และยอดใช้ต่อเดือน');
    var box = X.loading(view);
    Promise.all([callApi('master.items', {}), loadPlan(true).catch(function () { return { rows: [] }; }), docId ? callApi('documents.get', { id: docId }) : Promise.resolve(null)]).then(function (res) {
      if (!alive()) return; box.remove();
      var items = res[0].ok ? res[0].data.rows : [], plan = res[1], det = res[2];
      if (det && (!det.ok || det.data.document.module !== 'M5' || !det.data.module_data || !det.data.module_data.can_edit)) {
        add(view, el('div', det.ok ? 'เอกสารนี้แก้ไขไม่ได้แล้ว' : X.errText(det), 'card fail')); return;
      }
      var cur = det ? det.data.module_data.data : null;
      var itemByLabel = {}, itemById = {}, planCodes = {};
      items.forEach(function (it) { itemByLabel[it.code + ' ' + it.name] = it; itemById[it.id] = it; });
      plan.rows.forEach(function (p) { if (p.code) planCodes[p.code] = p; });
      var dl = el('datalist', null, '', { id: 'dl56-items' });
      items.forEach(function (it) { var o = document.createElement('option'); o.value = it.code + ' ' + it.name; dl.appendChild(o); });
      view.appendChild(dl);

      var form = el('form', null, 'card m1form', { novalidate: 'novalidate', autocomplete: 'off' });
      form.appendChild(redFlag()); if (!docId) form.appendChild(menuGuide('M5')); form.appendChild(routeGuide(false));
      var phone = input('tel', { maxlength: '50', inputmode: 'tel' }); phone.value = (cur && cur.phone) || store('phone') || '';
      var addStock = check('ขอเพิ่มในรายการเข้าคลังวัสดุการแพทย์ด้วย (ใช้ต่อเนื่อง)', cur && cur.add_to_stock);
      var udn = input('text', { maxlength: '100', placeholder: 'เช่น อด 0033.301.5/123' }); udn.value = (cur && cur.unit_doc_no) || '';
      add(sec(form, 'หน่วยงาน'), el('div', 'หน่วยงาน: ' + (plan.department_name || 'ยังไม่ระบุ — แก้ที่ "ข้อมูลของฉัน" ก่อนส่ง'), 'muted'), fieldBox('เบอร์โทรศัพท์', phone, true),
          fieldBox('เลขที่หนังสือของหน่วยงาน (ช่อง "ที่")', udn, false, 'เลขทะเบียนหนังสือส่งของหน่วยงาน · เว้นว่างได้ แล้วเขียนบนกระดาษหลังพิมพ์'), addStock);

      var bg = el('textarea', null, '', { rows: '3', maxlength: '3000' }); bg.value = (cur && cur.background) || '';
      add(sec(form, '๑. ความเป็นมา'), fieldBox('ความเป็นมา (ถ้ามี)', bg, false, 'เช่น บริการที่เปิดใหม่ จำนวนผู้ป่วยที่เพิ่มขึ้น'));

      var rs = sec(form, '๒. เหตุผลความจำเป็น');
      var rboxes = REASONS.map(function (r) { var l = check(r, cur && cur.reason_codes && cur.reason_codes.indexOf(r) >= 0); rs.appendChild(l); return [r, l.box]; });
      var rtext = el('textarea', null, '', { rows: '3', maxlength: '3000' }); rtext.value = (cur && cur.reason_text) || '';
      rs.appendChild(fieldBox('รายละเอียดความจำเป็น', rtext, true, 'ผลต่อผู้ป่วยถ้าไม่มีวัสดุนี้ และทำไมใช้รายการในคลังแทนไม่ได้'));
      rs.appendChild(redFlag());

      var ms = sec(form, '๓. การเบิกคืนค่าวัสดุ');
      var reim = el('select'); add(reim, el('option', 'เลือก', '', { value: '' }));
      Object.keys(REIMBURSE).forEach(function (k) { var o = el('option', REIMBURSE[k]); o.value = k; reim.appendChild(o); }); reim.value = (cur && cur.reimburse) || '';
      ms.appendChild(fieldBox('เบิกคืนจากหน่วยงานที่เกี่ยวข้องได้หรือไม่', reim, true));
      var sbox = el('div'), sboxes = {};
      Object.keys(SCHEMES).forEach(function (k) { var l = check(SCHEMES[k], cur && cur.schemes && cur.schemes.indexOf(k) >= 0); sboxes[k] = l.box; sbox.appendChild(l); });
      var sother = input('text', { maxlength: '200' }); sother.value = (cur && cur.scheme_other) || '';
      add(ms, add(el('div', null, 'f'), el('div', 'สิทธิ์ที่ใช้เบิก', 'lbl-sm'), el('div', 'ตามที่หน่วยงานที่เกี่ยวข้องกำหนดสิทธิ์ เช่น ประกันสังคม บัตรทอง จ่ายตรง', 'muted'), sbox), fieldBox('สิทธิ์อื่นๆ (ระบุ)', sother));
      function syncSchemes() { var off = reim.value === 'NO'; sbox.style.opacity = off ? .5 : 1; Object.keys(sboxes).forEach(function (k) { sboxes[k].disabled = off; }); }
      reim.addEventListener('change', syncSchemes); syncSchemes();

      var ls = sec(form, '๔. รายการที่ขอซื้อ');
      ls.appendChild(el('div', 'กำหนดคุณลักษณะตามความต้องการใช้งาน ไม่ระบุยี่ห้อหรือเขียนให้เข้าได้เพียงยี่ห้อเดียว (พ.ร.บ.จัดซื้อจัดจ้างฯ มาตรา 9)', 'notice'));
      var lbox = el('div'), sumLine = el('div', null, 'p-sum56'), addBtn = el('button', '+ เพิ่มรายการ', 'secondary small', { type: 'button' });
      add(ls, lbox, add(el('div', null, 'actions'), addBtn), sumLine);
      var lines = (cur ? cur.lines : [{}]).map(function (l) { return { item_id: l.item_id || null, item_name: l.item_name || '', spec: l.spec || '', unit: l.unit || '', qty: l.qty, unit_price: l.unit_price, stock_on_hand: l.stock_on_hand, use_per_month: l.use_per_month }; });
      if (!lines.length) lines.push({});
      addBtn.addEventListener('click', function () { lines.push({}); renderLines(); });
      var comm, total = 0;
      function renderLines() {
        clear(lbox);
        lines.forEach(function (l, i) {
          var c = el('fieldset', null, 'itemcard'); c.appendChild(el('legend', 'รายการที่ ' + (i + 1)));
          var nm = input('text', { maxlength: '500', list: 'dl56-items' }); nm.value = l.item_id && itemById[l.item_id] ? itemById[l.item_id].code + ' ' + itemById[l.item_id].name : (l.item_name || '');
          var sp = el('textarea', null, '', { rows: '2', maxlength: '2000' }); sp.value = l.spec || '';
          var un = input('text', { maxlength: '50' }); un.value = l.unit || '';
          var q = numInput(l.qty), pr = moneyInput(l.unit_price), st = numInput(l.stock_on_hand), use = numInput(l.use_per_month);
          var info = el('div', null, 'muted');
          function upd() {
            var it = itemByLabel[nm.value.trim()];
            l.item_id = it ? it.id : null; l.item_name = it ? '' : nm.value.trim();
            l.spec = sp.value.trim(); l.unit = un.value.trim(); l.qty = num(q.value); l.unit_price = num(pr.value); l.stock_on_hand = num(st.value); l.use_per_month = num(use.value);
            var a = l.qty > 0 && l.unit_price >= 0 ? r2(l.qty * l.unit_price) : null;
            var cov = l.use_per_month > 0 ? Math.round(((l.stock_on_hand || 0) + (l.qty || 0)) / l.use_per_month * 10) / 10 : null;
            clear(info);
            add(info, document.createTextNode('จำนวนเงิน ' + (a === null ? '-' : money(a)) + ' บาท · ใช้ต่อเดือน ' + (l.use_per_month > 0 && l.unit_price >= 0 ? money(l.use_per_month * l.unit_price) : '-') + ' บาท · พอใช้ ' + (cov === null ? '-' : cov) + ' เดือน'));
            if (cov !== null && cov > MONTHS_WARN) info.appendChild(el('div', 'สั่งแล้วพอใช้เกิน ' + MONTHS_WARN + ' เดือน', 'warn56'));
            if (it && planCodes[it.code]) info.appendChild(el('div', 'รายการนี้อยู่ในแผนแล้ว (คงเหลือ ' + qtyText(planCodes[it.code].remaining) + ') ควรใช้เมนู "ยืนยันแผน"', 'warn56'));
            recalc();
          }
          [nm, sp, un, q, pr, st, use].forEach(function (x) { x.addEventListener('input', upd); });
          var rm = el('button', 'ลบรายการ', 'danger small', { type: 'button' }); rm.addEventListener('click', function () { lines.splice(i, 1); if (!lines.length) lines.push({}); renderLines(); });
          add(c, fieldBox('ชื่อรายการ', nm, true, 'มีรหัสในคลัง เลือกจากรายการ · ไม่มี พิมพ์ชื่อเอง'), fieldBox('คุณลักษณะ/ขนาด', sp),
              add(el('div', null, 'row'), fieldBox('หน่วยนับ', un, true), fieldBox('จำนวน', q, true), fieldBox('ราคา/หน่วย (บาท)', pr, true)),
              add(el('div', null, 'row'), fieldBox('คงคลังหน่วยงาน', st), fieldBox('ยอดใช้ต่อเดือน (คาดการณ์)', use, true)), info, add(el('div', null, 'actions'), rm));
          lbox.appendChild(c); upd();
        });
      }
      function recalc() {
        total = lines.reduce(function (s, l) { return r2(s + (l.qty > 0 && l.unit_price >= 0 ? r2(l.qty * l.unit_price) : 0)); }, 0);
        var monthly = lines.reduce(function (s, l) { return r2(s + (l.use_per_month > 0 && l.unit_price >= 0 ? r2(l.use_per_month * l.unit_price) : 0)); }, 0);
        sumLine.textContent = 'รวม ' + lines.length + ' รายการ · ' + money(total) + ' บาท · ค่าใช้จ่ายต่อเดือนประมาณ ' + money(monthly) + ' บาท';
        if (comm) comm.setTotal(total);
      }
      renderLines();

      var cs = sec(form, '๕. คณะกรรมการ');
      comm = committeeBox(cs, cur && cur.committees, cur && cur.purchase_method); comm.setTotal(total);
      var as = sec(form, '๖. เอกสารประกอบ');
      var qc = numInput(cur ? cur.quotation_count : null); as.appendChild(fieldBox('ใบเสนอราคา (จำนวนบริษัท)', qc));
      var checks = checksBox(as, cur ? cur.attach_checks : { pp: true }, 'M5');
      as.appendChild(el('div', 'ชุดเอกสารที่ควรแนบในระบบ: คุณลักษณะเฉพาะ · ใบเสนอราคา · เอกสาร ๑ รายชื่อกรรมการ (ระบบพิมพ์ให้) — ยังไม่ครบก็ส่งได้ แนบเพิ่มภายหลังได้', 'muted'));
      var note = el('textarea', null, '', { rows: '2', maxlength: '2000' }); note.value = (cur && cur.note) || ''; as.appendChild(fieldBox('หมายเหตุ', note));

      var errs = el('div', null, 'ferr'); form.appendChild(errs);
      var save = el('button', 'บันทึกร่าง', 'secondary', { type: 'button' }), next = el('button', 'บันทึกแล้วไปแนบไฟล์และส่ง', '', { type: 'submit' });
      add(form, add(el('div', null, 'actions'), save, next));
      view.appendChild(form);

      var st = { id: docId, version: cur ? cur.version : null };
      function payload() {
        var p = { phone: phone.value.trim(), unit_doc_no: udn.value.trim(), add_to_stock: addStock.box.checked, background: bg.value.trim(),
                  reason_codes: rboxes.filter(function (x) { return x[1].checked; }).map(function (x) { return x[0]; }), reason_text: rtext.value.trim(),
                  reimburse: reim.value, schemes: reim.value === 'NO' ? [] : Object.keys(sboxes).filter(function (k) { return sboxes[k].checked; }), scheme_other: sother.value.trim(),
                  lines: lines.filter(function (l) { return l.item_id || l.item_name || l.qty; }).map(function (l) {
                    return { item_id: l.item_id, item_name: l.item_name, spec: l.spec, unit: l.unit, qty: l.qty, unit_price: l.unit_price, stock_on_hand: l.stock_on_hand, use_per_month: l.use_per_month };
                  }),
                  committees: comm.get(), purchase_method: comm.method(), quotation_count: num(qc.value) === null ? null : Math.round(num(qc.value)),
                  attach_checks: checks.get(), note: note.value.trim() };
        if (st.id) { p.document_id = st.id; p.version = st.version; }
        return p;
      }
      function doSave(go) {
        var p = payload();
        if (p.lines.some(function (l) { return isNaN(l.qty) || isNaN(l.unit_price) || isNaN(l.stock_on_hand) || isNaN(l.use_per_month); })) { toast('มีช่องตัวเลขที่ไม่ถูกต้อง', true); return Promise.resolve(); }
        if (looksLikePatient([p.background, p.reason_text, p.note].concat(p.lines.map(function (l) { return l.spec; }))) && !window.confirm('ข้อความอาจมี HN หรือชื่อผู้ป่วย — ห้ามใส่ข้อมูลระบุตัวผู้ป่วย\nกด "ยกเลิก" เพื่อกลับไปแก้ · กด "ตกลง" ถ้าตรวจแล้วไม่มี')) return Promise.resolve();
        store('phone', p.phone);
        return callApi('m5.save', p).then(function (r) {
          if (!r.ok) { showErrors(errs, r.fields); reportFail(r); return; }
          clear(errs); st.id = r.data.document_id; st.version = r.data.version; toast('บันทึกแล้ว');
          if (go) location.hash = '#/documents/' + encodeURIComponent(st.id);
          else if (!docId) history.replaceState(null, '', '#/oop/' + encodeURIComponent(st.id));
        });
      }
      save.addEventListener('click', function () { guard(save, function () { return doSave(false); }); });
      form.addEventListener('submit', function (ev) { ev.preventDefault(); guard(next, function () { return doSave(true); }); });
    });
  }

  /* ---------- หน้าเอกสาร: ส่วนเสริมของ M5/M6 ---------- */
  function linesTable(md, module) {
    var d = md.data, t = el('table', null, 'stack'), hr = el('tr');
    var heads = module === 'M6' ? ['ลำดับ', 'รหัส', 'รายการ', 'หน่วย', 'คงคลัง', 'ใช้/เดือน', 'จำนวน', 'ราคา/หน่วย', 'จำนวนเงิน', 'พอใช้ (เดือน)', 'สถานะจัดซื้อ']
                                : ['ลำดับ', 'รหัส', 'รายการ', 'หน่วย', 'คงคลัง', 'ใช้/เดือน', 'จำนวน', 'ราคา/หน่วย', 'จำนวนเงิน', 'พอใช้ (เดือน)', 'สถานะจัดซื้อ'];
    heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
    var tb = el('tbody');
    d.lines.forEach(function (l) {
      var tr = el('tr'), nm = el('td'); add(nm, document.createTextNode(l.item_name || '')); if (l.spec) nm.appendChild(el('div', l.spec, 'muted'));
      (l.warn || []).forEach(function (w) { nm.appendChild(el('div', w, 'warn56')); });
      add(tr, el('td', String(l.line_no)), el('td', l.item_code || '-'), nm, el('td', l.unit || ''), el('td', qtyText(l.stock_on_hand), 'num'), el('td', qtyText(l.use_per_month), 'num'),
          el('td', qtyText(l.qty), 'num'), el('td', money(l.unit_price), 'num'), el('td', money(l.amount), 'num'), el('td', l.months_cover === null ? '-' : String(l.months_cover), 'num'),
          el('td', LINE_STATUS[l.purchase_status] || '-'));
      [].forEach.call(tr.children, function (td, k) { td.setAttribute('data-label', heads[k]); });
      tb.appendChild(tr);
    });
    add(t, tb);
    return add(el('div', null, 'scroll'), t);
  }

  function committeeView(c) {
    var w = el('div');
    Object.keys(SETS).forEach(function (k) {
      if (!c[k] || !c[k].length) return;
      w.appendChild(el('div', SETS[k], 'lbl-sm'));
      var ol = el('ol'); c[k].forEach(function (m, i) { ol.appendChild(el('li', m.name + (m.position ? ' ตำแหน่ง ' + m.position : '') + (c[k].length > 1 ? (i === 0 ? ' (ประธาน)' : ' (กรรมการ)') : ''))); });
      w.appendChild(ol);
    });
    return w;
  }

  function signerText(s) { return s ? s.name + (s.position ? ' (' + s.position + ')' : '') + ' · ' + X.fmtDate(s.at) : '-'; }

  function bodyCards(view, doc, md, data, refresh) {
    var d = md.data; if (!d) return;
    var c = el('div', null, 'card doc-part');
    add(c, el('h2', doc.module === 'M6' ? 'รายการยืนยันตามแผน' : 'รายการขอซื้อนอกแผน'), linesTable(md, doc.module),
        el('p', 'รวม ' + d.line_count + ' รายการ · ' + money(d.total_amount) + ' บาท (' + d.total_text + ')' + (doc.module === 'M5' ? ' · ค่าใช้จ่ายต่อเดือนประมาณ ' + money(d.monthly_cost) + ' บาท' : ''), 'p-sum56'));
    var kv = el('dl', null, 'kv');
    add(kv, el('dt', 'เบอร์โทรศัพท์'), el('dd', d.phone || '-'), el('dt', 'ใบเสนอราคา'), el('dd', d.quotation_count ? d.quotation_count + ' บริษัท' : '-'),
        el('dt', 'เอกสารแนบที่ระบุ'), el('dd', CHECKS.filter(function (x) { return d.attach_checks[x[0]]; }).map(function (x) { return x[1].split(' — ')[0].split(' (')[0]; }).join(', ') || '-'));
    if (doc.module === 'M5') {
      add(kv, el('dt', 'เหตุผลความจำเป็น'), el('dd', (d.reason_codes || []).join(', ') + (d.reason_text ? ' — ' + d.reason_text : '')),
          el('dt', 'การเบิกคืน'), el('dd', (REIMBURSE[d.reimburse] || '-') + ((d.schemes || []).length ? ' · ' + d.schemes.map(function (k) { return k === 'OTHER' && d.scheme_other ? d.scheme_other : SCHEMES[k]; }).join(', ') : '')),
          el('dt', 'เพิ่มเข้าคลัง'), el('dd', d.add_to_stock ? 'ขอเพิ่มในรายการเข้าคลัง' : 'ไม่'));
      if (d.background) add(kv, el('dt', 'ความเป็นมา'), el('dd', d.background));
    }
    add(kv, el('dt', 'ผู้จัดทำ'), el('dd', d.preparer.name ? d.preparer.name + (d.preparer.position ? ' (' + d.preparer.position + ')' : '') : '-'),
        el('dt', 'หัวหน้าหน่วยงานยืนยัน'), el('dd', signerText(d.head)));
    if (d.note) add(kv, el('dt', 'หมายเหตุ'), el('dd', d.note));
    c.appendChild(kv);
    add(c, el('h2', 'คณะกรรมการ'), committeeView(d.committees));
    if (doc.module === 'M5') c.appendChild(routeGuide(false));
    view.appendChild(c);
    if (data.can_attach) view.appendChild(add(el('div', null, 'card doc-part'), redFlag()));
    if (doc.status === 'DRAFT' || doc.status === 'RETURNED') {
      if (doc.module === 'M5') {
        var miss = [['spec', 'คุณลักษณะเฉพาะ'], ['quotation', 'ใบเสนอราคา']].filter(function (x) { return !d.attach_checks[x[0]]; }).map(function (x) { return x[1]; });
        view.appendChild(el('div', miss.length ? 'ชุดเอกสารยังไม่ครบ: ' + miss.join(', ') + ' — ส่งได้ แต่ควรแนบไฟล์ให้ครบด้านล่าง' : 'ชุดเอกสาร: แนบไฟล์ PP (บังคับ) คุณลักษณะเฉพาะ และใบเสนอราคาด้านล่าง ระบบเก็บไว้กับเอกสารนี้', 'card doc-part notice'));
      }
      if (data.can_attach && !data.attachments.length && doc.module === 'M5') view.appendChild(el('div', 'ขั้นต่อไป: แนบไฟล์ใบแจ้งความประสงค์ (PP) ที่พิมพ์จาก Nextgov ด้านล่าง แล้วกด "ส่ง"', 'card doc-part notice'));
    }
    if (md.is_officer || d.officer_opinion || d.funding_source || d.exec_decision) view.appendChild(officerCard(doc, md, refresh));
  }

  function officerCard(doc, md, refresh) {
    var d = md.data, c = el('div', null, 'card doc-part officer'); c.appendChild(el('h2', 'งานพัสดุ'));
    var editable = md.can_officer_edit;
    var opinionLocked = doc.module === 'M6' ? doc.status === 'COMPLETED' : ['WAIT_EXEC', 'APPROVED', 'REJECTED'].indexOf(doc.status) >= 0;
    var fund = null, op = el('textarea', null, '', { rows: '3', maxlength: '3000' }); op.value = d.officer_opinion || '';
    if (doc.module === 'M5') { fund = input('text', { maxlength: '300', list: 'dl56-fund' }); fund.value = d.funding_source || ''; }
    if (!editable || opinionLocked) {
      var kv = el('dl', null, 'kv');
      if (doc.module === 'M5') add(kv, el('dt', 'แหล่งเงิน'), el('dd', d.funding_source || '-'));
      add(kv, el('dt', 'ความเห็นพัสดุ'), el('dd', d.officer_opinion || '-'));
      if (d.exec_decision) add(kv, el('dt', 'ผลการพิจารณา'), el('dd', (d.exec_decision === 'APPROVE' ? 'อนุมัติ' : 'ไม่อนุมัติ') + ' · ' + (d.exec_name || '') + ' · ' + ymdThai(d.exec_date) + (d.exec_ref ? ' · ' + d.exec_ref : '')));
      c.appendChild(kv);
    } else {
      var fdl = el('datalist', null, '', { id: 'dl56-fund' }); ['เงินบำรุงโรงพยาบาล', 'เงินงบประมาณ', 'เงิน UC', 'เงินกองทุนอื่น'].forEach(function (v) { var o = document.createElement('option'); o.value = v; fdl.appendChild(o); });
      if (fund) add(c, fdl, fieldBox('แหล่งเงิน (ตามที่กลุ่มงานแผนกำหนด ถ้ามี)', fund, false));
      c.appendChild(fieldBox('ความเห็นหัวหน้ากลุ่มงานพัสดุ', op, true));
      var sv = el('button', 'บันทึก', 'secondary', { type: 'button' });
      sv.addEventListener('click', function () {
        guard(sv, function () {
          var p = { document_id: doc.id, version: d.version, officer_opinion: op.value.trim() }; if (fund) p.funding_source = fund.value.trim();
          return callApi(doc.module === 'M6' ? 'm6.officer.save' : 'm5.officer.save', p).then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกแล้ว'); return refresh(); });
        });
      });
      c.appendChild(add(el('div', null, 'actions'), sv));
    }
    if (editable) c.appendChild(supplyForm(doc, md, refresh));
    if (editable && doc.module === 'M5' && doc.status === 'WAIT_EXEC') c.appendChild(execForm(doc, refresh));
    var canStatus = editable && (doc.module === 'M6' ? ['IN_REVIEW', 'COMPLETED'].indexOf(doc.status) >= 0 : doc.status === 'APPROVED');
    if (canStatus) c.appendChild(lineStatusForm(doc, md, refresh));
    return c;
  }

  /* ชื่อในแบบพิมพ์ส่วนของพัสดุ: หัวหน้ากลุ่มงานพัสดุ (ค่าตั้งต้น) + ผู้รับมอบ (ชื่ออย่างเดียว) */
  function supplyForm(doc, md, refresh) {
    var s = md.data.supply || {}, f = el('div', null, 'sec'); f.appendChild(el('h3', 'ชื่อในแบบพิมพ์'));
    var hn = input('text', { maxlength: '200' }), hp = input('text', { maxlength: '200' }), as = input('text', { maxlength: '200', list: 'dl56-asg' });
    hn.value = s.name || SUPPLY_HEAD.name; hp.value = s.position === undefined ? SUPPLY_HEAD.position : (s.position || '');
    as.value = s.assignee_name || store('assignee') || '';
    var dl = el('datalist', null, '', { id: 'dl56-asg' }); (store('assignees') || []).forEach(function (v) { var o = document.createElement('option'); o.value = v; dl.appendChild(o); });
    add(f, dl, add(el('div', null, 'row'), fieldBox('หัวหน้ากลุ่มงานพัสดุ', hn), fieldBox('ตำแหน่ง', hp)),
        fieldBox('มอบให้ (ชื่อเจ้าหน้าที่จัดซื้อ)', as, false, 'ใส่ชื่ออย่างเดียว ไม่ต้องใส่ตำแหน่ง · เว้นว่างชื่อหัวหน้า = ใช้ค่าตั้งต้น'));
    var sv = el('button', 'บันทึกชื่อ', 'secondary', { type: 'button' });
    sv.addEventListener('click', function () {
      guard(sv, function () {
        var a = as.value.trim();
        if (a) { store('assignee', a); var l = (store('assignees') || []).filter(function (x) { return x !== a; }); l.unshift(a); store('assignees', l.slice(0, 8)); }
        return callApi(doc.module === 'M6' ? 'm6.officer.save' : 'm5.officer.save', { document_id: doc.id, version: md.data.version, supply_head_name: hn.value.trim(), supply_head_position: hp.value.trim(), assignee_name: a })
          .then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกแล้ว'); return refresh(); });
      });
    });
    f.appendChild(add(el('div', null, 'actions'), sv));
    return f;
  }

  function execForm(doc, refresh) {
    var f = el('div', null, 'sec'); f.appendChild(el('h3', 'บันทึกผลการอนุมัติ (ตามหนังสือที่ลงนามแล้ว)'));
    var dec = el('select'); [['APPROVE', 'อนุมัติ'], ['REJECT', 'ไม่อนุมัติ']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; dec.appendChild(o); });
    var nm = input('text', { maxlength: '200', list: 'dl56-exec' }); var dlx = el('datalist', null, '', { id: 'dl56-exec' });
    ['คณะกรรมการเวชภัณฑ์มิใช่ยา', 'ผู้อำนวยการโรงพยาบาลอุดรธานี', 'รองผู้อำนวยการด้านยุทธศาสตร์และแผนงานโครงการ'].forEach(function (v) { var o = document.createElement('option'); o.value = v; dlx.appendChild(o); });
    var dt = input('date'); dt.value = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    var ref = input('text', { maxlength: '200', placeholder: 'เช่น เลขที่หนังสือ' }), cm = el('textarea', null, '', { rows: '2', maxlength: '2000' });
    add(f, dlx, add(el('div', null, 'row'), fieldBox('ผล', dec, true), fieldBox('ผู้พิจารณา', nm, true), fieldBox('วันที่', dt, true)), fieldBox('อ้างอิง', ref), fieldBox('เหตุผล (บังคับเมื่อไม่อนุมัติ)', cm));
    f.appendChild(el('div', 'แนะนำให้สแกนหนังสือที่ลงนามแล้วเก็บไว้กับแฟ้มงานพัสดุ — ถ้าเลือก "เพิ่มเข้าคลัง" ระบบจะเพิ่มรายการรอออกรหัสให้เมื่ออนุมัติ', 'muted'));
    var go = el('button', 'บันทึกผลการพิจารณา', '', { type: 'button' });
    go.addEventListener('click', function () {
      if (!window.confirm('บันทึกผล "' + dec.options[dec.selectedIndex].text + '"? บันทึกแล้วแก้ไม่ได้')) return;
      guard(go, function () {
        return callApi('m5.exec.record', { document_id: doc.id, version: doc.version, decision: dec.value, exec_name: nm.value.trim(), exec_date: dt.value, exec_ref: ref.value.trim(), comment: cm.value.trim() })
          .then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกผลแล้ว' + (r.data.pending_added ? ' · เพิ่มรายการรอออกรหัส ' + r.data.pending_added + ' รายการ' : '')); return refresh(); });
      });
    });
    f.appendChild(add(el('div', null, 'actions'), go));
    return f;
  }

  function lineStatusForm(doc, md, refresh) {
    var f = el('div', null, 'sec'), sels = {}; f.appendChild(el('h3', 'สถานะการจัดซื้อรายรายการ'));
    md.data.lines.forEach(function (l) {
      var s = el('select'); Object.keys(LINE_STATUS).forEach(function (k) { var o = el('option', LINE_STATUS[k]); o.value = k; s.appendChild(o); }); s.value = l.purchase_status || 'PENDING';
      sels[l.line_no] = s; f.appendChild(fieldBox(l.line_no + '. ' + l.item_name, s));
    });
    var sv = el('button', 'บันทึกสถานะ', 'secondary', { type: 'button' });
    sv.addEventListener('click', function () {
      guard(sv, function () {
        var m = {}; Object.keys(sels).forEach(function (k) { m[k] = sels[k].value; });
        return callApi(doc.module === 'M6' ? 'm6.officer.save' : 'm5.officer.save', { document_id: doc.id, version: md.data.version, line_status: m })
          .then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกสถานะแล้ว'); return refresh(); });
      });
    });
    f.appendChild(add(el('div', null, 'actions'), sv));
    return f;
  }

  var detailHook = {
    head: function (acts, d, md) {
      if (md.can_edit) acts.appendChild(el('a', 'แก้ไข', 'btn secondary', { href: '#/' + (d.module === 'M6' ? 'plan' : 'oop') + '/' + encodeURIComponent(d.id) }));
      if (d.doc_no && d.status !== 'CANCELLED') acts.appendChild(el('a', 'พิมพ์ / PDF', 'btn secondary', { href: '#/purprint/' + encodeURIComponent(d.id) }));
    },
    skip: function (a, md) {
      if (a.action === 'EXEC_APPROVE' || a.action === 'EXEC_REJECT') return true;      // ใช้แบบบันทึกผลในกล่องงานพัสดุ
      return false;
    },
    body: bodyCards
  };
  X.detail.M5 = detailHook; X.detail.M6 = detailHook;

  /* ---------- พิมพ์ ---------- */
  function pagePrint(view, parts, alive) {
    var id = decodeURIComponent(parts[0] || ''), box = X.loading(view);
    callApi('documents.get', { id: id }).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { add(view, el('div', X.errText(r), 'card fail')); return; }
      var doc = r.data.document, md = r.data.module_data;
      var bar = el('div', null, 'card no-print actions');
      add(bar, el('a', '← กลับ', '', { href: '#/documents/' + encodeURIComponent(doc.id) }));
      if (!md || !md.data || !doc.doc_no || (doc.module !== 'M5' && doc.module !== 'M6')) { add(bar, el('span', 'พิมพ์ได้เฉพาะเอกสารที่ส่งแล้ว', 'muted')); view.appendChild(bar); return; }
      var pr = el('button', 'พิมพ์ / บันทึกเป็น PDF', '', { type: 'button' }); pr.addEventListener('click', function () { window.print(); });
      var paper = el('div', null, 'pages56');
      paper.appendChild(doc.module === 'M6' ? paperM6(doc, md) : paperM5(doc, md));
      var sheet = committeeSheet(doc, md); if (sheet) paper.appendChild(sheet);
      var ed = el('button', 'แก้ไขข้อความ', 'secondary', { type: 'button', 'aria-pressed': 'false' });
      ed.addEventListener('click', function () {
        var on = paper.getAttribute('contenteditable') !== 'true';
        paper.setAttribute('contenteditable', on ? 'true' : 'false'); paper.classList.toggle('editing56', on);
        ed.textContent = on ? 'เสร็จสิ้นการแก้ไข' : 'แก้ไขข้อความ'; ed.setAttribute('aria-pressed', String(on));
      });
      var reset = el('button', 'คืนค่าเดิม', 'secondary', { type: 'button' }); reset.addEventListener('click', function () { location.reload(); });
      add(bar, pr, ed, reset, el('div', 'เอกสารนี้ต้องพิมพ์แนบต้นเรื่องการจัดซื้อ · แก้ข้อความหรือกด × ลบช่องลงนามที่ไม่ใช้ได้ก่อนพิมพ์ (ไม่บันทึกในระบบ)', 'muted'));
      view.appendChild(bar);
      view.appendChild(paper);
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { fitLines(paper); });
      [].forEach.call(paper.querySelectorAll('.sig, .msig'), function (b) { if (b.parentNode && b.parentNode.closest('.msig')) return;   // ช่องลงนามซ้อนในกล่องพัสดุ ใช้ × ของกล่องเดียว
        var x = el('button', '×', 'del56 no-print', { type: 'button', title: 'ลบช่องลงนามนี้', 'aria-label': 'ลบช่องลงนามนี้', contenteditable: 'false' });
        x.addEventListener('click', function () { var g = b.parentNode; b.remove(); if (g && !g.querySelector('.sig, .msig')) g.remove(); });
        b.appendChild(x);
      });
    });
  }

  /* ฟอนต์ราชการ: ใช้ TH Sarabun New/PSK ถ้ามีในเครื่อง (16pt) ไม่มีใช้ Sarabun ขนาดเทียบเท่า */
  /* ฟอนต์ราชการ TH Sarabun New (SIPA) เก็บใน web/vendor/fonts — ไม่ต้องติดตั้งในเครื่อง พิมพ์ 16pt ทุกเครื่อง */
  function hasThSarabun() { return true; }
  /* ไม่ให้ข้อความสั้นที่ควรอยู่บรรทัดเดียว (หัวเรื่อง ตำแหน่งผู้ลงนาม ข้อย่อย รายชื่อกรรมการ) ฉีกข้ามบรรทัด: ย่อขนาดทีละ 0.5pt จนพอดี (ไม่ต่ำกว่า 12pt) */
  var FIT_SEL = '.m-line, .m-sub2, .msig > div:not(.msig-space):not(.m-op), .sh-row';
  function overflowing(n) { if (n.scrollWidth > n.clientWidth + 1) return true; return [].some.call(n.children, function (c) { return c.scrollWidth > c.clientWidth + 1; }); }
  function fitLines(root) {
    [].forEach.call(root.querySelectorAll(FIT_SEL), function (n) {
      n.style.whiteSpace = 'nowrap'; [].forEach.call(n.children, function (c) { c.style.whiteSpace = 'nowrap'; });
      var pt = parseFloat(getComputedStyle(n).fontSize) * 0.75, guard = 0, min = n.closest('.m-keep16, .sheet56') ? 16 : 11;   // ช่องลงนามคงไว้ ๑๖ พอยต์
      while (overflowing(n) && pt > min && guard++ < 24) { pt -= 0.5; n.style.fontSize = pt + 'pt'; }
      if (overflowing(n)) { n.style.whiteSpace = ''; [].forEach.call(n.children, function (c) { c.style.whiteSpace = ''; }); }   // ยาวเกินจริง ให้ตัดบรรทัดตามคำ
    });
  }
  function paperEl(label) { return el('article', null, 'paper paper56' + (hasThSarabun() ? ' th16' : ''), { 'aria-label': label }); }
  function editable(node) { node.setAttribute('contenteditable', 'true'); node.className += ' ed56'; node.title = 'คลิกเพื่อแก้ไขก่อนพิมพ์ (ไม่บันทึกในระบบ)'; return node; }

  /* ช่องลงนาม: วันที่ขึ้นจุดเดียว = วันที่กดในระบบ (opt.date) · opt.noDate = ไม่มีบรรทัดวันที่ · opt.edit = แก้ชื่อในกระดาษได้ */
  function sig(s, role, opt) {
    opt = opt || {};
    var w = el('div', null, 'sig');
    var nm = el('div', null, 'sig-n'); add(nm, document.createTextNode('( '), opt.edit ? editable(el('span', s && s.name ? s.name : '.'.repeat(30))) : el('span', s && s.name ? s.name : '.'.repeat(30)), document.createTextNode(' )'));
    var ps = el('div', null, 'sig-p'); var pv = el('span', s && s.position ? s.position : '.'.repeat(30)); add(ps, document.createTextNode('ตำแหน่ง '), opt.edit ? editable(pv) : pv);
    add(w, el('div', 'ลงชื่อ ' + '.'.repeat(34)), nm, ps, el('div', role, 'role'));
    if (!opt.noDate) w.appendChild(el('div', 'วันที่ ' + (opt.date ? thaiDay(opt.date) : '.'.repeat(24)), 'sig-d'));
    return w;
  }
  function sigRow() { var r = el('div', null, 'sigs sigs56'); [].slice.call(arguments).forEach(function (x) { r.appendChild(x || el('div', null, 'sig')); }); return r; }

  /* ส่วนของกลุ่มงานพัสดุ: ความเห็น · ทราบ/มอบ (ชื่ออย่างเดียว) · ลงนามหัวหน้ากลุ่มงานพัสดุ (วันที่ = วันที่กดรับ) */
  function supplyPrint(d, extra) {
    var sp = d.supply || { name: SUPPLY_HEAD.name, position: SUPPLY_HEAD.position }, w = el('div', null, 'p-supply');
    add(w, el('p', 'ความเห็นหัวหน้ากลุ่มงานพัสดุ', 'p-h'));
    (extra || []).forEach(function (x) { w.appendChild(x); });
    w.appendChild(el('p', d.officer_opinion || '.'.repeat(110), 'p-lead'));
    var asg = el('p', null, 'p-lead'); add(asg, document.createTextNode('ทราบ / มอบ '), editable(el('span', sp.assignee_name || '.'.repeat(40))), document.createTextNode(' ดำเนินการ'));
    w.appendChild(asg);
    w.appendChild(sigRow(null, sig(sp, 'หัวหน้ากลุ่มงานพัสดุ', { noDate: true, edit: true })));
    return w;
  }
  function pTable(heads, rows, sumRow) {
    var t = el('table', null, 'ptable'), hr = el('tr'); heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
    var tb = el('tbody'); rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (v, i) { tr.appendChild(el('td', v, i >= heads.length - 4 && i > 1 ? 'num' : '')); }); tb.appendChild(tr); });
    if (sumRow) { var tr = el('tr'); var td = el('td', sumRow[0]); td.colSpan = heads.length - 1; add(tr, td, el('td', sumRow[1], 'num')); tr.style.fontWeight = '700'; tb.appendChild(tr); }
    add(t, tb); return t;
  }
  function commPrint(c) {
    var w = el('div', null, 'p-notes');
    Object.keys(SETS).forEach(function (k) {
      var list = (c[k] || []).filter(function (m) { return m && String(m.name || '').trim(); });
      if (!list.length) return;
      w.appendChild(el('p', SETS[k], 'p-h'));
      list.forEach(function (m, i) { w.appendChild(el('p', (list.length > 1 ? (i + 1) + '. ' : '') + m.name + (m.position ? ' ตำแหน่ง ' + m.position : '') + (list.length > 1 ? (i === 0 ? '  ประธานกรรมการ' : '  กรรมการ') : ''), 'p-lead')); });
    });
    return w;
  }
  function checksPrint(d) {
    var w = el('div', null, 'p-notes'); w.appendChild(el('p', 'เอกสารประกอบ', 'p-h'));
    CHECKS.forEach(function (x, i) {
      if (x[3] === 'other' && (!CHECKS[i - 1] || CHECKS[i - 1][3] !== 'other')) w.appendChild(el('p', 'อื่นๆ', 'p-lead'));
      w.appendChild(el('p', (d.attach_checks[x[0]] ? '☑ ' : '☐ ') + x[1].split(' — ')[0] + (x[0] === 'quotation' && d.quotation_count ? ' จำนวน ' + th(d.quotation_count) + ' บริษัท' : ''), x[3] === 'other' ? 'p-in2' : 'p-in1'));
      if (x[0] === 'quotation') w.appendChild(el('p', (hasCommittee(d.committees) ? '☑ ' : '☐ ') + 'เอกสารยืนยันรายชื่อคณะกรรมการ (เอกสาร ๑)', 'p-in1'));
    });
    return w;
  }

  function paperM6(doc, md) {
    var d = md.data, p = paperEl('แบบยืนยันสำหรับพิมพ์');
    p.className += ' memo56';
    add(p, el('h1', md.form_title, 'p-title'), el('p', 'ประจำปีงบประมาณ พ.ศ. ' + th(d.fiscal_year), 'p-center'));
    var l2 = el('p', null, 'm-line m-2col');
    add(l2, add(el('span', null, 'm-half'), el('b', 'ที่'), el('span', ' ' + th(d.unit_doc_no || ''), 'm-fill')), add(el('span', null, 'm-half'), el('b', 'วันที่'), el('span', ' ' + th(thaiDay(doc.submitted_at)), 'm-fill')));
    p.appendChild(l2);
    add(p, el('p', 'เรียน หัวหน้ากลุ่มงานพัสดุ', 'm-to'));
    add(p, el('p', th('ข้าพเจ้า หน่วยงาน ' + shortDept(d.department_name) + ' โทร ' + (d.phone || '') + ' ขอยืนยันความต้องการใช้วัสดุการแพทย์ตามแผนจัดซื้อ และจะเบิกใช้ตามจำนวนที่ยืนยัน ดังรายการต่อไปนี้'), 'm-para'));
    p.appendChild(pTable(['ที่', 'รหัส', 'รายการ', 'หน่วยนับ', 'คงคลัง', 'ใช้/เดือน', 'จำนวน', 'ราคา/หน่วย', 'จำนวนเงิน (บาท)'],
      d.lines.map(function (l) { return [th(l.line_no), l.item_code || '-', l.item_name, l.unit || '', th(qtyText(l.stock_on_hand)), th(qtyText(l.use_per_month)), th(qtyText(l.qty)), th(money(l.unit_price)), th(money(l.amount))]; }),
      ['รวมเป็นเงิน (' + d.total_text + ')', th(money(d.total_amount))]));
    if (hasCommittee(d.committees)) p.appendChild(el('p', 'รายชื่อคณะกรรมการตามเอกสาร ๑ ที่แนบ', 'p-lead'));
    // เอกสารประกอบ (คุณลักษณะเฉพาะ ใบเสนอราคา ฯลฯ) ไม่พิมพ์ แต่ยังต้องแนบในระบบครบชุดเหมือนเดิม
    if (d.note) p.appendChild(el('p', 'หมายเหตุ: ' + d.note));
    // แบบยืนยันใช้กำกับภายใน (ไม่ใช่บันทึกข้อความ): ผู้จัดทำซ้าย · หัวหน้าหน่วยงานขวา แถวเดียวกัน
    p.appendChild(sigGrid([msig(d.preparer, ['ผู้จัดทำ']), msig(d.head, ['หัวหน้า' + shortDept(d.department_name)])], 2, 'm-pair16 m-keep16'));
    // ส่วนพัสดุ: ความเห็น · ทราบ/มอบ (เว้นจุดให้เขียนชื่อผู้รับมอบ) · เว้นที่ลงนาม · ชื่อหัวหน้ากลุ่มงานพัสดุ
    var sp = d.supply || { name: SUPPLY_HEAD.name, position: SUPPLY_HEAD.position };
    var box = el('div', null, 'msig m-supbox');
    box.appendChild(el('div', 'ความเห็นหัวหน้ากลุ่มงานพัสดุ', 'm-etitle'));
    box.appendChild(d.officer_opinion ? el('div', d.officer_opinion, 'm-note m-op') : el('div', '', 'm-dotline'));
    var asg = el('div', null, 'm-asg'); add(asg, document.createTextNode('ทราบ / มอบ '), editable(el('span', sp.assignee_name || '', 'm-asg-fill')), document.createTextNode(' ดำเนินการ'));
    box.appendChild(asg);
    var who = msig(sp, ['หัวหน้ากลุ่มงานพัสดุ'], { edit: true }); who.className += ' m-supsig';
    box.appendChild(who);
    p.appendChild(add(el('div', null, 'mgrid m-keep16'), box));
    p.appendChild(footerDates(doc, d, false));
    return p;
  }

  /* บันทึกข้อความตามแบบหนังสือราชการ (ต้นแบบ: บันทึกขอซื้อน้ำยาทำลายเชื้อ กลุ่มงานการพยาบาลผู้ป่วยห้องผ่าตัด) */
  var TH_DIG = '๐๑๒๓๔๕๖๗๘๙';
  function th(v) { return String(v === null || v === undefined ? '' : v).replace(/[0-9]/g, function (c) { return TH_DIG[c]; }); }
  function memoLine(label, value, cls) { var p = el('p', null, 'm-line ' + (cls || '')); add(p, el('b', label), el('span', value, 'm-fill')); return p; }
  function para(head, text) { var p = el('p', null, 'm-para'); if (head) add(p, el('b', head), document.createTextNode('  ')); p.appendChild(document.createTextNode(text || '')); return p; }
  function shortDept(n) { return String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
  /* ช่องลงนามตามแบบหนังสือราชการ: เว้นที่ลงลายมือชื่อ → (ชื่อเต็ม) → ตำแหน่ง ไม่มีวันที่ใต้ชื่อ (วันที่ไปอยู่ท้ายกระดาษ) */
  function msig(s, roleLines, opt) {
    opt = opt || {};
    var w = el('div', null, 'msig');
    if (opt.title) w.appendChild(el('div', opt.title, 'm-etitle'));
    (opt.above || []).forEach(function (x) { w.appendChild(x); });
    var nm = el('span', s && s.name ? s.name : '.'.repeat(32));
    add(w, el('div', '', 'msig-space'), add(el('div'), document.createTextNode('('), opt.edit ? editable(nm) : nm, document.createTextNode(')')));
    (s && s.position ? [s.position] : []).concat((roleLines || []).filter(function (r) { return !(s && s.position === r); })).forEach(function (t) { w.appendChild(el('div', t)); });
    return w;
  }
  function dots(n) { return el('div', '.'.repeat(n || 60), 'm-note'); }

  /* ท้ายกระดาษ: หน่วยงานเต็ม · วันที่ยื่นทุกครั้ง/ตีกลับ · วันที่อนุมัติ (คณะกรรมการเวชภัณฑ์มิใช่ยา) หรือพัสดุรับ */
  /* ท้ายกระดาษ = หมายเหตุแยกบรรทัดด้วยดอกจัน · เลขที่ระบบมุมขวาล่าง */
  function footerDates(doc, d, memo) {
    var f = el('div', null, 'p-foot'), fmt = function (iso) { return th(thaiDay(iso)); };
    var sub = (d.history || []).filter(function (h) { return h.action !== 'RECEIVE'; })
      .map(function (h, i) { return (h.action === 'RETURN' ? 'ส่งกลับแก้ไข ' : i === 0 ? 'ยื่น ' : 'ยื่นใหม่ ') + fmt(h.at); });
    var rec = (d.history || []).filter(function (h) { return h.action === 'RECEIVE'; }).pop();
    f.appendChild(el('div', 'หมายเหตุ', 'f-h'));
    add(f, el('div', '*  หน่วยงานที่ขอ: ' + (d.department_name || '-')),
        el('div', 'ผู้จัดทำ: ' + ((d.preparer && d.preparer.name) || '-') + '   โทร ' + th(d.phone || '-'), 'f-in'),
        el('div', 'วันที่ยื่น: ' + (sub.join(' · ') || '-'), 'f-in'),
        el('div', '** กลุ่มงานพัสดุ หมวดวัสดุการแพทย์ ลงรับ วันที่ ' + (rec ? fmt(rec.at) : '.'.repeat(30))));
    if (memo) f.appendChild(el('div', '*** ความเห็นของคณะกรรมการเวชภัณฑ์มิใช่ยา ลงวันที่ ' + (d.exec_date ? th(ymdThai(d.exec_date)) : '.'.repeat(30))));
    f.appendChild(el('div', '**** เลขที่เอกสารในระบบ ' + th(doc.doc_no) + '   พิมพ์ ' + th(X.fmtDate(new Date().toISOString()))));
    return f;
  }

  function paperM5(doc, md) {
    var d = md.data, p = paperEl('บันทึกข้อความสำหรับพิมพ์'); p.className += ' memo56';
    var head = el('div', null, 'm-head');
    var crest = el('img', null, 'm-crest', { src: 'garuda.png', alt: '' }); crest.onerror = function () { crest.style.visibility = 'hidden'; };
    add(head, crest, el('div', 'บันทึกข้อความ', 'm-title'));
    p.appendChild(head);
    var unit = shortDept(d.department_name);
    var subject = 'ขออนุมัติจัดซื้อวัสดุการแพทย์นอกแผน' + (d.add_to_stock ? ' และเพิ่มในรายการเข้าคลังวัสดุการแพทย์' : '');
    p.appendChild(memoLine('ส่วนราชการ', ' ' + unit + ' โรงพยาบาลอุดรธานี โทร ' + th(d.phone || '')));
    var l2 = el('p', null, 'm-line m-2col');
    add(l2, add(el('span', null, 'm-half'), el('b', 'ที่'), el('span', ' ' + th(d.unit_doc_no || ''), 'm-fill')), add(el('span', null, 'm-half'), el('b', 'วันที่'), el('span', ' ' + th(thaiDay(doc.submitted_at)), 'm-fill')));
    p.appendChild(l2);
    p.appendChild(memoLine('เรื่อง', ' ' + subject, 'm-subj'));
    p.appendChild(el('p', 'เรียน ผู้อำนวยการโรงพยาบาลอุดรธานี ผ่าน รองผู้อำนวยการด้านยุทธศาสตร์และแผนงานโครงการ', 'm-to'));

    p.appendChild(para('ความเป็นมา', th(d.background || ('ด้วย ' + unit + ' มีความจำเป็นต้องใช้วัสดุการแพทย์ที่ไม่อยู่ในแผนจัดซื้อประจำปีงบประมาณ พ.ศ. ' + d.fiscal_year))));
    var reim = 'การเบิกคืน ' + (REIMBURSE[d.reimburse] || '-') + ((d.schemes || []).length ? ' สิทธิ์ ' + d.schemes.map(function (k) { return k === 'OTHER' && d.scheme_other ? d.scheme_other : SCHEMES[k]; }).join(', ') : '');
    p.appendChild(para('ข้อเท็จจริง', th(d.reason_text || '')));
    (d.reason_codes || []).forEach(function (r, i) { p.appendChild(el('p', th((i + 1) + ') ' + r), 'm-sub2')); });
    p.appendChild(el('p', th(reim), 'm-sub2'));
    p.appendChild(el('p', th('ค่าใช้จ่ายต่อเดือนโดยประมาณ ' + money(d.monthly_cost) + ' บาท'), 'm-sub2'));
    p.appendChild(para('ข้อพิจารณา', 'เพื่อให้มีวัสดุการแพทย์ใช้ในการให้บริการผู้ป่วยอย่างเพียงพอและต่อเนื่อง ' + unit + ' จึงขออนุมัติจัดซื้อ' + (d.add_to_stock ? ' และเพิ่มในรายการเข้าคลังวัสดุการแพทย์' : '') + ' รายละเอียดดังนี้'));
    d.lines.forEach(function (l, i) {
      p.appendChild(el('p', th((i + 1) + '. ' + (l.item_code ? l.item_code + ' ' : '') + l.item_name + (l.spec ? ' (' + l.spec + ')' : '') + ' จำนวน ' + qtyText(l.qty) + ' ' + (l.unit || '') +
        ' ราคา' + (l.unit || 'หน่วย') + 'ละ ' + money(l.unit_price) + ' บาท' + (l.price_text ? ' (' + l.price_text + ')' : '') + ' (ราคารวมภาษี) รวมเป็นเงิน ' + money(l.amount) + ' บาท' + (l.amount_text ? ' (' + l.amount_text + ')' : '')), 'm-item'));
    });
    p.appendChild(el('p', th('รวมเป็นเงินทั้งสิ้น ' + money(d.total_amount) + ' บาท (' + d.total_text + ')'), 'm-item'));
    // เอกสารแนบไม่พิมพ์ในบันทึก — ระบบเก็บไฟล์เป็นชุดเอกสาร (ผู้ใช้สั่ง 26 พ.ย. 2569)
    p.appendChild(para('ข้อเสนอ', 'จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติ จักเป็นพระคุณยิ่ง'));

    // เจ้าของหนังสือ: หัวหน้ากลุ่มงาน — ลงนามครึ่งขวาของหน้า
    p.appendChild(sigGrid([el('div'), msig(d.head, ['หัวหน้า' + unit])], 2, 'm-author'));

    // ความเห็นตามลำดับการเสนอ: พัสดุ → คณะกรรมการเวชภัณฑ์มิใช่ยา → รองผอ. → ผอ.
    var sp = d.supply || { name: SUPPLY_HEAD.name, position: SUPPLY_HEAD.position };
    var asg = el('div', null, 'm-note'); add(asg, document.createTextNode('มอบ '), editable(el('span', sp.assignee_name || '.'.repeat(30))), document.createTextNode(' ดำเนินการ'));
    var b1 = msig(sp, ['หัวหน้ากลุ่มงานพัสดุ'], { edit: true, title: 'ความเห็นกลุ่มงานพัสดุ',
      above: (d.officer_opinion ? [el('div', d.officer_opinion, 'm-note m-op')] : []).concat([asg]) });
    var b2 = msig(null, ['คณะกรรมการเวชภัณฑ์มิใช่ยา'], { title: 'ความเห็นคณะกรรมการเวชภัณฑ์มิใช่ยา',
      above: [el('div', '☐ เห็นควรอนุมัติ   ☐ ไม่เห็นควรอนุมัติ', 'm-note')] });
    // แหล่งเงิน: กลุ่มงานยุทธศาสตร์และแผนงานโครงการเป็นผู้กำหนด
    var b3 = msig(null, ['รองผู้อำนวยการด้านยุทธศาสตร์และแผนงานโครงการ'], { title: 'ความเห็นรองผู้อำนวยการ',
      above: [el('div', 'แหล่งเงิน ' + (d.funding_source || '.'.repeat(30)), 'm-note')] });
    var b4 = msig(DIRECTOR, [], { edit: true, title: 'คำสั่งผู้อำนวยการ', above: [el('div', '☐ อนุมัติ   ☐ ไม่อนุมัติ', 'm-note')] });
    p.appendChild(sigGrid([b1, b2, b3, b4], 2, 'm-endorse'));
    p.appendChild(footerDates(doc, d, true));
    return p;
  }
  function sigGrid(blocks, cols, extra) { var g = el('div', null, 'mgrid mgrid' + cols + (extra ? ' ' + extra : '')); blocks.forEach(function (b) { g.appendChild(b); }); return g; }

  /* เอกสาร ๑ รายชื่อคณะกรรมการ — แยกหน้าตามแบบกลุ่มงานพัสดุ (ปรับปรุงครั้งที่ ๒ : ๒๘ ต.ค. ๒๕๖๕) เพื่อไม่กินพื้นที่ลงนามผู้มีอำนาจ */
  function cleanList(c, k) { return ((c || {})[k] || []).filter(function (m) { return m && String(m.name || '').trim(); }); }
  function hasCommittee(c) { return Object.keys(SETS).some(function (k) { return cleanList(c, k).length; }); }
  var SHEET_SETS = [['tor', 'คณะกรรมการกำหนดคุณลักษณะเฉพาะและราคากลาง'], ['inspect', 'คณะกรรมการตรวจรับพัสดุ'], ['eval', 'คณะกรรมการพิจารณาผลฯ']];
  function committeeSheet(doc, md) {
    var d = md.data; if (!d || !hasCommittee(d.committees)) return null;
    var p = paperEl('เอกสาร ๑ รายชื่อคณะกรรมการ'); p.className += ' memo56 sheet56';
    add(p, el('p', 'เอกสาร ๑', 'sh-no'),
        el('p', 'ตามที่หน่วยงานได้รับการแจ้งให้ส่งรายชื่อคณะกรรมการตรวจรับการจัดซื้อ/การจ้างนั้น หน่วยงาน ' + shortDept(d.department_name) + ' ขอแจ้งรายชื่อคณะกรรมการ ดังนี้', 'm-para'));
    SHEET_SETS.forEach(function (x) {
      var list = cleanList(d.committees, x[0]); if (!list.length) return;
      p.appendChild(el('p', x[1], 'sh-set'));
      list.forEach(function (m, i) {
        // ๑๖ พอยต์ทั้งแผ่น: บรรทัดแรก ลำดับ ชื่อ หน้าที่ · บรรทัดถัดไป ตำแหน่ง (ไม่ย่อ ไม่ล้นขอบ)
        var r = el('div', null, 'sh-row');
        add(r, el('span', th(i + 1) + '.', 'sh-i'), el('span', m.name, 'sh-n'), el('span', list.length > 1 ? (i === 0 ? 'ประธานกรรมการ' : 'กรรมการ') : '', 'sh-r'),
            el('span', '', 'sh-i'), add(el('span', null, 'sh-p'), document.createTextNode('ตำแหน่ง ' + (m.position || ''))), el('span', ''));
        p.appendChild(r);
      });
    });
    p.appendChild(el('p', 'จึงเรียนมาเพื่อโปรดดำเนินการ', 'm-para'));
    p.appendChild(sigGrid([el('div'), msig(d.head, ['หัวหน้า' + shortDept(d.department_name)])], 2, 'm-author m-keep16'));
    p.appendChild(add(el('div', null, 'p-foot'), el('div', 'หมายเหตุ', 'f-h'), el('div', '*  หน่วยงานที่ขอ: ' + (d.department_name || '-')), el('div', '**** ประกอบเอกสารเลขที่ในระบบ ' + th(doc.doc_no))));
    return p;
  }

  /* ---------- รายงานแผน + ส่งออก + นำเข้าแผน ---------- */
  function pagePlanReport(view, parts, alive) {
    X.pageTitle(view, 'แผนจัดซื้อและการยืนยัน', 'ยอดในแผนเทียบยอดที่หน่วยงานยืนยัน · ทุกตารางส่งออก Excel ได้');
    var exp = el('div', null, 'card actions');
    add(exp, exportBtn('Excel: รายการยืนยันแผนทั้งหมด', function () { return exportLines('M6'); }), exportBtn('Excel: รายการขอซื้อนอกแผนทั้งหมด', function () { return exportLines('M5'); }));
    view.appendChild(exp);
    var canReport = X.hasRole('OFFICER') || X.hasRole('APPROVER') || X.hasRole('ADMIN');
    if (canReport) {
      var box = X.loading(view);
      callApi('purchase.plan.report', {}).then(function (r) {
        if (!alive()) return; box.remove();
        if (!r.ok) { add(view, el('div', X.errText(r), 'card fail')); return; }
        renderReport(view, r.data);
      });
    }
    if (X.hasRole('ADMIN') || X.hasRole('OFFICER')) view.appendChild(importCard());
  }

  function exportLines(module) {
    return callApi('purchase.lines.export', { module: module }).then(function (r) {
      if (!r.ok) { reportFail(r); return; }
      var m5 = module === 'M5';
      var head = ['เลขที่', 'สถานะ', 'วันที่ส่ง', 'หน่วยงาน', 'ผู้จัดทำ', 'ลำดับ', 'รหัส', 'รายการ', 'หน่วยนับ', 'จำนวน', 'ราคา/หน่วย', 'จำนวนเงิน', 'คงคลัง', 'ใช้/เดือน', 'พอใช้ (เดือน)', 'สถานะจัดซื้อ'].concat(m5 ? ['เหตุผลความจำเป็น'] : []);
      var rows = [head].concat(r.data.rows.map(function (x) {
        return [x.doc_no, X.statusLabel(x.status), x.submitted_at ? thaiDay(x.submitted_at) : '', x.department_name || '', x.requester, x.line_no, x.code, x.name, x.unit, x.qty, x.unit_price, x.amount,
                x.stock_on_hand, x.use_per_month, x.months_cover, LINE_STATUS[x.purchase_status] || ''].concat(m5 ? [x.reason_text || ''] : []);
      }));
      rows.push(['รวม', '', '', '', '', '', '', '', '', '', '', r.data.total]);
      var sheets = [{ name: m5 ? 'นอกแผน' : 'ยืนยันแผน', rows: rows }];
      if (m5) {   // สรุปรายหน่วยงาน ใช้อ้างอิงขอเพิ่มวงเงินกลางปี (รายการใหม่ไม่มีวงเงินในแผน)
        var by = {}, order = [], docsSeen = {};
        r.data.rows.forEach(function (x) {
          var k = x.department_name || '-'; if (!by[k]) { by[k] = { docs: 0, approved: 0, pending: 0, rejected: 0 }; order.push(k); }
          if (!docsSeen[x.doc_no]) { docsSeen[x.doc_no] = 1; by[k].docs++; }
          var col = x.status === 'APPROVED' ? 'approved' : (x.status === 'REJECTED' || x.status === 'CANCELLED') ? 'rejected' : 'pending';
          by[k][col] = r2(by[k][col] + x.amount);
        });
        var sum = [['หน่วยงาน', 'จำนวนเอกสาร', 'อนุมัติแล้ว (บาท)', 'รอพิจารณา (บาท)', 'ไม่อนุมัติ/ยกเลิก (บาท)', 'ขอเพิ่มวงเงินได้ (อนุมัติ + รอ)']];
        var t = { docs: 0, approved: 0, pending: 0, rejected: 0 };
        order.forEach(function (k) { var v = by[k]; sum.push([k, v.docs, v.approved, v.pending, v.rejected, r2(v.approved + v.pending)]); ['docs', 'approved', 'pending', 'rejected'].forEach(function (f) { t[f] = r2(t[f] + v[f]); }); });
        sum.push(['รวม', t.docs, t.approved, t.pending, t.rejected, r2(t.approved + t.pending)]);
        sheets.push({ name: 'สรุปขอเพิ่มวงเงิน', rows: sum });
      }
      return exportXlsx((module === 'M6' ? 'ยืนยันแผน' : 'ขอซื้อนอกแผน') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx', sheets);
    });
  }

  function renderReport(view, data) {
    var s = data.summary, c = el('div', null, 'card');
    var grid = el('div', null, 'grid');
    function stat(label, v) { var b = el('div', null, 'stat'); add(b, el('b', v), el('span', label, 'muted')); return b; }
    add(grid, stat('มูลค่าแผนปี ' + data.fiscal_year + ' (บาท)', money(s.plan_value)), stat('ยืนยันแล้ว (บาท)', money(s.confirmed_value)),
        stat('ร้อยละที่ยืนยัน', s.plan_value ? (s.confirmed_value / s.plan_value * 100).toFixed(1) + '%' : '-'), stat('รายการที่มีผู้ยืนยัน', s.items_confirmed + ' / ' + s.items));
    c.appendChild(grid);
    var q = input('search', { placeholder: 'ค้นหารหัส/ชื่อ', 'aria-label': 'ค้นหา' }), only = check('เฉพาะรายการที่มีผู้ยืนยัน');
    var xbtn = exportBtn('Excel: แผนเทียบยอดยืนยัน', function () {
      var head = ['รหัส', 'รายการ', 'หน่วยนับ', 'ราคา/หน่วย', 'จำนวนในแผน', 'มูลค่าแผน', 'ยืนยันแล้ว', 'มูลค่ายืนยัน', 'คงเหลือ', 'ไตรมาส 1', 'ไตรมาส 2', 'ไตรมาส 3', 'ไตรมาส 4'];
      var a = [head].concat(data.rows.map(function (r) { var qs = r.quarters || []; return [r.code || '(ไม่มีรหัส)', r.name, r.unit, r.price, r.plan_qty, r.plan_value, r.confirmed, r.confirmed_value, r.remaining, qs[0], qs[1], qs[2], qs[3]]; }));
      a.push(['รวม', '', '', '', '', s.plan_value, '', s.confirmed_value]);
      var b = [['รหัส', 'รายการ', 'หน่วยงาน', 'เลขที่', 'สถานะ', 'จำนวน', 'จำนวนเงิน', 'สถานะจัดซื้อ']];
      data.rows.forEach(function (r) { r.by_unit.forEach(function (u) { b.push([r.code || '(ไม่มีรหัส)', r.name, u.department_name, u.doc_no, X.statusLabel(u.status), u.qty, u.amount, LINE_STATUS[u.purchase_status] || '']); }); });
      return exportXlsx('แผนเทียบยอดยืนยัน-' + data.fiscal_year + '.xlsx', [{ name: 'สรุปรายการ', rows: a }, { name: 'รายหน่วยงาน', rows: b }]);
    });
    add(c, add(el('div', null, 'row'), q, only), add(el('div', null, 'actions'), xbtn));
    var out = el('div', null, 'scroll'); c.appendChild(out);
    function draw() {
      clear(out); var k = q.value.trim().toLowerCase();
      var rows = data.rows.filter(function (r) { return (!only.box.checked || r.confirmed > 0) && (!k || (r.code || '').toLowerCase().indexOf(k) >= 0 || r.name.toLowerCase().indexOf(k) >= 0); });
      var t = el('table', null, 'stack'), hr = el('tr'), heads = ['รหัส', 'รายการ', 'ในแผน', 'ยืนยันแล้ว', 'คงเหลือ', 'มูลค่ายืนยัน', 'หน่วยงาน'];
      heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      rows.slice(0, 300).forEach(function (r) {
        var tr = el('tr');
        add(tr, el('td', r.code || '(ไม่มีรหัส)'), el('td', r.name + ' · ' + r.unit), el('td', qtyText(r.plan_qty), 'num'), el('td', qtyText(r.confirmed), 'num'),
            el('td', qtyText(r.remaining), 'num' + (r.remaining < 0 ? ' warn56' : '')), el('td', money(r.confirmed_value), 'num'),
            el('td', r.by_unit.map(function (u) { return u.department_name + ' ' + qtyText(u.qty); }).join(' · ') || '-'));
        [].forEach.call(tr.children, function (td, i) { td.setAttribute('data-label', heads[i]); });
        tb.appendChild(tr);
      });
      add(t, tb); out.appendChild(t);
      if (rows.length > 300) out.appendChild(el('p', 'แสดง 300 จาก ' + rows.length + ' รายการ — ค้นหาเพื่อกรอง หรือส่งออก Excel เพื่อดูทั้งหมด', 'muted'));
    }
    q.addEventListener('input', draw); only.box.addEventListener('change', draw); draw();
    view.appendChild(c);
  }

  /** อ่านไฟล์แผน (รูปแบบ "แผน ปี 70 ชื่อเดิมและรหัส Nextgov.xlsx": หัวตาราง 2 แถว ข้อมูลเริ่มเมื่อคอลัมน์ A เป็นตัวเลข) */
  function parsePlan(XLSX, buf) {
    var wb = XLSX.read(buf, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    var fy = null, total = null, rows = [], hdrOk = false;
    aoa.forEach(function (r, i) {
      var a = r[0];
      if (typeof a === 'string') { var m = /พ\.ศ\.\s*(\d{4})/.exec(a); if (m && !fy) fy = Number(m[1]); }
      if (r[1] === 'รหัส') hdrOk = true;
      if (r[3] === 'รวมมูลค่า') total = Number(r[11]);
      if (typeof a !== 'number') return;
      var code = String(r[1] || '').trim(), isCode = /^\d-\d{2}-\d{3}-\d{3}$/.test(code);
      var old = String(r[2] || '').trim(); if (/ยังไม่มีรหัส|ไม่พบ/.test(old)) old = '';
      function n(v) { return typeof v === 'number' ? v : (v === null || v === '' ? null : Number(String(v).replace(/,/g, ''))); }
      rows.push({ row: i + 1, code: isCode ? code : '', note: isCode ? '' : code, old_name: old, name: String(r[3] || '').replace(/\s+/g, ' ').trim(), unit: String(r[4] || '').trim(),
                  hist: [n(r[5]), n(r[6]), n(r[7])], stock_bf: n(r[8]), qty: n(r[9]), price: n(r[10]), value: n(r[11]), quarters: [n(r[12]), n(r[13]), n(r[14]), n(r[15])] });
    });
    var sum = rows.reduce(function (s, x) { return s + (x.value || 0); }, 0);
    return { fiscal_year: fy, rows: rows, total_row: total, sum: Math.round(sum * 100) / 100, header_ok: hdrOk,
             coded: rows.filter(function (x) { return x.code; }).length };
  }

  function importCard() {
    var c = el('div', null, 'card'); add(c, el('h2', 'นำเข้าแผนจัดซื้อจาก Excel'), el('p', 'ใช้ไฟล์รูปแบบเดียวกับ "แผน ปี 70 ชื่อเดิมและรหัส Nextgov.xlsx" · ระบบตรวจยอดรวมกับแถว "รวมมูลค่า" ก่อนนำเข้า · นำเข้าซ้ำได้ รายการเดิมไม่ถูกเขียนทับ', 'muted'));
    var f = input('file', { accept: '.xlsx,.xls' }), out = el('div'), go = el('button', 'นำเข้า', '', { type: 'button' }); go.disabled = true;
    add(c, f, out, add(el('div', null, 'actions'), go));
    var parsed = null;
    f.addEventListener('change', function () {
      clear(out); parsed = null; go.disabled = true; if (!f.files[0]) return;
      loadXlsx().then(function (XLSX) { return f.files[0].arrayBuffer().then(function (b) { return parsePlan(XLSX, b); }); }).then(function (p) {
        parsed = p;
        var okSum = p.total_row === null || Math.abs(p.total_row - p.sum) < 1;
        add(out, el('p', 'ปีงบประมาณ ' + (p.fiscal_year || 'ไม่พบ') + ' · ' + p.rows.length + ' รายการ (มีรหัส ' + p.coded + ' · ไม่มีรหัส ' + (p.rows.length - p.coded) + ')'),
            el('p', 'ผลรวมมูลค่า ' + money(p.sum) + ' บาท · แถวรวมในไฟล์ ' + (p.total_row === null ? '-' : money(p.total_row)) + ' บาท · ' + (okSum ? 'ตรงกัน' : 'ไม่ตรงกัน'), okSum ? 'pass' : 'fail'));
        if (!p.header_ok || !p.fiscal_year || !p.rows.length) out.appendChild(el('p', 'รูปแบบไฟล์ไม่ตรง (ไม่พบหัวตาราง "รหัส" หรือปี พ.ศ.)', 'fail'));
        else go.disabled = !okSum;
      }).catch(function (e) { out.appendChild(el('p', 'อ่านไฟล์ไม่สำเร็จ: ' + e.message, 'fail')); });
    });
    go.addEventListener('click', function () {
      if (!parsed) return;
      guard(go, function () {
        var chunks = [], size = 250, i = 0, res = { inserted: 0, skipped: 0 };
        for (var k = 0; k < parsed.rows.length; k += size) chunks.push(parsed.rows.slice(k, k + size));
        function step() {
          if (i >= chunks.length) { toast('นำเข้าแล้ว: เพิ่ม ' + res.inserted + ' · มีอยู่แล้ว ' + res.skipped + ' · รวมในระบบ ' + res.total_rows + ' รายการ ' + money(res.total_value) + ' บาท'); planCache = null; return; }
          out.lastChild && (out.lastChild.textContent = out.lastChild.textContent);
          return callApi('purchase.plan.import', { fiscal_year: parsed.fiscal_year, rows: chunks[i] }, { timeout: 120000 }).then(function (r) {
            if (!r.ok) { reportFail(r); if (r.fields && r.fields.detail) out.appendChild(el('pre', r.fields.detail)); return; }
            res.inserted += r.data.inserted; res.skipped += r.data.skipped; res.total_rows = r.data.total_rows; res.total_value = r.data.total_value; i++;
            go.textContent = 'นำเข้า ' + Math.min(i * size, parsed.rows.length) + ' / ' + parsed.rows.length; return step();
          });
        }
        return step();
      });
    });
    return c;
  }

  /* ---------- ลงทะเบียนหน้า ---------- */
  var at = X.pages.map(function (p) { return p.path; }).indexOf('documents');
  X.pages.splice(at < 0 ? X.pages.length : at, 0,
    { path: 'plan', label: 'ขอซื้อในแผน', roles: ['USER', 'OFFICER', 'APPROVER'], render: pagePlanForm },
    { path: 'oop', label: 'ขอซื้อนอกแผน', roles: ['USER', 'OFFICER', 'APPROVER'], render: pageOopForm },
    { path: 'planreport', label: 'แผนจัดซื้อ', render: pagePlanReport },
    { path: 'purprint', label: 'พิมพ์', nav: false, render: pagePrint });

  var css = '.n56{width:7em}.t56 td{vertical-align:top}.hits56{display:flex;flex-direction:column;gap:4px;margin:6px 0}.hits56 .hit{text-align:left;white-space:normal}' +
            '.flag56{background:#fde8e8;color:#9b1c1c;border:1px solid #f5b5b5;border-left:6px solid #c81e1e;border-radius:10px;padding:10px 12px;margin:8px 0;font-weight:600}' +
            '.warn56{color:var(--bad,#b42318);font-size:13px}.p-sum56{font-weight:700;margin-top:8px}.cset{margin:8px 0}.cset .mrow input{flex:1}td.num{text-align:right}' +
            '.paper56{font-family:"TH Sarabun New","TH SarabunPSK",sans-serif}.paper56.th16{font-size:16pt;line-height:1.35}.paper56.th16 table.ptable{font-size:14pt}.paper56 table.ptable td.num{white-space:nowrap}.paper56 table.ptable th,.paper56 table.ptable td{padding:2px 4px}' +
            '.paper56 .sigs56{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;margin-top:18px;page-break-inside:avoid}.paper56 .sigs56 .sig{line-height:1.6;text-align:center}' +
            '.paper56 .p-supply{margin-top:16px;border-top:1px solid #000;padding-top:8px;page-break-inside:avoid}.paper56 .p-in1{padding-left:2.5em}.paper56 .p-in2{padding-left:4.5em}' +
            '.ed56{outline:1px dashed #9ab;outline-offset:2px;border-radius:2px}@media print{.ed56{outline:0}}' +
            '.route56{margin:8px 0;border:1px solid var(--line,#ddd);border-radius:10px;padding:8px 12px;background:var(--card,#fff)}.route56 summary{cursor:pointer;font-weight:700}' +
            '.flow56{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:6px 22px}.flow56 li{position:relative;flex:1 1 calc(33% - 22px);min-width:150px;border:1px solid #9ec5e8;background:#eef6fd;color:#123;border-radius:8px;padding:6px 8px;font-size:14px;display:flex;flex-direction:column}' +
            '.flow56 li+li:before{content:"➜";position:absolute;left:-18px;top:50%;transform:translateY(-50%);color:#3a78b8}@media (max-width:640px){.flow56{flex-direction:column}.flow56 li+li:before{content:"⬇";left:50%;top:-16px;transform:translateX(-50%)}}' +
            '@media (max-width:640px){.paper56 .sigs56{grid-template-columns:1fr}}' +
            '.sig,.msig{position:relative}.del56{position:absolute;top:0;right:0;border:1px solid #c9c9c9;background:#fff;color:#a00;border-radius:50%;width:24px;height:24px;line-height:20px;padding:0;font-size:16px;cursor:pointer}' +
            '.pages56.editing56 .paper56{outline:2px dashed #3a78b8;outline-offset:6px}@media print{.del56,.no-print{display:none!important}.pages56.editing56 .paper56{outline:0}}' +
            '.memo56{line-height:1.4}.memo56 .m-head{position:relative;text-align:center;min-height:1.5cm;margin-bottom:4px}.memo56 .m-crest{position:absolute;left:0;top:0;height:1.5cm}' +
            '.memo56 .m-title{font-size:1.8em;font-weight:700;padding-top:.25cm}.memo56 .m-line{display:flex;gap:6px;margin:1px 0;align-items:baseline}.memo56 .m-line b{font-size:1.25em;white-space:nowrap}' +
            '.memo56 .m-fill{flex:1;border-bottom:1px dotted #000;min-width:0}.memo56 .m-half{flex:1;display:flex;gap:6px;align-items:baseline}.memo56 .m-to{margin:8px 0 4px}' +
            '.memo56 .m-para,.memo56 .m-item{text-indent:2.5cm;margin:3px 0;text-align:left}.memo56 .m-total{font-weight:400}.memo56 .m-sub .p-h{padding-left:2.5cm;margin:3px 0}.memo56 .m-sub .p-lead{padding-left:3.2cm;text-indent:0;margin:0}' +
            '.memo56 .mgrid{display:grid;gap:8px 18px;margin-top:16px;page-break-inside:avoid}.memo56 .mgrid1{grid-template-columns:minmax(0,60%);justify-content:center}.memo56 .mgrid2{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.memo56 .mgrid3{grid-template-columns:repeat(3,1fr)}' +
            '.memo56 .msig{text-align:center;line-height:1.35;display:flex;flex-direction:column}.memo56 .msig .msig-space{margin-top:auto;min-height:1.6em}.memo56 .m-note{text-align:left;overflow-wrap:anywhere}' +
            '.memo56 .m-etitle{text-align:left;font-weight:700}.memo56 .m-endorse{margin-top:10px;gap:10px 28px}.memo56 .m-endorse .msig{font-size:.9em}' +
            '@font-face{font-family:"TH Sarabun New";src:local("TH Sarabun New"),url("vendor/fonts/THSarabunNew.woff") format("woff");font-weight:400}' +
            '@font-face{font-family:"TH Sarabun New";src:local("TH Sarabun New Bold"),url("vendor/fonts/THSarabunNew-Bold.woff") format("woff");font-weight:700}' +
            '.memo56 .m-sub2{padding-left:3cm;margin:0}' +
            '.g2-56{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}.gcol56{border:1px solid var(--line,#ddd);border-radius:8px;padding:8px 10px;font-size:14px;display:flex;flex-direction:column;gap:3px}.gcol56.on{border-color:#3a78b8;background:#eef6fd}' +
            '@media (max-width:640px){.g2-56{grid-template-columns:1fr}}' +
            '.paper56{width:210mm;max-width:100%;box-sizing:border-box;padding:15mm 15mm 15mm 25mm}.memo56 .m-title{font-size:29pt!important}.memo56 .m-line b{font-size:20pt!important}' +
            '@media print{.paper56{width:auto;padding:0}}@media (max-width:640px){.paper56{padding:16px}}' +
            '.paper56 .p-foot{margin-top:12px;padding-top:3px;border-top:.5pt solid #000;font-size:11pt;line-height:1.25}.paper56 .p-foot .f-h{font-weight:700}.paper56 .p-foot .f-in{padding-left:1.2em}.paper56 .p-foot .f-no{text-align:right;margin-top:2px}.paper56 .p-no{text-align:right;font-size:.8em}' +
            '@media print{@page{size:A4;margin:1.5cm 1.5cm 1.5cm 2.5cm}}' +
            '.memo56 .msig>div{white-space:nowrap}.memo56 .msig .m-note,.memo56 .msig .m-etitle{white-space:normal}.memo56 .m-author{grid-template-columns:1fr auto}.memo56 .m-author .msig{min-width:9cm}.memo56 .m-keep16 .msig{font-size:16pt}.memo56 .m-pair16{grid-template-columns:auto auto;justify-content:space-between;column-gap:24px;margin-top:22px}.memo56 .m-pair16 .msig-space{min-height:2.4em}.memo56 .m-supbox{text-align:left;display:block}.memo56 .m-supbox .m-dotline{border-bottom:1px dotted #000;height:1.35em;margin:2px 0 4px}.memo56 .m-asg{display:flex;align-items:baseline;white-space:nowrap;margin-top:2px}.memo56 .m-asg-fill{flex:1;border-bottom:1px dotted #000;min-height:1.3em;margin:0 6px;padding:0 6px}.memo56 .m-supsig{display:flex;margin-left:auto;width:max-content;min-width:9cm;text-align:center}.memo56 .m-supsig .msig-space{min-height:2.8em}.paper56 table.ptable td:nth-child(2){white-space:nowrap}.memo56 .m-keep16{margin-top:14px}' +
            '.memo56 .m-endorse .msig{font-size:.84em}.memo56 .m-pair .msig{font-size:.95em}.paper56 p,.paper56 .m-note{line-break:strict}' +
            '.sheet56{margin-top:16px}@media print{.sheet56{page-break-before:always;break-before:page;margin-top:0}}.sheet56 .sh-no{text-align:right}.sheet56 .sh-set{margin:8px 0 2px 2.5cm}' +
            '.sheet56 .sh-row{display:grid;grid-template-columns:1.6em minmax(0,1fr) auto;gap:0 12px;align-items:baseline;margin:0 0 4px 1.5cm;font-size:16pt}.sheet56 .sh-row>span{white-space:normal}.sheet56 .sh-r{text-align:right;white-space:nowrap}.sheet56 .sh-n,.sheet56 .sh-p{min-height:1.3em}' +
            '@media (max-width:640px){.sheet56 .sh-row{margin-left:0}.memo56 .mgrid2,.memo56 .mgrid3{grid-template-columns:1fr}.memo56 .m-para,.memo56 .m-item{text-indent:1.2cm}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
});
