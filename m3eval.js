/* Menu 2 ประเมินวัสดุ ชุด 26 พ.ย. 2569 — ส่วนขยายของ app.js (แทนหน้าเดิม: ประเมินวัสดุ ใบประเมิน รอบประเมิน รายงานผล)
   - ส่งให้หน่วยงานประเมินได้ไม่จำกัด · เลือกได้ 3 แบบ: ค้นหา · ทั้งกลุ่มงาน · ทีละหน่วยงาน · ชุดหน่วยงานที่บันทึกไว้
   - หน่วยงานละ 3 ท่าน ท่านละ 1 ใบ · บัญชีเดียวกรอกพร้อมกันหลายเครื่องได้ · คะแนนอย่างเดียว ไม่มีผ่าน/ไม่ผ่าน ไม่มีระดับ
   - ข้อมูลจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น */
(window.MEDSUP_PLUGINS = window.MEDSUP_PLUGINS || []).push(function (X) {
  'use strict';
  var el = X.el, add = X.add, clear = X.clear, callApi = X.callApi, guard = X.guard, toast = X.toast, reportFail = X.reportFail, A = X.app;
  if (!A) return;   // app.js ยังไม่ได้แก้ด้วย patch-m3.js
  ['m2x.unitset.save'].forEach(function (a) { X.WRITE_ACTIONS.push(a); });
  Object.assign(X.FIELD_MSG, { duplicate: 'ซ้ำกับที่มีอยู่แล้ว' });
  Object.assign(X.FIELD_LABEL, { evaluator_name: 'ชื่อผู้ประเมิน', evaluator_position: 'ตำแหน่ง', department_ids: 'หน่วยงาน' });

  function pct(x) { return typeof x === 'number' ? x.toFixed(2) : '-'; }
  function C() { return A.consts(); }
  function lstore(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem('medsup.' + k) || 'null');
      if (v === null) localStorage.removeItem('medsup.' + k); else localStorage.setItem('medsup.' + k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function sameName(a, b) { return String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase(); }
  function groupOf(name) { var m = /^(.*?)\s*\(/.exec(name || ''); return m && m[1] ? m[1].trim() : 'หน่วยงานอื่น'; }
  function replacePage(path, render) { X.pages.forEach(function (p) { if (p.path === path) p.render = render; }); }

  /* ---------- หน้าเมนูประเมินวัสดุ ---------- */
  function pageEval(view, args, alive) {
    var top = X.pageTitle(view, 'ประเมินวัสดุ');
    if (X.hasRole('OFFICER')) add(top, add(el('div', null, 'actions'), el('a', '+ สร้างรอบประเมิน', 'btn', { href: '#/round/new' }),
      el('a', 'ผลประเมินย้อนหลัง', 'btn secondary', { href: '#/evalresults' }), el('a', 'แบบประเมิน', 'btn secondary', { href: '#/templates' })));
    var tc = add(el('div', null, 'card'), el('h2', 'งานประเมินของหน่วยงาน')), tbox = el('div', 'กำลังโหลด...', 'muted');
    tc.appendChild(tbox); view.appendChild(tc);
    var me = X.me();
    if (!me.department_id) { tbox.textContent = ''; add(tbox, document.createTextNode('ยังไม่ได้เลือกหน่วยงาน — '), el('a', 'เลือกที่ข้อมูลของฉัน', '', { href: '#/me' })); }
    else callApi('m2.tasks').then(function (r) {
      if (!alive()) return; clear(tbox); tbox.className = '';
      if (!r.ok) { add(tbox, el('span', X.errText(r), 'fail')); return; }
      if (!r.data.length) { add(tbox, el('div', 'ไม่มีงานประเมินค้าง', 'muted')); return; }
      var ul = el('ul', null, 'tasklist');
      r.data.forEach(function (t) {
        var a = el('a', null, 'task', { href: '#/evalform/' + encodeURIComponent(t.assignment_id) }), max = t.max_evaluators || 3;
        var state = t.submitted_at ? el('span', 'ครบ ' + max + ' ท่านแล้ว', 'chip ok') : t.overdue ? el('span', 'เลยกำหนด · ' + t.evaluated + '/' + max, 'chip bad') : el('span', 'ประเมินแล้ว ' + t.evaluated + '/' + max + ' ท่าน', 'chip');
        add(a, add(el('div', null, 'task-main'), el('b', t.item_name), el('span', ' · ' + (t.product_name || t.vendor_text || ''), 'muted')),
            add(el('div', null, 'task-meta'), state, el('span', ' ภายใน ' + A.thaiDate(t.due_date), 'muted')));
        ul.appendChild(add(el('li'), a));
      });
      tbox.appendChild(ul);
    });
    if (!X.hasRole('OFFICER')) return;
    var rc = add(el('div', null, 'card'), el('h2', 'รอบประเมิน')), rbox = el('div', 'กำลังโหลด...', 'muted');
    rc.appendChild(rbox); view.appendChild(rc);
    callApi('documents.list', { module: 'M2', page_size: 50 }).then(function (r) {
      if (!alive()) return; clear(rbox); rbox.className = '';
      if (!r.ok) { add(rbox, el('span', X.errText(r), 'fail')); return; }
      if (!r.data.rows.length) { add(rbox, el('div', 'ยังไม่มีรอบประเมิน', 'muted')); return; }
      rbox.appendChild(A.docTable(r.data.rows));
    });
  }

  /* ---------- ใบประเมิน (หน่วยงานละ 3 ท่าน) ---------- */
  function pageEvalForm(view, args, alive) {
    var id = decodeURIComponent(args[0] || ''), box = X.loading(view);
    callApi('m2.assignment.get', { assignment_id: id }).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { A.errLine(view, r); return; }
      var g = r.data, max = g.max_evaluators || 3;
      var head = add(el('div', null, 'card'), el('h1', 'แบบประเมิน ' + g.item_name), el('div', g.template_name || '', 'muted'));
      var kv = el('dl', null, 'kv');
      add(kv, el('dt', 'รหัสและชื่อวัสดุ'), el('dd', (g.item_code ? g.item_code + ' ' : '') + g.item_name),
          el('dt', 'ชื่อผลิตภัณฑ์'), el('dd', g.product_name || '-'), el('dt', 'ผู้ขาย'), el('dd', g.vendor_text || '-'),
          el('dt', 'หน่วยงาน'), el('dd', g.department_name + (g.qty ? ' · ตัวอย่าง ' + g.qty : '')),
          el('dt', 'กำหนดส่ง'), add(el('dd'), document.createTextNode(A.thaiDate(g.due_date) + ' '), g.can_submit && g.due_date && g.due_date < g.today ? el('span', 'เลยกำหนด', 'chip bad') : null));
      add(head, kv, add(el('div', null, 'actions'), el('a', '← ประเมินวัสดุ', '', { href: '#/eval' })));
      view.appendChild(head);

      var who = add(el('div', null, 'card'), el('h2', 'ผู้ประเมินของหน่วยงาน (' + g.evaluators.length + '/' + max + ' ท่าน)'));
      if (g.evaluators.length) {
        var ol = el('ol', null, 'steps');
        g.evaluators.forEach(function (e) { ol.appendChild(el('li', e.name + ' · ' + e.position + ' · ส่งเมื่อ ' + X.fmtDate(e.submitted_at) + (e.on_behalf ? ' (พัสดุบันทึกแทน)' : ''))); });
        who.appendChild(ol);
      } else who.appendChild(el('div', 'ยังไม่มีผู้ประเมิน', 'muted'));
      who.appendChild(el('div', 'หน่วยงานละ ' + max + ' ท่าน ท่านละ 1 ใบ · ใช้บัญชีหน่วยงานเดียวกันกรอกพร้อมกันหลายเครื่องได้ · ชื่อซ้ำส่งไม่ได้ · ครบ ' + max + ' ท่านระบบปิดรับ', 'muted'));
      view.appendChild(who);

      if (g.responses) g.responses.forEach(function (x) { view.appendChild(responseCard(g, x)); });
      if (g.unit_score && g.unit_score.n) view.appendChild(el('div', 'คะแนนของหน่วยงาน (เฉลี่ยร้อยละของ ' + g.unit_score.n + ' ท่าน): ' + pct(g.unit_score.pct), 'card score-line'));
      if (!g.can_submit) {
        if (g.evaluators.length < max) view.appendChild(el('div', g.moved_in_after_open ? 'คุณเลือกหน่วยงานนี้หลังรอบเปิด ให้คนเดิมของหน่วยงานประเมิน หรือแจ้งพัสดุ'
                                                         : g.status === 'OPEN' ? 'ยังส่งใบนี้ไม่ได้' : 'รอบนี้ปิดแล้ว', 'card notice'));
        return;
      }
      view.appendChild(scoreForm(g));
    });
  }

  function responseCard(g, x) {
    var S = C().M2_SCALE, c = add(el('div', null, 'card reply'), el('h2', x.evaluator_name + ' · ' + x.evaluator_position));
    var t = el('table'), tb = el('tbody');
    add(t, add(el('thead'), add(el('tr'), el('th', 'หัวข้อ'), el('th', 'คะแนน'))));
    g.criteria.forEach(function (q, i) { var s = x.scores[i]; add(tb, add(el('tr'), el('td', (i + 1) + '. ' + q), el('td', typeof s === 'number' ? s + ' · ' + S[5 - s][1] : 'ไม่ได้ใช้'))); });
    add(t, tb);
    add(c, add(el('div', null, 'scroll'), t),
        el('p', 'รวม ' + x.score.sum + ' คะแนน จาก ' + x.score.n + ' ข้อ · เฉลี่ย ' + pct(x.score.avg) + ' · ร้อยละ ' + pct(x.score.pct), 'score-line'),
        x.suggestion ? add(el('div'), el('b', 'ข้อเสนอแนะ'), el('div', x.suggestion, 'pre')) : null,
        el('div', 'ส่งเมื่อ ' + X.fmtDate(x.submitted_at) + (x.on_behalf ? ' (พัสดุบันทึกแทน)' : ''), 'muted'));
    if (X.hasRole('OFFICER') && g.status === 'OPEN') {
      var re = el('button', 'ให้ส่งใหม่ (ใบนี้ไม่นับ)', 'secondary', { type: 'button' });
      re.addEventListener('click', function () {
        A.askComment('เหตุผลที่ให้ส่งใหม่', function (text) {
          return callApi('m2.response.reopen', { response_id: x.id, comment: text }).then(function (r) {
            if (!r.ok) { reportFail(r); return false; }
            toast('เปิดให้ส่งใหม่แล้ว'); A.route(); return true;
          });
        });
      });
      add(c, add(el('div', null, 'actions'), re));
    }
    return c;
  }

  function scoreForm(g) {
    var S = C().M2_SCALE, me = X.me(), key = 'm2form:' + g.assignment_id, saved = lstore(key) || {};
    var form = el('form', null, 'card scoreform', { novalidate: 'novalidate', autocomplete: 'off' }), picks = saved.picks || {}, errs = [];
    var summary = el('p', null, 'score-line', { 'aria-live': 'polite' });
    add(form, el('h2', 'ใบประเมินท่านที่ ' + (g.evaluators.length + 1)));
    if (g.on_behalf) form.appendChild(el('div', 'คุณกำลังบันทึกแทนหน่วยงาน ' + g.department_name + ' กรอกชื่อผู้ประเมินตามใบที่ได้รับ', 'notice'));
    function persist() { lstore(key, { picks: picks, suggestion: sug.value, name: nm.value, pos: ps.value }); }
    function current() {
      var vals = g.criteria.map(function (q, i) { return picks[i] === 'na' ? null : (typeof picks[i] === 'number' ? picks[i] : undefined); });
      var nums = vals.filter(function (v) { return typeof v === 'number'; }), sum = nums.reduce(function (a, b) { return a + b; }, 0);
      summary.textContent = 'ตอบแล้ว ' + vals.filter(function (v) { return v !== undefined; }).length + '/' + g.criteria.length + ' ข้อ' + (nums.length ? ' · ร้อยละ ' + (Math.round(sum / (5 * nums.length) * 10000 + 1e-9) / 100).toFixed(2) : '');
      return vals;
    }
    g.criteria.forEach(function (q, i) {
      var fs = el('fieldset', null, 'crit'), row = el('div', null, 'scale'), er = el('div', null, 'ferr');
      errs.push(er);
      S.concat([['na', 'ไม่ได้ใช้']]).forEach(function (opt) {
        var lab = el('label', null, 'pick' + (opt[0] === 'na' ? ' na' : '')), inp = el('input', null, '', { type: 'radio', name: 'c' + i, value: String(opt[0]) });
        if (picks[i] === opt[0]) inp.checked = true;
        inp.addEventListener('change', function () { picks[i] = opt[0]; er.textContent = ''; current(); persist(); });
        add(lab, inp, el('span', opt[0] === 'na' ? opt[1] : opt[0] + ' ' + opt[1])); row.appendChild(lab);
      });
      add(fs, el('legend', (i + 1) + '. ' + q), row, er); form.appendChild(fs);
    });
    var sug = el('textarea', null, '', { maxlength: '3000', rows: '3', id: 'm2-sug' }); sug.value = saved.suggestion || '';
    var nm = el('input', null, '', { type: 'text', maxlength: '200', id: 'm2-name', autocomplete: 'name' }), ps = el('input', null, '', { type: 'text', maxlength: '200', id: 'm2-pos', list: 'dl-m2-pos' });
    // บัญชีหน่วยงาน (ใช้ร่วมกัน) ไม่เติมชื่อบัญชีให้ ต้องพิมพ์ชื่อผู้ประเมินเอง
    var shared = /@unit\.medsup\.local$/.test(me.email || '');
    nm.value = saved.name || (g.on_behalf || shared || g.evaluators.some(function (e) { return sameName(e.name, me.full_name); }) ? '' : me.full_name || '');
    ps.value = saved.pos || (g.on_behalf || shared ? '' : me.position || '');
    var nmErr = el('div', null, 'ferr'), psErr = el('div', null, 'ferr');
    [sug, nm, ps].forEach(function (t) { t.addEventListener('input', function () { persist(); nmErr.textContent = ''; psErr.textContent = ''; }); });
    add(form, add(el('div', null, 'f'), el('label', 'ข้อเสนอแนะ (ถ้ามี)', '', { for: 'm2-sug' }), sug),
        add(el('div', null, 'row'), add(el('div'), el('label', 'ชื่อผู้ประเมิน *', '', { for: 'm2-name' }), nm, nmErr), add(el('div'), el('label', 'ตำแหน่ง *', '', { for: 'm2-pos' }), ps, psErr)),
        A.dataList('dl-m2-pos', C().POSITIONS), summary);
    var send = el('button', 'ส่งผลประเมิน', '', { type: 'submit' }), rid = null, sig = null;
    add(form, add(el('div', null, 'actions'), send));
    current();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var vals = current(), first = -1;
      vals.forEach(function (v, i) { errs[i].textContent = v === undefined ? 'ยังไม่ได้เลือก' : ''; if (v === undefined && first < 0) first = i; });
      if (first < 0 && !vals.some(function (v) { return typeof v === 'number'; })) { errs[0].textContent = 'ต้องให้คะแนนอย่างน้อย 1 ข้อ'; first = 0; }
      nmErr.textContent = !nm.value.trim() ? 'ต้องกรอก' : g.evaluators.some(function (e) { return sameName(e.name, nm.value); }) ? 'ชื่อนี้ประเมินรายการนี้แล้ว' : '';
      psErr.textContent = ps.value.trim() ? '' : 'ต้องกรอก';
      if (first >= 0) { form.querySelectorAll('fieldset.crit')[first].scrollIntoView({ block: 'center' }); return; }
      if (nmErr.textContent || psErr.textContent) { nm.focus(); return; }
      if (!window.confirm('ส่งผลประเมินของ ' + nm.value.trim() + '? ส่งแล้วแก้เองไม่ได้ (ถ้าผิด แจ้งพัสดุให้เปิดส่งใหม่)')) return;
      var payload = { assignment_id: g.assignment_id, scores: vals, suggestion: sug.value.trim(), evaluator_name: nm.value.trim(), evaluator_position: ps.value.trim() };
      var s = JSON.stringify(payload); if (s !== sig) { sig = s; rid = A.newRequestId(); }   // กดซ้ำหลังเน็ตหลุด = คำขอเดิม ไม่เกิดใบซ้ำ
      guard(send, function () {
        return callApi('m2.response.submit', payload, { requestId: rid }).then(function (r) {
          if (!r.ok) {
            if (r.code === 'DUPLICATE') { toast('หน่วยงานนี้ครบ 3 ท่านแล้ว (มีเครื่องอื่นส่งก่อน)', true); lstore(key, null); A.route(); return; }
            if (r.fields && r.fields.evaluator_name === 'duplicate') { nmErr.textContent = 'ชื่อนี้ประเมินรายการนี้แล้ว'; nm.focus(); }
            reportFail(r); return;
          }
          lstore(key, null);
          toast('ส่งผลประเมินแล้ว (' + r.data.evaluated + '/' + r.data.max_evaluators + ' ท่าน)'); A.route();
        });
      });
    });
    return form;
  }

  /* ---------- เลือกหน่วยงาน (ค้นหา · ทั้งกลุ่มงาน · ทีละหน่วยงาน · ชุดหน่วยงาน) ---------- */
  function unitPicker(depts, sets, initial, locked, itemNameOf) {
    var sel = {}, order = [];   // department_id → { qty input }
    var box = el('div', null, 'unitpick'), chips = el('div', null, 'chips'), count = el('span', null, 'muted');
    var deptById = {}; depts.forEach(function (d) { deptById[d.id] = d; });
    function setQty(id, q) { if (sel[id]) sel[id].qty.value = q === null || q === undefined ? '' : String(q); }
    function addUnit(id) {
      if (sel[id] || !deptById[id]) return;
      var qty = el('input', null, '', { type: 'number', min: '0', step: '1', placeholder: 'จำนวน', 'aria-label': 'จำนวนตัวอย่าง ' + deptById[id].name, class: 'qty' });
      var rm = el('button', '×', 'chip-x', { type: 'button', 'aria-label': 'เอาออก ' + deptById[id].name });
      var chip = add(el('span', null, 'chip unit'), el('span', deptById[id].name), qty, locked ? null : rm);
      rm.addEventListener('click', function () { removeUnit(id); syncChecks(); });
      if (locked) qty.disabled = true;
      sel[id] = { qty: qty, chip: chip }; order.push(id); chips.appendChild(chip); upd();
    }
    function removeUnit(id) { if (!sel[id]) return; sel[id].chip.remove(); delete sel[id]; order.splice(order.indexOf(id), 1); upd(); }
    function upd() { count.textContent = 'เลือกแล้ว ' + order.length + ' หน่วยงาน'; }
    (initial || []).forEach(function (u) { addUnit(u.department_id); setQty(u.department_id, u.qty); });

    add(box, add(el('div', null, 'unit-head'), el('b', 'ส่งให้หน่วยงานประเมิน'), count), chips);
    if (locked) { upd(); return { el: box, value: value }; }

    var panel = el('div', null, 'unit-panel hidden'), toggle = el('button', '+ เลือกหน่วยงาน', 'secondary small', { type: 'button' });
    var setSel = el('select', null, '', { 'aria-label': 'ชุดหน่วยงาน' }), useSet = el('button', 'ใช้ชุดนี้', 'secondary small', { type: 'button' }), saveSet = el('button', 'บันทึกเป็นชุดหน่วยงาน', 'secondary small', { type: 'button' });
    function fillSets() {
      clear(setSel); add(setSel, el('option', sets.length ? '— ชุดหน่วยงาน —' : '(ยังไม่มีชุดหน่วยงาน)', '', { value: '' }));
      var nm = (itemNameOf() || '').toLowerCase();
      sets.forEach(function (s) {
        var hit = s.item_hint && nm && (nm.indexOf(s.item_hint.toLowerCase()) >= 0 || s.item_hint.toLowerCase().indexOf(nm) >= 0);
        setSel.appendChild(el('option', (hit ? '★ แนะนำ · ' : '') + s.name + ' (' + s.department_ids.length + ')', '', { value: s.id }));
      });
    }
    fillSets();
    useSet.addEventListener('click', function () {
      var s = sets.filter(function (x) { return x.id === setSel.value; })[0]; if (!s) return;
      s.department_ids.forEach(addUnit); syncChecks(); toast('เพิ่มหน่วยงานจากชุด "' + s.name + '" แล้ว');
    });
    saveSet.addEventListener('click', function () {
      if (!order.length) { toast('ยังไม่ได้เลือกหน่วยงาน', true); return; }
      A.askComment('ชื่อชุดหน่วยงาน (เช่น ศัลยกรรม ใช้ประเมินผ้าก๊อซ)', function (text) {
        var name = text.split('\n')[0].trim().slice(0, 200);
        return callApi('m2x.unitset.save', { name: name, item_hint: (itemNameOf() || '').slice(0, 300), department_ids: order.slice() }).then(function (r) {
          if (!r.ok) { reportFail(r); return false; }
          return callApi('m2x.unitset.list', {}).then(function (l) { if (l.ok) { sets.length = 0; l.data.forEach(function (x) { sets.push(x); }); fillSets(); } toast('บันทึกชุดหน่วยงานแล้ว'); return true; });
        });
      });
    });
    var q = el('input', null, '', { type: 'search', placeholder: 'ค้นหาหน่วยงาน', 'aria-label': 'ค้นหาหน่วยงาน' }), list = el('div', null, 'unit-list'), checks = {};
    var groups = {}; depts.forEach(function (d) { (groups[groupOf(d.name)] = groups[groupOf(d.name)] || []).push(d); });
    Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'th'); }).forEach(function (gname) {
      var gbox = el('div', null, 'unit-group'), gc = el('input', null, '', { type: 'checkbox' });
      var glab = add(el('label', null, 'check group'), gc, el('b', ' ' + gname + ' (' + groups[gname].length + ')'));
      gc.addEventListener('change', function () { groups[gname].forEach(function (d) { if (gc.checked) addUnit(d.id); else removeUnit(d.id); }); syncChecks(); });
      gbox.appendChild(glab);
      groups[gname].sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); }).forEach(function (d) {
        var c = el('input', null, '', { type: 'checkbox' }), l = add(el('label', null, 'check'), c, document.createTextNode(' ' + d.name));
        c.addEventListener('change', function () { if (c.checked) addUnit(d.id); else removeUnit(d.id); syncChecks(); });
        checks[d.id] = { box: c, label: l, name: d.name.toLowerCase() }; gbox.appendChild(l);
      });
      gbox.gc = gc; gbox.members = groups[gname]; list.appendChild(gbox);
    });
    function syncChecks() {
      Object.keys(checks).forEach(function (id) { checks[id].box.checked = !!sel[id]; });
      [].forEach.call(list.children, function (g) { var n = g.members.filter(function (d) { return sel[d.id]; }).length; g.gc.checked = n === g.members.length; g.gc.indeterminate = n > 0 && n < g.members.length; });
    }
    q.addEventListener('input', function () {
      var k = q.value.trim().toLowerCase();
      Object.keys(checks).forEach(function (id) { checks[id].label.style.display = !k || checks[id].name.indexOf(k) >= 0 ? '' : 'none'; });
      [].forEach.call(list.children, function (g) { g.style.display = !k || g.members.some(function (d) { return d.name.toLowerCase().indexOf(k) >= 0; }) ? '' : 'none'; });
    });
    toggle.addEventListener('click', function () { panel.classList.toggle('hidden'); toggle.textContent = panel.classList.contains('hidden') ? '+ เลือกหน่วยงาน' : 'ปิดรายการหน่วยงาน'; if (!panel.classList.contains('hidden')) q.focus(); });
    add(panel, q, list);
    add(box, add(el('div', null, 'actions'), toggle, setSel, useSet, saveSet), panel);
    syncChecks(); upd();
    function value() { return order.map(function (id) { var v = sel[id].qty.value; return { department_id: id, qty: v === '' ? null : Number(v) }; }); }
    return { el: box, value: value };
  }

  /* ---------- สร้าง/แก้รอบประเมิน ---------- */
  function pageRoundEdit(view, args, alive) {
    var docId = args[0] && args[0] !== 'new' ? decodeURIComponent(args[0]) : null;
    X.pageTitle(view, docId ? 'แก้ไขรอบประเมิน' : 'สร้างรอบประเมิน', 'ส่งให้หน่วยงานประเมินได้ไม่จำกัด หน่วยงานละ 3 ท่าน');
    var box = X.loading(view);
    var loads = [callApi('m2.template.list'), A.loadMaster('departments'), A.loadMaster('items'), A.loadMaster('vendors'), callApi('m2x.unitset.list', {})];
    if (docId) loads.push(callApi('documents.get', { id: docId }));
    Promise.all(loads).then(function (res) {
      if (!alive()) return; box.remove();
      var bad = res.filter(function (r) { return !r.ok; })[0]; if (bad) { A.errLine(view, bad); return; }
      roundForm(view, res[0].data, res[1].data.rows.filter(function (x) { return x.is_active !== false; }), res[2].data.rows, res[3].data.rows, res[4].data, docId ? res[5].data : null);
    });
  }

  function roundForm(view, templates, depts, items, vendors, sets, data) {
    var md = data ? data.module_data : null, d = data ? data.document : null, locked = !!(d && d.status !== 'DRAFT'), R = C().M2_REASON;
    var itemByLabel = {}, itemById = {}, vendorByName = {};
    function itemLabel(it) { return it.name + ' · ' + it.code; }
    items.forEach(function (it) { itemByLabel[itemLabel(it)] = it; itemById[it.id] = it; });
    vendors.forEach(function (v) { vendorByName[v.name] = v; });
    var form = el('form', null, 'card m1form roundform', { novalidate: 'novalidate', autocomplete: 'off' }), fieldErr = {};
    function errBox(k) { return (fieldErr[k] = el('div', null, 'ferr')); }
    var due = el('input', null, '', { type: 'date', id: 'r-due', min: A.todayYmd() }); due.value = md ? md.due_date || '' : '';
    var note = el('textarea', null, '', { rows: '2', maxlength: '1000', id: 'r-note' }); note.value = md ? md.note || '' : '';
    add(form, add(el('div', null, 'row'), add(el('div'), el('label', 'กำหนดส่งผลประเมิน *', '', { for: 'r-due' }), due, errBox('due_date')),
                   add(el('div'), el('label', 'หมายเหตุ', '', { for: 'r-note' }), note)),
        A.dataList('dl-r-item', items.map(itemLabel)), A.dataList('dl-r-vendor', vendors.map(function (v) { return v.name; })));
    var list = el('div'), cards = []; form.appendChild(list);

    function itemCard(src) {
      var c = { id: src ? src.id : null, errs: {} }, card = el('fieldset', null, 'sec itemcard'), legend = el('legend', '');
      card.appendChild(legend);
      c.item = el('input', null, '', { type: 'text', list: 'dl-r-item', maxlength: '300', placeholder: 'พิมพ์ชื่อหรือรหัสแล้วเลือก (ไม่มีในรายการ พิมพ์เองได้)' });
      c.vendor = el('input', null, '', { type: 'text', list: 'dl-r-vendor', maxlength: '300' });
      c.product = el('input', null, '', { type: 'text', maxlength: '300' });
      c.reason = el('select'); Object.keys(R).forEach(function (k) { c.reason.appendChild(el('option', R[k], '', { value: k })); });
      c.tpl = el('select'); c.tpl.appendChild(el('option', '— เลือกแบบประเมิน —', '', { value: '' }));
      templates.forEach(function (t) { c.tpl.appendChild(el('option', t.name + ' (' + t.criteria.length + ' ข้อ)', '', { value: t.id })); });
      c.fda = el('input', null, '', { type: 'checkbox' });
      if (src) {
        var it = src.item_id ? itemById[src.item_id] : null;
        c.item.value = it && it.name === src.item_name ? itemLabel(it) : src.item_name;
        c.orig = { itemText: c.item.value, item_id: src.item_id, item_name: src.item_name, vendorText: src.vendor_text || '', vendor_id: src.vendor_id };
        c.vendor.value = src.vendor_text || ''; c.product.value = src.product_name || ''; c.reason.value = src.reason; c.tpl.value = src.template_id; c.fda.checked = !!src.fda_ok;
      }
      c.item.addEventListener('change', function () {
        var it = itemByLabel[c.item.value.trim()]; if (!it || c.tpl.value) return;
        var t = templates.filter(function (x) { return x.item_code && x.item_code === it.code; })[0]; if (t) c.tpl.value = t.id;
      });
      c.picker = unitPicker(depts, sets, src ? src.units : [], locked, function () { return c.item.value.split(' · ')[0]; });
      var rmItem = el('button', 'เอารายการนี้ออก', 'danger small', { type: 'button' });
      rmItem.addEventListener('click', function () { if (!window.confirm('เอารายการนี้ออก?')) return; cards.splice(cards.indexOf(c), 1); card.remove(); renumber(); });
      function f(label, input, key, req) { c.errs[key] = el('div', null, 'ferr'); return add(el('div', null, 'f'), add(el('label', label + (req ? ' *' : '')), input), c.errs[key]); }
      add(card, f('วัสดุการแพทย์', c.item, 'item_name', true), add(el('div', null, 'row'), f('ผู้ขาย', c.vendor, 'vendor_text', true), f('ชื่อผลิตภัณฑ์/ยี่ห้อ', c.product, 'product_name')),
          add(el('div', null, 'row'), f('เหตุที่ประเมิน', c.reason, 'reason', true), f('แบบประเมิน', c.tpl, 'template_id', true)),
          add(el('label', null, 'check'), c.fda, document.createTextNode(' ตรวจเลขทะเบียน อย. / เอกสารรับรองความปลอดภัยของตัวอย่างแล้ว')),
          c.picker.el, c.errs.units = el('div', null, 'ferr'), locked ? null : add(el('div', null, 'actions'), rmItem));
      if (locked) [c.item, c.vendor, c.product, c.reason, c.tpl, c.fda].forEach(function (x) { x.disabled = true; });
      c.legend = legend; list.appendChild(card); cards.push(c); renumber();
    }
    function renumber() { cards.forEach(function (c, i) { c.legend.textContent = 'รายการที่ ' + (i + 1); }); }
    (md && md.items.length ? md.items : [null]).forEach(itemCard);
    var addItem = el('button', '+ เพิ่มรายการ', 'secondary', { type: 'button' });
    addItem.addEventListener('click', function () { itemCard(null); cards[cards.length - 1].item.focus(); });
    if (!locked) form.appendChild(add(el('div', null, 'actions'), addItem));
    else form.appendChild(el('div', 'รอบนี้เปิดให้หน่วยงานประเมินแล้ว แก้ได้เฉพาะกำหนดส่งและหมายเหตุ', 'notice'));
    var save = el('button', locked ? 'บันทึก' : 'บันทึกร่าง', locked ? '' : 'secondary', { type: 'button' }), open = el('button', 'บันทึกและส่งให้หน่วยงานประเมิน', '', { type: 'button' });
    form.appendChild(add(el('div', null, 'actions'), locked ? null : open, save, el('a', 'ยกเลิก', '', { href: d ? '#/documents/' + encodeURIComponent(d.id) : '#/eval' })));
    form.addEventListener('submit', function (ev) { ev.preventDefault(); });
    view.appendChild(form);

    var st = { docId: d ? d.id : null, version: d ? d.version : null, rid: null, sig: null };
    function payload() {
      var p = { due_date: due.value || '', note: note.value.trim() };
      if (st.docId) { p.document_id = st.docId; p.version = st.version; }
      if (!locked) p.items = cards.map(function (c) {
        var it = itemByLabel[c.item.value.trim()], v = vendorByName[c.vendor.value.trim()], o = c.orig || {};
        var keepItem = !it && o.item_id && c.item.value === o.itemText, keepVendor = !v && o.vendor_id && c.vendor.value.trim() === o.vendorText;
        var x = { item_id: it ? it.id : keepItem ? o.item_id : '', item_name: it ? it.name : keepItem ? o.item_name : c.item.value.trim(),
                  vendor_id: v ? v.id : keepVendor ? o.vendor_id : '', vendor_text: c.vendor.value.trim(),
                  product_name: c.product.value.trim(), reason: c.reason.value, template_id: c.tpl.value, fda_ok: c.fda.checked, units: c.picker.value() };
        if (c.id) x.id = c.id;
        return x;
      });
      return p;
    }
    function clearErrs() { Object.keys(fieldErr).forEach(function (k) { fieldErr[k].textContent = ''; }); cards.forEach(function (c) { Object.keys(c.errs).forEach(function (k) { c.errs[k].textContent = ''; }); }); }
    function showErrs(fields) {
      Object.keys(fields || {}).forEach(function (k) {
        var m = /^items\.(\d+)(?:\.(\w+))?(?:\.(\d+))?$/.exec(k), text = A.fieldText(fields[k]);
        if (!m) { if (fieldErr[k]) fieldErr[k].textContent = text; return; }
        var c = cards[+m[1]]; if (!c) return;
        var key = m[2] === 'item_id' ? 'item_name' : m[2] === 'vendor_id' ? 'vendor_text' : m[2];
        if (c.errs[key]) c.errs[key].textContent = (m[3] !== undefined ? 'หน่วยงานลำดับที่ ' + (+m[3] + 1) + ': ' : '') + text;
      });
      var first = form.querySelector('.ferr:not(:empty)'); if (first) first.scrollIntoView({ block: 'center' });
    }
    function localCheck(p) {
      var e = {};
      if (!p.due_date) e.due_date = 'required';
      (p.items || []).forEach(function (it, i) {
        if (!it.item_name) e['items.' + i + '.item_name'] = 'required';
        if (!it.vendor_text) e['items.' + i + '.vendor_text'] = 'required';
        if (!it.template_id) e['items.' + i + '.template_id'] = 'required';
        if (!it.units.length) e['items.' + i + '.units'] = 'required';
        it.units.forEach(function (u, j) { if (u.qty !== null && (!isFinite(u.qty) || u.qty < 0 || Math.floor(u.qty) !== u.qty)) e['items.' + i + '.units.' + j] = 'invalid_qty'; });
      });
      return e;
    }
    function doSave(thenOpen) {
      clearErrs();
      var p = payload(), e = localCheck(p);
      if (Object.keys(e).length) { showErrs(e); return Promise.resolve(); }
      var s = JSON.stringify(p); if (s !== st.sig) { st.sig = s; st.rid = A.newRequestId(); }
      return callApi('m2.save', p, { requestId: st.rid }).then(function (r) {
        if (!r.ok) { if (r.fields) showErrs(r.fields); reportFail(r); return; }
        st.docId = r.data.document_id; st.version = r.data.doc_version; st.sig = null;
        if (!thenOpen) { toast('บันทึกแล้ว'); location.hash = '#/documents/' + encodeURIComponent(st.docId); return; }
        return callApi('workflow.transition', { document_id: st.docId, action: 'OPEN', version: st.version }).then(function (t) {
          if (!t.ok) { if (t.fields) showErrs(t.fields); reportFail(t); location.hash = '#/round/' + encodeURIComponent(st.docId); return; }
          toast('ส่งให้หน่วยงานประเมินแล้ว · ' + t.data.document.doc_no); location.hash = '#/documents/' + encodeURIComponent(st.docId);
        });
      });
    }
    save.addEventListener('click', function () { guard(save, function () { return doSave(false); }); });
    open.addEventListener('click', function () {
      var n = cards.reduce(function (a, c) { return a + c.picker.value().length; }, 0);
      if (!window.confirm('ส่งให้หน่วยงานประเมิน ' + n + ' หน่วยงาน? หลังส่งแก้รายการ/หน่วยงานไม่ได้ (เลื่อนกำหนดส่งได้)')) return;
      guard(open, function () { return doSave(true); });
    });
  }

  /* ---------- หน้าเอกสารรอบประเมิน (พัสดุ) ---------- */
  function roundBody(view, d, md) {
    var R = C().M2_REASON, max = md.max_evaluators || 3;
    var sum = add(el('div', null, 'card doc-part'), el('h2', 'ความคืบหน้า')), kv = el('dl', null, 'kv');
    add(kv, el('dt', 'กำหนดส่ง'), el('dd', A.thaiDate(md.due_date) || '-'), el('dt', 'ส่งผลแล้ว'), el('dd', md.sent + ' จาก ' + md.total + ' หน่วยงาน (ครบ ' + max + ' ท่าน ' + md.complete + ' หน่วยงาน)'));
    if (md.note) add(kv, el('dt', 'หมายเหตุ'), el('dd', md.note));
    sum.appendChild(kv);
    if (md.total) { var bar = el('div', null, 'bar'), fill = el('i'); fill.style.width = Math.round(md.sent / md.total * 100) + '%'; bar.appendChild(fill); sum.appendChild(bar); }
    if (md.can_edit_due) sum.appendChild(add(el('div', null, 'actions'), el('a', md.can_edit ? 'แก้ไขรอบ' : 'เลื่อนกำหนดส่ง', 'btn secondary', { href: '#/round/' + encodeURIComponent(d.id) })));
    view.appendChild(sum);
    md.items.forEach(function (it, i) {
      var c = add(el('div', null, 'card doc-part'), el('h2', (i + 1) + '. ' + it.item_name + (it.item_code ? ' · ' + it.item_code : '')),
                  el('div', [it.product_name, it.vendor_text, R[it.reason], 'แบบ: ' + it.template_name].filter(Boolean).join(' · '), 'muted'));
      if (!it.fda_ok) c.appendChild(el('div', 'ยังไม่ได้ยืนยันเลขทะเบียน อย. / เอกสารรับรองความปลอดภัยของตัวอย่าง', 'note-warn'));
      var t = el('table', null, 'stack'), heads = ['หน่วยงาน', 'จำนวน', 'ผู้ประเมิน', 'คะแนน (ร้อยละ)', ''], hr = el('tr');
      heads.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      it.units.forEach(function (u) {
        var state = u.evaluated >= max ? el('span', u.evaluated + '/' + max, 'chip ok') : u.overdue ? el('span', 'เลยกำหนด ' + u.evaluated + '/' + max, 'chip bad') : el('span', u.evaluated + '/' + max, 'chip');
        var link = u.evaluated || d.status === 'OPEN' ? el('a', d.status === 'OPEN' && u.evaluated < max ? 'ดู/บันทึกแทน' : 'ดูใบ', '', { href: '#/evalform/' + encodeURIComponent(u.assignment_id) }) : null;
        var tr = add(el('tr'), el('td', u.department_name), el('td', u.qty === null ? '-' : String(u.qty)), add(el('td'), state), el('td', u.score && u.score.n ? pct(u.score.pct) : '-'), add(el('td'), link));
        [].forEach.call(tr.children, function (td, k) { if (heads[k]) td.setAttribute('data-label', heads[k]); });
        tb.appendChild(tr);
      });
      add(t, tb); c.appendChild(add(el('div', null, 'scroll'), t));
      c.appendChild(el('p', it.overall.units ? 'คะแนนรวม (เฉลี่ยร้อยละของ ' + it.overall.units + ' หน่วยงาน): ' + pct(it.overall.pct) : 'ยังไม่มีผล', 'score-line'));
      if (d.doc_no && d.status !== 'CANCELLED') c.appendChild(add(el('div', null, 'actions'), el('a', 'พิมพ์รายงานผล / PDF', 'btn secondary', { href: '#/evalprint/' + encodeURIComponent(d.id) + '/' + encodeURIComponent(it.id) })));
      view.appendChild(c);
    });
    view.appendChild(el('div', 'ผลการประเมินเป็นคะแนนประกอบการพิจารณาของคณะกรรมการ ไม่ใช่เกณฑ์ผ่าน/ไม่ผ่าน', 'muted card'));
  }
  X.detail.M2 = { body: function (view, d, md) { if (md && md.items) roundBody(view, d, md); } };

  /* ---------- รายงานผลการประเมิน (พิมพ์) ---------- */
  function pageEvalPrint(view, args, alive) {
    var id = decodeURIComponent(args[0] || ''), itemId = decodeURIComponent(args[1] || ''), box = X.loading(view);
    callApi('documents.get', { id: id }).then(function (r) {
      if (!alive()) return; box.remove();
      if (!r.ok) { A.errLine(view, r); return; }
      var d = r.data.document, md = r.data.module_data, it = md && md.items ? md.items.filter(function (x) { return x.id === itemId; })[0] : null;
      var bar = add(el('div', null, 'card no-print actions'), el('a', '← กลับ', '', { href: '#/documents/' + encodeURIComponent(d.id) }));
      if (d.module !== 'M2' || !it || !d.doc_no || d.status === 'CANCELLED') { add(bar, el('span', 'ไม่มีรายงานให้พิมพ์', 'muted')); view.appendChild(bar); return; }
      var pr = el('button', 'พิมพ์ / บันทึกเป็น PDF', '', { type: 'button' }); pr.addEventListener('click', function () { window.print(); });
      add(bar, pr, d.status === 'OPEN' ? el('span', 'รอบยังไม่ปิด ผลอาจเปลี่ยน', 'muted') : null);
      view.appendChild(bar); view.appendChild(paper(d, md, it));
    });
  }
  function paper(d, md, it) {
    var T = A.thaiDigits, R = C().M2_REASON, p = el('article', null, 'paper evalpaper', { 'aria-label': 'รายงานผลการประเมินสำหรับพิมพ์' });
    function line(label, value) { return add(el('p', null, 'p-line'), document.createTextNode(label + ' '), el('span', value || '-', 'fill grow')); }
    add(p, el('h1', 'รายงานผลการประเมินวัสดุการแพทย์', 'p-title'), el('p', 'โรงพยาบาลอุดรธานี งานพัสดุ หมวดวัสดุการแพทย์', 'p-center'),
        line('เลขที่รอบ', T(d.doc_no)), line('รหัสและชื่อวัสดุ', (it.item_code ? T(it.item_code) + ' ' : '') + it.item_name),
        line('ชื่อผลิตภัณฑ์', it.product_name), line('ผู้ขาย', it.vendor_text), line('เหตุที่ประเมิน', R[it.reason]),
        line('ช่วงประเมิน', (md.opened_at ? A.thaiDate(md.opened_at, false, true) : '') + ' ถึง ' + A.thaiDate(md.due_date, false, true)));
    var t = el('table', null, 'ptable'), heads = ['ลำดับ', 'หน่วยงาน', 'ผู้ประเมิน (ท่าน)', 'คะแนนเฉลี่ย (ร้อยละ)'];
    add(t, add(el('thead'), heads.reduce(function (tr, h) { tr.appendChild(el('th', h)); return tr; }, el('tr'))));
    var tb = el('tbody');
    it.units.forEach(function (u, i) {
      var tr = add(el('tr'), el('td', T(i + 1)), el('td', u.department_name));
      if (u.score && u.score.n) add(tr, el('td', T(u.score.n)), el('td', T(pct(u.score.pct))));
      else { var td = el('td', 'ไม่ส่งผล'); td.setAttribute('colspan', '2'); tr.appendChild(td); }
      tb.appendChild(tr);
    });
    add(t, tb); p.appendChild(t);
    var o = it.overall;
    p.appendChild(el('p', o.units ? 'คะแนนรวม (เฉลี่ยร้อยละของ ' + T(o.units) + ' หน่วยงาน น้ำหนักเท่ากัน): ร้อยละ ' + T(pct(o.pct)) : 'ยังไม่มีหน่วยงานส่งผล', 'p-sum'));
    var ct = el('table', null, 'ptable'), cb = el('tbody');
    add(ct, add(el('thead'), add(el('tr'), el('th', 'ข้อ'), el('th', 'หัวข้อประเมิน'), el('th', 'เฉลี่ย (เต็ม ๕)'))));
    it.criteria.forEach(function (q, i) {
      var v = []; it.units.forEach(function (u) { (u.responses || []).forEach(function (r) { if (typeof r.scores[i] === 'number') v.push(r.scores[i]); }); });
      var avg = v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 100 + 1e-9) / 100 : null;
      add(cb, add(el('tr'), el('td', T(i + 1)), el('td', q), el('td', avg === null ? '-' : T(avg.toFixed(2)))));
    });
    add(ct, cb); p.appendChild(ct);
    var notes = [];
    it.units.forEach(function (u) { (u.responses || []).forEach(function (r) { if (r.suggestion) notes.push(u.department_name + ': ' + r.suggestion); }); });
    if (notes.length) { p.appendChild(el('p', 'ข้อเสนอแนะจากหน่วยงาน', 'p-h')); var ul = el('ul', null, 'p-notes'); notes.forEach(function (n) { ul.appendChild(el('li', n)); }); p.appendChild(ul); }
    p.appendChild(el('p', 'วิธีคิด: ร้อยละของผู้ประเมิน = คะแนนรวม ÷ (๕ × จำนวนข้อที่ให้คะแนน) × ๑๐๐ · หน่วยงาน = เฉลี่ยผู้ประเมิน · คะแนนรวม = เฉลี่ยหน่วยงาน', 'p-crit'));
    p.appendChild(el('p', 'หมายเหตุ : ผลการประเมินเป็นคะแนนประกอบการพิจารณาของคณะกรรมการ ไม่ใช่เกณฑ์ผ่าน/ไม่ผ่าน', 'p-note'));
    function sig(role) { return add(el('div', null, 'sig'), el('div', 'ลงชื่อ ' + '.'.repeat(30)), el('div', '( ' + '.'.repeat(28) + ' )'), el('div', role, 'role')); }
    p.appendChild(add(el('div', null, 'sigs'), sig('ผู้จัดทำ'), sig('ผู้ตรวจสอบ')));
    p.appendChild(el('p', 'เลขที่เอกสารระบบ ' + T(d.doc_no) + (d.status === 'OPEN' ? ' · รอบยังไม่ปิด' : ''), 'p-sys'));
    return p;
  }

  /* ---------- ผลประเมินย้อนหลัง + Excel ---------- */
  function pageResults(view, args, alive) {
    var card = X.pageTitle(view, 'ผลประเมินย้อนหลัง', 'ทุกรอบที่ส่งให้หน่วยงานประเมินแล้ว · คะแนนอย่างเดียว ไม่มีผ่าน/ไม่ผ่าน');
    var q = el('input', null, '', { type: 'search', placeholder: 'ค้นหา วัสดุ ผู้ขาย เลขที่รอบ' }), xl = el('button', 'ส่งออก Excel', 'secondary', { type: 'button' });
    add(card, add(el('div', null, 'filters'), X.m3.fieldBox('ค้นหา', q)), add(el('div', null, 'actions'), xl));
    var out = el('div', 'กำลังโหลด...', 'muted card'); view.appendChild(out);
    var data = null;
    function shown() {
      var k = q.value.trim().toLowerCase();
      return !k ? data.summary : data.summary.filter(function (r) { return [r.doc_no, r.item_name, r.item_code, r.product_name, r.vendor].join(' ').toLowerCase().indexOf(k) >= 0; });
    }
    function render() {
      clear(out); out.className = 'card';
      var list = shown(); add(out, el('div', 'พบ ' + list.length + ' รายการ', 'muted'));
      if (!list.length) return;
      var t = el('table', null, 'stack'), H = ['เลขที่รอบ', 'วัสดุการแพทย์', 'ผลิตภัณฑ์/ผู้ขาย', 'หน่วยงานที่ส่งผล', 'ผู้ประเมิน', 'คะแนน (ร้อยละ)'], hr = el('tr');
      H.forEach(function (h) { hr.appendChild(el('th', h)); }); add(t, add(el('thead'), hr));
      var tb = el('tbody');
      list.forEach(function (r) {
        var a = el('a', r.doc_no, '', { href: '#/documents/' + encodeURIComponent(r.document_id) });
        var cells = [a, r.item_name + (r.item_code ? ' · ' + r.item_code : ''), [r.product_name, r.vendor].filter(Boolean).join(' · '), r.units_sent + '/' + r.units_total, String(r.evaluators), pct(r.pct)];
        var tr = el('tr'); cells.forEach(function (v, i) { var td = el('td'); td.setAttribute('data-label', H[i]); if (typeof v === 'string') td.textContent = v; else td.appendChild(v); tr.appendChild(td); });
        tb.appendChild(tr);
      });
      add(t, tb); out.appendChild(add(el('div', null, 'scroll'), t));
    }
    q.addEventListener('input', function () { if (data) render(); });
    callApi('m2x.results', {}).then(function (r) { if (!alive()) return; if (!r.ok) { clear(out); add(out, el('span', X.errText(r), 'fail')); return; } data = r.data; render(); });
    xl.addEventListener('click', function () {
      if (!data) return;
      guard(xl, function () {
        var keep = {}; shown().forEach(function (s) { keep[s.doc_no + '|' + s.item_name] = true; });
        var s1 = [['เลขที่รอบ', 'สถานะ', 'วันที่ส่งให้ประเมิน', 'รหัสวัสดุ', 'วัสดุการแพทย์', 'ผลิตภัณฑ์', 'ผู้ขาย', 'แบบประเมิน', 'หน่วยงานที่ส่ง', 'หน่วยงานทั้งหมด', 'ผู้ประเมิน (ท่าน)', 'คะแนนรวม (ร้อยละ)']]
          .concat(shown().map(function (r) { return [r.doc_no, r.status === 'CLOSED' ? 'ปิดรอบแล้ว' : 'กำลังประเมิน', X.m3.thaiDay(r.opened_at), r.item_code || '', r.item_name, r.product_name || '', r.vendor, r.template, r.units_sent, r.units_total, r.evaluators, r.pct]; }));
        var maxC = data.detail.reduce(function (m, x) { return Math.max(m, x.criteria.length); }, 0), ch = [];
        for (var i = 0; i < maxC; i++) ch.push('ข้อ ' + (i + 1));
        var s2 = [['เลขที่รอบ', 'วัสดุการแพทย์', 'ผู้ขาย', 'หน่วยงาน', 'ผู้ประเมิน', 'ตำแหน่ง', 'ส่งเมื่อ', 'พัสดุบันทึกแทน', 'จำนวนข้อที่ให้คะแนน', 'คะแนนรวม', 'ร้อยละ'].concat(ch, ['ข้อเสนอแนะ'])]
          .concat(data.detail.filter(function (x) { return keep[x.doc_no + '|' + x.item_name]; }).map(function (x) {
            var sc = []; for (var j = 0; j < maxC; j++) sc.push(j < x.scores.length ? (x.scores[j] === null ? 'ไม่ได้ใช้' : x.scores[j]) : '');
            return [x.doc_no, x.item_name, x.vendor, x.department, x.evaluator, x.position, X.m3.thaiDay(x.submitted_at), x.on_behalf ? 'ใช่' : '', x.n, x.sum, x.pct].concat(sc, [x.suggestion]);
          }));
        return X.m3.exportXlsx('ผลประเมินวัสดุการแพทย์-' + X.m3.todayYmd() + '.xlsx', [{ name: 'สรุปรายการ', rows: s1 }, { name: 'รายผู้ประเมิน', rows: s2 }]);
      });
    });
  }

  replacePage('eval', pageEval); replacePage('evalform', pageEvalForm); replacePage('round', pageRoundEdit); replacePage('evalprint', pageEvalPrint);
  var at = X.pages.map(function (p) { return p.path; }).indexOf('documents');
  X.pages.splice(at < 0 ? X.pages.length : at, 0, { path: 'evalresults', label: 'ผลประเมิน', nav: false, roles: ['OFFICER'], render: pageResults });
});
