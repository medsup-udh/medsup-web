/* ชุด 26 พ.ย. 2569 — ส่วนขยายของ app.js (ลงทะเบียนผ่าน window.MEDSUP_PLUGINS)
   - Menu 1: กล่องงานพัสดุแบบมีขั้นตอนแก้ไข · ผลการแก้ปัญหาที่หน่วยงานเห็นเมื่อปิดงาน · ฐานข้อมูลปัญหา (Excel)
   - ข้อมูลจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น · Excel สร้างในเบราว์เซอร์ (SheetJS ใน web/vendor) */
(window.MEDSUP_PLUGINS = window.MEDSUP_PLUGINS || []).push(function (X) {
  'use strict';
  var el = X.el, add = X.add, clear = X.clear, callApi = X.callApi, guard = X.guard, toast = X.toast, reportFail = X.reportFail;

  Object.assign(X.FIELD_LABEL, { action_type: 'แนวทางแก้ไข', action_other: 'แนวทางอื่น (ระบุ)', steps: 'ขั้นตอนการแก้ไข', advice: 'คำแนะนำถึงหน่วยงาน',
    review_result: 'สาเหตุของปัญหา', reply_to_unit: 'ผลการแก้ไข' });
  Object.assign(X.FIELD_MSG, { too_many: 'เกินจำนวนที่กำหนด' });
  ['m1x.resolution.save'].forEach(function (a) { X.WRITE_ACTIONS.push(a); });

  /* ---------- ตัวช่วยร่วม (ใช้ทุกส่วนในไฟล์นี้) ---------- */
  var xlsxReady = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxReady) xlsxReady = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';
      s.onload = function () { res(window.XLSX); }; s.onerror = function () { xlsxReady = null; rej(new Error('โหลดตัวสร้าง Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต')); };
      document.head.appendChild(s);
    });
    return xlsxReady;
  }
  function exportXlsx(filename, sheets) {
    return loadXlsx().then(function (XLSX) {
      var wb = XLSX.utils.book_new();
      sheets.forEach(function (s) {
        var ws = XLSX.utils.aoa_to_sheet(s.rows);
        ws['!cols'] = s.rows[0].map(function (h, i) { return { wch: s.widths && s.widths[i] ? s.widths[i] : 16 }; });
        XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      });
      XLSX.writeFile(wb, filename); toast('สร้างไฟล์ Excel แล้ว');
    }, function (e) { toast(e.message, true); });
  }
  function thaiDay(iso) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(String(iso).length === 10 ? iso + 'T05:00:00Z' : iso)); } catch (e) { return iso; }
  }
  function todayYmd() { return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); }
  function fieldBox(label, input, hint) {
    var w = el('div', null, 'f'), id = 'f3-' + Math.random().toString(36).slice(2, 9); input.id = id;
    add(w, el('label', label, '', { for: id }), input, hint ? el('div', hint, 'muted') : null); return w;
  }
  X.m3 = { exportXlsx: exportXlsx, thaiDay: thaiDay, todayYmd: todayYmd, fieldBox: fieldBox };

  /* ---------- Menu 1: ผลการแก้ปัญหา ---------- */
  function closureView(c, attachments) {
    var box = el('div');
    function part(title, node) { if (node) add(box, el('h3', title), node); }
    part('สาเหตุของปัญหา', c.cause ? el('div', c.cause, 'pre') : null);
    part('แนวทางแก้ไข', c.action_type ? el('div', c.action_type === 'อื่นๆ' ? 'อื่นๆ: ' + (c.action_other || '') : c.action_type) : null);
    if (c.steps && c.steps.length) { var ol = el('ol', null, 'steps'); c.steps.forEach(function (s) { ol.appendChild(el('li', s)); }); part('ขั้นตอนการแก้ไข', ol); }
    part('ผลการแก้ไข', c.result ? el('div', c.result, 'pre') : null);
    part('คำแนะนำถึงหน่วยงาน', c.advice ? el('div', c.advice, 'pre') : null);
    var ids = c.confirm_attachment_ids || [];
    if (ids.length) {
      var names = (attachments || []).filter(function (a) { return ids.indexOf(a.id) >= 0; }).map(function (a) { return a.original_filename; });
      part('เอกสารยืนยัน', el('div', names.join(', ') + ' (ดาวน์โหลดได้ในส่วนไฟล์แนบด้านล่าง)', 'muted'));
    }
    return box;
  }

  /** หน่วยงาน: กล่องผลการแก้ปัญหาเมื่อปิดงาน (แทนกล่องผลแจ้งกลับเดิม) */
  function m1Body(view, d, md, data) {
    if (!md.closure || d.status !== 'COMPLETED' || md.officer) return;
    var card = el('div', null, 'card doc-part reply');
    add(card, el('h2', 'ผลการแก้ปัญหาจากงานพัสดุ หมวดวัสดุการแพทย์'), closureView(md.closure, data.attachments),
        md.closure.closed_at ? el('div', 'ปิดงานเมื่อ ' + X.fmtDate(md.closure.closed_at), 'muted') : null);
    view.appendChild(card);
  }

  /** พัสดุ: บันทึกการประสาน · สาเหตุ · แนวทาง · ขั้นตอน · ผล · คำแนะนำ · เอกสารยืนยัน · ปิดงาน */
  function m1Officer(d, md, refresh) {
    var o = md.officer, c = md.closure || {}, card = el('div', null, 'card doc-part officer');
    add(card, el('h2', 'งานพัสดุ หมวดวัสดุการแพทย์'));
    if (d.status === 'SUBMITTED') card.appendChild(el('div', 'กด "รับเรื่อง" ด้านบนก่อน จึงบันทึกการแก้ไขได้', 'muted'));

    add(card, el('h3', 'บันทึกการประสาน (เห็นเฉพาะพัสดุ)'));
    if (o.followups.length) {
      var ul = el('ul', null, 'timeline');
      o.followups.forEach(function (f) { add(ul, add(el('li'), el('div', f.note, 'pre'), el('div', (f.by_name || '-') + ' · ' + X.fmtDate(f.acted_at), 'muted'))); });
      card.appendChild(ul);
    } else if (!o.can_followup) card.appendChild(el('div', '-', 'muted'));
    if (o.can_followup) {
      var note = el('textarea', null, '', { maxlength: '2000', rows: '2', 'aria-label': 'บันทึกการประสาน', placeholder: 'เช่น โทรสอบถามผู้ขาย นัดเข้าตรวจสอบ' });
      var addBtn = el('button', 'เพิ่มบันทึก', 'secondary small', { type: 'button' });
      addBtn.addEventListener('click', function () {
        var text = note.value.trim(); if (!text) { note.focus(); return; }
        guard(addBtn, function () {
          return callApi('m1.followup.add', { document_id: d.id, note: text }).then(function (r) { if (!r.ok) { reportFail(r); return; } toast('เพิ่มบันทึกแล้ว'); return refresh(); });
        });
      });
      add(card, note, add(el('div', null, 'actions'), addBtn));
    }

    add(card, el('h3', 'การแก้ปัญหา (หน่วยงานเห็นเมื่อปิดงาน)'));
    if (!o.can_review) {
      var has = c.cause || c.result || (c.steps && c.steps.length);
      card.appendChild(has ? closureView(c, null) : el('div', '-', 'muted'));
      return card;
    }
    var cause = el('textarea', null, '', { maxlength: '3000', rows: '3', placeholder: 'เช่น พบสารละลายขุ่นใน Syringe จากการเก็บผิดอุณหภูมิระหว่างขนส่ง' });
    var type = el('select'); add(type, el('option', '— เลือก —', '', { value: '' }));
    (md.action_types || []).forEach(function (t) { type.appendChild(el('option', t, '', { value: t })); });
    var other = el('input', null, '', { type: 'text', maxlength: '300', placeholder: 'ระบุแนวทาง' });
    var steps = el('textarea', null, '', { maxlength: '6100', rows: '5', placeholder: 'พิมพ์ 1 บรรทัดต่อ 1 ขั้นตอน เช่น\nสอบถามผู้ขาย\nส่งสารละลายตรวจพิสูจน์\nรับเอกสารยืนยันผลตรวจจากผู้ขาย' });
    var result = el('textarea', null, '', { maxlength: '3000', rows: '3', placeholder: 'เช่น ผู้ขายเปลี่ยนสินค้าล็อตใหม่ให้ครบแล้ว' });
    var advice = el('textarea', null, '', { maxlength: '2000', rows: '2', placeholder: 'เช่น เก็บที่อุณหภูมิไม่เกิน 25 องศา ตรวจสีสารละลายก่อนใช้' });
    cause.value = o.review_result || ''; result.value = o.reply_to_unit || ''; type.value = c.action_type || ''; other.value = c.action_other || '';
    steps.value = (c.steps || []).join('\n'); advice.value = c.advice || '';
    var otherBox = fieldBox('แนวทางอื่น (ระบุ) *', other);
    function syncOther() { otherBox.style.display = type.value === 'อื่นๆ' ? '' : 'none'; }
    type.addEventListener('change', syncOther); syncOther();
    var errBox = el('div', null, 'ferr');
    add(card, fieldBox('สาเหตุของปัญหา *', cause), fieldBox('แนวทางแก้ไข *', type), otherBox,
        fieldBox('ขั้นตอนการแก้ไข * (บรรทัดละ 1 ขั้นตอน ไม่เกิน 20 ขั้น)', steps), fieldBox('ผลการแก้ไข *', result), fieldBox('คำแนะนำถึงหน่วยงาน', advice),
        el('div', 'เอกสารยืนยัน (เช่น ผลตรวจพิสูจน์ หนังสือจากผู้ขาย) แนบในส่วนไฟล์แนบด้านล่าง หน่วยงานเห็นเมื่อปิดงาน', 'muted'), errBox);
    var saveBtn = el('button', 'บันทึก', 'secondary', { type: 'button' }), closeBtn = el('button', 'บันทึกและปิดงาน', '', { type: 'button' });
    add(card, add(el('div', null, 'actions'), closeBtn, saveBtn));
    var repVer = o.version, resVer = c.version || 0;
    function stepLines() { return steps.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
    function saveAll() {
      var p1 = (cause.value.trim() !== (o.review_result || '') || result.value.trim() !== (o.reply_to_unit || ''))
        ? callApi('m1.review.save', { document_id: d.id, version: repVer, review_result: cause.value, reply_to_unit: result.value }).then(function (r) {
            if (r.ok) { repVer = r.data.version; o.review_result = cause.value.trim(); o.reply_to_unit = result.value.trim(); } return r; })
        : Promise.resolve({ ok: true });
      return p1.then(function (r) {
        if (!r.ok) return r;
        var p = { document_id: d.id, version: resVer, steps_text: stepLines().join('\n'), advice: advice.value };
        if (type.value) p.action_type = type.value;
        if (type.value === 'อื่นๆ') p.action_other = other.value;
        return callApi('m1x.resolution.save', p).then(function (x) { if (x.ok) resVer = x.data.version; return x; });
      });
    }
    saveBtn.addEventListener('click', function () {
      guard(saveBtn, function () { return saveAll().then(function (r) { if (!r.ok) { reportFail(r); return; } toast('บันทึกแล้ว'); return refresh(); }); });
    });
    closeBtn.addEventListener('click', function () {
      var miss = [];
      if (!cause.value.trim()) miss.push('สาเหตุของปัญหา');
      if (!type.value) miss.push('แนวทางแก้ไข'); else if (type.value === 'อื่นๆ' && !other.value.trim()) miss.push('แนวทางอื่น (ระบุ)');
      if (!stepLines().length) miss.push('ขั้นตอนการแก้ไข');
      if (!result.value.trim()) miss.push('ผลการแก้ไข');
      errBox.textContent = miss.length ? 'ยังไม่ได้กรอก: ' + miss.join(', ') : '';
      if (miss.length) return;
      if (!window.confirm('ปิดงานเรื่องนี้? หลังปิดแก้ไขไม่ได้ และหน่วยงานจะเห็นสาเหตุ ขั้นตอน ผล และคำแนะนำ')) return;
      guard(closeBtn, function () {
        return saveAll().then(function (r) {
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
  X.detail.M1 = { body: m1Body, officer: m1Officer };

  /* ---------- ฐานข้อมูลปัญหา (พัสดุ) ---------- */
  var STATUS_TXT = { SUBMITTED: 'รอรับเรื่อง', IN_REVIEW: 'กำลังดำเนินการ', RETURNED: 'ส่งกลับแก้ไข', COMPLETED: 'ปิดงานแล้ว' };
  function pageProblems(view, args, alive) {
    var card = X.pageTitle(view, 'ฐานข้อมูลปัญหาวัสดุการแพทย์', 'รวมทุกเรื่องที่หน่วยงานส่งแล้ว พร้อมสาเหตุ ขั้นตอนแก้ไข และผล ใช้ค้นหาเรื่องเดิมก่อนแก้ปัญหาซ้ำ');
    var from = el('input', null, '', { type: 'date' }), to = el('input', null, '', { type: 'date' }), st = el('select'), q = el('input', null, '', { type: 'search', placeholder: 'ค้นหา วัสดุ ผู้ขาย สาเหตุ' });
    [['ALL', 'ทุกสถานะ'], ['OPEN', 'ยังไม่ปิดงาน'], ['COMPLETED', 'ปิดงานแล้ว']].forEach(function (o) { st.appendChild(el('option', o[1], '', { value: o[0] })); });
    var load = el('button', 'แสดง', '', { type: 'button' }), xl = el('button', 'ส่งออก Excel', 'secondary', { type: 'button' });
    add(card, add(el('div', null, 'filters'), fieldBox('ส่งตั้งแต่', from), fieldBox('ถึง', to), fieldBox('สถานะ', st), fieldBox('ค้นหา', q)), add(el('div', null, 'actions'), load, xl));
    var out = el('div'); add(view, out);
    var rows = [];
    function shown() {
      var k = q.value.trim().toLowerCase();
      return !k ? rows : rows.filter(function (r) { return [r.doc_no, r.item_name, r.item_code, r.vendor, r.department, r.cause, r.problem].join(' ').toLowerCase().indexOf(k) >= 0; });
    }
    function render() {
      clear(out); var list = shown();
      var c = el('div', null, 'card'); add(c, el('div', 'พบ ' + list.length + ' เรื่อง', 'muted'));
      if (!list.length) { out.appendChild(c); return; }
      var t = el('table', null, 'stack'), hr = el('tr'), H = ['เลขที่', 'ส่งเมื่อ', 'หน่วยงาน', 'วัสดุการแพทย์', 'ผู้ขาย', 'สาเหตุ', 'แนวทาง', 'สถานะ'];
      H.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      list.forEach(function (r) {
        var tr = el('tr'), a = el('a', r.doc_no, '', { href: '#/documents/' + encodeURIComponent(r.id || '') });
        var cells = [a, thaiDay(r.submitted_at), r.department, r.item_name + (r.item_code ? ' · ' + r.item_code : ''), r.vendor, r.cause || '-', r.action_type || '-', STATUS_TXT[r.status] || r.status];
        cells.forEach(function (v, i) { var td = el('td'); td.setAttribute('data-label', H[i]); if (typeof v === 'string') td.textContent = v; else td.appendChild(v); tr.appendChild(td); });
        tb.appendChild(tr);
      });
      add(t, tb); add(c, add(el('div', null, 'scroll'), t)); out.appendChild(c);
    }
    function fetchRows() {
      var p = { status: st.value }; if (from.value) p.from = from.value; if (to.value) p.to = to.value;
      return callApi('m1x.export', p).then(function (r) { if (!alive()) return; if (!r.ok) { reportFail(r); return; } rows = r.data.rows; render(); });
    }
    load.addEventListener('click', function () { guard(load, fetchRows); });
    q.addEventListener('input', render);
    xl.addEventListener('click', function () {
      guard(xl, function () {
        return (rows.length ? Promise.resolve() : fetchRows()).then(function () {
          var head = ['เลขที่', 'วันที่ส่ง', 'วันที่ปิดงาน', 'สถานะ', 'หน่วยงาน', 'รหัสวัสดุ', 'วัสดุการแพทย์', 'ผู้ขาย/ยี่ห้อ', 'Lot', 'วันหมดอายุ', 'ประเภทปัญหา', 'วันที่พบปัญหา',
                      'ปัญหาที่พบ', 'สาเหตุ', 'แนวทางแก้ไข', 'ขั้นตอนการแก้ไข', 'ผลการแก้ไข', 'คำแนะนำถึงหน่วยงาน'];
          var aoa = [head].concat(shown().map(function (r) {
            return [r.doc_no, thaiDay(r.submitted_at), thaiDay(r.closed_at), STATUS_TXT[r.status] || r.status, r.department, r.item_code, r.item_name, r.vendor, r.lot_no,
                    thaiDay(r.expiry_date), r.problem_type, thaiDay(r.problem_found_date), r.problem, r.cause, r.action_type,
                    r.steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'), r.result, r.advice];
          }));
          return exportXlsx('ฐานข้อมูลปัญหาวัสดุการแพทย์-' + todayYmd() + '.xlsx', [{ name: 'ปัญหาวัสดุการแพทย์', rows: aoa, widths: [14, 12, 12, 12, 24, 14, 30, 22, 10, 12, 12, 12, 40, 40, 20, 50, 40, 40] }]);
        });
      });
    });
    guard(load, fetchRows);
  }
  var at = X.pages.map(function (p) { return p.path; }).indexOf('documents');
  X.pages.splice(at < 0 ? X.pages.length : at, 0, { path: 'problems', label: 'ฐานข้อมูลปัญหา', roles: ['OFFICER'], render: pageProblems });
});
