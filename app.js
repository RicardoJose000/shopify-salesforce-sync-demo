(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const EMBED = new URLSearchParams(location.search).has('embed');
  if (EMBED) document.documentElement.classList.add('embed');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const icons = () => window.lucide && lucide.createIcons();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const sfId = p => p + '5g0000' + Array.from({ length: 9 }, () => B62[rnd(62)]).join('');
  let shopSeq = 7412883000000 + rnd(900000);
  const shopId = () => String(shopSeq += 1 + rnd(9000));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + rnd(1e9));
  const money = n => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const phone = () => `04${rnd(10)}${rnd(10)} ${100 + rnd(900)} ${100 + rnd(900)}`;
  const clock = () => new Date().toLocaleTimeString('en-AU', { hour12: false });
  const timeAgo = t => { const d = new Date(t); const s = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ').toLowerCase(); return (new Date().toDateString() === d.toDateString() ? 'Today ' : 'Yesterday ') + s; };
  const today = () => new Date().toLocaleDateString('en-AU');

  const IMG = id => `https://images.unsplash.com/photo-${id}?w=96&h=96&fit=crop&auto=format&q=70`;
  const AV = (g, n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;

  const PRODUCTS = [
    { key: 'wat', title: 'Minimal Smart Watch', sku: 'HC-WAT-01', price: 249, stock: 18, img: IMG('1523275335684-37898b6baf30') },
    { key: 'hdp', title: 'Studio Headphones', sku: 'HC-HDP-02', price: 189, stock: 24, img: IMG('1505740420928-5e560c06d30e') },
    { key: 'snk', title: 'Runner Knit Sneaker', sku: 'HC-SNK-03', price: 139, stock: 32, img: IMG('1491553895911-0055eca6402d') },
    { key: 'bpk', title: 'Commuter Backpack', sku: 'HC-BPK-04', price: 119, stock: 15, img: IMG('1553062407-98eeb64c6a62') },
    { key: 'mug', title: 'Ceramic Mug', sku: 'HC-MUG-05', price: 24, stock: 60, img: IMG('1514228742587-6b1558fcca3d') },
  ];
  const SHOPPERS = [
    { first: 'Jack', last: 'Thompson', city: 'Perth', state: 'WA' },
    { first: 'Mia', last: 'Patel', city: 'Adelaide', state: 'SA' },
    { first: 'Noah', last: 'Kelly', city: 'Hobart', state: 'TAS' },
    { first: 'Ruby', last: 'Chen', city: 'Gold Coast', state: 'QLD' },
  ];
  const SEED = [
    { first: 'Liam', last: 'Nguyen', city: 'Melbourne', state: 'VIC' },
    { first: 'Chloe', last: 'Wilson', city: 'Brisbane', state: 'QLD' },
  ];
  const SF_USER = 'Sam Carter';
  const BACKOFF = [1500, 3000, 4500, 6000, 8000];

  /* ---------------------------------------------------------------- state */
  let S;
  const UI = { shopView: 'customers', sfView: 'contacts', form: {}, inv: new Map(), sfEdit: null, sfMenu: null };

  function freshState() {
    const s = {
      shop: { customers: [], orders: [], products: [] },
      sf: { contacts: [], orders: [], products: [] },
      eng: { processed: new Set(), recent: new Map(), lastWebhook: null, sfDown: false,
             m: { events: 0, synced: 0, dupes: 0, loops: 0, recovered: 0, lat: [] } },
      shoppers: SHOPPERS.slice(), orderNo: 1041, sfOrderNo: 100,
    };
    const yest = Date.now() - 26 * 3600000;
    PRODUCTS.forEach(p => {
      const sp = { id: shopId(), ...p };
      s.shop.products.push(sp);
      s.sf.products.push({ Id: sfId('01t'), Name: p.title, ProductCode: p.sku, Stock: p.stock, UnitPrice: p.price, ShopifyId: sp.id, srcAt: 0 });
    });
    SEED.forEach(p => { const c = makeCustomer(p, yest); s.shop.customers.push(c); linkCustomer(s, c); });
    [[0, [['snk', 1]], 'Fulfilled'], [1, [['hdp', 1], ['mug', 1]], 'Unfulfilled']].forEach(([ci, items, ful], i) => {
      const c = s.shop.customers[ci];
      const o = makeOrder(s, c, items, i ? Date.now() - 5 * 3600000 : yest);
      o.fulfillment = ful;
      c.orders++;
      s.shop.orders.unshift(o);
      const so = createSfOrder(s, o);
      so.Status = ful === 'Fulfilled' ? 'Fulfilled' : 'Paid';
    });
    return s;
  }
  function makeCustomer(p, at = Date.now()) {
    return { id: shopId(), first: p.first, last: p.last, email: p.email || `${p.first}.${p.last}@example.com`.toLowerCase(),
             phone: p.phone || phone(), city: `${p.city}${p.state ? ' ' + p.state : ''}`, orders: 0, at };
  }
  function linkCustomer(s, c) {
    const ct = { Id: sfId('003'), FirstName: c.first, LastName: c.last, Account: `${c.first} ${c.last}`, Email: c.email, Phone: c.phone, ShopifyId: c.id, srcAt: c.at };
    s.sf.contacts.unshift(ct);
    return ct;
  }
  function makeOrder(s, c, items, at = Date.now()) {
    const lines = items.map(([key, qty]) => { const p = s.shop.products.find(x => x.key === key); return { key, productId: p.id, sku: p.sku, qty, price: p.price }; });
    return { id: shopId(), name: '#' + (s.orderNo++), customerId: c.id, customerName: `${c.first} ${c.last}`, lines,
             total: lines.reduce((t, l) => t + l.qty * l.price, 0), financial: 'Paid', fulfillment: 'Unfulfilled', at };
  }
  function createSfOrder(s, o) {
    const so = { Id: sfId('801'), OrderNumber: String(s.sfOrderNo++).padStart(8, '0'), Account: o.customerName, Start: new Date(o.at).toLocaleDateString('en-AU'),
                 Status: 'Paid', Amount: o.total, Lines: o.lines.length, ShopifyId: o.id, ShopifyName: o.name };
    s.sf.orders.unshift(so);
    return so;
  }

  /* ---------------------------------------------------------------- flashes */
  const flashes = new Map();
  const flash = (side, id) => flashes.set(side + ':' + id, performance.now());
  function fl(side, id) {
    const t = flashes.get(side + ':' + id);
    if (t == null) return '';
    const el = performance.now() - t;
    if (el > 2400) { flashes.delete(side + ':' + id); return ''; }
    return ` class="flash" style="--d:-${el | 0}ms"`;
  }

  /* ---------------------------------------------------------------- Shopify UI */
  const shopEl = $('#shop'), sfEl = $('#sf');

  function shopDirtyMsg() {
    if (UI.shopView === 'customerNew' && Object.values(UI.form).some(v => v && String(v).trim())) return 'Unsaved customer';
    if (UI.inv.size) return 'Unsaved changes';
    return '';
  }
  function renderShopTop() {
    const msg = shopDirtyMsg();
    const top = $('#sTop');
    const want = msg ? 'save' : 'normal';
    if (top.dataset.mode === want && want === 'normal') return;
    top.dataset.mode = want;
    top.innerHTML = msg
      ? `<div class="s-savebar"><span class="s-sb-msg"><i data-lucide="circle-alert"></i>${msg}</span>
           <div class="s-sb-btns"><button class="s-btn-dark" data-act="shopDiscard" data-q="shop-discard">Discard</button><button class="s-btn-light" data-act="shopSave" data-q="shop-save">Save</button></div></div>`
      : `<span class="s-logo"><span class="logo logo-shopify"></span></span>
         <div class="s-search" data-na><i data-lucide="search"></i>Search<kbd>Ctrl K</kbd></div>
         <div class="s-store" data-na><span class="s-av">HC</span>Harbour &amp; Co.</div>`;
    icons();
  }

  function renderShopMain() {
    const v = UI.shopView, sh = S.shop;
    let h = '';
    if (v === 'customers') {
      h = `<div class="s-head"><h1>Customers</h1><button class="s-btn-primary" data-act="shopNewCustomer" data-q="shop-add-customer">Add customer</button></div>
        <div class="s-card"><div class="s-tabs"><span class="on">All</span><span data-na>Returning</span><span data-na>Email subscribers</span></div>
        <table class="s-table"><thead><tr><th>Customer name</th><th>Phone</th><th>Location</th><th class="r">Orders</th></tr></thead><tbody>
        ${sh.customers.map(c => `<tr data-name="${esc(c.first + ' ' + c.last)}"${fl('shop', c.id)}><td><b>${esc(c.first)} ${esc(c.last)}</b><div class="s-sub">${esc(c.email)}</div></td>
          <td data-cell="phone">${esc(c.phone)}</td><td>${esc(c.city)}, Australia</td><td class="r">${c.orders} order${c.orders === 1 ? '' : 's'}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else if (v === 'customerNew') {
      const f = UI.form;
      const field = (k, label, ph = '') => `<label class="s-field"><span>${label}</span><input data-f="${k}" data-q="f-${k}" value="${esc(f[k] || '')}" placeholder="${ph}" autocomplete="off"></label>`;
      h = `<div class="s-head"><button class="s-back" data-act="shopBack" data-q="shop-back"><i data-lucide="arrow-left"></i></button><h1>New customer</h1></div>
        <div class="s-card s-form"><h2>Customer overview</h2>
          <div class="s-row2">${field('first', 'First name')}${field('last', 'Last name')}</div>
          ${field('email', 'Email')}${field('phone', 'Phone number')}
        </div>
        <div class="s-card s-form"><h2>Default address</h2>
          <div class="s-row2">${field('city', 'City')}${field('state', 'State/territory')}</div>
          <label class="s-field"><span>Country/region</span><div class="s-select" data-na>Australia<i data-lucide="chevron-down"></i></div></label>
        </div>`;
    } else if (v === 'orders') {
      const badge = (cls, t) => `<span class="badge ${cls}"><i></i>${t}</span>`;
      h = `<div class="s-head"><h1>Orders</h1><button class="s-btn-sec" style="margin-left:auto" data-na>Export</button></div>
        <div class="s-card"><div class="s-tabs"><span class="on">All</span><span data-na>Unfulfilled</span><span data-na>Unpaid</span><span data-na>Open</span></div>
        <table class="s-table"><thead><tr><th>Order</th><th class="c-date">Date</th><th>Customer</th><th class="r">Total</th><th>Payment</th><th>Fulfillment</th></tr></thead><tbody>
        ${sh.orders.map(o => `<tr data-order="${o.name}"${fl('shop', o.id)}><td><b>${o.name}</b></td><td class="c-date">${timeAgo(o.at)}</td><td>${esc(o.customerName)}</td><td class="r">${money(o.total)}</td>
          <td>${o.financial === 'Refunded' ? badge('ref', 'Refunded') : o.financial === 'Cancelled' ? badge('can', 'Voided') : badge('paid', 'Paid')}</td>
          <td>${o.fulfillment === 'Fulfilled' ? badge('ful', 'Fulfilled') : o.fulfillment === 'Cancelled' ? badge('can', 'Cancelled') : badge('unf', 'Unfulfilled')}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else {
      h = `<div class="s-head"><h1>Inventory</h1><button class="s-btn-sec" style="margin-left:auto" data-na>Export</button></div>
        <div class="s-card"><div class="s-tabs"><span class="on">All</span><span data-na>Harbour &amp; Co. Warehouse</span></div>
        <table class="s-table"><thead><tr><th>Product</th><th>SKU</th><th class="r">Price</th><th class="r">Available</th></tr></thead><tbody>
        ${sh.products.map(p => { const dv = UI.inv.get(p.id); return `<tr data-sku="${p.sku}"${fl('shop', p.id)}><td><span class="s-prod"><img class="s-thumb" src="${p.img}" alt="">${esc(p.title)}</span></td><td>${p.sku}</td><td class="r">${money(p.price)}</td>
          <td class="r"><input class="s-num${dv != null ? ' dirty' : ''}" type="text" inputmode="numeric" data-inv="${p.id}" data-q="inv-${p.sku}" value="${dv != null ? esc(dv) : p.stock}"></td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    keepFocus($('#sMain'), h);
    shopEl.querySelectorAll('.s-nav a[data-sv]').forEach(a => a.classList.toggle('on',
      (a.dataset.sv === UI.shopView || (UI.shopView === 'customerNew' && a.dataset.sv === 'customers')) && !(a.dataset.sv === 'inventory' && !a.classList.contains('sub') && UI.shopView === 'inventory')));
    $('#sOrdCnt').textContent = S.shop.orders.filter(o => o.fulfillment === 'Unfulfilled').length || '';
  }

  // re-render without losing the caret in an input the user is typing in
  function keepFocus(container, html) {
    const a = document.activeElement;
    let key = null, sel = null;
    if (a && container.contains(a) && a.tagName === 'INPUT') { key = a.dataset.q; sel = [a.selectionStart, a.selectionEnd]; }
    const top = container.scrollTop;
    container.innerHTML = html;
    container.scrollTop = top;
    if (key) { const n = container.querySelector(`[data-q="${key}"]`); if (n) { n.focus(); try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
    icons();
  }

  let sToastT;
  function shopToast(msg) {
    const t = $('#sToast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(sToastT); sToastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------------------------------------------------------------- Salesforce UI */
  function renderSf() {
    const v = UI.sfView, sf = S.sf, ed = UI.sfEdit;
    const editCell = (obj, rec, field, val, q) => {
      if (ed && ed.obj === obj && ed.id === rec.Id && ed.field === field) {
        return `<td class="sf-ed${ed.changed ? ' edited' : ''}"><input class="sf-in" data-sfin data-q="sf-in" value="${esc(ed.value)}"></td>`;
      }
      const changed = ed && ed.saved && ed.obj === obj && ed.id === rec.Id;
      return `<td class="sf-ed${changed ? ' edited' : ''}">${esc(val)}<button class="sf-pen" title="Edit ${field}" data-act="sfEditStart" data-obj="${obj}" data-id="${rec.Id}" data-field="${field}" data-q="${q}"><span class="slds ic-edit"></span></button></td>`;
    };
    let h = '';
    const head = (icon, color, obj, lv, n, btns = '<button class="sf-btn" data-na>New</button><button class="sf-btn" data-na>Import</button>') => `
      <div class="sf-lvh"><span class="sf-oicon" style="--c:${color}"><span class="slds ${icon}"></span></span>
        <div><div class="sf-obj">${obj}</div><div class="sf-lv" data-na>${lv}<span class="slds ic-down"></span></div></div>
        <div class="sf-btns">${btns}</div></div>
      <div class="sf-info">${n} item${n === 1 ? '' : 's'} &bull; Sorted by ${v === 'orders' ? 'Order Number' : 'Name'} &bull; Updated a few seconds ago</div>`;
    if (v === 'contacts') {
      h = head('ic-contact', '#A094ED', 'Contacts', 'All Contacts', sf.contacts.length) + `
        <table class="sf-table"><thead><tr><th class="num"></th><th>Name</th><th>Account Name</th><th>Phone</th><th>Email</th><th>Shopify ID</th></tr></thead><tbody>
        ${sf.contacts.map((c, i) => `<tr data-name="${esc(c.FirstName + ' ' + c.LastName)}"${fl('sf', c.Id)}><td class="num">${i + 1}</td><td><span class="sf-link" data-na>${esc(c.FirstName)} ${esc(c.LastName)}</span></td>
          <td><span class="sf-link" data-na>${esc(c.Account)}</span></td>${editCell('contact', c, 'Phone', c.Phone, 'sf-pen-phone-' + c.FirstName)}<td>${esc(c.Email)}</td><td class="sf-mono">${c.ShopifyId}</td></tr>`).join('')}
        </tbody></table>`;
    } else if (v === 'orders') {
      h = head('ic-orders', '#769ED9', 'Orders', 'All Orders', sf.orders.length, '<button class="sf-btn solo" data-na>New</button>') + `
        <table class="sf-table"><thead><tr><th class="num"></th><th>Order Number</th><th>Account Name</th><th>Order Start Date</th><th>Status</th><th class="r">Order Amount</th><th>Shopify Order</th><th></th></tr></thead><tbody>
        ${sf.orders.map((o, i) => `<tr data-order="${o.ShopifyName}"${fl('sf', o.Id)}><td class="num">${i + 1}</td><td><span class="sf-link" data-na>${o.OrderNumber}</span></td><td><span class="sf-link" data-na>${esc(o.Account)}</span></td>
          <td>${o.Start}</td><td>${o.Status}</td><td class="r">${money(o.Amount)}</td><td class="sf-mono">${o.ShopifyName}</td>
          <td style="width:40px"><button class="sf-rowact" data-act="sfMenu" data-id="${o.Id}" data-q="sf-rowact-${o.ShopifyName.slice(1)}"><span class="slds ic-down"></span></button>
          ${UI.sfMenu === o.Id ? `<div class="sf-menu"><a data-act="sfStatus" data-id="${o.Id}" data-status="Fulfilled" data-q="sf-mark-fulfilled">Mark as Fulfilled</a><a data-act="sfStatus" data-id="${o.Id}" data-status="Refunded">Mark as Refunded</a><a data-act="sfStatus" data-id="${o.Id}" data-status="Cancelled">Cancel Order</a></div>` : ''}</td></tr>`).join('')}
        </tbody></table>`;
    } else {
      h = head('ic-product', '#B781D3', 'Products', 'All Products', sf.products.length) + `
        <table class="sf-table"><thead><tr><th class="num"></th><th>Product Name</th><th>Product Code</th><th>Stock</th><th class="r">List Price</th></tr></thead><tbody>
        ${sf.products.map((p, i) => `<tr data-sku="${p.ProductCode}"${fl('sf', p.Id)}><td class="num">${i + 1}</td><td><span class="sf-link" data-na>${esc(p.Name)}</span></td><td>${p.ProductCode}</td>
          ${editCell('product', p, 'Stock', p.Stock, 'sf-pen-stock-' + p.ProductCode)}<td class="r">${money(p.UnitPrice)}</td></tr>`).join('')}
        </tbody></table>`;
    }
    if (ed && !ed.saved) h += `<div class="sf-foot"><button class="sf-btn solo" data-act="sfCancel">Cancel</button><button class="sf-btn solo brand" data-act="sfSave" data-q="sf-save">Save</button></div>`;
    keepFocus($('#sfPage'), `<div class="sf-card">${h}</div>`);
    sfEl.querySelectorAll('.sf-nav a[data-fv]').forEach(a => a.classList.toggle('on', a.dataset.fv === UI.sfView));
    sfEl.classList.toggle('down', S.eng.sfDown);
  }

  let fToastT;
  function sfToast(msg, info) {
    const t = $('#sfToast'); t.innerHTML = `<i data-lucide="${info ? 'info' : 'circle-check'}"></i>${esc(msg)}`; icons();
    t.classList.toggle('info', !!info); t.classList.add('show');
    clearTimeout(fToastT); fToastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function renderStats() {
    const m = S.eng.m;
    const avg = m.lat.length ? (m.lat.reduce((a, b) => a + b, 0) / m.lat.length).toFixed(1) + 's' : '-';
    $('#stats').textContent = `${m.events} events · ${m.synced} synced · avg ${avg} · ${m.dupes} duplicate${m.dupes === 1 ? '' : 's'} ignored · ${m.loops} echo${m.loops === 1 ? '' : 'es'} skipped · ${m.recovered} recovered after retry`;
  }

  function render() { renderShopTop(); renderShopMain(); renderSf(); renderStats(); }

  /* ---------------------------------------------------------------- sync log */
  const logBody = $('#logBody');
  const RES = { run: 'processing', ok: 'synced', dup: 'duplicate ignored', loop: 'echo skipped', retry: 'waiting to retry', recovered: 'synced after retry', fail: 'failed, kept in error log' };
  const DIR = {
    s2f: '<span class="logo logo-shopify"></span>Shopify<em>→</em><span class="logo logo-sf"></span>Salesforce',
    f2s: '<span class="logo logo-sf"></span>Salesforce<em>→</em><span class="logo logo-shopify"></span>Shopify',
  };
  function emptyLog() { logBody.innerHTML = '<div class="log-empty">No events yet. Change something in Shopify or Salesforce and it shows up here.</div>'; }
  function trace(dir, topic, ref) {
    const e = logBody.querySelector('.log-empty'); if (e) e.remove();
    logBody.querySelectorAll('.lg-item.open').forEach(n => { if (!n.classList.contains('keep')) n.classList.remove('open'); });
    const el = document.createElement('div');
    el.className = 'lg-item open';
    el.innerHTML = `<div class="lg-row"><span class="mono">${clock()}</span><span class="c-dir">${DIR[dir]}</span><span class="mono c-evt">${esc(topic)}</span>
      <span class="c-rec">${esc(ref || '')}</span><span class="c-res run"><span class="d"></span>${RES.run}</span><span class="mono r c-took">-</span></div><div class="lg-steps"></div>`;
    logBody.prepend(el);
    while (logBody.children.length > 60) logBody.lastElementChild.remove();
    logBody.scrollTop = 0;
    const t0 = performance.now();
    return {
      t0, el,
      step(text, detail, kind) {
        const d = document.createElement('div');
        if (kind) d.className = kind;
        d.innerHTML = `<span class="ms">+${Math.round(performance.now() - t0)}ms</span><span class="tx">${esc(text)}</span>${detail ? `<span class="dt">${esc(detail)}</span>` : ''}`;
        el.querySelector('.lg-steps').append(d);
      },
      status(kind, took) {
        const r = el.querySelector('.c-res');
        r.className = 'c-res ' + kind;
        r.innerHTML = `<span class="d"></span>${RES[kind]}`;
        if (took != null) el.querySelector('.c-took').textContent = took;
      },
    };
  }
  function sysLine(text, up) {
    const e = logBody.querySelector('.log-empty'); if (e) e.remove();
    const el = document.createElement('div');
    el.className = 'lg-sys ' + (up ? 'up' : 'down');
    el.textContent = `${clock()}  ${text}`;
    logBody.prepend(el);
    logBody.scrollTop = 0;
  }
  logBody.addEventListener('click', e => { const r = e.target.closest('.lg-row'); if (r) r.parentElement.classList.toggle('open'); });
  async function step(T, text, detail, ms, kind) { T.step(text, detail, kind); await sleep(ms); }

  /* ---------------------------------------------------------------- engine */
  const Q = [], RQ = [];
  let working = false, pending = 0;
  function enqueue(job) { Q.push(job); pump(); }
  async function pump() {
    if (working) return;
    working = true;
    while (Q.length) {
      const j = Q.shift();
      try { j.kind === 'webhook' ? await onWebhook(j.wh) : await onCdc(j.ev); } catch (e) { console.error(e); }
    }
    working = false;
  }
  const later = (ms, fn) => { pending++; setTimeout(() => { pending--; fn(); }, ms); };

  function emitWebhook(topic, payload, ref, { echo = false, side = false, delay = 0 } = {}) {
    const wh = { id: uuid(), topic, payload: JSON.parse(JSON.stringify(payload)), ref };
    if (!echo && !side) S.eng.lastWebhook = wh;
    const go = () => enqueue({ kind: 'webhook', wh });
    delay ? later(delay, go) : go();
  }
  const emitCdc = (entity, recordId, fields, ref) => enqueue({ kind: 'cdc', ev: { entity, recordId, fields, ref, user: SF_USER } });

  const custPayload = c => ({ id: c.id, first: c.first, last: c.last, email: c.email, phone: c.phone, city: c.city, updatedAt: Date.now() });
  const custHash = p => [p.first, p.last, p.email, p.phone, p.city].join('|');
  const orderPayload = o => ({ id: o.id, name: o.name, customerId: o.customerId, customerName: o.customerName, lines: o.lines, total: o.total, at: o.at, financial: o.financial, fulfillment: o.fulfillment, updatedAt: Date.now() });
  const stockPayload = p => ({ productId: p.id, sku: p.sku, available: p.stock, updatedAt: Date.now() });

  // Shopify -> Salesforce
  async function onWebhook(wh) {
    const E = S.eng;
    const T = trace('s2f', wh.topic, wh.ref);
    E.m.events++; renderStats();
    await step(T, 'Webhook received', 'id ' + wh.id.slice(0, 8), 340);
    await step(T, 'Signature checked', 'HMAC-SHA256 ok', 200);
    if (E.processed.has(wh.id)) {
      await step(T, 'Event id already processed, nothing written', null, 150, 'warn');
      T.status('dup', Math.round(performance.now() - T.t0) + 'ms'); E.m.dupes++; renderStats();
      return;
    }
    E.processed.add(wh.id);
    if (isEcho(wh)) {
      await step(T, 'Values match what the sync just wrote to Shopify, skipped (no loop)', null, 150, 'loop');
      T.status('loop', Math.round(performance.now() - T.t0) + 'ms'); E.m.loops++; renderStats();
      return;
    }
    const plan = mapShopify(wh);
    await step(T, plan.map, plan.detail, 260);
    await sleep(380);
    if (E.sfDown) {
      T.step('Salesforce API not reachable', 'HTTP 503', 'err');
      queueRetry(T, plan, 1);
      return;
    }
    const r = applySf(plan);
    T.step(r.text, r.detail, 'good');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderStats();
    T.status('ok', secs.toFixed(1) + 's');
  }

  function isEcho(wh) {
    const p = wh.payload, E = S.eng;
    let key, hash;
    if (wh.topic.startsWith('customers/')) { key = 'c:' + p.id; hash = custHash(p); }
    else if (wh.topic.startsWith('orders/')) { key = 'o:' + p.id; hash = p.fulfillment + '|' + p.financial; }
    else { key = 'i:' + p.productId; hash = String(p.available); }
    const r = E.recent.get(key);
    if (r && r.hash === hash && r.exp > Date.now()) { E.recent.delete(key); return true; }
    return false;
  }
  const remember = (key, hash) => S.eng.recent.set(key, { hash, exp: Date.now() + 15000 });

  function mapShopify(wh) {
    const p = wh.payload;
    if (wh.topic.startsWith('customers/')) return {
      map: 'Mapped to Contact', detail: 'FirstName, LastName, Email, Phone, MailingCity',
      apply() {
        let ct = S.sf.contacts.find(x => x.ShopifyId === p.id);
        if (ct && ct.srcAt > p.updatedAt) return { text: 'Salesforce already has newer data, skipped', detail: 'out-of-order safe', id: ct.Id, view: 'contacts' };
        if (!ct) {
          ct = linkCustomer(S, { ...(S.shop.customers.find(x => x.id === p.id) || p), at: p.updatedAt });
          return { text: 'Contact created, upsert on Shopify_Customer_Id__c', detail: ct.Id, id: ct.Id, view: 'contacts' };
        }
        Object.assign(ct, { FirstName: p.first, LastName: p.last, Email: p.email, Phone: p.phone, srcAt: p.updatedAt });
        return { text: 'Contact updated, upsert on Shopify_Customer_Id__c', detail: ct.Id, id: ct.Id, view: 'contacts' };
      },
    };
    if (wh.topic === 'orders/create') return {
      map: 'Mapped to Order + Order Products', detail: `${p.lines.length} line${p.lines.length === 1 ? '' : 's'}, Standard Price Book`,
      apply() {
        const extra = [];
        if (!S.sf.contacts.find(x => x.ShopifyId === p.customerId)) {
          const c = S.shop.customers.find(x => x.id === p.customerId);
          if (c) { linkCustomer(S, c); extra.push('customer created first'); }
        }
        const so = S.sf.orders.find(x => x.ShopifyId === p.id) || createSfOrder(S, p);
        return { text: `Order ${so.OrderNumber} created with ${p.lines.length} Order Product${p.lines.length === 1 ? '' : 's'}`, detail: extra.join(', ') || so.Id, id: so.Id, view: 'orders' };
      },
    };
    if (wh.topic.startsWith('orders/')) {
      const st = p.fulfillment === 'Fulfilled' ? 'Fulfilled' : p.fulfillment === 'Cancelled' ? 'Cancelled' : p.financial === 'Refunded' ? 'Refunded' : 'Paid';
      return {
        map: 'Mapped to Order.Status', detail: `${p.fulfillment} -> ${st}`,
        apply() { const so = S.sf.orders.find(x => x.ShopifyId === p.id); so.Status = st; return { text: `Order ${so.OrderNumber} status set to ${st}`, detail: so.Id, id: so.Id, view: 'orders' }; },
      };
    }
    return {
      map: 'Mapped to Product2.Stock__c', detail: `${p.sku} = ${p.available}`,
      apply() {
        const fp = S.sf.products.find(x => x.ShopifyId === p.productId);
        if (fp.srcAt > p.updatedAt) return { text: 'Salesforce already has newer stock, skipped', detail: 'out-of-order safe', id: fp.Id, view: 'products' };
        fp.Stock = p.available; fp.srcAt = p.updatedAt;
        return { text: `Product stock set to ${p.available}`, detail: fp.Id, id: fp.Id, view: 'products' };
      },
    };
  }

  function applySf(plan) {
    const r = plan.apply();
    flash('sf', r.id);
    if (!EMBED && !UI.sfEdit && UI.sfView !== r.view) UI.sfView = r.view;
    renderSf();
    return r;
  }

  function queueRetry(T, plan, n) {
    const d = BACKOFF[n - 1];
    T.step(`Queued, retry ${n} of ${BACKOFF.length} in ${d / 1000}s`, n === 1 ? '(sped up for the demo, live: 1m, 5m, 30m, then hourly)' : null, 'warn');
    T.status('retry');
    T.el.classList.add('open', 'keep');
    RQ.push({ T, plan, n, at: Date.now() + d });
  }
  setInterval(() => {
    const now = Date.now();
    RQ.filter(it => it.at <= now && !it.busy).forEach(async it => {
      it.busy = true;
      await sleep(380);
      RQ.splice(RQ.indexOf(it), 1);
      if (S.eng.sfDown) {
        it.T.step(`Retry ${it.n} failed`, 'HTTP 503', 'err');
        if (it.n < BACKOFF.length) queueRetry(it.T, it.plan, it.n + 1);
        else { it.T.step('Kept in the error log with the reason, can be re-run', null, 'err'); it.T.status('fail'); }
        return;
      }
      const r = applySf(it.plan);
      it.T.step(`Retry ${it.n} succeeded`, null, 'good');
      it.T.step(r.text, r.detail, 'good');
      S.eng.m.synced++; S.eng.m.recovered++; renderStats();
      it.T.status('recovered', ((performance.now() - it.T.t0) / 1000).toFixed(1) + 's');
    });
  }, 200);

  // Salesforce -> Shopify
  async function onCdc(ev) {
    const E = S.eng;
    const T = trace('f2s', ev.entity + 'ChangeEvent', ev.ref);
    E.m.events++; renderStats();
    await step(T, 'Change event received', 'Change Data Capture', 340);
    await step(T, `Changed by ${ev.user}, not the integration user`, null, 200);
    const plan = mapSalesforce(ev);
    await step(T, plan.map, plan.detail, 260);
    await sleep(380);
    const r = plan.apply();
    flash('shop', r.id);
    if (!EMBED && UI.shopView !== r.view && !shopDirtyMsg()) UI.shopView = r.view;
    renderShopMain();
    T.step(r.text, r.detail, 'good');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderStats();
    T.status('ok', secs.toFixed(1) + 's');
  }

  function mapSalesforce(ev) {
    const f = ev.fields;
    if (ev.entity === 'Contact') return {
      map: 'Mapped to Shopify customer', detail: 'Phone -> phone',
      apply() {
        const ct = S.sf.contacts.find(x => x.Id === ev.recordId);
        const c = S.shop.customers.find(x => x.id === ct.ShopifyId);
        c.phone = f.Phone;
        const p = custPayload(c);
        remember('c:' + c.id, custHash(p));
        emitWebhook('customers/update', p, `${c.first} ${c.last}`, { echo: true, delay: 650 });
        return { text: 'Shopify customer updated', detail: 'customerUpdate ' + c.id, id: c.id, view: 'customers' };
      },
    };
    if (ev.entity === 'Order') {
      const how = { Fulfilled: 'fulfillmentCreate', Cancelled: 'orderCancel', Refunded: 'tagsAdd Refunded', Paid: 'tagsAdd Paid' }[f.Status];
      return {
        map: 'Mapped Status to Shopify', detail: `${f.Status} -> ${how}`,
        apply() {
          const so = S.sf.orders.find(x => x.Id === ev.recordId);
          const o = S.shop.orders.find(x => x.id === so.ShopifyId);
          if (f.Status === 'Fulfilled') o.fulfillment = 'Fulfilled';
          else if (f.Status === 'Cancelled') { o.fulfillment = 'Cancelled'; o.financial = 'Cancelled'; }
          else if (f.Status === 'Refunded') o.financial = 'Refunded';
          remember('o:' + o.id, o.fulfillment + '|' + o.financial);
          emitWebhook(f.Status === 'Fulfilled' ? 'orders/fulfilled' : f.Status === 'Cancelled' ? 'orders/cancelled' : 'orders/updated', orderPayload(o), o.name, { echo: true, delay: 650 });
          return { text: `Shopify order ${o.name} marked ${f.Status.toLowerCase()}`, detail: how, id: o.id, view: 'orders' };
        },
      };
    }
    return {
      map: 'Mapped to Shopify inventory', detail: `${f.ProductCode} available = ${f.Stock}`,
      apply() {
        const fp = S.sf.products.find(x => x.Id === ev.recordId);
        const p = S.shop.products.find(x => x.id === fp.ShopifyId);
        p.stock = f.Stock;
        UI.inv.delete(p.id);
        remember('i:' + p.id, String(p.stock));
        emitWebhook('inventory_levels/update', stockPayload(p), p.sku, { echo: true, delay: 650 });
        return { text: `Shopify available set to ${p.stock}`, detail: 'inventorySetQuantities ' + p.sku, id: p.id, view: 'inventory' };
      },
    };
  }

  /* ---------------------------------------------------------------- actions */
  const A = {
    shopView(v) { if (shopDirtyMsg()) return; UI.shopView = v; UI.form = {}; render(); },
    sfView(v) { UI.sfView = v; UI.sfEdit = null; UI.sfMenu = null; renderSf(); },
    shopNewCustomer() { UI.shopView = 'customerNew'; UI.form = {}; render(); },
    shopBack() { UI.shopView = 'customers'; UI.form = {}; render(); },
    shopDiscard() { UI.form = {}; UI.inv.clear(); if (UI.shopView === 'customerNew') UI.shopView = 'customers'; render(); },
    shopSave() {
      if (UI.shopView === 'customerNew') {
        const f = UI.form;
        if (!(f.first || '').trim() || !(f.last || '').trim()) { shopToast('First and last name are needed'); return; }
        const c = makeCustomer({ first: f.first.trim(), last: f.last.trim(), email: (f.email || '').trim() || undefined, phone: (f.phone || '').trim() || undefined, city: (f.city || '').trim() || 'Sydney', state: (f.state || '').trim() });
        S.shop.customers.unshift(c);
        UI.form = {}; UI.shopView = 'customers';
        flash('shop', c.id);
        render();
        shopToast('Customer created');
        emitWebhook('customers/create', custPayload(c), `${c.first} ${c.last}`);
        return;
      }
      const changes = [...UI.inv.entries()];
      UI.inv.clear();
      changes.forEach(([id, v]) => {
        const p = S.shop.products.find(x => x.id === id);
        const n = Math.max(0, parseInt(v, 10));
        if (Number.isNaN(n) || n === p.stock) return;
        const d = n - p.stock;
        p.stock = n;
        flash('shop', p.id);
        emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} ${d > 0 ? '+' : ''}${d}`);
      });
      render();
      if (changes.length) shopToast('Inventory updated');
    },
    storeOrder(first, items) {
      let c = first ? S.shop.customers.find(x => x.first === first) : null;
      if (!c) {
        const p = S.shoppers.shift();
        if (p) { c = makeCustomer(p); S.shop.customers.unshift(c); emitWebhook('customers/create', custPayload(c), `${c.first} ${c.last}`, { side: true }); }
        else c = pick(S.shop.customers);
      }
      if (!items) {
        const keys = S.shop.products.filter(p => p.stock > 0).map(p => p.key).sort(() => Math.random() - .5);
        items = keys.slice(0, 1 + rnd(2)).map(k => [k, 1 + rnd(2)]);
      }
      items = items.map(([k, q]) => [k, Math.min(q, S.shop.products.find(p => p.key === k).stock)]).filter(([, q]) => q > 0);
      if (!items.length) return;
      const o = makeOrder(S, c, items);
      c.orders++;
      S.shop.orders.unshift(o);
      flash('shop', o.id);
      if (!EMBED && !shopDirtyMsg()) UI.shopView = 'orders';
      render();
      shopToast(`New order ${o.name} from Online Store`);
      emitWebhook('orders/create', orderPayload(o), `${o.name} ${c.first} ${c.last}`, { delay: 150 });
      o.lines.forEach((l, i) => {
        const p = S.shop.products.find(x => x.key === l.key);
        p.stock -= l.qty;
        emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} -${l.qty} sold`, { side: true, delay: 300 + i * 80 });
      });
    },
    sfEditStart(obj, id, field) {
      if (S.eng.sfDown) return;
      const rec = (obj === 'contact' ? S.sf.contacts : S.sf.products).find(x => x.Id === id);
      UI.sfEdit = { obj, id, field, value: String(rec[field]), orig: String(rec[field]), changed: false };
      UI.sfMenu = null;
      renderSf();
      const inp = $('#sfPage .sf-in'); if (inp) { inp.focus(); inp.select(); }
    },
    sfCancel() { UI.sfEdit = null; renderSf(); },
    sfSave() {
      const ed = UI.sfEdit;
      if (!ed || S.eng.sfDown) return;
      UI.sfEdit = null;
      if (ed.value.trim() === ed.orig) { renderSf(); return; }
      if (ed.obj === 'contact') {
        const ct = S.sf.contacts.find(x => x.Id === ed.id);
        ct.Phone = ed.value.trim(); ct.srcAt = Date.now();
        flash('sf', ct.Id); renderSf();
        sfToast(`Contact "${ct.FirstName} ${ct.LastName}" was saved.`);
        emitCdc('Contact', ct.Id, { Phone: ct.Phone }, `${ct.FirstName} ${ct.LastName}`);
      } else {
        const fp = S.sf.products.find(x => x.Id === ed.id);
        const n = Math.max(0, parseInt(ed.value, 10));
        if (Number.isNaN(n)) { renderSf(); return; }
        fp.Stock = n; fp.srcAt = Date.now();
        flash('sf', fp.Id); renderSf();
        sfToast(`Product "${fp.Name}" was saved.`);
        emitCdc('Product2', fp.Id, { Stock: n, ProductCode: fp.ProductCode }, `${fp.ProductCode} stock ${n}`);
      }
    },
    sfMenu(id) { UI.sfMenu = UI.sfMenu === id ? null : id; renderSf(); },
    sfStatus(id, status) {
      UI.sfMenu = null;
      if (S.eng.sfDown) return renderSf();
      const so = S.sf.orders.find(x => x.Id === id);
      if (so.Status === status) return renderSf();
      so.Status = status;
      flash('sf', so.Id); renderSf();
      sfToast(`Order "${so.OrderNumber}" was saved.`);
      emitCdc('Order', so.Id, { Status: status }, `${so.OrderNumber} (${so.ShopifyName})`);
    },
    resend() {
      const wh = S.eng.lastWebhook;
      if (!wh) return;
      enqueue({ kind: 'webhook', wh: { ...wh, ref: (wh.ref || '') + ' (resent)' } });
    },
    outage(on) {
      if (S.eng.sfDown === on) return;
      S.eng.sfDown = on;
      $('#outage').checked = on;
      UI.sfEdit = null; UI.sfMenu = null;
      sysLine(on ? 'Salesforce API unreachable (simulated outage)' : 'Salesforce API reachable again', !on);
      renderSf();
    },
  };

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-sv]');
    if (nav) { A.shopView(nav.dataset.sv); return; }
    const fnav = e.target.closest('[data-fv]');
    if (fnav) { A.sfView(fnav.dataset.fv); return; }
    const na = e.target.closest('[data-na]');
    if (na) {
      if (na.closest('#sf')) sfToast('Not part of this demo. Try Contacts, Orders or Products.', true);
      else shopToast('Not part of this demo. Try Customers, Orders or Inventory.');
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) { if (UI.sfMenu && !e.target.closest('.sf-menu')) { UI.sfMenu = null; renderSf(); } return; }
    const d = b.dataset;
    switch (d.act) {
      case 'shopNewCustomer': A.shopNewCustomer(); break;
      case 'shopBack': A.shopBack(); break;
      case 'shopSave': A.shopSave(); break;
      case 'shopDiscard': A.shopDiscard(); break;
      case 'sfEditStart': A.sfEditStart(d.obj, d.id, d.field); break;
      case 'sfCancel': A.sfCancel(); break;
      case 'sfSave': A.sfSave(); break;
      case 'sfMenu': A.sfMenu(d.id); break;
      case 'sfStatus': A.sfStatus(d.id, d.status); break;
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f) { UI.form[t.dataset.f] = t.value; renderShopTop(); }
    else if (t.dataset.inv) {
      const p = S.shop.products.find(x => x.id === t.dataset.inv);
      if (t.value === String(p.stock)) UI.inv.delete(p.id); else UI.inv.set(p.id, t.value);
      t.classList.toggle('dirty', UI.inv.has(p.id));
      renderShopTop();
    } else if (t.hasAttribute('data-sfin') && UI.sfEdit) {
      UI.sfEdit.value = t.value;
      UI.sfEdit.changed = t.value !== UI.sfEdit.orig;
      t.parentElement.classList.toggle('edited', UI.sfEdit.changed);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-sfin')) A.sfSave();
    if (e.key === 'Escape' && UI.sfEdit) A.sfCancel();
  });
  $('#btnOrder').addEventListener('click', () => A.storeOrder());
  $('#btnReplay').addEventListener('click', () => A.resend());
  $('#outage').addEventListener('change', e => A.outage(e.target.checked));
  $('#btnReset').addEventListener('click', reset);

  /* ---------------------------------------------------------------- walkthrough player */
  const player = $('#player'), vid = $('#vid');
  if (player && !EMBED) {
    const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const sync = () => { player.classList.toggle('paused', vid.paused); $('#pcPlay').innerHTML = vid.paused ? ICON_PLAY : ICON_PAUSE; };
    const tick = () => {
      const d = vid.duration || 0;
      $('#pcFill').style.width = d ? (vid.currentTime / d * 100) + '%' : '0';
      $('#pcTime').textContent = fmt(vid.currentTime) + ' / ' + fmt(d || 115);
      if (d && vid.buffered.length) $('#pcBuf').style.width = (vid.buffered.end(vid.buffered.length - 1) / d * 100) + '%';
    };
    const toggle = () => { if (player.classList.contains('ended')) return; if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
    let uiT;
    const showUi = () => { player.classList.add('ui'); clearTimeout(uiT); uiT = setTimeout(() => player.classList.remove('ui'), 2200); };
    vid.addEventListener('play', () => { player.classList.remove('ended'); sync(); });
    vid.addEventListener('pause', sync);
    ['timeupdate', 'loadedmetadata', 'progress', 'seeked'].forEach(ev => vid.addEventListener(ev, tick));
    vid.addEventListener('ended', () => { player.classList.add('ended'); sync(); });
    vid.addEventListener('click', () => { toggle(); showUi(); });
    player.addEventListener('mousemove', showUi);
    $('#pBig').addEventListener('click', () => vid.play().catch(() => {}));
    $('#pcPlay').addEventListener('click', () => { toggle(); showUi(); });
    $('#pReplay').addEventListener('click', () => { vid.currentTime = 0; vid.play().catch(() => {}); });
    $('#pcFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (player.requestFullscreen) player.requestFullscreen();
      else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
    });
    const track = $('#pcTrack');
    const seek = e => { const r = track.getBoundingClientRect(); const x = Math.min(Math.max(e.clientX - r.left, 0), r.width); if (vid.duration) vid.currentTime = x / r.width * vid.duration; tick(); };
    track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); track.classList.add('drag'); player.classList.remove('ended'); seek(e); });
    track.addEventListener('pointermove', e => { if (track.classList.contains('drag')) { seek(e); showUi(); } });
    track.addEventListener('pointerup', () => track.classList.remove('drag'));
    document.addEventListener('keydown', e => {
      if (e.code !== 'Space' || (e.target.closest && e.target.closest('input, textarea, button, select'))) return;
      const r = player.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) { e.preventDefault(); toggle(); showUi(); }
    });
    // stop playing once it's scrolled out of view
    new IntersectionObserver(([en]) => { if (!en.isIntersecting && !vid.paused) vid.pause(); }, { threshold: 0.2 }).observe(player);
    sync(); tick();
    vid.play().catch(() => sync());
    $('#openVideo').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { if (vid.ended) vid.currentTime = 0; vid.play().catch(() => {}); }, 500);
    });
  }

  // keep row highlights fading correctly after re-renders
  const st = document.createElement('style');
  st.textContent = '.flash > td { animation-delay: var(--d, 0ms) !important; }';
  document.head.append(st);

  function reset() {
    S = freshState();
    RQ.length = 0; Q.length = 0; flashes.clear();
    Object.assign(UI, { shopView: 'customers', sfView: 'contacts', form: {}, inv: new Map(), sfEdit: null, sfMenu: null });
    $('#outage').checked = false;
    $('#sTop').dataset.mode = '';
    emptyLog();
    render();
  }

  const idle = (retries = false) => new Promise(res => {
    const t = setInterval(() => { if (!working && !Q.length && !pending && (!retries || !RQ.length)) { clearInterval(t); res(); } }, 100);
  });

  reset();
  window.__demo = { A, UI, idle, reset, get state() { return S; } };
})();
