/* หน้าผู้ขาย (สแกน QR เข้า) — คำขอวางประเมินวัสดุการแพทย์
   - ต้องอ่านและรับทราบประกาศหลักเกณฑ์ฉบับปัจจุบันก่อนเข้าระบบด้วยบัญชี Google (ไม่ต้องมีรหัสในระบบ)
   - ฟอร์มบันทึกร่างอัตโนมัติในเครื่อง · ไฟล์อัปโหลดทันทีที่แนบ · ปิดหน้าระหว่างกรอกมีคำเตือน
   - ข้อมูลจากเซิร์ฟเวอร์แสดงด้วย textContent เท่านั้น */
(function () {
  'use strict';
  var CFG = window.MEDSUP_CONFIG || {};
  var SKEY = 'medsup.vsess', session = null, me = null, home = null, gReady = false, pendingBtn = null;
  try { var sv = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (sv) { session = sv.session; me = sv.vendor; } } catch (e) { /* ข้าม */ }

  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls, attrs) {
    var e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = text;
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  var toastTimer;
  function toast(msg, bad) {
    var a = clear($('toast-area')); a.appendChild(el('div', msg, 'toast' + (bad ? ' bad' : ''), { role: bad ? 'alert' : 'status' }));
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { clear(a); }, bad ? 8000 : 3500);
  }
  function rid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
  function thaiDay(iso) {
    if (!iso) return '-';
    try { return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(String(iso).length === 10 ? iso + 'T05:00:00Z' : iso)); } catch (e) { return iso; }
  }
  function n2(x) { return x === null || x === undefined ? '-' : Number(x).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function guard(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    Promise.resolve().then(fn).catch(function (e) { toast('เกิดข้อผิดพลาดที่หน้าจอ: ' + (e && e.message), true); })
      .finally(function () { btn.disabled = false; btn.removeAttribute('aria-busy'); });
  }

  /* ---------- API ---------- */
  function call(action, payload, requestId, timeout) {
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, timeout || 45000);
    var body = { action: action, session: session, payload: payload || {} };
    if (requestId) body.request_id = requestId;
    return fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, code: 'NETWORK', message: 'เชื่อมต่อไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่' }; })
      .finally(function () { clearTimeout(t); })
      .then(function (r) {
        if (!r.ok && r.code === 'BUSY') return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return call(action, payload, requestId, timeout); });
        if (!r.ok && r.code === 'UNAUTHENTICATED' && session) { setSession(null); toast('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง (ร่างที่กรอกยังอยู่)', true); render(); }
        return r;
      });
  }
  function setSession(d) {
    session = d ? d.session : null; me = d ? d.vendor : null;
    try { if (d) sessionStorage.setItem(SKEY, JSON.stringify(d)); else sessionStorage.removeItem(SKEY); } catch (e) { /* ข้าม */ }
    $('who').textContent = me ? me.email : ''; $('logout').hidden = !me;
  }

  var LABEL = { company: 'ชื่อบริษัท', rep_name: 'ผู้แทน', phone: 'โทรศัพท์', item_name: 'วัสดุการแพทย์', brand_model: 'ยี่ห้อ / รุ่น', fda_has: 'ทะเบียน อย.', fda_no: 'เลขทะเบียน อย.',
    fda_why: 'เหตุผลที่ไม่มีทะเบียน อย.', iso_has: 'มาตรฐาน ISO', iso_text: 'มาตรฐาน/เอกสารรับรอง', iso_why: 'เหตุผลที่ไม่มีมาตรฐาน', samples: 'จำนวนตัวอย่าง', advice: 'คำแนะนำจากผู้ขาย',
    attach_spec: 'ไฟล์คุณลักษณะเฉพาะ', attach_iso: 'ไฟล์ใบรับรองด้านความปลอดภัย', file_ids: 'ไฟล์แนบ', round: 'รอบรับคำขอ', files: 'ไฟล์แนบ', data: 'ไฟล์' };
  var MSG = { required: 'ต้องกรอก', file_required: 'ต้องแนบไฟล์', invalid_phone: 'รูปแบบเบอร์โทรไม่ถูกต้อง', not_found: 'ไม่พบไฟล์ (ให้แนบใหม่)', too_many: 'เกินจำนวนที่กำหนด',
    closed: 'ปิดรับคำขอแล้ว', too_large: 'ไฟล์ใหญ่เกิน 10 MB', type_mismatch: 'ชนิดไฟล์ไม่ตรงกับเนื้อไฟล์', bad_type: 'รับเฉพาะ PDF หรือภาพ', empty: 'ไฟล์ว่าง', too_long: 'ยาวเกินกำหนด' };
  function errText(r) {
    if (r.fields) return Object.keys(r.fields).map(function (k) { var b = k.split('.')[0]; return (LABEL[b] || 'ข้อมูล') + ': ' + (MSG[r.fields[k]] || r.fields[k]); }).join(' · ');
    return r.message || 'ไม่สำเร็จ';
  }

  /* ---------- เข้าสู่ระบบ ---------- */
  function inApp() { var ua = navigator.userAgent || ''; return / Line\//i.test(ua) || /FBAN|FBAV|FB_IAB|Messenger|Instagram/i.test(ua); }
  window.VendorInitGoogle = function () {
    if (!window.google || !google.accounts) return;
    google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential });
    gReady = true; if (pendingBtn) { google.accounts.id.renderButton(pendingBtn, { theme: 'outline', size: 'large', locale: 'th' }); pendingBtn = null; }
  };
  window.VendorGoogleFailed = function () { if (pendingBtn) pendingBtn.textContent = 'โหลดปุ่มเข้าสู่ระบบ Google ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วโหลดหน้านี้ใหม่'; };
  function googleButton(box) {
    if (inApp()) { box.appendChild(el('div', 'เปิดลิงก์นี้ใน Chrome หรือ Safari (แตะ ⋮ หรือ ⋯ แล้วเลือก "เปิดในเบราว์เซอร์") Google ไม่ให้เข้าสู่ระบบในแอปแชต', 'notice')); return; }
    if (gReady) google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', locale: 'th' }); else pendingBtn = box;
  }
  var lastToken = null;
  function onCredential(resp) {
    lastToken = resp.credential;
    call('vendor.login', { id_token: lastToken, ack_version: ackVersion || undefined }).then(function (r) {
      if (!r.ok) { toast(r.code === 'LOGIN_FAILED' ? 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง' : errText(r), true); return; }
      if (r.data.need_ack) { ackVersion = null; toast('ประกาศหลักเกณฑ์มีฉบับใหม่ กรุณาอ่านและรับทราบอีกครั้ง', true); render(); return; }
      setSession(r.data); location.hash = '#/'; render();
    });
  }
  var ackVersion = null;

  /* ---------- ประกาศ ---------- */
  function noticeBox(notice, round, full) {
    var c = el('section', null, 'card v-ann');
    add(c, el('div', 'ประกาศ ' + notice.issuer, 'muted'), el('h1', 'เปิดรับคำขอวางประเมินวัสดุการแพทย์' + (round ? ' รอบที่ ' + round.round_no : '')));
    if (round) add(c, add(el('p'), el('span', 'ตั้งแต่ ' + thaiDay(round.open_date) + ' ถึง ' + thaiDay(round.close_date) + ' '),
      el('span', round.is_open ? 'เปิดรับอยู่' : 'ปิดรับ', 'chip ' + (round.is_open ? 'ok' : 'bad'))), round.note ? el('div', round.note, 'muted') : null);
    else c.appendChild(el('p', 'ยังไม่มีประกาศรอบรับคำขอ', 'muted'));
    if (!full) return c;
    add(c, el('h3', notice.title + ' (ฉบับที่ ' + notice.version + ')'));
    var ol = el('ol'); notice.items.forEach(function (it) { add(ol, add(el('li'), el('b', it[0] + ' '), el('span', it[1]))); }); c.appendChild(ol);
    add(c, el('h3', 'หลักเกณฑ์การยื่นคำขอ')); ol = el('ol'); notice.rules.forEach(function (t) { ol.appendChild(el('li', t)); }); c.appendChild(ol);
    add(c, el('h3', 'กรณีมีความเสี่ยงด้านความปลอดภัยระหว่างประเมิน')); ol = el('ol'); notice.safety.forEach(function (t) { ol.appendChild(el('li', t)); }); c.appendChild(ol);
    return c;
  }
  var FLOW = ['ยื่นคำขอและแนบเอกสารในระบบ', 'งานพัสดุ หมวดวัสดุการแพทย์ตรวจเอกสาร หากไม่ครบ ระบบแจ้งให้แก้ไข', 'งานพัสดุ หมวดวัสดุการแพทย์นัดส่งตัวอย่างและเลือกหน่วยงานทดลองใช้',
              'หน่วยงานทดลองใช้และประเมินผ่านระบบ', 'งานพัสดุ หมวดวัสดุการแพทย์อนุมัติผล ผู้ขายดูคะแนนได้ที่ "คำขอของฉัน"'];
  function flow(k) { var ol = el('ol', null, 'v-flow'); FLOW.forEach(function (s, i) { ol.appendChild(add(el('li', null, k === null ? '' : i <= k ? 'done' : 'todo'), el('span', String(i + 1)), el('div', s))); }); return ol; }

  function pageLogin(view) {
    view.appendChild(el('div', 'กำลังโหลดประกาศ...', 'card muted', { role: 'status' }));
    call('vendor.public', {}).then(function (r) {
      clear(view);
      if (!r.ok) { view.appendChild(el('div', errText(r), 'card fail')); return; }
      view.appendChild(noticeBox(r.data.notice, r.data.round, true));
      var c = el('div', null, 'card'), cb = el('input', null, '', { type: 'checkbox', id: 'ack' }), gb = el('div', null, '', { id: 'gbtn' });
      add(c, add(el('label', null, '', { for: 'ack', style: 'display:flex;gap:8px;align-items:flex-start;color:var(--text)' }), cb,
        el('span', 'ข้าพเจ้าได้อ่านและรับทราบประกาศหลักเกณฑ์การประเมินและการรายงานผล ฉบับที่ ' + r.data.notice.version + ' แล้ว')),
        el('div', 'ระบบบันทึกบัญชี Google ชื่อ และวันเวลาที่รับทราบ', 'muted'), gb);
      view.appendChild(c);
      add(view, add(el('div', null, 'card'), el('h3', 'ขั้นตอนหลังยื่นคำขอ'), flow(null)), add(el('p', null, 'muted'), add(el('a', 'ตรวจสอบหนังสือแจ้งผล', '', { href: '#/verify' }))));
      cb.addEventListener('change', function () { ackVersion = cb.checked ? r.data.notice.version : null; clear(gb); if (cb.checked) googleButton(gb); });
    });
  }

  /* ---------- หน้าแรกผู้ขาย ---------- */
  var ST_K = { SUBMITTED: 1, RETURNED: 0, EVALUATING: 3, APPROVED: 4, REJECTED: 1 };
  function loadHome() { return call('vendor.home', {}).then(function (r) { if (r.ok) home = r.data; return r; }); }
  function pageHome(view) {
    view.appendChild(el('div', 'กำลังโหลด...', 'card muted', { role: 'status' }));
    loadHome().then(function (r) {
      clear(view); if (!r.ok) { view.appendChild(el('div', errText(r), 'card fail')); return; }
      var h = r.data, open = h.round && h.round.is_open;
      view.appendChild(noticeBox(h.notice, h.round, false));
      var nb = el('a', null, 'card v-big', { href: open ? '#/new' : '#/', 'aria-disabled': open ? 'false' : 'true' });
      add(nb, add(el('div'), el('b', 'ยื่นคำขอวางประเมิน'), el('div', open ? 'กรอกข้อมูลวัสดุการแพทย์และแนบเอกสาร' : 'ปิดรับคำขอ รอประกาศรอบถัดไป', 'muted')));
      view.appendChild(nb);
      var list = add(el('section', null, 'card'), el('h2', 'คำขอของฉัน (' + h.requests.length + ' รายการ)'));
      if (!h.requests.length) list.appendChild(el('div', 'ยังไม่มีคำขอ', 'muted'));
      h.requests.forEach(function (q) {
        var a = el('a', null, 'v-file', { href: '#/req/' + encodeURIComponent(q.id) });
        add(a, add(el('div'), el('b', q.req_no + ' '), el('span', q.item_name), el('div', q.brand_model + ' · ยื่น ' + thaiDay(q.submitted_at), 'muted')),
          add(el('div', null, '', { style: 'text-align:right' }), el('span', q.status_text, 'chip' + (q.status === 'APPROVED' ? ' ok' : q.status === 'REJECTED' || q.status === 'RETURNED' ? ' bad' : '')),
            q.pct !== null ? el('div', 'ร้อยละ ' + n2(q.pct)) : null));
        list.appendChild(a);
      });
      view.appendChild(list);
      add(view, add(el('div', null, 'card'), el('h3', 'ขั้นตอนหลังยื่นคำขอ'), flow(null)));
      var nt = el('a', 'ประกาศหลักเกณฑ์การประเมินและการรายงานผล ฉบับที่ ' + h.notice.version + ' (รับทราบแล้ว)', '', { href: '#/notice' });
      view.appendChild(add(el('p'), nt));
    });
  }
  function pageNotice(view) {
    var back = el('a', '‹ หน้าแรก', '', { href: '#/' }); view.appendChild(add(el('p'), back));
    var go = function (h) { view.appendChild(noticeBox(h.notice, h.round, true)); };
    if (home) go(home); else loadHome().then(function (r) { if (r.ok) go(r.data); });
  }

  /* ---------- ฟอร์มยื่นคำขอ (ร่างอัตโนมัติ · ไฟล์อัปโหลดทันที) ---------- */
  var KINDS = [['spec', 'คุณลักษณะเฉพาะ', true], ['quote', 'ใบเสนอราคา', false], ['catalog', 'แค็ตตาล็อก', false], ['other', 'เอกสารอื่น', false]];
  var dirty = false;
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  function draftKey(reqId) { return 'medsup.vdraft:' + (me ? me.email : '') + ':' + (reqId || 'new'); }
  function readDraft(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeDraft(k, d) { try { localStorage.setItem(k, JSON.stringify(d)); return true; } catch (e) { return false; } }
  function dropDraft(k) { try { localStorage.removeItem(k); } catch (e) { /* ข้าม */ } }

  function pageForm(view, reqId) {
    view.appendChild(el('div', 'กำลังโหลด...', 'card muted', { role: 'status' }));
    Promise.all([loadHome(), reqId ? call('vendor.request.get', { id: reqId }) : Promise.resolve(null)]).then(function (res) {
      clear(view);
      var bad = res.filter(function (r) { return r && !r.ok; })[0]; if (bad) { view.appendChild(el('div', errText(bad), 'card fail')); return; }
      var h = res[0].data, cur = res[1] ? res[1].data : null;
      if (cur && cur.request.status !== 'RETURNED') { location.hash = '#/req/' + encodeURIComponent(reqId); return; }
      if (!cur && !(h.round && h.round.is_open)) { add(view, noticeBox(h.notice, h.round, false), el('div', 'ขณะนี้ปิดรับคำขอ', 'card muted')); return; }
      buildForm(view, h, cur, reqId);
    });
  }

  function buildForm(view, h, cur, reqId) {
    var key = draftKey(reqId), saved = readDraft(key), base = cur ? cur.request : (h.profile || {});
    var v = saved && saved.v ? saved.v : {
      company: base.company || '', rep_name: base.rep_name || '', phone: base.phone || '', item_name: cur ? base.item_name : '', brand_model: cur ? base.brand_model : '',
      fda_has: cur ? base.fda_has : null, fda_no: cur ? base.fda_no || '' : '', fda_why: cur ? base.fda_why || '' : '',
      iso_has: cur ? base.iso_has : null, iso_text: cur ? base.iso_text || '' : '', iso_why: cur ? base.iso_why || '' : '', samples: cur ? base.samples : '', advice: cur ? base.advice || '' : '' };
    var reqToken = saved && saved.rid ? saved.rid : rid();
    // ไฟล์: ของคำขอเดิม (ส่งกลับให้แก้) + ไฟล์ที่อัปโหลดรอไว้ (ยังไม่ผูกกับคำขอ)
    var files = (cur ? cur.files : []).concat(h.staged_files || []);
    var savedAt = el('p', saved ? 'กู้ร่างที่บันทึกไว้แล้ว กรอกต่อได้ทันที' : 'ระบบบันทึกร่างอัตโนมัติระหว่างกรอก หากเน็ตหลุดหรือออกจากหน้านี้ กลับมากรอกต่อได้', 'v-saved', { role: 'status' });
    function persist() {
      dirty = true;
      var ok = writeDraft(key, { v: v, rid: reqToken });
      savedAt.textContent = ok ? 'บันทึกร่างอัตโนมัติแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : 'เครื่องนี้บันทึกร่างไม่ได้ กรุณากรอกให้เสร็จก่อนปิดหน้า';
    }
    var f = el('form', null, 'card', { novalidate: 'novalidate' });
    add(view, add(el('p'), el('a', '‹ หน้าแรก', '', { href: '#/' })));
    add(f, el('h2', cur ? 'แก้ไขคำขอ ' + cur.request.req_no : 'ยื่นคำขอวางประเมิน'),
      el('div', cur ? 'งานพัสดุส่งกลับให้แก้ไข: ' + (cur.request.officer_comment || '') : 'รอบที่ ' + h.round.round_no + ' · ปิดรับ ' + thaiDay(h.round.close_date), cur ? 'notice' : 'muted'), savedAt);
    if (saved) { var rs = el('button', 'เริ่มกรอกใหม่', 'secondary small', { type: 'button' }); rs.addEventListener('click', function () { dropDraft(key); dirty = false; render(); }); f.appendChild(rs); }

    function field(k, label, req, attrs, multi) {
      var id = 'vf-' + k, inp = el(multi ? 'textarea' : 'input', null, '', Object.assign({ id: id, name: k, maxlength: multi ? '2000' : '300' }, attrs || {}));
      inp.value = v[k] || '';
      inp.addEventListener('input', function () { v[k] = inp.value; persist(); });
      var lb = add(el('label', null, '', { for: id }), el('span', label + ' '), req ? el('span', '*', 'v-req') : el('span', '(ถ้ามี)', 'muted'));
      return add(el('div', null, 'f'), lb, inp);
    }
    function choice(k, label, yes, no, onChange) {
      var box = el('div', null, 'f'), row = el('div', null, 'v-choice', { role: 'group', 'aria-label': label });
      [[true, yes], [false, no]].forEach(function (o) {
        var b = el('button', o[1], '', { type: 'button', 'aria-pressed': String(v[k] === o[0]) });
        b.addEventListener('click', function () { v[k] = o[0]; persist(); [].forEach.call(row.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); onChange(); });
        row.appendChild(b);
      });
      return add(box, add(el('label'), el('span', label + ' '), el('span', '*', 'v-req')), row);
    }
    add(f, el('h3', 'ข้อมูลบริษัท'), field('company', 'ชื่อบริษัท', true), field('rep_name', 'ผู้แทน', true), field('phone', 'โทรศัพท์', true, { inputmode: 'tel', maxlength: '30' }));
    add(f, el('h3', 'ข้อมูลวัสดุการแพทย์'), field('item_name', 'วัสดุการแพทย์ (ชื่อสามัญ)', true), field('brand_model', 'ยี่ห้อ / รุ่น', true));
    var fdaBox = el('div'), isoBox = el('div');
    function fdaRender() { clear(fdaBox); if (v.fda_has === true) fdaBox.appendChild(field('fda_no', 'เลขทะเบียน อย.', true)); else if (v.fda_has === false) fdaBox.appendChild(field('fda_why', 'ชี้แจงเหตุผล (เช่น ไม่ต้องขึ้นทะเบียนตามประกาศ อย. ระบุประกาศ)', true, null, true)); }
    function isoRender() {
      clear(isoBox);
      if (v.iso_has === true) add(isoBox, field('iso_text', 'มาตรฐาน/เอกสารรับรอง (เช่น ISO 13485, ISO 10993)', true), fileSlot('iso', 'ใบรับรองหรือเอกสารรับรองด้านความปลอดภัย', true));
      else if (v.iso_has === false) isoBox.appendChild(field('iso_why', 'ชี้แจงเหตุผล และมาตรฐานอื่นที่ใช้ยืนยันความปลอดภัย (ถ้ามี)', true, null, true));
    }
    add(f, choice('fda_has', 'ทะเบียน อย.', 'มีเลขทะเบียน', 'ไม่มี', fdaRender), fdaBox,
      choice('iso_has', 'มาตรฐาน ISO ด้านความปลอดภัย หรือเอกสารที่รับรองด้านความปลอดภัย', 'มี', 'ไม่มี', isoRender), isoBox,
      el('div', 'ต้องเลือก "มี" หรือ "ไม่มี" ทั้ง 2 ข้อ หากไม่มีต้องชี้แจง เพื่อความปลอดภัยของผู้ป่วย', 'muted'),
      field('samples', 'จำนวนตัวอย่างที่นำมาให้ทดลอง (เช่น 20 ชิ้น)', true, { maxlength: '200' }),
      field('advice', 'คำแนะนำจากผู้ขาย (ใช้แทนรายการใดของโรงพยาบาล ข้อแตกต่าง ข้อควรระวัง)', false, null, true));

    // ไฟล์แนบ: อัปโหลดทันทีที่เลือก
    function fileSlot(kind, label, req) {
      var box = add(el('div', null, 'f'), add(el('label'), el('span', label + ' '), req ? el('span', '*', 'v-req') : el('span', '(ถ้ามี)', 'muted'))), list = el('div');
      var pick = el('input', null, '', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png', 'aria-label': 'แนบ' + label });
      function draw() {
        clear(list);
        files.filter(function (x) { return x.kind === kind; }).forEach(function (x) {
          var rm = el('button', 'ลบ', 'secondary small', { type: 'button', 'aria-label': 'ลบ ' + x.original_filename });
          rm.addEventListener('click', function () {
            guard(rm, function () {
              return call('vendor.file.remove', { file_id: x.id }, rid()).then(function (r) {
                if (!r.ok) { toast(errText(r), true); return; }
                files = files.filter(function (y) { return y.id !== x.id; }); draw();
              });
            });
          });
          list.appendChild(add(el('div', null, 'v-file ok'), el('span', '✓ ' + x.original_filename + ' · ' + Math.max(1, Math.round(x.file_size / 1024)) + ' KB'), rm));
        });
      }
      pick.addEventListener('change', function () {
        var file = pick.files && pick.files[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 10 MB', true); pick.value = ''; return; }
        var st = el('div', 'กำลังอัปโหลด ' + file.name + ' ...', 'muted', { role: 'status' }); list.appendChild(st); pick.disabled = true;
        var rd = new FileReader();
        rd.onload = function () {
          var b64 = String(rd.result).split(',')[1] || '';
          call('vendor.file.upload', { kind: kind, filename: file.name, data_base64: b64 }, null, 180000).then(function (r) {
            pick.disabled = false; pick.value = ''; st.remove();
            if (!r.ok) { toast(file.name + ': ' + errText(r), true); return; }
            if (!files.some(function (y) { return y.id === r.data.file.id; })) files.push(r.data.file);
            dirty = true; draw();
          });
        };
        rd.onerror = function () { pick.disabled = false; st.remove(); toast('อ่านไฟล์ไม่สำเร็จ', true); };
        rd.readAsDataURL(file);
      });
      draw();
      return add(box, list, pick);
    }
    add(f, el('h3', 'เอกสารแนบ'));
    KINDS.forEach(function (k) { f.appendChild(fileSlot(k[0], k[1], k[2])); });
    add(f, el('div', 'PDF หรือภาพ ไม่เกิน 10 MB ต่อไฟล์ · ไฟล์อัปโหลดทันทีที่แนบ หากเน็ตหลุด ไฟล์ที่ขึ้น ✓ แล้วไม่ต้องแนบใหม่', 'muted'));
    fdaRender(); isoRender();

    var err = el('div', null, 'fail', { role: 'alert' }), go = el('button', cur ? 'ยื่นคำขอที่แก้ไขแล้ว' : 'ยื่นคำขอ', '', { type: 'submit' });
    add(f, err, add(el('div', null, 'actions'), go));
    view.appendChild(f);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      var miss = [];
      ['company', 'rep_name', 'phone', 'item_name', 'brand_model', 'samples'].forEach(function (k) { if (!String(v[k] || '').trim()) miss.push(LABEL[k]); });
      if (v.fda_has === null || v.fda_has === undefined) miss.push('ทะเบียน อย. (มี/ไม่มี)'); else if (v.fda_has ? !v.fda_no.trim() : !v.fda_why.trim()) miss.push(v.fda_has ? LABEL.fda_no : LABEL.fda_why);
      if (v.iso_has === null || v.iso_has === undefined) miss.push('มาตรฐาน ISO (มี/ไม่มี)'); else if (v.iso_has ? !v.iso_text.trim() : !v.iso_why.trim()) miss.push(v.iso_has ? LABEL.iso_text : LABEL.iso_why);
      if (!files.some(function (x) { return x.kind === 'spec'; })) miss.push(LABEL.attach_spec);
      if (v.iso_has === true && !files.some(function (x) { return x.kind === 'iso'; })) miss.push(LABEL.attach_iso);
      if (miss.length) { err.textContent = 'ยังไม่ครบ: ' + miss.join(', '); return; }
      var p = { company: v.company.trim(), rep_name: v.rep_name.trim(), phone: v.phone.trim(), item_name: v.item_name.trim(), brand_model: v.brand_model.trim(),
                fda_has: v.fda_has, iso_has: v.iso_has, samples: String(v.samples).trim(), advice: (v.advice || '').trim(),
                file_ids: files.filter(function (x) { return v.iso_has || x.kind !== 'iso'; }).map(function (x) { return x.id; }) };
      if (v.fda_has) p.fda_no = v.fda_no.trim(); else p.fda_why = v.fda_why.trim();
      if (v.iso_has) p.iso_text = v.iso_text.trim(); else p.iso_why = v.iso_why.trim();
      if (reqId) p.request_id = reqId;
      guard(go, function () {
        return call('vendor.request.submit', p, reqToken).then(function (r) {
          if (!r.ok) { err.textContent = errText(r); return; }
          dropDraft(key); dirty = false; toast('ยื่นคำขอแล้ว เลขที่ ' + r.data.req_no);
          location.hash = '#/req/' + encodeURIComponent(r.data.id);
        });
      });
    });
  }

  /* ---------- รายละเอียดคำขอ ---------- */
  function pageReq(view, id) {
    add(view, add(el('p'), el('a', '‹ หน้าแรก', '', { href: '#/' })));
    var box = el('div', 'กำลังโหลด...', 'card muted', { role: 'status' }); view.appendChild(box);
    call('vendor.request.get', { id: id }).then(function (r) {
      box.remove(); if (!r.ok) { view.appendChild(el('div', errText(r), 'card fail')); return; }
      var q = r.data.request, s = r.data.score, c = el('section', null, 'card');
      add(c, add(el('div', null, '', { style: 'display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap' }), el('h2', q.req_no, '', { style: 'margin:0' }),
        el('span', q.status_text, 'chip' + (q.status === 'APPROVED' ? ' ok' : q.status === 'REJECTED' || q.status === 'RETURNED' ? ' bad' : ''))));
      if (q.officer_comment) c.appendChild(el('div', (q.status === 'RETURNED' ? 'งานพัสดุส่งกลับให้แก้ไข: ' : 'เหตุผล: ') + q.officer_comment, 'notice'));
      var dl = el('dl', null, 'kv');
      [['บริษัท', q.company], ['ผู้แทน', q.rep_name + ' · ' + q.phone], ['วัสดุการแพทย์', q.item_name], ['ยี่ห้อ/รุ่น', q.brand_model],
       ['ทะเบียน อย.', q.fda_has ? q.fda_no : 'ไม่มี: ' + q.fda_why], ['ISO/เอกสารรับรอง', q.iso_has ? q.iso_text : 'ไม่มี: ' + q.iso_why], ['ตัวอย่าง', q.samples],
       ['คำแนะนำ', q.advice || '-'], ['ยื่นเมื่อ', thaiDay(q.submitted_at)], ['ไฟล์แนบ', r.data.files.map(function (x) { return x.original_filename; }).join(', ') || '-']]
        .forEach(function (kv) { add(dl, el('dt', kv[0]), el('dd', kv[1])); });
      c.appendChild(dl);
      if (q.status === 'RETURNED') c.appendChild(add(el('div', null, 'actions'), el('a', 'แก้ไขแล้วยื่นใหม่', 'button', { href: '#/edit/' + encodeURIComponent(q.id), role: 'button' })));
      view.appendChild(c);
      if (s) {
        var sc = add(el('section', null, 'card'), el('h2', 'ผลการประเมิน ร้อยละ ' + n2(s.pct)), el('div', 'ผู้ประเมิน ' + s.evaluators + ' ท่าน ใน ' + s.units + ' หน่วยงาน', 'muted'));
        var t = el('table'), tb = el('tbody');
        add(t, add(el('thead'), add(el('tr'), el('th', 'เกณฑ์'), el('th', 'คะแนนเฉลี่ย (เต็ม 5)'))));
        s.criteria.forEach(function (x, i) { tb.appendChild(add(el('tr'), el('td', (i + 1) + '. ' + x.criterion), el('td', x.avg === null ? '-' : n2(x.avg)))); });
        add(t, tb); add(sc, add(el('div', null, 'scroll'), t), add(el('div', null, 'actions'), el('a', 'หนังสือแจ้งผล (พิมพ์/บันทึก PDF)', 'button', { href: '#/cert/' + encodeURIComponent(q.id), role: 'button' })));
        view.appendChild(sc);
      }
      if (q.status !== 'REJECTED') add(view, add(el('div', null, 'card'), el('h3', 'ความคืบหน้า'), flow(ST_K[q.status])));
    });
  }

  /* ---------- หนังสือแจ้งผล ---------- */
  function verifyUrl(no, code) { return location.origin + location.pathname + '#/verify/' + encodeURIComponent(no) + '/' + encodeURIComponent(code); }
  // ห้ามตัดคำกลางบรรทัด: วลีที่ตัวตัดคำของเบราว์เซอร์มักแยก (โรง|พยาบาล) และค่าที่ไม่ยาวเกินไป ให้อยู่บรรทัดเดียวกัน
  var KEEP = ['โรงพยาบาลอุดรธานี', 'หัวหน้างานพัสดุ', 'หมวดวัสดุการแพทย์', 'วัสดุการแพทย์', 'งานพัสดุ', 'บริษัทฯ', 'ผู้ประเมิน', 'การประเมิน', 'ประสิทธิภาพ', 'ความปลอดภัย',
              'ผลิตภัณฑ์', 'บุคลากร', 'ความคิดเห็น', 'ผู้ใช้งาน', 'สภาพการใช้งาน', 'รับประกันคุณภาพ', 'การตกลงซื้อ', 'คะแนนเฉลี่ย', 'รหัสตรวจสอบ', 'เลขที่คำขอ', 'ประกาศฉบับที่'];
  function tp(tag, parts, cls) {
    var n = el(tag, null, cls || '');
    (Array.isArray(parts) ? parts : [parts]).forEach(function (x) {
      if (x && x.v !== undefined) { var v = String(x.v); n.appendChild(v.length <= 32 ? el('span', v, 'nw') : document.createTextNode(v)); return; }
      var txt = String(x), re = new RegExp('(' + KEEP.join('|') + ')'), bits = txt.split(re);
      bits.forEach(function (b) { if (!b) return; n.appendChild(KEEP.indexOf(b) >= 0 ? el('span', b, 'nw') : document.createTextNode(b)); });
    });
    return n;
  }
  function pageCert(view, id) {
    add(view, add(el('p'), el('a', '‹ กลับ', '', { href: '#/req/' + encodeURIComponent(id) })));
    call('vendor.cert', { id: id }).then(function (r) {
      if (!r.ok) { view.appendChild(el('div', errText(r), 'card fail')); return; }
      var d = r.data, L = el('div', null, 'letter');
      add(L, add(el('p', null, 'c'), add(el('b'), tp('span', 'หนังสือแจ้งผลการประเมินวัสดุการแพทย์'))), tp('p', 'งานพัสดุ หมวดวัสดุการแพทย์ โรงพยาบาลอุดรธานี', 'c'),
        el('p', 'ที่ '), el('p', thaiDay(d.approved_at), 'r'), tp('p', ['เรียน ', { v: d.company }]),
        tp('p', ['ตามที่บริษัทฯ ได้ยื่นคำขอวางประเมินวัสดุการแพทย์ ', { v: d.item_name }, ' ยี่ห้อ/รุ่น ', { v: d.brand_model }, ' รอบที่ ' + d.round_no +
          ' บัดนี้การประเมินเสร็จสิ้นแล้ว ผลการประเมินจากผู้ประเมิน ' + d.evaluators + ' ท่าน ใน ' + d.units + ' หน่วยงาน มีดังนี้'], 'ind'));
      var t = el('table'); add(t, add(el('tr'), el('th', 'เกณฑ์'), tp('th', 'คะแนนเฉลี่ย (เต็ม 5)')));
      d.criteria.forEach(function (x, i) { t.appendChild(add(el('tr'), el('td', (i + 1) + '. ' + x.criterion), el('td', x.avg === null ? '-' : n2(x.avg)))); });
      t.appendChild(add(el('tr'), el('th', 'ผลรวม'), add(el('th'), el('span', 'ร้อยละ ' + n2(d.pct), 'nw'))));
      add(L, t, tp('p', 'ผลการประเมินนี้สะท้อนความคิดเห็นของบุคลากรผู้ใช้งานในโรงพยาบาลอุดรธานี เฉพาะผลิตภัณฑ์ รุ่น และสภาพการใช้งานที่ประเมินเท่านั้น ไม่ถือเป็นการรับรองหรือรับประกันคุณภาพ ความปลอดภัย หรือประสิทธิภาพของผลิตภัณฑ์ และไม่ถือเป็นการตกลงซื้อ (ประกาศฉบับที่ ' + d.notice_version + ')', 'ind'),
        add(el('div', null, 'sign'), el('p', '(..............................................)'), tp('p', 'หัวหน้างานพัสดุ หมวดวัสดุการแพทย์')),
        add(el('div', null, 'foot'), add(tp('div', 'เลขที่คำขอ '), el('span', d.req_no, 'nw'), document.createTextNode(' · '), tp('span', 'รหัสตรวจสอบ '), el('span', d.verify_code, 'nw')),
          add(el('div'), document.createTextNode('ตรวจสอบเอกสาร: '), el('span', verifyUrl(d.req_no, d.verify_code), 'url'))));
      var pr = el('button', 'พิมพ์ / บันทึกเป็น PDF', '', { type: 'button' }); pr.addEventListener('click', function () { window.print(); });
      add(view, el('p', 'ข้อมูลมาจากระบบโดยตรง แก้ไขไม่ได้', 'muted'), L, add(el('div', null, 'actions'), pr));
    });
  }

  /* ---------- ตรวจสอบหนังสือ (ไม่ต้อง Login) ---------- */
  function pageVerify(view, args) {
    var no = el('input', null, '', { id: 'vno', placeholder: 'เช่น 1/2570-001', value: args[0] ? decodeURIComponent(args[0]) : '' });
    var code = el('input', null, '', { id: 'vcode', placeholder: 'เช่น ABCD-EF23', value: args[1] ? decodeURIComponent(args[1]) : '' });
    var b = el('button', 'ตรวจสอบ', '', { type: 'submit' }), out = el('div', null, '', { role: 'status' });
    var f = add(el('form', null, 'card'), el('h2', 'ตรวจสอบหนังสือแจ้งผลการประเมิน'), add(el('label', 'เลขที่คำขอ', '', { for: 'vno' })), no,
      add(el('label', 'รหัสตรวจสอบ', '', { for: 'vcode' })), code, add(el('div', null, 'actions'), b), out);
    add(view, add(el('p'), el('a', '‹ หน้าแรก', '', { href: '#/' })), f);
    function check() {
      clear(out); if (!no.value.trim() || !code.value.trim()) { out.textContent = 'กรอกให้ครบ'; return; }
      guard(b, function () {
        return call('vendor.verify', { req_no: no.value.trim(), code: code.value.trim() }).then(function (r) {
          if (!r.ok) { out.appendChild(el('div', errText(r), 'fail')); return; }
          if (!r.data.valid) { out.appendChild(el('div', 'ไม่พบเอกสารนี้ในระบบ หรือรหัสไม่ตรง', 'fail')); return; }
          var d = r.data; add(out, el('div', 'ถูกต้อง: หนังสือฉบับนี้ออกโดยระบบของโรงพยาบาล ข้อมูลตรงกับด้านล่าง', 'pass'),
            el('div', d.req_no + ' · ' + d.company + ' · ' + d.item_name + ' (' + d.brand_model + ') · อนุมัติผล ' + thaiDay(d.approved_at) + ' · ร้อยละ ' + n2(d.pct)));
        });
      });
    }
    f.addEventListener('submit', function (e) { e.preventDefault(); check(); });
    if (args[0] && args[1]) check();
  }

  /* ---------- เส้นทาง ---------- */
  function render() {
    var view = clear($('view')), parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    if (parts[0] !== 'new' && parts[0] !== 'edit') dirty = false;
    if (parts[0] === 'verify') return pageVerify(view, parts.slice(1));
    if (!session) return pageLogin(view);
    if (parts[0] === 'new') return pageForm(view, null);
    if (parts[0] === 'edit' && parts[1]) return pageForm(view, decodeURIComponent(parts[1]));
    if (parts[0] === 'req' && parts[1]) return pageReq(view, decodeURIComponent(parts[1]));
    if (parts[0] === 'cert' && parts[1]) return pageCert(view, decodeURIComponent(parts[1]));
    if (parts[0] === 'notice') return pageNotice(view);
    return pageHome(view);
  }
  window.addEventListener('hashchange', function () {
    if (dirty && !window.confirm('ข้อมูลที่กรอกบันทึกเป็นร่างไว้แล้ว ออกจากหน้านี้หรือไม่?')) return;
    render(); window.scrollTo(0, 0);
  });
  $('logout').addEventListener('click', function () {
    call('auth.logout', {}).finally(function () { setSession(null); if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); location.hash = '#/'; render(); });
  });
  setSession(session ? { session: session, vendor: me } : null);
  render();
})();
