(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const EMBED = new URLSearchParams(location.search).has('embed');
  if (EMBED) document.documentElement.classList.add('embed');
  const tell3d = detail => window.dispatchEvent(new CustomEvent('sync3d', { detail }));
  let evSeq = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const sfId = p => p + '5g0000' + Array.from({ length: 9 }, () => B62[rnd(62)]).join('');
  let shopSeq = 7412883000000 + rnd(900000);
  const shopId = () => String(shopSeq += 1 + rnd(9000));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + rnd(1e9));
  const money = n => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const phone = () => `04${rnd(10)}${rnd(10)} ${100 + rnd(900)} ${100 + rnd(900)}`;
  const clock = () => new Date().toLocaleTimeString('en-AU', { hour12: false });
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const IMG = id => `https://images.unsplash.com/photo-${id}?w=96&h=96&fit=crop&auto=format&q=70`;
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
  const UI = { shopTab: 'customers', sfTab: 'contacts', form: null, formErr: '', edit: null, dd: null };

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
      createSfOrder(s, o).Status = ful === 'Fulfilled' ? 'Fulfilled' : 'Paid';
    });
    return s;
  }
  function makeCustomer(p, at = Date.now()) {
    return { id: shopId(), first: p.first, last: p.last, email: p.email || `${p.first}.${p.last}@example.com`.toLowerCase().replace(/\s+/g, ''),
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
    const so = { Id: sfId('801'), OrderNumber: String(s.sfOrderNo++).padStart(8, '0'), Account: o.customerName,
                 Status: 'Paid', Amount: o.total, Lines: o.lines.length, ShopifyId: o.id, ShopifyName: o.name };
    s.sf.orders.unshift(so);
    return so;
  }

  /* ---------------------------------------------------------------- fresh-row marks */
  const marks = new Map();
  const mark = (side, id, note) => marks.set(side + ':' + id, { t: performance.now(), note });
  function freshAttr(side, id) {
    const m = marks.get(side + ':' + id);
    if (!m) return '';
    const el = performance.now() - m.t;
    if (el > 2600) { marks.delete(side + ':' + id); return ''; }
    return ` data-fresh="1" data-note="${esc(m.note)}" style="--d:-${el | 0}ms"`;
  }
  const rowCls = (side, id) => 'row' + (marks.has(side + ':' + id) && performance.now() - marks.get(side + ':' + id).t < 2600 ? ' fresh' : '');

  /* ---------------------------------------------------------------- split-flap numbers */
  const flaps = new Map();
  function flap(key, v) {
    let f = flaps.get(key);
    if (!f) { f = { v, prev: v, t: -1e9 }; flaps.set(key, f); }
    else if (f.v !== v) { f.prev = f.v; f.v = v; f.t = performance.now(); }
    const el = performance.now() - f.t;
    if (el > 700) return `<span class="flap"><span class="fl-top">${v}</span><span class="fl-bot">${v}</span></span>`;
    return `<span class="flap" style="--fd:-${el | 0}ms"><span class="fl-top">${v}</span><span class="fl-bot">${f.prev}</span><span class="fl-a">${f.prev}</span><span class="fl-b">${v}</span></span>`;
  }

  /* ---------------------------------------------------------------- rendering */
  function keepFocus(container, html) {
    const a = document.activeElement;
    let key = null, sel = null;
    if (a && container.contains(a) && a.tagName === 'INPUT') { key = a.dataset.k; sel = [a.selectionStart, a.selectionEnd]; }
    const top = container.scrollTop;
    container.innerHTML = html;
    container.scrollTop = top;
    if (key) { const n = container.querySelector(`[data-k="${key}"]`); if (n) { n.focus(); try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  }
  const editing = (side, kind, id) => UI.edit && UI.edit.side === side && UI.edit.kind === kind && UI.edit.id === id;
  const editBox = () => `<span class="inline-edit"><input data-k="edit" data-edit value="${esc(UI.edit.value)}" autocomplete="off"><button class="pill solid" data-act="editSave" style="height:28px">Save</button><button class="txt" data-act="editCancel">Cancel</button></span>`;

  function tabs(el, list, cur, attr) {
    el.innerHTML = list.map(([k, label, n]) => `<button data-${attr}="${k}" class="${k === cur ? 'on' : ''}">${label}<sup>${n}</sup></button>`).join('');
  }

  function renderShop() {
    const sh = S.shop, t = UI.shopTab;
    tabs($('#shopTabs'), [['customers', 'Customers', sh.customers.length], ['orders', 'Orders', sh.orders.length], ['stock', 'Stock', sh.products.length]], t, 'st');
    let h = '';
    if (t === 'customers') {
      if (UI.form) {
        const f = UI.form;
        const fld = (k, label, wide) => `<label class="${wide ? 'wide' : ''}">${label}<input data-k="f-${k}" data-f="${k}" value="${esc(f[k] || '')}" autocomplete="off"></label>`;
        h += `<div class="addform">${fld('first', 'First name')}${fld('last', 'Last name')}${fld('email', 'Email', true)}${fld('phone', 'Phone')}${fld('city', 'City')}
          <div class="actions"><button class="pill solid" data-act="formSave">Save customer</button><button class="txt" data-act="formCancel">Cancel</button>${UI.formErr ? `<span class="err">${esc(UI.formErr)}</span>` : ''}</div></div>`;
      } else {
        h += `<div class="lead-act"><button class="pill" data-act="formOpen">Add a customer</button><span class="note">It shows up in Salesforce as a Contact.</span></div>`;
      }
      h += '<ul class="rows">' + sh.customers.map(c => `
        <li class="${rowCls('shop', c.id)}" data-name="${esc(c.first + ' ' + c.last)}"${freshAttr('shop', c.id)}>
          <div class="r-main"><span class="r-name">${esc(c.first)} ${esc(c.last)}</span><span class="r-meta">${esc(c.email)} &middot; ${esc(c.city)}</span></div>
          <div class="r-side">${editing('shop', 'phone', c.id) ? editBox() : `<span class="mono">${esc(c.phone)}</span><button class="txt" data-act="editStart" data-side="shop" data-kind="phone" data-id="${c.id}">Edit</button>`}</div>
        </li>`).join('') + '</ul>';
    } else if (t === 'orders') {
      h += `<div class="lead-act"><button class="pill" data-act="storeOrder">Simulate a store order</button><span class="note">A shopper checks out online.</span></div>`;
      h += '<ul class="rows">' + sh.orders.map(o => {
        const items = o.lines.reduce((n, l) => n + l.qty, 0);
        const ful = o.fulfillment === 'Unfulfilled' ? '<span class="warn">Unfulfilled</span>' : o.fulfillment === 'Cancelled' ? '<span class="bad">Cancelled</span>' : 'Fulfilled';
        const fin = o.financial === 'Cancelled' ? 'Voided' : o.financial;
        return `<li class="${rowCls('shop', o.id)}" data-order="${o.name}"${freshAttr('shop', o.id)}>
          <div class="r-main"><span class="r-name">${o.name} &middot; ${esc(o.customerName)}</span><span class="r-meta">${plural(items, 'item')} &middot; ${money(o.total)}</span></div>
          <div class="r-side"><span class="status">${fin} &middot; ${ful}</span>${o.fulfillment === 'Unfulfilled' ? `<button class="txt" data-act="fulfil" data-id="${o.id}">Fulfil</button>` : ''}</div>
        </li>`;
      }).join('') + '</ul>';
    } else {
      h += '<ul class="rows">' + sh.products.map(p => `
        <li class="${rowCls('shop', p.id)}" data-sku="${p.sku}"${freshAttr('shop', p.id)}>
          <img class="thumb" src="${p.img}" alt="">
          <div class="r-main"><span class="r-name">${esc(p.title)}</span><span class="r-meta">${p.sku} &middot; ${money(p.price)}</span></div>
          <div class="r-side stepper"><button data-act="shopStock" data-id="${p.id}" data-d="-1" aria-label="One less">&minus;</button>${flap('shop:' + p.id, p.stock)}<button data-act="shopStock" data-id="${p.id}" data-d="1" aria-label="One more">+</button></div>
        </li>`).join('') + '</ul>';
    }
    keepFocus($('#shopBody'), h);
  }

  function renderSf() {
    const sf = S.sf, t = UI.sfTab;
    tabs($('#sfTabs'), [['contacts', 'Contacts', sf.contacts.length], ['orders', 'Orders', sf.orders.length], ['products', 'Products', sf.products.length]], t, 'ft');
    let h = '<ul class="rows">';
    if (t === 'contacts') {
      h += sf.contacts.map(c => `
        <li class="${rowCls('sf', c.Id)}" data-name="${esc(c.FirstName + ' ' + c.LastName)}"${freshAttr('sf', c.Id)}>
          <div class="r-main"><span class="r-name">${esc(c.FirstName)} ${esc(c.LastName)}</span><span class="r-meta">Shopify ID ${c.ShopifyId} &middot; ${esc(c.Email)}</span></div>
          <div class="r-side">${editing('sf', 'phone', c.Id) ? editBox() : `<span class="mono">${esc(c.Phone)}</span><button class="txt" data-act="editStart" data-side="sf" data-kind="phone" data-id="${c.Id}">Edit</button>`}</div>
        </li>`).join('');
    } else if (t === 'orders') {
      h += sf.orders.map(o => `
        <li class="${rowCls('sf', o.Id)}" data-order="${o.ShopifyName}"${freshAttr('sf', o.Id)}>
          <div class="r-main"><span class="r-name">${o.OrderNumber} &middot; ${esc(o.Account)}</span><span class="r-meta">${plural(o.Lines, 'order product')} &middot; ${money(o.Amount)} &middot; Shopify ${o.ShopifyName}</span></div>
          <div class="r-side"><div class="dd${UI.dd === o.Id ? ' open' : ''}"><button class="dd-btn" data-act="ddOpen" data-id="${o.Id}" aria-haspopup="listbox">${o.Status}<svg viewBox="0 0 10 10"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>${UI.dd === o.Id ? `<ul class="dd-menu" role="listbox">${['Paid', 'Fulfilled', 'Refunded', 'Cancelled'].map(s => `<li><button class="${s === o.Status ? 'cur' : ''}" data-act="ddPick" data-id="${o.Id}" data-v="${s}">${s === 'Paid' ? 'Paid' : s === 'Fulfilled' ? 'Mark as fulfilled' : s === 'Refunded' ? 'Mark as refunded' : 'Cancel order'}</button></li>`).join('')}</ul>` : ''}</div></div>
        </li>`).join('');
    } else {
      h += sf.products.map(p => `
        <li class="${rowCls('sf', p.Id)}" data-sku="${p.ProductCode}"${freshAttr('sf', p.Id)}>
          <div class="r-main"><span class="r-name">${esc(p.Name)}</span><span class="r-meta">${p.ProductCode} &middot; ${money(p.UnitPrice)}</span></div>
          <div class="r-side stepper"><button data-act="sfStock" data-id="${p.Id}" data-d="-1" aria-label="One less">&minus;</button>${flap('sf:' + p.Id, p.Stock)}<button data-act="sfStock" data-id="${p.Id}" data-d="1" aria-label="One more">+</button></div>
        </li>`).join('');
    }
    keepFocus($('#sfBody'), h + '</ul>');
    $('#sf').classList.toggle('offline', S.eng.sfDown);
    const b = $('#btnOutage');
    b.textContent = S.eng.sfDown ? 'Bring Salesforce back' : 'Take Salesforce offline';
    b.classList.toggle('alarm', S.eng.sfDown);
  }

  function renderTally() {
    const m = S.eng.m;
    const avg = m.lat.length ? (m.lat.reduce((a, b) => a + b, 0) / m.lat.length).toFixed(1) : null;
    const first = m.events ? `${plural(m.events, 'event')}, ${m.synced} synced${avg ? `, ${avg}s on average` : ''}.` : 'Nothing has happened yet.';
    $('#tally').innerHTML = `${first}<small>${m.dupes} duplicate${m.dupes === 1 ? '' : 's'} ignored &middot; ${m.loops} echo${m.loops === 1 ? '' : 'es'} skipped &middot; ${m.recovered} recovered after retry</small>`;
    $('#btnResend').disabled = !S.eng.lastWebhook;
  }

  function render() { renderShop(); renderSf(); renderTally(); }

  /* ---------------------------------------------------------------- sync log */
  const entries = $('#entries');
  const RES = { run: 'working', ok: 'synced', dup: 'duplicate ignored', loop: 'echo skipped', retry: 'waiting to retry', recovered: 'synced after retry', fail: 'failed, kept in error log' };
  const DIR = { s2f: 'Shopify &rarr; Salesforce', f2s: 'Salesforce &rarr; Shopify' };
  function emptyLog() { entries.innerHTML = '<li class="empty">Make a change on either side and it will show up here.</li>'; }
  function clearEmpty() { const e = entries.querySelector('.empty'); if (e) e.remove(); }
  function trace(dir, topic, ref) {
    clearEmpty();
    entries.querySelectorAll('.ev.open:not(.keep)').forEach(n => n.classList.remove('open'));
    const el = document.createElement('li');
    el.className = 'ev run open';
    el.innerHTML = `<div class="ev-top"><span>${clock()}</span><span class="dir">${DIR[dir]}</span><span class="res">${RES.run}</span></div>
      <div class="ev-what"><code>${esc(topic)}</code><span>${esc(ref || '')}</span></div><ol class="ev-steps"></ol>`;
    entries.prepend(el);
    while (entries.children.length > 60) entries.lastElementChild.remove();
    entries.scrollTop = 0;
    const t0 = performance.now();
    const id3 = ++evSeq;
    tell3d({ type: 'start', id: id3, dir });
    return {
      t0, el,
      step(text, detail, kind) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="t">+${Math.round(performance.now() - t0)}ms</span><span class="${kind || ''}">${esc(text)}${detail ? ` <span class="d">${esc(detail)}</span>` : ''}</span>`;
        el.querySelector('.ev-steps').append(li);
      },
      status(kind, took) {
        el.classList.remove('run', 'ok', 'dup', 'loop', 'retry', 'recovered', 'fail');
        el.classList.add(kind);
        el.querySelector('.res').textContent = RES[kind] + (took ? ' · ' + took : '');
        tell3d({ type: 'status', id: id3, kind });
      },
    };
  }
  function sysLine(text, up) {
    clearEmpty();
    const el = document.createElement('li');
    el.className = 'sysline ' + (up ? 'up' : 'down');
    el.textContent = `${clock()}  ${text}`;
    entries.prepend(el);
    entries.scrollTop = 0;
  }
  entries.addEventListener('click', e => { const ev = e.target.closest('.ev'); if (ev) ev.classList.toggle('open'); });
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
    renderTally();
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
    E.m.events++; renderTally();
    await step(T, 'Webhook received', 'id ' + wh.id.slice(0, 8), 340);
    await step(T, 'Signature checked', 'HMAC-SHA256 ok', 200);
    if (E.processed.has(wh.id)) {
      await step(T, 'Already processed, nothing written', null, 150, 'warn');
      T.status('dup', Math.round(performance.now() - T.t0) + 'ms'); E.m.dupes++; renderTally();
      return;
    }
    E.processed.add(wh.id);
    if (isEcho(wh)) {
      await step(T, 'Same values the sync just wrote to Shopify, skipped so it cannot loop', null, 150, 'loop');
      T.status('loop', Math.round(performance.now() - T.t0) + 'ms'); E.m.loops++; renderTally();
      return;
    }
    const plan = mapShopify(wh);
    await step(T, plan.map, plan.detail, 260);
    await sleep(380);
    if (E.sfDown) {
      T.step('Salesforce not reachable', 'HTTP 503', 'err');
      queueRetry(T, plan, 1);
      return;
    }
    const r = applySf(plan);
    T.step(r.text, r.detail, 'good');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderTally();
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
      map: 'Mapped to Contact', detail: 'name, email, phone, city',
      apply() {
        let ct = S.sf.contacts.find(x => x.ShopifyId === p.id);
        if (ct && ct.srcAt > p.updatedAt) return { text: 'Salesforce already has newer data, skipped', detail: 'out-of-order safe', id: ct.Id, tab: 'contacts', note: 'checked' };
        if (!ct) {
          ct = linkCustomer(S, { ...(S.shop.customers.find(x => x.id === p.id) || p), at: p.updatedAt });
          return { text: 'Contact created, matched on Shopify ID', detail: ct.Id, id: ct.Id, tab: 'contacts', note: 'new from Shopify' };
        }
        Object.assign(ct, { FirstName: p.first, LastName: p.last, Email: p.email, Phone: p.phone, srcAt: p.updatedAt });
        return { text: 'Contact updated, matched on Shopify ID', detail: ct.Id, id: ct.Id, tab: 'contacts', note: 'updated from Shopify' };
      },
    };
    if (wh.topic === 'orders/create') return {
      map: 'Mapped to Order and Order Products', detail: plural(p.lines.length, 'line'),
      apply() {
        const extra = [];
        if (!S.sf.contacts.find(x => x.ShopifyId === p.customerId)) {
          const c = S.shop.customers.find(x => x.id === p.customerId);
          if (c) { linkCustomer(S, c); extra.push('customer created first'); }
        }
        const so = S.sf.orders.find(x => x.ShopifyId === p.id) || createSfOrder(S, p);
        return { text: `Order ${so.OrderNumber} created with ${plural(p.lines.length, 'order product')}`, detail: extra.join(', ') || so.Id, id: so.Id, tab: 'orders', note: 'new from Shopify' };
      },
    };
    if (wh.topic.startsWith('orders/')) {
      const st = p.fulfillment === 'Fulfilled' ? 'Fulfilled' : p.fulfillment === 'Cancelled' ? 'Cancelled' : p.financial === 'Refunded' ? 'Refunded' : 'Paid';
      return {
        map: 'Mapped to Order Status', detail: `${p.fulfillment} -> ${st}`,
        apply() { const so = S.sf.orders.find(x => x.ShopifyId === p.id); so.Status = st; return { text: `Order ${so.OrderNumber} set to ${st}`, detail: so.Id, id: so.Id, tab: 'orders', note: 'updated from Shopify' }; },
      };
    }
    return {
      map: 'Mapped to Product stock', detail: `${p.sku} = ${p.available}`,
      apply() {
        const fp = S.sf.products.find(x => x.ShopifyId === p.productId);
        if (fp.srcAt > p.updatedAt) return { text: 'Salesforce already has newer stock, skipped', detail: 'out-of-order safe', id: fp.Id, tab: 'products', note: 'checked' };
        fp.Stock = p.available; fp.srcAt = p.updatedAt;
        return { text: `Stock set to ${p.available}`, detail: fp.Id, id: fp.Id, tab: 'products', note: 'updated from Shopify' };
      },
    };
  }

  function applySf(plan) {
    const r = plan.apply();
    mark('sf', r.id, r.note);
    if (!UI.edit && UI.sfTab !== r.tab) UI.sfTab = r.tab;
    renderSf();
    return r;
  }

  function queueRetry(T, plan, n) {
    const d = BACKOFF[n - 1];
    T.step(`Queued, retry ${n} of ${BACKOFF.length} in ${d / 1000}s`, n === 1 ? '(sped up here, live: 1m, 5m, 30m, then hourly)' : null, 'warn');
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
      it.T.step(`Retry ${it.n} went through`, null, 'good');
      it.T.step(r.text, r.detail, 'good');
      S.eng.m.synced++; S.eng.m.recovered++; renderTally();
      it.T.status('recovered', ((performance.now() - it.T.t0) / 1000).toFixed(1) + 's');
    });
  }, 200);

  // Salesforce -> Shopify
  async function onCdc(ev) {
    const E = S.eng;
    const T = trace('f2s', ev.entity + 'ChangeEvent', ev.ref);
    E.m.events++; renderTally();
    await step(T, 'Change event received', 'Change Data Capture', 340);
    await step(T, `Changed by ${ev.user}, not by the sync`, null, 200);
    const plan = mapSalesforce(ev);
    await step(T, plan.map, plan.detail, 260);
    await sleep(380);
    const r = plan.apply();
    mark('shop', r.id, 'updated from Salesforce');
    if (!UI.edit && !UI.form && UI.shopTab !== r.tab) UI.shopTab = r.tab;
    renderShop();
    T.step(r.text, r.detail, 'good');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderTally();
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
        return { text: 'Shopify customer updated', detail: 'customerUpdate', id: c.id, tab: 'customers' };
      },
    };
    if (ev.entity === 'Order') {
      const how = { Fulfilled: 'fulfillmentCreate', Cancelled: 'orderCancel', Refunded: 'tag added: Refunded', Paid: 'tag added: Paid' }[f.Status];
      return {
        map: 'Mapped Status to Shopify', detail: `${f.Status} -> ${how}`,
        apply() {
          const so = S.sf.orders.find(x => x.Id === ev.recordId);
          const o = S.shop.orders.find(x => x.id === so.ShopifyId);
          if (f.Status === 'Fulfilled') o.fulfillment = 'Fulfilled';
          else if (f.Status === 'Cancelled') { o.fulfillment = 'Cancelled'; o.financial = 'Cancelled'; }
          else if (f.Status === 'Refunded') o.financial = 'Refunded';
          else if (f.Status === 'Paid') o.financial = 'Paid';
          remember('o:' + o.id, o.fulfillment + '|' + o.financial);
          emitWebhook(f.Status === 'Fulfilled' ? 'orders/fulfilled' : f.Status === 'Cancelled' ? 'orders/cancelled' : 'orders/updated', orderPayload(o), o.name, { echo: true, delay: 650 });
          return { text: `Shopify order ${o.name} marked ${f.Status.toLowerCase()}`, detail: how, id: o.id, tab: 'orders' };
        },
      };
    }
    return {
      map: 'Mapped to Shopify stock', detail: `${f.ProductCode} = ${f.Stock}`,
      apply() {
        const fp = S.sf.products.find(x => x.Id === ev.recordId);
        const p = S.shop.products.find(x => x.id === fp.ShopifyId);
        p.stock = f.Stock;
        remember('i:' + p.id, String(p.stock));
        emitWebhook('inventory_levels/update', stockPayload(p), p.sku, { echo: true, delay: 650 });
        return { text: `Shopify stock set to ${p.stock}`, detail: 'inventorySetQuantities', id: p.id, tab: 'stock' };
      },
    };
  }

  /* ---------------------------------------------------------------- actions */
  // stock steppers wait a moment so several quick clicks go out as one change
  const stockTimers = new Map();
  function debounceStock(key, fn) { clearTimeout(stockTimers.get(key)); stockTimers.set(key, setTimeout(() => { stockTimers.delete(key); fn(); }, 600)); }

  const A = {
    formOpen() { UI.form = {}; UI.formErr = ''; UI.edit = null; renderShop(); const f = $('#shopBody [data-f="first"]'); if (f) f.focus(); },
    formCancel() { UI.form = null; UI.formErr = ''; renderShop(); },
    formSave() {
      const f = UI.form || {};
      const first = (f.first || '').trim(), last = (f.last || '').trim();
      if (!first || !last) { UI.formErr = 'First and last name are needed.'; renderShop(); return; }
      const email = (f.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { UI.formErr = 'That email doesn’t look right.'; renderShop(); return; }
      const c = makeCustomer({ first, last, email: email || undefined, phone: (f.phone || '').trim() || undefined, city: (f.city || '').trim() || 'Sydney', state: '' });
      S.shop.customers.unshift(c);
      UI.form = null; UI.formErr = '';
      mark('shop', c.id, 'just added');
      renderShop();
      emitWebhook('customers/create', custPayload(c), `${c.first} ${c.last}`);
    },
    editStart(side, kind, id) {
      if (side === 'sf' && S.eng.sfDown) return;
      const rec = side === 'shop' ? S.shop.customers.find(x => x.id === id) : S.sf.contacts.find(x => x.Id === id);
      UI.edit = { side, kind, id, value: side === 'shop' ? rec.phone : rec.Phone };
      side === 'shop' ? renderShop() : renderSf();
      const inp = $(`#${side === 'shop' ? 'shopBody' : 'sfBody'} [data-edit]`); if (inp) { inp.focus(); inp.select(); }
    },
    editCancel() { const s = UI.edit && UI.edit.side; UI.edit = null; s === 'sf' ? renderSf() : renderShop(); },
    editSave() {
      const ed = UI.edit; if (!ed) return;
      const v = ed.value.trim();
      UI.edit = null;
      if (ed.side === 'shop') {
        const c = S.shop.customers.find(x => x.id === ed.id);
        if (!v || v === c.phone) return renderShop();
        c.phone = v; c.at = Date.now();
        mark('shop', c.id, 'edited');
        renderShop();
        emitWebhook('customers/update', custPayload(c), `${c.first} ${c.last}`);
      } else {
        if (S.eng.sfDown) return renderSf();
        const ct = S.sf.contacts.find(x => x.Id === ed.id);
        if (!v || v === ct.Phone) return renderSf();
        ct.Phone = v; ct.srcAt = Date.now();
        mark('sf', ct.Id, 'edited');
        renderSf();
        emitCdc('Contact', ct.Id, { Phone: v }, `${ct.FirstName} ${ct.LastName}`);
      }
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
      mark('shop', o.id, 'new order');
      UI.shopTab = 'orders';
      renderShop();
      emitWebhook('orders/create', orderPayload(o), `${o.name} ${c.first} ${c.last}`, { delay: 150 });
      o.lines.forEach((l, i) => {
        const p = S.shop.products.find(x => x.key === l.key);
        p.stock -= l.qty;
        emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} -${l.qty} sold`, { side: true, delay: 300 + i * 80 });
      });
    },
    fulfil(id) {
      const o = S.shop.orders.find(x => x.id === id);
      if (!o || o.fulfillment !== 'Unfulfilled') return;
      o.fulfillment = 'Fulfilled';
      mark('shop', o.id, 'fulfilled');
      renderShop();
      emitWebhook('orders/fulfilled', orderPayload(o), o.name);
    },
    shopStock(id, d) {
      const p = S.shop.products.find(x => x.id === id);
      const before = p._pending == null ? p.stock : p._pending;
      p.stock = Math.max(0, p.stock + d);
      if (p._pending == null) p._pending = before;
      mark('shop', p.id, 'changed');
      renderShop();
      debounceStock('shop' + id, () => {
        const diff = p.stock - p._pending; p._pending = null;
        if (diff) emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} ${diff > 0 ? '+' : ''}${diff}`);
      });
    },
    sfStock(id, d) {
      if (S.eng.sfDown) return;
      const fp = S.sf.products.find(x => x.Id === id);
      const before = fp._pending == null ? fp.Stock : fp._pending;
      fp.Stock = Math.max(0, fp.Stock + d); fp.srcAt = Date.now();
      if (fp._pending == null) fp._pending = before;
      mark('sf', fp.Id, 'changed');
      renderSf();
      debounceStock('sf' + id, () => {
        const diff = fp.Stock - fp._pending; fp._pending = null;
        if (diff) emitCdc('Product2', fp.Id, { Stock: fp.Stock, ProductCode: fp.ProductCode }, `${fp.ProductCode} ${diff > 0 ? '+' : ''}${diff}`);
      });
    },
    sfStatus(id, status) {
      if (S.eng.sfDown) return renderSf();
      const so = S.sf.orders.find(x => x.Id === id);
      if (so.Status === status) return;
      so.Status = status;
      mark('sf', so.Id, 'edited');
      renderSf();
      emitCdc('Order', so.Id, { Status: status }, `${so.OrderNumber} (${so.ShopifyName})`);
    },
    resend() {
      const wh = S.eng.lastWebhook;
      if (!wh) return;
      enqueue({ kind: 'webhook', wh: { ...wh, ref: (wh.ref || '') + ' (sent again)' } });
    },
    outage(on) {
      if (S.eng.sfDown === on) return;
      S.eng.sfDown = on;
      tell3d({ type: 'outage', on });
      if (UI.edit && UI.edit.side === 'sf') UI.edit = null;
      sysLine(on ? 'Salesforce went offline (simulated)' : 'Salesforce is back online', !on);
      renderSf();
    },
  };

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', e => {
    const st = e.target.closest('[data-st]');
    if (st) { UI.shopTab = st.dataset.st; UI.edit = null; renderShop(); return; }
    const ft = e.target.closest('[data-ft]');
    if (ft) { UI.sfTab = ft.dataset.ft; UI.edit = null; renderSf(); return; }
    const b = e.target.closest('[data-act]');
    if (UI.dd && !(b && (b.dataset.act === 'ddPick' || b.dataset.act === 'ddOpen'))) { UI.dd = null; renderSf(); }
    if (!b) return;
    const d = b.dataset;
    switch (d.act) {
      case 'formOpen': A.formOpen(); break;
      case 'formCancel': A.formCancel(); break;
      case 'formSave': A.formSave(); break;
      case 'editStart': A.editStart(d.side, d.kind, d.id); break;
      case 'editSave': A.editSave(); break;
      case 'editCancel': A.editCancel(); break;
      case 'storeOrder': A.storeOrder(); break;
      case 'fulfil': A.fulfil(d.id); break;
      case 'shopStock': A.shopStock(d.id, +d.d); break;
      case 'sfStock': A.sfStock(d.id, +d.d); break;
      case 'ddOpen': UI.dd = UI.dd === d.id ? null : d.id; renderSf(); break;
      case 'ddPick': UI.dd = null; A.sfStatus(d.id, d.v); renderSf(); break;
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f && UI.form) UI.form[t.dataset.f] = t.value;
    else if (t.hasAttribute('data-edit') && UI.edit) UI.edit.value = t.value;
  });
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (e.key === 'Enter' && t.hasAttribute('data-edit')) { e.preventDefault(); A.editSave(); }
    else if (e.key === 'Enter' && t.dataset.f) { e.preventDefault(); A.formSave(); }
    else if (e.key === 'Escape' && t.hasAttribute('data-edit')) A.editCancel();
    else if (e.key === 'Escape' && t.dataset.f) A.formCancel();
  });
  $('#btnResend').addEventListener('click', () => A.resend());
  $('#btnOutage').addEventListener('click', () => A.outage(!S.eng.sfDown));
  $('#btnReset').addEventListener('click', reset);

  // pause background footage that is off screen, and respect reduced motion
  const vids = [...document.querySelectorAll('video[autoplay]')];
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) vids.forEach(v => { v.removeAttribute('autoplay'); v.pause(); });
  else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(list => list.forEach(en => { if (en.isIntersecting) en.target.play().catch(() => {}); else en.target.pause(); }), { threshold: 0.1 });
    vids.forEach(v => io.observe(v));
  }

  /* ---------------------------------------------------------------- reveals and tilt */
  const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(list => list.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  document.querySelectorAll('.reveal').forEach(el => revealIO ? revealIO.observe(el) : el.classList.add('in'));
  document.querySelectorAll('.tilt').forEach(fig => {
    fig.addEventListener('pointermove', e => {
      const r = fig.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      fig.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg');
      fig.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
    });
    fig.addEventListener('pointerleave', () => { fig.style.setProperty('--ry', '0deg'); fig.style.setProperty('--rx', '0deg'); });
  });

  /* ---------------------------------------------------------------- guide player */
  const player = $('#player'), vid = $('#vid');
  if (player && vid && !EMBED) {
    const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
    const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.6" height="14" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" fill="currentColor"/></svg>';
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const chapters = [...document.querySelectorAll('#chapters li')];
    const sync = () => { player.classList.toggle('paused', vid.paused); $('#pcPlay').innerHTML = vid.paused ? PLAY : PAUSE; };
    const tick = () => {
      const d = vid.duration || 0;
      $('#pcFill').style.width = d ? (vid.currentTime / d * 100) + '%' : '0';
      $('#pcTime').textContent = fmt(vid.currentTime) + (d ? ' / ' + fmt(d) : '');
      let cur = -1;
      chapters.forEach((li, i) => { if (vid.currentTime + 0.05 >= +li.dataset.t) cur = i; });
      chapters.forEach((li, i) => li.classList.toggle('on', i === cur && vid.currentTime > 0));
    };
    const toggle = () => { if (player.classList.contains('ended')) return; if (vid.paused) vid.play().catch(() => {}); else vid.pause(); };
    let uiT;
    const showUi = () => { player.classList.add('ui'); clearTimeout(uiT); uiT = setTimeout(() => player.classList.remove('ui'), 2200); };
    vid.addEventListener('play', () => { player.classList.remove('ended'); sync(); });
    vid.addEventListener('pause', sync);
    ['timeupdate', 'loadedmetadata', 'seeked'].forEach(ev => vid.addEventListener(ev, tick));
    vid.addEventListener('ended', () => { player.classList.add('ended'); sync(); });
    vid.addEventListener('click', () => { toggle(); showUi(); });
    player.addEventListener('pointermove', showUi);
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
    track.addEventListener('pointerdown', e => { track.setPointerCapture(e.pointerId); track.dataset.drag = '1'; player.classList.remove('ended'); seek(e); });
    track.addEventListener('pointermove', e => { if (track.dataset.drag) { seek(e); showUi(); } });
    track.addEventListener('pointerup', () => { delete track.dataset.drag; });
    chapters.forEach(li => li.addEventListener('click', () => { player.classList.remove('ended'); vid.currentTime = +li.dataset.t; vid.play().catch(() => {}); }));
    new IntersectionObserver(([en]) => { if (!en.isIntersecting && !vid.paused) vid.pause(); }, { threshold: 0.2 }).observe(player);
    sync(); tick();
  }

  function reset() {
    S = freshState();
    RQ.length = 0; Q.length = 0; marks.clear();
    stockTimers.forEach(t => clearTimeout(t)); stockTimers.clear();
    Object.assign(UI, { shopTab: 'customers', sfTab: 'contacts', form: null, formErr: '', edit: null, dd: null });
    flaps.clear();
    tell3d({ type: 'reset' });
    emptyLog();
    render();
  }

  const idle = (retries = false) => new Promise(res => {
    const t = setInterval(() => { if (!working && !Q.length && !pending && !stockTimers.size && (!retries || !RQ.length)) { clearInterval(t); res(); } }, 100);
  });

  reset();
  window.__demo = { A, UI, idle, reset, get state() { return S; } };
})();
