// Baybex core helpers — shared by landing, shop app and super admin
(function () {
  const BX = (window.BX = {});
  BX.lang = localStorage.getItem('bx_lang') || 'bn';
  BX.digits = localStorage.getItem('bx_digits') || BX.lang;
  BX.setLang = l => { BX.lang = l; localStorage.setItem('bx_lang', l); };
  BX.setDigits = d => { BX.digits = d; localStorage.setItem('bx_digits', d); };
  // L('বাংলা', 'English')
  window.L = (bn, en) => (BX.lang === 'en' ? (en === undefined ? bn : en) : bn);

  const BN = '০১২৩৪৫৬৭৮৯';
  BX.bnDigits = str => String(str).replace(/[0-9]/g, d => BN[d]);
  BX.toEnDigits = str => String(str).replace(/[০-৯]/g, d => BN.indexOf(d));
  BX.dg = str => (BX.digits === 'bn' ? BX.bnDigits(str) : String(str));
  BX.num = (v, dec = 2) => {
    const x = Number(v) || 0;
    const sgn = x < 0 ? '-' : '';
    const fixed = Math.abs(x).toFixed(dec);
    let [i, f] = fixed.split('.');
    // Bangladeshi grouping: 1,00,000
    let last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    let out = sgn + rest + last3;
    if (f && /[1-9]/.test(f)) out += '.' + f.replace(/0+$/, '');
    return BX.dg(out);
  };
  BX.qty = v => BX.num(v, 3);
  BX.tk = v => '৳' + BX.num(v, 2);
  BX.date = d => {
    if (!d) return '';
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m && s.length <= 10) return BX.dg(`${m[3]}-${m[2]}-${m[1]}`);
    const dt = new Date(s);
    if (isNaN(dt)) return s;
    const bd = new Date(dt.getTime() + 6 * 3600e3);
    const p = x => String(x).padStart(2, '0');
    return BX.dg(`${p(bd.getUTCDate())}-${p(bd.getUTCMonth() + 1)}-${bd.getUTCFullYear()}`);
  };
  BX.dateTime = d => {
    if (!d) return '';
    const dt = new Date(d); const bd = new Date(dt.getTime() + 6 * 3600e3);
    const p = x => String(x).padStart(2, '0');
    let h = bd.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return BX.dg(`${p(bd.getUTCDate())}-${p(bd.getUTCMonth() + 1)}-${bd.getUTCFullYear()} ${h}:${p(bd.getUTCMinutes())} ${ap}`);
  };
  BX.today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
  BX.addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  BX.monthStart = () => BX.today().slice(0, 8) + '01';

  window.esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.$ = (sel, root) => (root || document).querySelector(sel);
  window.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  window.nv = v => { const x = parseFloat(BX.toEnDigits(v)); return isFinite(x) ? x : 0; };

  BX.api = async (method, url, body) => {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (BX.branch) opt.headers['X-Branch'] = BX.branch;
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    let data = null;
    try { data = await r.json(); } catch (e) { data = {}; }
    if (!r.ok) {
      const e = new Error((data && data.error) || 'Error ' + r.status);
      e.status = r.status; e.code = data && data.code; e.data = data;
      if (r.status === 401 && BX.onUnauthorized) BX.onUnauthorized();
      throw e;
    }
    return data;
  };
  BX.get = u => BX.api('GET', u);
  BX.post = (u, b) => BX.api('POST', u, b || {});
  BX.put = (u, b) => BX.api('PUT', u, b || {});
  BX.del = (u, b) => BX.api('DELETE', u, b);

  BX.toast = (msg, type) => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'bad' ? 5000 : 2800);
  };
  BX.err = e => BX.toast(e.message || String(e), 'bad');

  // modal({title, body, wide, buttons:[{label, cls, onClick(close, el)}], onOpen(el)})
  BX.modal = opts => {
    const bg = document.createElement('div');
    bg.className = 'mbg';
    bg.innerHTML = `<div class="modal ${opts.wide ? (opts.wide === 'x' ? 'xwide' : 'wide') : ''}">
      <div class="mh"><h3>${opts.title || ''}</h3><button class="btn ghost sm" data-x>✕</button></div>
      <div class="mb">${opts.body || ''}</div>
      ${opts.buttons && opts.buttons.length ? '<div class="mf"></div>' : ''}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.querySelector('[data-x]').onclick = close;
    bg.addEventListener('mousedown', e => { if (e.target === bg && !opts.sticky) close(); });
    const mf = bg.querySelector('.mf');
    (opts.buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.innerHTML = b.label;
      btn.onclick = async () => {
        if (!b.onClick) return close();
        btn.disabled = true;
        try { await b.onClick(close, bg); } catch (e) { BX.err(e); } finally { btn.disabled = false; }
      };
      mf.appendChild(btn);
    });
    document.body.appendChild(bg);
    const first = bg.querySelector('input:not([type=hidden]):not([readonly]),select,textarea');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 50);
    if (opts.onOpen) opts.onOpen(bg.querySelector('.modal'), close);
    return { el: bg.querySelector('.modal'), close };
  };
  BX.confirm = (msg, okLabel) => new Promise(res => {
    let done = false;
    BX.modal({ title: L('নিশ্চিত করুন', 'Please confirm'), body: `<p>${msg}</p>`, onClose: () => { if (!done) res(false); },
      buttons: [{ label: L('না', 'Cancel'), onClick: c => { done = true; res(false); c(); } }, { label: okLabel || L('হ্যাঁ', 'Yes'), cls: 'pri', onClick: c => { done = true; res(true); c(); } }] });
  });

  // ---- simple form builder ----
  // fields: [{k, label, type:text|number|select|textarea|date|check|password|tel, options:[[v,l]], val, req, ph, col}]
  BX.formHtml = (fields, vals = {}) => '<div class="grid g2">' + fields.map(f => {
    const v = vals[f.k] !== undefined && vals[f.k] !== null ? vals[f.k] : (f.val !== undefined ? f.val : '');
    const span = f.full ? 'style="grid-column:1/-1"' : '';
    if (f.type === 'html') return `<div ${span}>${f.html}</div>`;
    if (f.type === 'check') return `<div class="f" ${span}><label class="chk"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> ${f.label}</label></div>`;
    let input;
    if (f.type === 'select') input = `<select class="in" name="${f.k}">${(f.options || []).map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea class="in" name="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea>`;
    else input = `<input class="in" name="${f.k}" type="${f.type === 'number' ? 'text' : (f.type || 'text')}" ${f.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(f.ph || '')}" ${f.ro ? 'readonly' : ''}>`;
    return `<div class="f" ${span}><label>${f.label}${f.req ? ' <span class="bad">*</span>' : ''}</label>${input}${f.help ? `<span class="small mute">${f.help}</span>` : ''}</div>`;
  }).join('') + '</div>';
  BX.formVals = (root, fields) => {
    const o = {};
    fields.forEach(f => {
      if (f.type === 'html') return;
      const el = root.querySelector(`[name="${f.k}"]`);
      if (!el) return;
      if (f.type === 'check') o[f.k] = el.checked;
      else if (f.type === 'number') o[f.k] = el.value === '' ? '' : nv(el.value);
      else o[f.k] = f.type === 'tel' || f.type === 'date' ? BX.toEnDigits(el.value).trim() : el.value.trim();
      if (f.req && (o[f.k] === '' || o[f.k] === undefined)) throw new Error(L(`"${f.label}" দিন`, `"${f.label}" is required`));
    });
    return o;
  };
  BX.formModal = (title, fields, vals, onSave, extra = {}) => BX.modal({
    title, wide: extra.wide, body: (extra.top || '') + BX.formHtml(fields, vals || {}) + (extra.bottom || ''), onOpen: extra.onOpen,
    buttons: [{ label: L('বাতিল', 'Cancel') }, { label: extra.saveLabel || L('সেভ করুন', 'Save'), cls: 'pri', onClick: async (close, el) => { const v = BX.formVals(el, fields); await onSave(v, el); close(); } }],
  });

  BX.table = (cols, rows, opts = {}) => {
    if (!rows || !rows.length) return `<div class="tbl-wrap"><div class="empty">${opts.empty || L('কোনো তথ্য নেই', 'No data')}</div></div>`;
    const head = cols.map(c => `<th class="${c.n ? 'n' : ''}">${c.h}</th>`).join('');
    const body = rows.map((r, i) => `<tr class="${opts.click ? 'click' : ''}" data-i="${i}">${cols.map(c => `<td class="${c.n ? 'n' : ''}">${c.f ? c.f(r, i) : esc(r[c.k])}</td>`).join('')}</tr>`).join('');
    const foot = opts.foot ? `<tfoot><tr>${cols.map(c => `<td class="${c.n ? 'n' : ''}">${opts.foot[c.k] !== undefined ? opts.foot[c.k] : ''}</td>`).join('')}</tr></tfoot>` : '';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  };
  BX.bindRows = (root, rows, fn) => $$('tbody tr[data-i]', root).forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('button,a,input,select')) return; fn(rows[tr.dataset.i]); }));

  BX.sum = (rows, k) => rows.reduce((a, r) => a + (Number(typeof k === 'function' ? k(r) : r[k]) || 0), 0);

  // amount in words (English, BD lakh/crore)
  BX.words = num => {
    num = Math.round(Number(num) || 0);
    if (num === 0) return 'Zero Taka Only';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    const parts = [];
    const crore = Math.floor(num / 1e7); num %= 1e7;
    const lakh = Math.floor(num / 1e5); num %= 1e5;
    const th = Math.floor(num / 1000); num %= 1000;
    if (crore) parts.push((crore >= 100 ? three(crore) : two(crore)) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (th) parts.push(two(th) + ' Thousand');
    if (num) parts.push(three(num));
    return parts.join(' ') + ' Taka Only';
  };

  // print an HTML document in a new window
  BX.print = (html, title, size) => {
    const w = window.open('', '_blank');
    if (!w) { BX.toast(L('পপ-আপ ব্লক করা আছে, অনুমতি দিন', 'Popup blocked — please allow popups'), 'bad'); return; }
    const pos = size === 'pos80';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title || 'Print')}</title>
      <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
      *{box-sizing:border-box} body{font-family:'Hind Siliguri',system-ui,sans-serif;color:#111;margin:0;padding:${pos ? '4px' : '24px'};font-size:${pos ? '12px' : '13px'};${pos ? 'width:76mm;' : ''}}
      h1,h2,h3{margin:0} table{width:100%;border-collapse:collapse} th,td{padding:${pos ? '3px 2px' : '6px 8px'};text-align:left;vertical-align:top}
      .items th{border-bottom:1.5px solid #111;border-top:1.5px solid #111;font-size:${pos ? '11px' : '12px'}} .items td{border-bottom:1px solid #ddd}
      .n{text-align:right;white-space:nowrap} .c{text-align:center} .muted{color:#555} .b{font-weight:700}
      .hdr{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:10px}
      .box{border:1px solid #ccc;border-radius:6px;padding:8px 10px}
      .tot td{padding:3px 8px} .tot .g td{border-top:1.5px solid #111;font-weight:800;font-size:${pos ? '14px' : '16px'}}
      .sig{display:flex;justify-content:space-between;margin-top:60px} .sig div{border-top:1px solid #333;padding-top:4px;width:180px;text-align:center}
      .stamp{display:inline-block;border:2px solid;padding:2px 10px;border-radius:6px;font-weight:800;transform:rotate(-6deg)}
      @page{${pos ? 'size:80mm auto;margin:2mm' : 'size:A4;margin:12mm'}}
      @media print{.np{display:none}}
      </style></head><body>${html}
      <div class="np" style="margin-top:20px;text-align:center"><button onclick="print()" style="padding:10px 24px;font-size:16px;cursor:pointer">🖨 Print</button></div>
      <script>window.onload=function(){setTimeout(function(){print()},400)}<\/script></body></html>`);
    w.document.close();
  };

  BX.waLink = (phone, text) => {
    let p = String(phone || '').replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '88' + p;
    return `https://wa.me/${p}?text=${encodeURIComponent(text || '')}`;
  };
  BX.validBD = p => /^01[3-9]\d{8}$/.test(String(p || '').replace(/[^0-9]/g, ''));

  // tile / unit display helpers
  BX.boxPcs = (sqft, p) => {
    const spp = Number(p.sqft_per_pcs) || 0, ppb = Number(p.pcs_per_box) || 0;
    if (!spp || !ppb) return BX.qty(sqft) + ' sqft';
    const sign = sqft < 0 ? '-' : '';
    const totalPcs = Math.round(Math.abs(sqft) / spp * 1000) / 1000;
    const boxes = Math.floor(totalPcs / ppb + 1e-9);
    const pcs = Math.round((totalPcs - boxes * ppb) * 100) / 100;
    return sign + BX.dg(boxes) + ' ' + L('বক্স', 'box') + (pcs ? ' ' + BX.dg(pcs) + ' ' + L('পিস', 'pcs') : '');
  };
  BX.stockText = (qty, p) => {
    if (p.kind === 'tile') return `${BX.boxPcs(qty, p)} <span class="mute small">(${BX.qty(qty)} sqft)</span>`;
    const units = p.units || [];
    const big = units.filter(u => Number(u.factor) > 1).sort((a, b) => b.factor - a.factor)[0];
    const su = units.find(u => u.name === p.sale_unit && Number(u.factor) !== 1) || (big && p.sale_unit !== p.base_unit ? big : null);
    return `${BX.qty(qty)} ${esc(p.base_unit)}${su ? ` <span class="mute small">(${BX.qty(qty / su.factor)} ${esc(su.name)})</span>` : ''}`;
  };
  BX.unitLabel = u => ({ sqft: L('স্কয়ার ফিট', 'sqft'), box: L('বক্স', 'box'), pcs: L('পিস', 'pcs') }[u] || u);

  // resize an image file to dataURL
  BX.imageToData = (file, max = 600) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });

  BX.download = (filename, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  BX.csv = rows => rows.map(r => r.map(v => { const s = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  BX.parseCsv = text => {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  };
  BX.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 250); }; };
})();
