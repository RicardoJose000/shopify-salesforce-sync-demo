(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const RECORD = new URLSearchParams(location.search).has('record');
  if (RECORD) document.documentElement.classList.add('record');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const icons = () => window.lucide && lucide.createIcons();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const sfId = p => p + '5g0000' + Array.from({ length: 9 }, () => B62[rnd(62)]).join('');
  let shopSeq = 7412883000000 + rnd(900000);
  const shopId = () => String(shopSeq += 1 + rnd(9000));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (rnd(16) & (c === 'x' ? 15 : 3 | 8)).toString(16)));
  const money = n => '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const phone = () => `04${rnd(10)}${rnd(10)} ${100 + rnd(900)} ${100 + rnd(900)}`;
  const clock = () => new Date().toLocaleTimeString('en-AU', { hour12: false });

  const IMG = id => `https://images.unsplash.com/photo-${id}?w=120&h=120&fit=crop&auto=format&q=70`;
  const AV = (g, n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;

  const PRODUCTS = [
    { key: 'wat', title: 'Minimal Smart Watch', sku: 'HC-WAT-01', price: 249, stock: 18, img: IMG('1523275335684-37898b6baf30') },
    { key: 'hdp', title: 'Studio Headphones', sku: 'HC-HDP-02', price: 189, stock: 24, img: IMG('1505740420928-5e560c06d30e') },
    { key: 'snk', title: 'Runner Knit Sneaker', sku: 'HC-SNK-03', price: 139, stock: 32, img: IMG('1491553895911-0055eca6402d') },
    { key: 'bpk', title: 'Commuter Backpack', sku: 'HC-BPK-04', price: 119, stock: 15, img: IMG('1553062407-98eeb64c6a62') },
    { key: 'mug', title: 'Ceramic Mug', sku: 'HC-MUG-05', price: 24, stock: 60, img: IMG('1514228742587-6b1558fcca3d') },
  ];
  const NEW_PEOPLE = [
    { first: 'Olivia', last: 'Bennett', city: 'Sydney, NSW', av: AV('women', 44) },
    { first: 'Jack', last: 'Thompson', city: 'Perth, WA', av: AV('men', 32) },
    { first: 'Mia', last: 'Patel', city: 'Adelaide, SA', av: AV('women', 68) },
    { first: 'Noah', last: 'Kelly', city: 'Hobart, TAS', av: AV('men', 75) },
    { first: 'Ruby', last: 'Chen', city: 'Gold Coast, QLD', av: AV('women', 12) },
    { first: 'Ethan', last: 'Walsh', city: 'Canberra, ACT', av: AV('men', 46) },
  ];
  const SEED_PEOPLE = [
    { first: 'Liam', last: 'Nguyen', city: 'Melbourne, VIC', av: AV('men', 22) },
    { first: 'Chloe', last: 'Wilson', city: 'Brisbane, QLD', av: AV('women', 65) },
  ];
  const SF_USER = 'Sam Carter (Sales)';
  const BACKOFF = [1500, 3000, 4500, 6000, 8000];

  /* ------------------------------------------------------------------ state */
  let S;
  function freshState() {
    const s = {
      shop: { customers: [], orders: [], products: [] },
      sf: { accounts: [], contacts: [], orders: [], products: [] },
      eng: { processed: new Set(), idMap: new Map(), recent: new Map(), lastWebhook: null, sfDown: false,
             m: { events: 0, synced: 0, dupes: 0, loops: 0, recovered: 0, lat: [] } },
      pool: NEW_PEOPLE.slice(), orderNo: 1041, sfOrderNo: 100,
    };
    const now = Date.now();
    PRODUCTS.forEach(p => {
      const sp = { id: shopId(), ...p, at: now };
      s.shop.products.push(sp);
      const fp = { Id: sfId('01t'), Name: p.title, ProductCode: p.sku, Stock: p.stock, UnitPrice: p.price, img: p.img, ShopifyId: sp.id, srcAt: now };
      s.sf.products.push(fp);
      s.eng.idMap.set(sp.id, fp.Id);
    });
    SEED_PEOPLE.forEach(p => {
      const c = makeCustomer(p);
      s.shop.customers.push(c);
      linkCustomer(s, c);
    });
    [[0, [['snk', 1]], 'Fulfilled'], [1, [['hdp', 1], ['mug', 1]], 'Unfulfilled']].forEach(([ci, items, ful]) => {
      const c = s.shop.customers[ci];
      const o = makeOrder(s, c, items);
      o.fulfillment = ful;
      c.orders++;
      s.shop.orders.unshift(o);
      createSfOrder(s, o);
      s.sf.orders[0].Status = ful === 'Fulfilled' ? 'Fulfilled' : 'Paid';
    });
    return s;
  }
  function makeCustomer(p) {
    return { id: shopId(), first: p.first, last: p.last, email: `${p.first}.${p.last}@example.com`.toLowerCase(),
             phone: phone(), city: p.city, av: p.av, orders: 0, at: Date.now() };
  }
  function linkCustomer(s, c) {
    const acc = { Id: sfId('001'), Name: `${c.first} ${c.last}`, ShopifyId: c.id };
    const ct = { Id: sfId('003'), FirstName: c.first, LastName: c.last, Email: c.email, Phone: c.phone, City: c.city,
                 AccountId: acc.Id, ShopifyId: c.id, srcAt: c.at };
    s.sf.accounts.unshift(acc);
    s.sf.contacts.unshift(ct);
    s.eng.idMap.set(c.id, ct.Id);
    return ct;
  }
  function makeOrder(s, c, items) {
    const lines = items.map(([key, qty]) => { const p = s.shop.products.find(x => x.key === key); return { key, productId: p.id, sku: p.sku, title: p.title, qty, price: p.price }; });
    return { id: shopId(), name: '#' + (s.orderNo++), customerId: c.id, customerName: `${c.first} ${c.last}`, lines,
             total: lines.reduce((t, l) => t + l.qty * l.price, 0), financial: 'Paid', fulfillment: 'Unfulfilled', at: Date.now() };
  }
  function createSfOrder(s, o) {
    const ct = s.sf.contacts.find(x => x.ShopifyId === o.customerId);
    const so = { Id: sfId('801'), OrderNumber: String(s.sfOrderNo++).padStart(8, '0'), AccountId: ct && ct.AccountId, AccountName: o.customerName,
                 Status: 'Paid', TotalAmount: o.total, Lines: o.lines.length, ShopifyId: o.id, ShopifyName: o.name };
    s.sf.orders.unshift(so);
    s.eng.idMap.set(o.id, so.Id);
    return so;
  }

  /* ------------------------------------------------------------------ rendering */
  const shopPanel = $('#shopPanel'), sfPanel = $('#sfPanel');
  const flashes = new Map();
  function flash(side, id, label) { flashes.set(side + ':' + id, { t: performance.now(), label }); }
  function flashAttrs(side, id) {
    const f = flashes.get(side + ':' + id);
    if (!f) return '';
    const el = performance.now() - f.t;
    if (el > 2600) { flashes.delete(side + ':' + id); return ''; }
    return ` data-flash="${esc(f.label)}" style="animation-delay:-${el | 0}ms"`;
  }
  const rowCls = (side, id) => 'row' + (flashes.has(side + ':' + id) && performance.now() - flashes.get(side + ':' + id).t < 2600 ? ' flash' : '');

  function setTab(panel, tab) { panel.dataset.tab = tab; render(); }

  function renderShop() {
    const tab = shopPanel.dataset.tab, sh = S.shop;
    let html = '', act = '';
    if (tab === 'customers') {
      html = sh.customers.map(c => `
        <div class="${rowCls('shop', c.id)}" data-id="${c.id}"${flashAttrs('shop', c.id)}>
          <img class="av" src="${c.av}" alt="">
          <div class="main"><b>${esc(c.first)} ${esc(c.last)}</b><span>${esc(c.email)}</span></div>
          <div class="side"><span class="mono">${c.phone}</span>${esc(c.city)}</div>
          <button class="ibtn" data-act="shopEdit" data-id="${c.id}" title="Customer updates their phone"><i data-lucide="pencil"></i></button>
        </div>`).join('');
      act = `<button class="btn btn-sm btn-light" data-act="shopAdd"><i data-lucide="user-plus"></i>New customer</button><span class="hint">Pencil = customer edits their phone</span>`;
    } else if (tab === 'orders') {
      html = sh.orders.map(o => {
        const fc = o.fulfillment === 'Fulfilled' ? 'gray' : o.fulfillment === 'Cancelled' ? 'red' : 'amber';
        const fin = o.financial === 'Refunded' ? 'gray' : o.financial === 'Cancelled' ? 'red' : 'green';
        const btn = o.fulfillment === 'Unfulfilled' ? `<button class="ibtn txt" data-act="shopFulfil" data-id="${o.id}" title="Mark as fulfilled in Shopify"><i data-lucide="package-check"></i>Fulfil</button>` : '';
        return `
        <div class="${rowCls('shop', o.id)}" data-id="${o.id}"${flashAttrs('shop', o.id)}>
          <span class="ord">${o.name}</span>
          <div class="main"><b>${esc(o.customerName)}</b><span>${((n) => n + (n === 1 ? ' item' : ' items'))(o.lines.reduce((t, l) => t + l.qty, 0))} · ${money(o.total)}</span></div>
          <div class="side"><div class="chips"><span class="chip ${fin}">${o.financial}</span><span class="chip ${fc}">${o.fulfillment}</span></div></div>
          ${btn}
        </div>`;
      }).join('');
      act = `<button class="btn btn-sm btn-light" data-act="shopOrder"><i data-lucide="shopping-bag"></i>Place order</button><span class="hint">A random customer buys 1-2 items</span>`;
    } else {
      html = sh.products.map(p => `
        <div class="${rowCls('shop', p.id)}" data-id="${p.id}"${flashAttrs('shop', p.id)}>
          <img class="pimg" src="${p.img}" alt="">
          <div class="main"><b>${esc(p.title)}</b><span>${p.sku} · ${money(p.price)}</span></div>
          <div class="stock">
            <button class="ibtn" data-act="shopStock" data-id="${p.id}" data-d="-1" title="Adjust stock"><i data-lucide="minus"></i></button>
            <span class="q">${p.stock}<small>avail.</small></span>
            <button class="ibtn" data-act="shopStock" data-id="${p.id}" data-d="1" title="Adjust stock"><i data-lucide="plus"></i></button>
          </div>
        </div>`).join('');
      act = `<span class="hint" style="margin-left:0">Use - / + to adjust stock in Shopify</span>`;
    }
    $('#shopList').innerHTML = html;
    $('#shopActions').innerHTML = act;
    shopPanel.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    shopPanel.querySelector('[data-count=customers]').textContent = sh.customers.length;
    shopPanel.querySelector('[data-count=orders]').textContent = sh.orders.length;
    shopPanel.querySelector('[data-count=products]').textContent = sh.products.length;
  }

  function renderSf() {
    const tab = sfPanel.dataset.tab, sf = S.sf;
    let html = '', act = '';
    if (tab === 'contacts') {
      html = sf.contacts.map(c => `
        <div class="${rowCls('sf', c.Id)}" data-id="${c.Id}"${flashAttrs('sf', c.Id)}>
          <span class="init">${c.FirstName[0]}${c.LastName[0]}</span>
          <div class="main"><b>${esc(c.FirstName)} ${esc(c.LastName)}</b><span>${esc(c.Email)}</span><span class="mono">Shopify ID ${c.ShopifyId}</span></div>
          <div class="side"><span class="mono">${c.Phone}</span>${esc(c.City)}</div>
          <button class="ibtn" data-act="sfEdit" data-id="${c.Id}" title="Sales rep updates the phone"><i data-lucide="pencil"></i></button>
        </div>`).join('');
      act = `<span class="hint" style="margin-left:0">Pencil = a sales rep updates the phone in Salesforce</span>`;
    } else if (tab === 'orders') {
      html = sf.orders.map(o => `
        <div class="${rowCls('sf', o.Id)}" data-id="${o.Id}"${flashAttrs('sf', o.Id)}>
          <span class="ord"><i data-lucide="file-text"></i></span>
          <div class="main"><b>${o.OrderNumber} · ${esc(o.AccountName)}</b><span>${o.Lines} Order Product${o.Lines === 1 ? '' : 's'} · ${money(o.TotalAmount)}</span><span class="mono">Shopify ${o.ShopifyName} · ${o.ShopifyId}</span></div>
          <select class="sel" data-act="sfStatus" data-id="${o.Id}">
            ${['Paid', 'Fulfilled', 'Cancelled', 'Refunded'].map(st => `<option${st === o.Status ? ' selected' : ''}>${st}</option>`).join('')}
          </select>
        </div>`).join('');
      act = `<span class="hint" style="margin-left:0">Change an Order Status to send it back to Shopify</span>`;
    } else {
      html = sf.products.map(p => `
        <div class="${rowCls('sf', p.Id)}" data-id="${p.Id}"${flashAttrs('sf', p.Id)}>
          <img class="pimg" src="${p.img}" alt="">
          <div class="main"><b>${esc(p.Name)}</b><span>${p.ProductCode} · Standard Price Book ${money(p.UnitPrice)}</span></div>
          <div class="stock">
            <button class="ibtn" data-act="sfStock" data-id="${p.Id}" data-d="-1" title="Adjust stock"><i data-lucide="minus"></i></button>
            <span class="q">${p.Stock}<small>stock</small></span>
            <button class="ibtn" data-act="sfStock" data-id="${p.Id}" data-d="1" title="Adjust stock"><i data-lucide="plus"></i></button>
          </div>
        </div>`).join('');
      act = `<span class="hint" style="margin-left:0">Use - / + to correct stock in Salesforce</span>`;
    }
    $('#sfList').innerHTML = html;
    $('#sfActions').innerHTML = act;
    sfPanel.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    sfPanel.querySelector('[data-count=contacts]').textContent = sf.contacts.length;
    sfPanel.querySelector('[data-count=orders]').textContent = sf.orders.length;
    sfPanel.querySelector('[data-count=products]').textContent = sf.products.length;
    sfPanel.classList.toggle('down', S.eng.sfDown);
  }

  let lastMetrics = {};
  function renderMetrics() {
    const m = S.eng.m;
    const vals = { mEvents: m.events, mSynced: m.synced, mDupes: m.dupes, mLoops: m.loops, mRec: m.recovered,
                   mAvg: m.lat.length ? (m.lat.reduce((a, b) => a + b, 0) / m.lat.length).toFixed(1) + 's' : '-' };
    for (const [id, v] of Object.entries(vals)) {
      const el = document.getElementById(id);
      if (lastMetrics[id] !== v) {
        el.textContent = v;
        if (lastMetrics[id] !== undefined) { el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump'); }
      }
    }
    lastMetrics = vals;
  }

  function render() { renderShop(); renderSf(); renderMetrics(); icons(); }

  /* ------------------------------------------------------------------ engine visuals */
  const traces = $('#traces');
  function dirBadge(dir) {
    return dir === 's2f'
      ? `<span class="dir"><span class="logo logo-shopify"></span><i data-lucide="arrow-right"></i><span class="logo logo-sf"></span></span>`
      : `<span class="dir"><span class="logo logo-sf"></span><i data-lucide="arrow-right"></i><span class="logo logo-shopify"></span></span>`;
  }
  const ST = {
    run: ['', 'Processing'], ok: ['check', ''], dup: ['copy-x', 'Duplicate blocked'], loop: ['repeat', 'Loop prevented'],
    retry: ['clock', 'Waiting to retry'], recovered: ['rotate-ccw', ''], fail: ['circle-alert', 'Parked in error log'],
  };
  function trace(dir, topic, ref) {
    $('#emptyTraces') && $('#emptyTraces').remove();
    const el = document.createElement('div');
    el.className = 'trace run';
    el.innerHTML = `<div class="t-head">${dirBadge(dir)}<span class="topic">${esc(topic)}</span><span class="t-time">${clock()}</span><span class="chip st run"><span class="spin"></span>Processing</span></div>${ref ? `<div class="t-ref">${esc(ref)}</div>` : ''}<ol class="steps"></ol>`;
    traces.prepend(el);
    while (traces.children.length > 40) traces.lastElementChild.remove();
    traces.scrollTop = 0;
    icons();
    const t0 = performance.now();
    const T = {
      t0,
      step(icon, text, detail, kind) {
        const li = document.createElement('li');
        if (kind) li.className = kind;
        li.innerHTML = `<i data-lucide="${icon}"></i><span class="s-text">${esc(text)}${detail ? `<em>${esc(detail)}</em>` : ''}</span><span class="s-ms">+${Math.round(performance.now() - t0)}ms</span>`;
        el.querySelector('.steps').append(li);
        icons();
      },
      status(kind, label) {
        el.className = 'trace ' + kind;
        const chip = el.querySelector('.st');
        chip.className = 'chip st ' + kind;
        chip.innerHTML = kind === 'run' ? `<span class="spin"></span>${label}` : `<i data-lucide="${ST[kind][0]}"></i>${esc(label || ST[kind][1])}`;
        icons();
      },
    };
    return T;
  }
  async function step(T, icon, text, detail, ms, kind) { T.step(icon, text, detail, kind); await sleep(ms); }
  function sysLine(text, up) {
    $('#emptyTraces') && $('#emptyTraces').remove();
    const el = document.createElement('div');
    el.className = 'sys' + (up ? ' up' : '');
    el.innerHTML = `<i data-lucide="${up ? 'cloud' : 'cloud-off'}"></i>${esc(text)}`;
    traces.prepend(el);
    icons();
  }

  const hub = $('#hub');
  let hubBusy = 0;
  function wire(seg, dirToHub, color, ms = 480) {
    const el = $(seg === 'L' ? '#segL' : '#segR');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--c', color);
    el.append(dot);
    const fromLeft = (seg === 'L') === dirToHub;
    dot.animate([{ left: fromLeft ? '0%' : '100%', opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { left: fromLeft ? '100%' : '0%', opacity: 0 }],
      { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => dot.remove();
  }
  function busy(on) { hubBusy += on ? 1 : -1; hub.classList.toggle('busy', hubBusy > 0); }
  const GREEN = '#95BF47', BLUE = '#38BDF8', TEAL = '#5EEAD4';

  /* ------------------------------------------------------------------ platform events */
  const Q = [];
  let working = false, pendingEmits = 0;
  const RQ = [];

  function enqueue(job) { Q.push(job); pump(); }
  async function pump() {
    if (working) return;
    working = true;
    while (Q.length) {
      const j = Q.shift();
      busy(true);
      try { j.kind === 'webhook' ? await handleWebhook(j.wh) : await handleCdc(j.ev); }
      catch (e) { console.error(e); }
      busy(false);
    }
    working = false;
  }
  function later(ms, fn) { pendingEmits++; setTimeout(() => { pendingEmits--; fn(); }, ms); }

  function emitWebhook(topic, payload, ref, { echo = false, delay = 0 } = {}) {
    const wh = { id: uuid(), topic, payload: JSON.parse(JSON.stringify(payload)), ref, at: Date.now() };
    if (!echo) S.eng.lastWebhook = wh;
    if (topic === 'orders/create') S.eng.lastOrderWebhook = wh;
    const go = () => enqueue({ kind: 'webhook', wh });
    delay ? later(delay, go) : go();
    return wh;
  }
  function emitCdc(entity, recordId, fields, ref) {
    enqueue({ kind: 'cdc', ev: { id: uuid(), entity, recordId, fields, ref, commitUser: SF_USER, at: Date.now() } });
  }

  const custPayload = c => ({ id: c.id, first: c.first, last: c.last, email: c.email, phone: c.phone, city: c.city, updatedAt: Date.now() });
  const custHash = p => [p.first, p.last, p.email, p.phone, p.city].join('|');

  /* ------------------------------------------------------------------ Shopify -> Salesforce */
  async function handleWebhook(wh) {
    const E = S.eng;
    const T = trace('s2f', wh.topic, wh.ref);
    E.m.events++; renderMetrics();
    wire('L', true, GREEN);
    await step(T, 'webhook', 'Webhook received from Shopify', 'event ' + wh.id.slice(0, 8), 360);
    await step(T, 'shield-check', 'Signature verified', 'HMAC-SHA256', 220);

    if (E.processed.has(wh.id)) {
      await step(T, 'copy-x', 'Event ID already processed', 'nothing written', 200, 'warn');
      T.status('dup'); E.m.dupes++; renderMetrics();
      return;
    }
    E.processed.add(wh.id);
    const echo = echoCheck(wh);
    if (echo) {
      await step(T, 'repeat', 'Same values the sync just wrote to Shopify', 'skipped, no loop', 200, 'loop');
      T.status('loop'); E.m.loops++; renderMetrics();
      return;
    }
    await step(T, 'fingerprint', 'New event, recorded in the event log', null, 180);
    const plan = mapShopify(wh);
    await step(T, 'shuffle', plan.mapText, plan.mapDetail, 260);
    await writeSalesforce(T, plan);
  }

  function echoCheck(wh) {
    const E = S.eng, p = wh.payload;
    let key, hash;
    if (wh.topic.startsWith('customers/')) { key = 'customer:' + p.id; hash = custHash(p); }
    else if (wh.topic.startsWith('orders/')) { key = 'order:' + p.id; hash = p.fulfillment + '|' + p.financial; }
    else if (wh.topic.startsWith('inventory')) { key = 'stock:' + p.productId; hash = String(p.available); }
    const r = E.recent.get(key);
    if (r && r.hash === hash && r.exp > Date.now()) { E.recent.delete(key); return true; }
    return false;
  }

  function mapShopify(wh) {
    const p = wh.payload;
    if (wh.topic.startsWith('customers/')) {
      return {
        mapText: 'Mapped Customer to Account + Contact', mapDetail: 'name, email, phone, city',
        apply() {
          const sf = S.sf;
          let ct = sf.contacts.find(x => x.ShopifyId === p.id);
          if (ct && ct.srcAt > p.updatedAt) return { text: 'Newer data already in Salesforce, skipped', detail: 'out-of-order safe', id: ct.Id, tab: 'contacts' };
          if (!ct) {
            const c = S.shop.customers.find(x => x.id === p.id) || p;
            ct = linkCustomer(S, { ...c, at: p.updatedAt });
            return { text: 'Contact created (upsert by Shopify ID)', detail: ct.Id, id: ct.Id, tab: 'contacts', label: 'created' };
          }
          Object.assign(ct, { FirstName: p.first, LastName: p.last, Email: p.email, Phone: p.phone, City: p.city, srcAt: p.updatedAt });
          return { text: 'Contact updated (upsert by Shopify ID)', detail: ct.Id, id: ct.Id, tab: 'contacts', label: 'updated' };
        },
      };
    }
    if (wh.topic === 'orders/create') {
      return {
        mapText: 'Mapped Order to Order + Order Products', mapDetail: `${p.lines.length} lines, Standard Price Book`,
        apply() {
          const extra = [];
          if (!S.sf.contacts.find(x => x.ShopifyId === p.customerId)) {
            const c = S.shop.customers.find(x => x.id === p.customerId);
            if (c) { linkCustomer(S, c); extra.push('customer created first'); }
          }
          let so = S.sf.orders.find(x => x.ShopifyId === p.id);
          if (!so) so = createSfOrder(S, p);
          return { text: `Order ${so.OrderNumber} created with ${p.lines.length} Order Products`, detail: extra.join(', ') || so.Id, id: so.Id, tab: 'orders', label: 'created' };
        },
      };
    }
    if (wh.topic.startsWith('orders/')) {
      const status = p.fulfillment === 'Fulfilled' ? 'Fulfilled' : p.fulfillment === 'Cancelled' ? 'Cancelled' : p.financial === 'Refunded' ? 'Refunded' : 'Paid';
      return {
        mapText: 'Mapped order status', mapDetail: `${p.fulfillment} -> Status = ${status}`,
        apply() {
          const so = S.sf.orders.find(x => x.ShopifyId === p.id);
          so.Status = status;
          return { text: `Order ${so.OrderNumber} status set to ${status}`, detail: so.Id, id: so.Id, tab: 'orders', label: 'updated' };
        },
      };
    }
    // inventory
    return {
      mapText: 'Mapped stock level to Product', mapDetail: `${p.sku}: available ${p.available}`,
      apply() {
        const fp = S.sf.products.find(x => x.ShopifyId === p.productId);
        if (fp.srcAt > p.updatedAt) return { text: 'Newer stock already in Salesforce, skipped', detail: 'out-of-order safe', id: fp.Id, tab: 'products' };
        fp.Stock = p.available; fp.srcAt = p.updatedAt;
        return { text: `Product stock set to ${p.available}`, detail: `${p.sku} · ${fp.Id}`, id: fp.Id, tab: 'products', label: 'updated' };
      },
    };
  }

  function applyToSf(T, plan) {
    const r = plan.apply();
    flash('sf', r.id, r.label || 'checked');
    if (sfPanel.dataset.tab !== r.tab && !guided.running) sfPanel.dataset.tab = r.tab;
    render();
    return r;
  }

  async function writeSalesforce(T, plan) {
    const E = S.eng;
    wire('R', false, TEAL);
    await sleep(400);
    if (E.sfDown) {
      T.step('server-crash', 'Salesforce API unavailable', 'HTTP 503', 'err');
      scheduleRetry(T, plan, 1);
      return;
    }
    const r = applyToSf(T, plan);
    T.step('database', r.text, r.detail, 'ok');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderMetrics();
    T.status('ok', `Synced in ${secs.toFixed(1)}s`);
  }

  function scheduleRetry(T, plan, n) {
    const d = BACKOFF[n - 1];
    T.step('clock', `Queued for retry #${n} in ${d / 1000}s`, n === 1 ? 'demo timing; live: 1m, 5m, 30m, hourly' : null, 'warn');
    T.status('retry', 'Waiting to retry');
    RQ.push({ T, plan, n, at: Date.now() + d });
  }

  setInterval(() => {
    const now = Date.now();
    RQ.filter(it => it.at <= now && !it.busy).forEach(async it => {
      it.busy = true;
      busy(true);
      wire('R', false, TEAL);
      await sleep(440);
      busy(false);
      RQ.splice(RQ.indexOf(it), 1);
      if (S.eng.sfDown) {
        it.T.step('x-circle', `Retry #${it.n} failed`, 'HTTP 503', 'err');
        if (it.n < BACKOFF.length) scheduleRetry(it.T, it.plan, it.n + 1);
        else { it.T.step('archive', 'Kept in the error log with the reason', 'can be re-run with one command', 'err'); it.T.status('fail'); }
        return;
      }
      const r = applyToSf(it.T, it.plan);
      it.T.step('rotate-ccw', `Retry #${it.n} succeeded`, null, 'ok');
      it.T.step('database', r.text, r.detail, 'ok');
      S.eng.m.synced++; S.eng.m.recovered++; renderMetrics();
      it.T.status('recovered', `Recovered after ${it.n} ${it.n > 1 ? 'retries' : 'retry'}`);
    });
  }, 200);

  /* ------------------------------------------------------------------ Salesforce -> Shopify */
  async function handleCdc(ev) {
    const E = S.eng;
    const T = trace('f2s', ev.entity + 'ChangeEvent', ev.ref);
    E.m.events++; renderMetrics();
    wire('R', true, BLUE);
    await step(T, 'radio-tower', 'Change event received from Salesforce', 'Change Data Capture', 360);
    await step(T, 'user-check', 'Changed by a person, not the sync user', ev.commitUser, 220);
    const plan = mapSalesforce(ev);
    await step(T, 'shuffle', plan.mapText, plan.mapDetail, 260);
    wire('L', false, TEAL);
    await sleep(440);
    const r = plan.apply();
    flash('shop', r.id, 'updated');
    if (shopPanel.dataset.tab !== r.tab && !guided.running) shopPanel.dataset.tab = r.tab;
    render();
    T.step('send', r.text, r.detail, 'ok');
    const secs = (performance.now() - T.t0) / 1000;
    E.m.synced++; E.m.lat.push(secs); renderMetrics();
    T.status('ok', `Synced in ${secs.toFixed(1)}s`);
  }

  function remember(key, hash) { S.eng.recent.set(key, { hash, exp: Date.now() + 15000 }); }

  function mapSalesforce(ev) {
    const f = ev.fields;
    if (ev.entity === 'Contact') {
      return {
        mapText: 'Mapped Contact to Shopify customer', mapDetail: 'Phone -> phone',
        apply() {
          const ct = S.sf.contacts.find(x => x.Id === ev.recordId);
          const c = S.shop.customers.find(x => x.id === ct.ShopifyId);
          c.phone = f.Phone; c.at = Date.now();
          const p = custPayload(c);
          remember('customer:' + c.id, custHash(p));
          emitWebhook('customers/update', p, `${c.first} ${c.last}`, { echo: true, delay: 700 });
          return { text: 'Shopify customer updated', detail: 'customerUpdate · ' + c.id, id: c.id, tab: 'customers' };
        },
      };
    }
    if (ev.entity === 'Order') {
      const how = { Fulfilled: 'fulfillmentCreate', Cancelled: 'orderCancel', Refunded: 'tagsAdd "Refunded"', Paid: 'tagsAdd "Paid"' }[f.Status];
      return {
        mapText: 'Mapped Order Status to Shopify', mapDetail: `Status ${f.Status} -> ${how}`,
        apply() {
          const so = S.sf.orders.find(x => x.Id === ev.recordId);
          const o = S.shop.orders.find(x => x.id === so.ShopifyId);
          if (f.Status === 'Fulfilled') o.fulfillment = 'Fulfilled';
          else if (f.Status === 'Cancelled') { o.fulfillment = 'Cancelled'; o.financial = 'Cancelled'; }
          else if (f.Status === 'Refunded') o.financial = 'Refunded';
          remember('order:' + o.id, o.fulfillment + '|' + o.financial);
          const topic = f.Status === 'Fulfilled' ? 'orders/fulfilled' : f.Status === 'Cancelled' ? 'orders/cancelled' : 'orders/updated';
          emitWebhook(topic, orderPayload(o), o.name, { echo: true, delay: 700 });
          return { text: `Shopify order ${o.name} ${f.Status === 'Paid' ? 'tagged Paid' : f.Status.toLowerCase()}`, detail: how, id: o.id, tab: 'orders' };
        },
      };
    }
    return {
      mapText: 'Mapped Product stock to Shopify inventory', mapDetail: `${f.ProductCode}: ${f.Stock}`,
      apply() {
        const fp = S.sf.products.find(x => x.Id === ev.recordId);
        const p = S.shop.products.find(x => x.id === fp.ShopifyId);
        p.stock = f.Stock;
        remember('stock:' + p.id, String(p.stock));
        emitWebhook('inventory_levels/update', stockPayload(p), p.sku, { echo: true, delay: 700 });
        return { text: `Shopify inventory set to ${p.stock}`, detail: 'inventorySetQuantities · ' + p.sku, id: p.id, tab: 'products' };
      },
    };
  }

  const orderPayload = o => ({ id: o.id, name: o.name, customerId: o.customerId, customerName: o.customerName, lines: o.lines, total: o.total, financial: o.financial, fulfillment: o.fulfillment, updatedAt: Date.now() });
  const stockPayload = p => ({ productId: p.id, sku: p.sku, available: p.stock, updatedAt: Date.now() });

  /* ------------------------------------------------------------------ user actions */
  const A = {
    shopAdd() {
      const person = S.pool.shift() || pick(NEW_PEOPLE);
      const c = makeCustomer(person);
      S.shop.customers.unshift(c);
      flash('shop', c.id, 'new');
      shopPanel.dataset.tab = 'customers';
      render();
      emitWebhook('customers/create', custPayload(c), `${c.first} ${c.last}`);
      return c;
    },
    shopEdit(id) {
      const c = S.shop.customers.find(x => x.id === id);
      c.phone = phone(); c.at = Date.now();
      flash('shop', c.id, 'edited');
      render();
      emitWebhook('customers/update', custPayload(c), `${c.first} ${c.last}`);
    },
    shopOrder(customerId, items) {
      const c = customerId ? S.shop.customers.find(x => x.id === customerId) : pick(S.shop.customers);
      if (!items) {
        const avail = S.shop.products.filter(p => p.stock > 0).map(p => p.key).sort(() => Math.random() - .5);
        items = avail.slice(0, 1 + rnd(2)).map(k => [k, 1 + rnd(2)]);
      }
      items = items.map(([k, q]) => [k, Math.min(q, S.shop.products.find(p => p.key === k).stock)]).filter(([, q]) => q > 0);
      if (!items.length) return null;
      const o = makeOrder(S, c, items);
      c.orders++;
      S.shop.orders.unshift(o);
      flash('shop', o.id, 'new');
      shopPanel.dataset.tab = 'orders';
      render();
      emitWebhook('orders/create', orderPayload(o), `${o.name} · ${c.first} ${c.last}`);
      o.lines.forEach((l, i) => {
        const p = S.shop.products.find(x => x.key === l.key);
        p.stock -= l.qty;
        emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} · -${l.qty} sold`, { delay: 120 + i * 60 });
      });
      return o;
    },
    shopFulfil(id) {
      const o = S.shop.orders.find(x => x.id === id);
      o.fulfillment = 'Fulfilled';
      flash('shop', o.id, 'fulfilled');
      render();
      emitWebhook('orders/fulfilled', orderPayload(o), o.name);
    },
    shopStock(id, d) {
      const p = S.shop.products.find(x => x.id === id);
      p.stock = Math.max(0, p.stock + d);
      flash('shop', p.id, 'adjusted');
      render();
      emitWebhook('inventory_levels/update', stockPayload(p), `${p.sku} · ${d > 0 ? '+' : ''}${d}`);
    },
    sfEdit(id) {
      if (S.eng.sfDown) return;
      const ct = S.sf.contacts.find(x => x.Id === id);
      ct.Phone = phone(); ct.srcAt = Date.now();
      flash('sf', ct.Id, 'edited');
      render();
      emitCdc('Contact', ct.Id, { Phone: ct.Phone }, `${ct.FirstName} ${ct.LastName}`);
    },
    sfStatus(id, status) {
      if (S.eng.sfDown) return;
      const so = S.sf.orders.find(x => x.Id === id);
      if (so.Status === status) return;
      so.Status = status;
      flash('sf', so.Id, 'edited');
      render();
      emitCdc('Order', so.Id, { Status: status }, `${so.OrderNumber} · ${so.ShopifyName}`);
    },
    sfStock(id, d) {
      if (S.eng.sfDown) return;
      const fp = S.sf.products.find(x => x.Id === id);
      fp.Stock = Math.max(0, fp.Stock + d); fp.srcAt = Date.now();
      flash('sf', fp.Id, 'edited');
      render();
      emitCdc('Product2', fp.Id, { Stock: fp.Stock, ProductCode: fp.ProductCode }, `${fp.ProductCode} · ${d > 0 ? '+' : ''}${d}`);
    },
    replay(wh) {
      wh = wh || S.eng.lastWebhook;
      if (!wh) return;
      enqueue({ kind: 'webhook', wh: { ...wh, ref: (wh.ref || '') + ' · resent' } });
    },
  };

  function setOutage(on) {
    if (S.eng.sfDown === on) return;
    S.eng.sfDown = on;
    $('#outage').checked = on;
    sysLine(on ? 'Salesforce went offline (simulated)' : 'Salesforce back online', !on);
    render();
  }

  /* ------------------------------------------------------------------ wiring */
  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('.tabs button');
    if (tabBtn) { setTab(tabBtn.closest('.panel'), tabBtn.dataset.tab); return; }
    const b = e.target.closest('button[data-act]');
    if (!b || guided.running) return;
    const { act, id, d } = b.dataset;
    if (act === 'shopAdd') A.shopAdd();
    else if (act === 'shopEdit') A.shopEdit(id);
    else if (act === 'shopOrder') A.shopOrder();
    else if (act === 'shopFulfil') A.shopFulfil(id);
    else if (act === 'shopStock') A.shopStock(id, +d);
    else if (act === 'sfEdit') A.sfEdit(id);
    else if (act === 'sfStock') A.sfStock(id, +d);
  });
  document.addEventListener('change', e => {
    const s = e.target.closest('select[data-act=sfStatus]');
    if (s && !guided.running) A.sfStatus(s.dataset.id, s.value);
  });
  $('#outage').addEventListener('change', e => setOutage(e.target.checked));
  $('#btnReplay').addEventListener('click', () => !guided.running && A.replay());
  $('#btnReset').addEventListener('click', () => !guided.running && reset());
  $('#btnGuided').addEventListener('click', () => runGuided());

  function reset() {
    S = freshState();
    RQ.length = 0; Q.length = 0; flashes.clear(); lastMetrics = {};
    traces.innerHTML = `<div class="empty" id="emptyTraces"><i data-lucide="activity"></i><b>Waiting for changes</b><span>Make a change in Shopify or Salesforce, or run the guided demo.</span></div>`;
    $('#outage').checked = false;
    shopPanel.dataset.tab = 'customers'; sfPanel.dataset.tab = 'contacts';
    render();
  }

  // keep flash highlights fading smoothly without re-rendering too often
  setInterval(() => { if (flashes.size) { for (const [k, f] of flashes) if (performance.now() - f.t > 2700) flashes.delete(k); } }, 500);

  /* ------------------------------------------------------------------ guided demo */
  const guided = { running: false };
  const idle = (retries = false) => new Promise(res => {
    const t = setInterval(() => {
      if (!working && !Q.length && !pendingEmits && (!retries || !RQ.length)) { clearInterval(t); res(); }
    }, 120);
  });
  const TOTAL = 7;
  function caption(n, title, sub) {
    $('#cNum').textContent = n;
    $('#cTitle').textContent = title;
    $('#cSub').textContent = sub;
    $('#cSteps').innerHTML = Array.from({ length: TOTAL }, (_, i) => `<i class="${i + 1 < n ? 'on' : i + 1 === n ? 'cur' : ''}"></i>`).join('');
    $('#caption').classList.add('show');
  }
  const hideCaption = () => $('#caption').classList.remove('show');
  const tabs = (shop, sf) => { shopPanel.dataset.tab = shop; sfPanel.dataset.tab = sf; render(); };
  function lockUi(on) {
    guided.running = on;
    ['#btnReplay', '#btnReset'].forEach(s => $(s).disabled = on);
    $('#btnGuided').disabled = on;
    $('#btnGuided span').textContent = on ? 'Running...' : 'Run guided demo';
    document.querySelector('.switch').classList.toggle('disabled', on);
  }

  async function runGuided() {
    if (guided.running) return;
    reset();
    lockUi(true);
    try {
      await sleep(900);
      caption(1, 'A new customer signs up in Shopify', 'The webhook reaches the sync in under a second and becomes an Account + Contact in Salesforce.');
      tabs('customers', 'contacts');
      await sleep(2200);
      const c = A.shopAdd();
      await idle(); await sleep(2400);

      caption(2, 'She places an order', 'The order, its line items and the stock changes all land in Salesforce, matched by Shopify ID.');
      tabs('orders', 'orders');
      await sleep(2000);
      const o = A.shopOrder(c.id, [['wat', 1], ['mug', 2]]);
      await sleep(1600);
      tabs('orders', 'orders');
      await idle(); await sleep(900);
      tabs('products', 'products');
      await sleep(2600);

      caption(3, 'Shopify sends the same webhook twice', 'It happens. The event ID is checked first, so the order is not created again.');
      tabs('orders', 'orders');
      await sleep(2200);
      A.replay(S.eng.lastOrderWebhook);
      await idle(); await sleep(2600);

      caption(4, 'Sales updates her phone in Salesforce', 'The change goes back to Shopify. The echo that follows is recognised and skipped, so there is no loop.');
      tabs('customers', 'contacts');
      await sleep(2200);
      A.sfEdit(S.sf.contacts.find(x => x.ShopifyId === c.id).Id);
      await idle(); await sleep(2800);

      caption(5, 'Order marked Fulfilled in Salesforce', 'Shopify gets the fulfilment straight away.');
      tabs('orders', 'orders');
      await sleep(2200);
      A.sfStatus(S.sf.orders.find(x => x.ShopifyId === o.id).Id, 'Fulfilled');
      await idle(); await sleep(2800);

      caption(6, 'Salesforce goes down for a moment', 'The change waits in a retry queue with back-off, then catches up on its own. Nothing is lost.');
      tabs('products', 'products');
      await sleep(2000);
      setOutage(true);
      await sleep(1200);
      A.shopStock(S.shop.products.find(p => p.key === 'bpk').id, -3);
      await sleep(6400);
      setOutage(false);
      await idle(true); await sleep(2800);

      caption(7, 'Stock corrected in Salesforce', 'Shopify inventory updates within seconds. Both directions, fully automatic.');
      await sleep(2000);
      A.sfStock(S.sf.products.find(p => p.ProductCode === 'HC-HDP-02').Id, 5);
      await idle(); await sleep(3200);
      hideCaption();
      await sleep(600);
    } finally {
      lockUi(false);
    }
    if (RECORD) await outro();
    window.__demoDone = true;
  }

  async function outro() {
    const m = S.eng.m;
    const avg = m.lat.length ? (m.lat.reduce((a, b) => a + b, 0) / m.lat.length).toFixed(1) + 's' : '-';
    $('#outroStats').innerHTML = [
      [m.synced, 'changes synced'], [avg, 'average sync time'], [m.dupes, 'duplicate blocked'],
      [m.loops, 'loops prevented'], [m.recovered, 'outage recovered'], ['0', 'records lost'],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    $('#outro').classList.add('show');
    await sleep(6500);
  }

  async function intro() {
    const el = $('#intro');
    el.classList.add('show');
    await sleep(3600);
    el.classList.add('hide');
    await sleep(600);
    el.classList.remove('show', 'hide');
  }

  /* ------------------------------------------------------------------ boot */
  reset();
  window.__demo = { runGuided, A, get state() { return S; } };
  if (RECORD) {
    window.__startRecording = async () => { await intro(); await runGuided(); };
  }
})();
