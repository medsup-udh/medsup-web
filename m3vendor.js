/* คำขอวางประเมินจากผู้ขาย — หน้าพัสดุ (ส่วนขยายของ app.js)
   - รายการคำขอ (ค้นหา/กรองสถานะ/Excel) · รอบรับคำขอ · ผู้ขายที่รับทราบประกาศ · QR เข้าหน้าผู้ขาย
   - รายละเอียดคำขอ: ดาวน์โหลดไฟล์ · ส่งกลับแก้ไข/ไม่รับพิจารณา · ส่งให้หน่วยงานประเมิน (สร้างรอบ Menu 2) · อนุมัติผล
   - ข้อมูลจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น */
(window.MEDSUP_PLUGINS = window.MEDSUP_PLUGINS || []).push(function (X) {
  'use strict';
  var el = X.el, add = X.add, clear = X.clear, callApi = X.callApi, guard = X.guard, toast = X.toast, reportFail = X.reportFail, A = X.app;
  if (!A || !X.m3) return;
  var M3 = X.m3;
  ['vendorx.round.save', 'vendorx.request.return', 'vendorx.request.reject', 'vendorx.request.send_eval', 'vendorx.request.approve']
    .forEach(function (a) { X.WRITE_ACTIONS.push(a); });
  Object.assign(X.FIELD_LABEL, { round_no: 'รอบที่', open_date: 'วันเปิดรับ', close_date: 'วันปิดรับ', due_date: 'กำหนดส่งผลประเมิน', template_id: 'แบบประเมิน', units: 'หน่วยงานที่ทดลองใช้', m2: 'รอบประเมิน' });
  Object.assign(X.FIELD_MSG, { invalid_round: 'รูปแบบ เช่น 1/2569', invalid_date: 'วันที่ไม่ถูกต้อง', before_open: 'ต้องไม่ก่อนวันเปิดรับ', overlap: 'ช่วงวันซ้อนกับรอบอื่น',
    in_use: 'มีคำขอในรอบนี้แล้ว เปลี่ยนเลขรอบไม่ได้', round_not_closed: 'ต้องปิดรอบประเมินก่อน', no_result: 'ยังไม่มีหน่วยงานส่งผลประเมิน' });

  var ST = { SUBMITTED: 'รอพัสดุตรวจ', RETURNED: 'ส่งกลับให้แก้ไข', EVALUATING: 'กำลังทดลองใช้', APPROVED: 'อนุมัติผลแล้ว', REJECTED: 'ไม่รับพิจารณา' };
  var KIND = { spec: 'คุณลักษณะเฉพาะ (สเปก)', quote: 'ใบเสนอราคา', catalog: 'แค็ตตาล็อก', iso: 'ใบรับรอง ISO', other: 'เอกสารอื่น' };
  function portalUrl() { var u = new URL('vendor.html', location.href); u.hash = ''; u.search = ''; return u.href; }
  function badge(s) { return el('span', ST[s] || s, 'badge s-' + (s === 'APPROVED' ? 'CLOSED' : s === 'EVALUATING' ? 'OPEN' : s)); }
  function failLine(box, r) {
    var t = r.fields ? Object.keys(r.fields).map(function (k) { return (X.FIELD_LABEL[k] || k) + ': ' + (X.FIELD_MSG[r.fields[k]] || r.fields[k]); }).join(' · ') : X.errText(r);
    box.textContent = t; return false;
  }
  function yesNo(has, a, b) { return has === true ? 'มี' + (a ? ' · ' + a : '') : has === false ? 'ไม่มี' + (b ? ' · เหตุผล: ' + b : '') : '-'; }
  function table(heads, rows, labels) {
    var t = el('table', null, 'stack'), hr = el('tr'); heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
    var tb = el('tbody'); rows.forEach(function (cells) {
      var tr = el('tr'); cells.forEach(function (c, i) { var td = el('td'); td.setAttribute('data-label', (labels || heads)[i]); if (c instanceof Node) td.appendChild(c); else td.textContent = c === null || c === undefined || c === '' ? '-' : String(c); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    add(t, tb); return add(el('div', null, 'scroll'), t);
  }

  /* ---------- QR เข้าหน้าผู้ขาย ---------- */
  var qrReady = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrReady) qrReady = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'vendor/qrcode.js';
      s.onload = function () { res(window.qrcode); }; s.onerror = function () { qrReady = null; rej(new Error('โหลดตัวสร้าง QR ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
    return qrReady;
  }
  function qrCard(view) {
    var url = portalUrl(), c = el('div', null, 'card');
    var show = el('button', 'แสดง QR', 'secondary small', { type: 'button' }), copy = el('button', 'คัดลอกลิงก์', 'secondary small', { type: 'button' }), box = el('div');
    add(c, el('h2', 'ลิงก์/QR สำหรับผู้ขาย'), el('div', 'ผู้ขายสแกนแล้วอ่านประกาศหลักเกณฑ์ รับทราบ แล้วเข้าด้วยบัญชี Google ของบริษัท (ไม่ต้องมีรหัสในระบบ)', 'muted'),
        add(el('p'), el('code', url)), add(el('div', null, 'actions'), show, copy, el('a', 'เปิดหน้าผู้ขาย', '', { href: url, target: '_blank', rel: 'noopener' })), box);
    copy.addEventListener('click', function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('คัดลอกลิงก์แล้ว'); }, function () { toast('คัดลอกไม่ได้ ให้เลือกข้อความลิงก์แล้วคัดลอกเอง', true); }); });
    show.addEventListener('click', function () {
      guard(show, function () {
        return loadQr().then(function (qrcode) {
          var q = qrcode(0, 'M'); q.addData(url); q.make();
          clear(box);
          var img = el('img', null, '', { src: q.createDataURL(8, 4), alt: 'QR เข้าหน้าคำขอวางประเมินของผู้ขาย', width: '264', height: '264' });
          var dl = el('a', 'บันทึกรูป QR', 'secondary small', { href: img.src, download: 'QR-คำขอวางประเมินผู้ขาย.png' });
          add(box, img, add(el('div', null, 'actions'), dl));
        }, function (e) { toast(e.message, true); });
      });
    });
    view.appendChild(c);
  }

  /* ---------- หน้ารวม ---------- */
  function pageList(view, args, alive) {
    var tab = args[0] || 'req';
    var top = X.pageTitle(view, 'คำขอวางประเมินจากผู้ขาย', 'ผู้ขายยื่นผ่าน QR · พัสดุตรวจเอกสารแล้วส่งให้หน่วยงานทดลองใช้ · ผู้ขายเห็นคะแนนหลังพัสดุอนุมัติผล');
    var bar = el('div', null, 'v-choice actions', { role: 'group', 'aria-label': 'เลือกส่วน' });
    [['req', 'คำขอ'], ['rounds', 'รอบรับคำขอ'], ['acks', 'ผู้รับทราบประกาศ'], ['qr', 'QR ผู้ขาย']].forEach(function (t) {
      var b = el('button', t[1], t[0] === tab ? '' : 'secondary', { type: 'button', 'aria-pressed': String(t[0] === tab) });
      b.addEventListener('click', function () { location.hash = '#/vendorreqs/' + t[0]; }); bar.appendChild(b);
    });
    top.appendChild(bar);
    if (tab === 'rounds') return tabRounds(view, alive);
    if (tab === 'acks') return tabAcks(view, alive);
    if (tab === 'qr') return qrCard(view);
    return tabRequests(view, alive);
  }

  function tabRequests(view, alive) {
    var box = X.loading(view);
    callApi('vendorx.request.list', {}).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { A.errLine(view, r); return; }
      var rows = r.data, c = el('div', null, 'card');
      var q = el('input', null, '', { type: 'search', placeholder: 'ค้นหา เลขที่/บริษัท/วัสดุ/ยี่ห้อ', 'aria-label': 'ค้นหา' });
      var st = el('select', null, '', { 'aria-label': 'สถานะ' }); add(st, el('option', 'ทุกสถานะ', '', { value: '' }));
      Object.keys(ST).forEach(function (k) { var n = rows.filter(function (x) { return x.status === k; }).length; st.appendChild(el('option', ST[k] + ' (' + n + ')', '', { value: k })); });
      if (rows.some(function (x) { return x.status === 'SUBMITTED'; })) st.value = 'SUBMITTED';
      var xl = el('button', 'Excel', 'secondary small', { type: 'button' }), out = el('div');
      add(c, add(el('div', null, 'row'), q, st), add(el('div', null, 'actions'), xl), out); view.appendChild(c);
      function shown() {
        var t = q.value.trim().toLowerCase();
        return rows.filter(function (x) { return (!st.value || x.status === st.value) && (!t || [x.req_no, x.company, x.item_name, x.brand_model, x.rep_name].join(' ').toLowerCase().indexOf(t) >= 0); });
      }
      function draw() {
        clear(out); var list = shown();
        if (!list.length) { out.appendChild(el('div', rows.length ? 'ไม่พบคำขอตามเงื่อนไข' : 'ยังไม่มีคำขอจากผู้ขาย', 'muted')); return; }
        out.appendChild(table(['เลขที่', 'ยื่นเมื่อ', 'บริษัท', 'วัสดุ / ยี่ห้อรุ่น', 'สถานะ', 'หน่วยงานทดลอง', 'คะแนน'], list.map(function (x) {
          return [el('a', x.req_no, '', { href: '#/vendorreq/' + x.id }), M3.thaiDay(x.submitted_at), x.company, x.item_name + ' · ' + x.brand_model, badge(x.status),
                  x.units.length ? x.units.length + ' หน่วยงาน' : '', x.pct === null ? '' : A.n2(x.pct) + '%'];
        })));
      }
      q.addEventListener('input', draw); st.addEventListener('change', draw); draw();
      xl.addEventListener('click', function () {
        var aoa = [['เลขที่', 'รอบ', 'ยื่นเมื่อ', 'บริษัท', 'ผู้แทน', 'โทรศัพท์', 'อีเมล', 'วัสดุ', 'ยี่ห้อ/รุ่น', 'อย.', 'เลข อย./เหตุผล', 'ISO', 'ISO/เหตุผล', 'ตัวอย่าง', 'สถานะ', 'ความเห็นพัสดุ', 'หน่วยงานทดลอง', 'ผู้ประเมิน', 'คะแนน (%)', 'อนุมัติผลเมื่อ']];
        shown().forEach(function (x) {
          aoa.push([x.req_no, x.round_no, M3.thaiDay(x.submitted_at), x.company, x.rep_name, x.phone, x.vendor_email, x.item_name, x.brand_model,
            x.fda_has ? 'มี' : 'ไม่มี', x.fda_has ? x.fda_no : x.fda_why, x.iso_has ? 'มี' : 'ไม่มี', x.iso_has ? x.iso_text : x.iso_why, x.samples,
            ST[x.status] || x.status, x.officer_comment || '', x.units.join(', '), x.evaluators || 0, x.pct === null ? '' : x.pct, x.approved_at ? M3.thaiDay(x.approved_at) : '']);
        });
        return M3.exportXlsx('คำขอวางประเมินผู้ขาย-' + M3.todayYmd() + '.xlsx', [{ name: 'คำขอผู้ขาย', rows: aoa, widths: [14, 8, 12, 28, 18, 14, 26, 28, 24, 6, 18, 6, 18, 14, 14, 30, 30, 8, 8, 12] }]);
      });
    });
  }

  function tabRounds(view, alive) {
    var form = el('form', null, 'card', { novalidate: 'novalidate' }), err = el('div', null, 'ferr', { role: 'alert' });
    var no = el('input', null, '', { type: 'text', maxlength: '20', placeholder: 'เช่น 1/2569' }), od = el('input', null, '', { type: 'date' }), cd = el('input', null, '', { type: 'date' });
    var note = el('input', null, '', { type: 'text', maxlength: '1000' }), save = el('button', 'บันทึกรอบ', '', { type: 'submit' }), cancel = el('button', 'ยกเลิกแก้ไข', 'secondary', { type: 'button', hidden: 'hidden' });
    var editing = null, title = el('h2', 'เพิ่มรอบรับคำขอ');
    add(form, title, add(el('div', null, 'row'), M3.fieldBox('รอบที่ *', no), M3.fieldBox('วันเปิดรับ *', od), M3.fieldBox('วันปิดรับ *', cd)), M3.fieldBox('หมายเหตุ', note),
        err, add(el('div', null, 'actions'), save, cancel));
    var list = el('div', 'กำลังโหลด...', 'card muted');
    add(view, form, list);
    function reset() { editing = null; no.value = od.value = cd.value = note.value = ''; title.textContent = 'เพิ่มรอบรับคำขอ'; cancel.hidden = true; err.textContent = ''; }
    cancel.addEventListener('click', reset);
    function load() {
      return callApi('vendorx.round.list', {}).then(function (r) {
        if (!alive()) return; clear(list); list.className = 'card';
        if (!r.ok) { list.appendChild(el('span', X.errText(r), 'fail')); return; }
        if (!r.data.length) { list.appendChild(el('div', 'ยังไม่มีรอบ — ผู้ขายจะยื่นคำขอไม่ได้จนกว่าจะมีรอบที่เปิดรับ', 'notice')); return; }
        var today = M3.todayYmd();
        list.appendChild(table(['รอบที่', 'เปิดรับ', 'ปิดรับ', 'สถานะ', 'หมายเหตุ', ''], r.data.map(function (x) {
          var b = el('button', 'แก้ไข', 'secondary small', { type: 'button' });
          b.addEventListener('click', function () { editing = x; no.value = x.round_no; od.value = x.open_date; cd.value = x.close_date; note.value = x.note || ''; title.textContent = 'แก้ไขรอบ ' + x.round_no; cancel.hidden = false; no.focus(); });
          var s = today < x.open_date ? 'ยังไม่เปิด' : today > x.close_date ? 'ปิดแล้ว' : 'เปิดรับอยู่';
          return [x.round_no, M3.thaiDay(x.open_date), M3.thaiDay(x.close_date), s, x.note, b];
        })));
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (!no.value.trim() || !od.value || !cd.value) { err.textContent = 'กรอกรอบที่ วันเปิดรับ และวันปิดรับ'; return; }
      var p = { round_no: no.value.trim(), open_date: od.value, close_date: cd.value, note: note.value.trim() };
      if (editing) { p.id = editing.id; p.version = editing.version; }
      guard(save, function () { return callApi('vendorx.round.save', p).then(function (r) { if (!r.ok) return failLine(err, r); toast('บันทึกรอบแล้ว'); reset(); return load(); }); });
    });
    load();
  }

  function tabAcks(view, alive) {
    var box = X.loading(view);
    callApi('vendorx.acks', {}).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { A.errLine(view, r); return; }
      var c = el('div', null, 'card'), xl = el('button', 'Excel', 'secondary small', { type: 'button' });
      add(c, el('div', 'ผู้ขายที่กดรับทราบประกาศหลักเกณฑ์ก่อนเข้าระบบ (' + r.data.length + ' ราย)', 'muted'), add(el('div', null, 'actions'), xl),
          r.data.length ? table(['รับทราบเมื่อ', 'อีเมล', 'ชื่อในบัญชี Google', 'บริษัท', 'ประกาศฉบับ'], r.data.map(function (a) { return [X.fmtDate(a.acked_at), a.email, a.google_name, a.company, a.notice_version]; }))
                        : el('div', 'ยังไม่มี', 'muted'));
      view.appendChild(c);
      xl.addEventListener('click', function () {
        var aoa = [['รับทราบเมื่อ', 'อีเมล', 'ชื่อในบัญชี Google', 'บริษัท', 'ประกาศฉบับ']].concat(r.data.map(function (a) { return [X.fmtDate(a.acked_at), a.email, a.google_name, a.company, a.notice_version]; }));
        return M3.exportXlsx('ผู้ขายรับทราบประกาศ-' + M3.todayYmd() + '.xlsx', [{ name: 'รับทราบประกาศ', rows: aoa, widths: [20, 30, 24, 30, 10] }]);
      });
    });
  }

  /* ---------- รายละเอียดคำขอ ---------- */
  function b64Blob(b64, type) {
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: type || 'application/octet-stream' });
  }
  function kv(pairs) {
    var dl = el('dl', null, 'kv'); pairs.forEach(function (p) { if (p) add(dl, el('dt', p[0]), el('dd', p[1] === null || p[1] === undefined || p[1] === '' ? '-' : String(p[1]))); }); return dl;
  }
  function pageDetail(view, args, alive) {
    var id = args[0]; if (!id) { location.hash = '#/vendorreqs'; return; }
    var box = X.loading(view);
    callApi('vendorx.request.get', { id: id }).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { A.errLine(view, r); return; }
      var q = r.data.request, files = r.data.files, s = r.data.score;
      var head = X.pageTitle(view, 'คำขอ ' + q.req_no, q.company + ' · ' + q.item_name);
      add(head, add(el('p'), badge(q.status), document.createTextNode(' ยื่นเมื่อ ' + X.fmtDate(q.submitted_at) + ' · รอบ ' + q.round_no)),
          add(el('div', null, 'actions'), el('a', '← กลับรายการคำขอ', '', { href: '#/vendorreqs' })));
      if (q.officer_comment && (q.status === 'RETURNED' || q.status === 'REJECTED')) head.appendChild(add(el('div', null, 'notice'), el('b', 'ความเห็นพัสดุ: '), document.createTextNode(q.officer_comment)));

      var info = el('div', null, 'card');
      add(info, el('h2', 'ข้อมูลที่ผู้ขายยื่น'), kv([['บริษัท', q.company], ['ผู้แทน', q.rep_name], ['โทรศัพท์', q.phone], ['อีเมล (บัญชี Google)', q.vendor_email],
        ['วัสดุ', q.item_name], ['ยี่ห้อ/รุ่น', q.brand_model], ['ทะเบียน อย.', yesNo(q.fda_has, q.fda_no, q.fda_why)], ['ISO', yesNo(q.iso_has, q.iso_text, q.iso_why)],
        ['ตัวอย่างที่ให้ทดลอง', q.samples], ['ข้อแนะนำการใช้', q.advice]]));
      view.appendChild(info);

      var fc = el('div', null, 'card'); add(fc, el('h2', 'เอกสารแนบ (' + files.length + ')'));
      if (!files.length) fc.appendChild(el('div', 'ไม่มีไฟล์', 'muted'));
      files.forEach(function (f) {
        var b = el('button', 'ดาวน์โหลด', 'secondary small', { type: 'button' });
        b.addEventListener('click', function () {
          guard(b, function () {
            return callApi('vendorx.file.download', { file_id: f.id }).then(function (d) {
              if (!d.ok) { reportFail(d); return; }
              var url = URL.createObjectURL(b64Blob(d.data.data_base64, d.data.file_type)), a = el('a', null, '', { href: url, download: d.data.filename });
              document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
            });
          });
        });
        fc.appendChild(add(el('div', null, 'v-file ok'), add(el('span'), el('b', (KIND[f.kind] || f.kind) + ': '), document.createTextNode(f.original_filename + ' (' + Math.ceil(f.file_size / 1024) + ' KB)')), b));
      });
      view.appendChild(fc);

      if (q.m2_document_id || s) {
        var sc = el('div', null, 'card');
        add(sc, el('h2', 'ผลการทดลองใช้'), q.m2_document_id ? add(el('p'), el('a', 'เปิดรอบประเมิน ' + (q.m2_doc_no || ''), '', { href: '#/documents/' + q.m2_document_id }),
            document.createTextNode(q.m2_status === 'CLOSED' ? ' (ปิดรอบแล้ว)' : ' (ยังเปิดอยู่ — ปิดรอบที่หน้ารอบประเมินเมื่อครบกำหนด)')) : null);
        if (s) {
          add(sc, el('p', 'ส่งผลแล้ว ' + s.units_sent + '/' + s.units_total + ' หน่วยงาน · ผู้ประเมิน ' + s.evaluators + ' ท่าน · แบบประเมิน ' + (s.template_name || '-')),
              el('p', 'คะแนนรวม ' + (s.pct === null ? '-' : A.n2(s.pct) + '%'), 'big'),
              table(['เกณฑ์', 'เฉลี่ย'], (s.criteria || []).map(function (c) { return [c.criterion, c.avg === null ? '-' : A.n2(c.avg)]; })));
        }
        view.appendChild(sc);
      }

      var act = el('div', null, 'card'), err = el('div', null, 'ferr', { role: 'alert' });
      function decide(action, label) {
        A.askComment(label + ' — เหตุผลถึงผู้ขาย (ต้องระบุ)', function (text) {
          return callApi(action, { id: q.id, comment: text }).then(function (d) { if (!d.ok) { reportFail(d); return false; } toast('บันทึกแล้ว'); A.route(); return true; });
        });
      }
      if (q.status === 'SUBMITTED') {
        var ret = el('button', 'ส่งกลับให้แก้ไข', 'secondary', { type: 'button' }), rej = el('button', 'ไม่รับพิจารณา', 'danger', { type: 'button' }), go = el('button', 'ส่งให้หน่วยงานทดลองใช้...', '', { type: 'button' });
        ret.addEventListener('click', function () { decide('vendorx.request.return', 'ส่งกลับให้แก้ไข'); });
        rej.addEventListener('click', function () { decide('vendorx.request.reject', 'ไม่รับพิจารณา'); });
        var evalBox = el('div');
        go.addEventListener('click', function () { go.disabled = true; sendEvalForm(evalBox, q, alive); });
        add(act, el('h2', 'พัสดุพิจารณา'), el('div', 'ตรวจเอกสารแล้ว: ส่งกลับให้ผู้ขายแก้ไข · ไม่รับพิจารณา · หรือส่งให้หน่วยงานทดลองใช้ (ระบบสร้างรอบประเมินให้)', 'muted'),
            add(el('div', null, 'actions'), go, ret, rej), evalBox, err);
        view.appendChild(act);
      } else if (q.status === 'EVALUATING') {
        var ap = el('button', 'อนุมัติผล (ผู้ขายเห็นคะแนนและพิมพ์หนังสือแจ้งผลได้)', '', { type: 'button' });
        ap.addEventListener('click', function () {
          if (!window.confirm('อนุมัติผลคำขอ ' + q.req_no + '? ผู้ขายจะเห็นคะแนน ' + (s && s.pct !== null ? A.n2(s.pct) + '%' : '') + ' (ไม่เห็นชื่อหน่วยงาน) แก้ไขภายหลังไม่ได้')) return;
          guard(ap, function () { return callApi('vendorx.request.approve', { id: q.id }).then(function (d) { if (!d.ok) return failLine(err, d); toast('อนุมัติผลแล้ว'); A.route(); }); });
        });
        var stop = el('button', 'ยุติการทดลองใช้', 'danger', { type: 'button' });
        stop.addEventListener('click', function () { decide('vendorx.request.reject', 'ยุติการทดลองใช้ (เช่น พบความเสี่ยงต่อผู้ป่วย) แล้วปิดรอบประเมินที่หน้ารอบประเมิน'); });
        add(act, el('h2', 'อนุมัติผล'), el('div', 'ทำได้เมื่อปิดรอบประเมินแล้ว และมีหน่วยงานส่งผลอย่างน้อย 1 หน่วยงาน', 'muted'), add(el('div', null, 'actions'), ap, stop), err);
        view.appendChild(act);
      } else if (q.status === 'APPROVED') {
        view.appendChild(add(el('div', null, 'card'), el('div', 'อนุมัติผลแล้วเมื่อ ' + X.fmtDate(q.approved_at) + ' · ผู้ขายพิมพ์หนังสือแจ้งผลจากหน้าผู้ขายได้ (มีรหัสตรวจสอบท้ายหนังสือ)', 'muted')));
      }
    });
  }

  function sendEvalForm(box, q, alive) {
    var wait = el('div', 'กำลังโหลดแบบประเมินและหน่วยงาน...', 'muted'); box.appendChild(wait);
    Promise.all([callApi('m2.template.list'), A.loadMaster('departments'), A.loadMaster('items'), callApi('m2x.unitset.list', {})]).then(function (res) {
      if (!alive()) return; wait.remove();
      var bad = res.filter(function (r) { return !r.ok; })[0]; if (bad) { box.appendChild(el('div', X.errText(bad), 'fail')); return; }
      var templates = res[0].data, depts = res[1].data.rows.filter(function (d) { return d.is_active !== false; }), items = res[2].data.rows, sets = res[3].data;
      var f = el('fieldset', null, 'sec'), err = el('div', null, 'ferr', { role: 'alert' });
      var tpl = el('select'); tpl.appendChild(el('option', '— เลือกแบบประเมิน —', '', { value: '' }));
      templates.forEach(function (t) { tpl.appendChild(el('option', t.name + ' (' + t.criteria.length + ' ข้อ)', '', { value: t.id })); });
      var due = el('input', null, '', { type: 'date', min: M3.todayYmd() }), note = el('input', null, '', { type: 'text', maxlength: '1000' });
      var label = function (it) { return (it.code ? it.code + ' · ' : '') + it.name; }, byLabel = {}; items.forEach(function (it) { byLabel[label(it)] = it; });
      var item = el('input', null, '', { type: 'text', list: 'dl-v-item', maxlength: '300', placeholder: 'ถ้ามีในรายการวัสดุ เลือกเพื่อผูกรหัส (ไม่บังคับ)' });
      var picker = X.m3eval.unitPicker(depts, sets, [], false, function () { return q.item_name; });
      var send = el('button', 'สร้างรอบประเมินและส่งให้หน่วยงาน', '', { type: 'button' });
      add(f, el('legend', 'ส่งให้หน่วยงานทดลองใช้'), el('div', 'วัสดุ: ' + q.item_name + ' · ' + q.brand_model + ' · ผู้ขาย ' + q.company, 'muted'),
          add(el('div', null, 'row'), M3.fieldBox('แบบประเมิน *', tpl), M3.fieldBox('กำหนดส่งผลประเมิน *', due)),
          M3.fieldBox('รหัสวัสดุในระบบ', item), A.dataList('dl-v-item', items.map(label)), M3.fieldBox('หมายเหตุถึงหน่วยงาน', note),
          picker.el, err, add(el('div', null, 'actions'), send));
      box.appendChild(f);
      send.addEventListener('click', function () {
        err.textContent = '';
        var units = picker.value();
        if (!tpl.value || !due.value) { err.textContent = 'เลือกแบบประเมินและกำหนดส่งผล'; return; }
        if (!units.length) { err.textContent = 'เลือกหน่วยงานที่ทดลองใช้อย่างน้อย 1 หน่วยงาน'; return; }
        var it = byLabel[item.value.trim()];
        var p = { id: q.id, template_id: tpl.value, due_date: due.value, note: note.value.trim(), units: units }; if (it) p.item_id = it.id;
        guard(send, function () {
          return callApi('vendorx.request.send_eval', p).then(function (d) {
            if (!d.ok) return failLine(err, d);
            toast('สร้างรอบประเมินและเปิดให้หน่วยงานประเมินแล้ว'); A.route();
          });
        });
      });
    });
  }

  var at = X.pages.map(function (p) { return p.path; }).indexOf('eval');
  X.pages.splice(at < 0 ? X.pages.length : at + 1, 0,
    { path: 'vendorreqs', label: 'คำขอผู้ขาย', roles: ['OFFICER'], render: pageList },
    { path: 'vendorreq', label: 'คำขอผู้ขาย', roles: ['OFFICER'], nav: false, render: pageDetail });
});
