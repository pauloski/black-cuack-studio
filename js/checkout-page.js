/* BlackQuack — página de checkout con stepper (checkout.html).
   Autónoma: lee el carrito de localStorage, el catálogo vía fetchProducts(), y
   usa los mismos endpoints que el modal antiguo (/api/shipping/quote, /api/checkout).
   El servidor RECALCULA precio y envío: lo de acá es UX, no seguridad. */
(function () {
  'use strict';

  /* ---------------- utilidades ---------------- */
  var CLP = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function cleanRut(r) { return String(r || '').toUpperCase().replace(/[^0-9K]/g, ''); }
  function rutDV(body) {
    var s = 0, m = 2;
    for (var i = body.length - 1; i >= 0; i--) { s += Number(body[i]) * m; m = m === 7 ? 2 : m + 1; }
    var r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function validRut(r) {
    var c = cleanRut(r); if (c.length < 8 || c.length > 9) return false;
    var b = c.slice(0, -1); return /^\d+$/.test(b) && rutDV(b) === c.slice(-1);
  }
  function fmtRut(r) {
    var c = cleanRut(r); if (c.length < 2) return c;
    return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
  }
  function normPhone(v) {
    var d = String(v || '').replace(/[^\d]/g, ''); if (d.indexOf('56') === 0) d = d.slice(2);
    return (d.length === 9 && d[0] === '9') ? '+56' + d : null;
  }

  /* ---------------- estado ---------------- */
  var app = document.getElementById('coApp');
  var PRODUCTS = {};      // id -> { id, name, price, image, variants:[{size,color,design,price}] }
  var lines = [];         // [{ id, size, color, design, qty, name, image, unit, total, variant }]
  var productsAmount = 0;
  var shipping = { cost: null, servicio: '', ok: false };
  var comunas = [];       // [{ region, comunas:[] }]
  var methods = [];       // métodos de despacho habilitados (del backend)
  var activeMethod = null;
  var step = 1;
  var quoting = false;
  var F = restoreForm();  // datos del formulario (persistidos en sessionStorage)

  var BLUE_MAP = 'https://mapa-pickup.blue.cl/';                                 // mapa embebible de Puntos Blue
  var BLUE_FINDER = 'https://www.blue.cl/lockers-puntos/encuentra-tu-punto';     // buscador oficial (fallback)

  /* ---------------- carga ---------------- */
  function readCart() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem('bq_cart_v5') || '{}'); } catch (e) { c = {}; }
    // Descarta el formato viejo (cart[id] = número).
    Object.keys(c).forEach(function (k) { if (typeof c[k] === 'number') delete c[k]; });
    return c;
  }

  function normProduct(p) {
    var price = Math.round(Number(p.price != null ? p.price : (p.precio != null ? p.precio : 0)) || 0);
    var variants = (p.variants || []).map(function (v) {
      return {
        size: v.size || '', color: v.color || '', design: v.design || '',
        price: Math.round(Number(v.price != null ? v.price : price) || 0)
      };
    });
    var img = p.image_url || (p.images && p.images[0]) || p.image || '';
    return { id: p.id || p.ID, name: p.product_title || p.name || 'Producto', price: price, image: img, variants: variants };
  }

  async function loadProducts() {
    var list = null;
    try { if (typeof window.fetchProducts === 'function') list = await window.fetchProducts(); }
    catch (e) { console.warn('[checkout] Contentful:', e.message); }
    if (!list || !list.length) {
      try { var r = await fetch('products.json', { cache: 'no-store' }); if (r.ok) list = await r.json(); }
      catch (e) { /* sin catálogo */ }
    }
    PRODUCTS = {};
    (list || []).forEach(function (p) { var n = normProduct(p); if (n.id) PRODUCTS[n.id] = n; });
  }

  function buildLines(cart) {
    lines = []; productsAmount = 0;
    Object.keys(cart).forEach(function (sku) {
      var l = cart[sku]; var p = PRODUCTS[l.id]; if (!p) return;
      var variant = p.variants.find(function (v) {
        return v.size === (l.size || '') && v.color === (l.color || '') && v.design === (l.design || '');
      });
      var unit = variant ? variant.price : p.price;
      var total = unit * l.qty;
      productsAmount += total;
      lines.push({
        id: l.id, size: l.size || '', color: l.color || '', design: l.design || '', qty: l.qty,
        name: p.name, image: p.image, unit: unit, total: total,
        variant: [l.size, l.color, l.design].filter(Boolean).join(' · ')
      });
    });
  }

  async function loadComunas() {
    try {
      var res = await fetch('/api/comunas');
      if (res.ok) { var d = await res.json(); if (Array.isArray(d) && d.length) comunas = d; }
    } catch (e) { /* se maneja en la UI */ }
  }

  async function loadMethods() {
    try {
      var res = await fetch('/api/shipping/methods');
      if (res.ok) { var d = await res.json(); if (d && d.methods && d.methods.length) methods = d.methods; }
    } catch (e) { /* fallback abajo */ }
    if (!methods.length) methods = [{ id: 'blue_retiro', courier: 'blue', metodo: 'retiro_punto', label: 'Retiro en Punto Blue', descripcion: 'Retíralo en un local cercano.', needsPunto: true, needsDireccion: false }];
    // Restaura el método guardado si sigue habilitado; si no, el primero.
    activeMethod = methods.filter(function (m) { return m.id === F.method; })[0] || methods[0];
  }

  function lineItems() {
    return lines.map(function (l) { return { id: l.id, size: l.size, color: l.color, design: l.design, qty: l.qty }; });
  }

  /* ---------------- persistencia del formulario ---------------- */
  function restoreForm() {
    try { return JSON.parse(sessionStorage.getItem('bq_checkout_form') || '{}'); } catch (e) { return {}; }
  }
  function saveForm() {
    F = {
      email: val('email'), nombre: val('nombre'), rut: val('rut'), telefono: val('telefono'),
      region: val('region'), comuna: val('comuna'), direccion: val('direccion'), referencia: val('referencia'),
      punto: val('punto'), method: activeMethod ? activeMethod.id : (F.method || '')
    };
    try { sessionStorage.setItem('bq_checkout_form', JSON.stringify(F)); } catch (e) {}
  }
  function val(name) { var el = document.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : (F[name] || ''); }

  /* ---------------- render principal ---------------- */
  function money(n) { return esc(CLP(n)); }

  function renderEmpty() {
    app.innerHTML =
      '<div class="co-card co-state">' +
        '<i data-lucide="package-open"></i>' +
        '<h2>Tu carrito está vacío</h2>' +
        '<p>Agrega algo antes de pagar. ¡Hora de hacer Quack! 🦆</p>' +
        '<a class="co-btn primary" href="tienda.html"><i data-lucide="shopping-bag"></i> Ir a la tienda</a>' +
      '</div>';
    icons();
  }

  function summaryHTML() {
    var items = lines.map(function (l) {
      return '<div class="co-li">' +
        '<div class="thumb">' + (l.image ? '<img src="' + esc(l.image) + '" alt="' + esc(l.name) + '">' : '') +
          '<span class="q">' + l.qty + '</span></div>' +
        '<div class="meta"><h4>' + esc(l.name) + '</h4>' +
          (l.variant ? '<div class="var">' + esc(l.variant) + '</div>' : '') + '</div>' +
        '<div class="price">' + money(l.total) + '</div>' +
      '</div>';
    }).join('');
    var shipLabel = shipping.ok
      ? (shipping.metodo === 'retiro_punto' ? 'Retiro · Punto Blue' : 'Envío · Chilexpress ' + shipping.servicio)
      : 'Envío';
    var shipLine = shipping.ok
      ? '<div class="co-tr"><span>' + esc(shipLabel) + '</span><span>' + money(shipping.cost) + '</span></div>'
      : '<div class="co-tr"><span>Envío</span><span class="muted">Se calcula en el paso 2</span></div>';
    var e = shipping.ok ? shipping.entrega : null;
    var etaLine = e
      ? '<div class="co-tr"><span class="muted">Entrega estimada</span><span class="muted">' +
        esc(e.desde === e.hasta ? e.hastaShort : e.desdeShort + ' – ' + e.hastaShort) + '</span></div>'
      : '';
    var total = productsAmount + (shipping.ok ? shipping.cost : 0);
    return '<aside class="co-summary"><div class="co-sum-card" id="coSumCard">' +
      '<div class="co-sum-head" id="coSumHead">' +
        '<h3><i data-lucide="shopping-bag"></i> Tu pedido (' + lines.length + ')</h3>' +
        '<button class="co-sum-toggle" type="button">Ver <i data-lucide="chevron-down"></i></button>' +
      '</div>' +
      '<div class="co-sum-body">' +
        '<div class="co-sum-items">' + items + '</div>' +
        '<div class="co-sum-tot">' +
          '<div class="co-tr"><span>Productos</span><span>' + money(productsAmount) + '</span></div>' +
          shipLine +
          etaLine +
          '<div class="co-tr grand"><span>Total</span><span id="coGrand">' + money(total) + '</span></div>' +
        '</div>' +
        '<div class="co-trust"><i data-lucide="shield-check"></i> Pago protegido · No guardamos tu tarjeta</div>' +
      '</div>' +
    '</div></aside>';
  }

  function stepsHTML() {
    var steps = [{ n: 1, l: 'Contacto', i: 'user' }, { n: 2, l: 'Envío', i: 'truck' }, { n: 3, l: 'Pago', i: 'credit-card' }];
    return '<ol class="co-steps">' + steps.map(function (s, idx) {
      var cls = s.n === step ? 'active' : (s.n < step ? 'done' : '');
      var dot = s.n < step ? '<i data-lucide="check"></i>' : String(s.n);
      return '<li class="co-step ' + cls + '">' +
        '<span class="dot">' + dot + '</span><span class="lbl">' + s.l + '</span>' +
        (idx < steps.length - 1 ? '<span class="bar"></span>' : '') + '</li>';
    }).join('') + '</ol>';
  }

  function field(name, label, opts) {
    opts = opts || {};
    var input = opts.type === 'select'
      ? '<select name="' + name + '" ' + (opts.attrs || '') + '></select>'
      : '<input name="' + name + '" type="' + (opts.type || 'text') + '" ' +
        (opts.autocomplete ? 'autocomplete="' + opts.autocomplete + '" ' : '') +
        (opts.inputmode ? 'inputmode="' + opts.inputmode + '" ' : '') +
        'placeholder="' + esc(opts.ph || '') + '" value="' + esc(F[name] || '') + '">';
    return '<div class="co-field" data-field="' + name + '">' +
      '<label>' + esc(label) + (opts.opt ? ' <span class="opt">(opcional)</span>' : '') + '</label>' +
      input + '<small class="co-err" data-for="' + name + '"></small></div>';
  }

  function panelsHTML() {
    // Paso 1 — Contacto
    var p1 = '<div class="co-panel" data-step="1"><h2>¿Quién recibe?</h2>' +
      '<p class="co-sub">Para la boleta y para coordinar la entrega.</p>' +
      field('email', 'Email', { type: 'email', autocomplete: 'email', inputmode: 'email', ph: 'tu@email.com' }) +
      field('nombre', 'Nombre completo', { autocomplete: 'name', ph: 'Paulo Correa' }) +
      '<div class="co-row">' +
        field('rut', 'RUT', { ph: '12.345.678-5' }) +
        field('telefono', 'Teléfono', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', ph: '9 1234 5678' }) +
      '</div>' +
      '<div class="co-formerr" data-for="_step1"></div>' +
      '<div class="co-nav"><button class="co-btn primary grow" data-next="2">Continuar a envío <i data-lucide="arrow-right"></i></button></div>' +
    '</div>';

    // Paso 2 — Envío
    var p2 = '<div class="co-panel" data-step="2"><h2>¿Cómo lo recibes?</h2>' +
      '<p class="co-sub">Elige tu comuna y verás el costo al instante.</p>' +
      '<div id="coMethodSel"></div>' +
      '<div class="co-row">' +
        field('region', 'Región', { type: 'select' }) +
        field('comuna', 'Comuna', { type: 'select', attrs: 'disabled' }) +
      '</div>' +
      '<div id="coMethodFields"></div>' +
      field('referencia', 'Referencia', { opt: true, ph: 'Portón negro, entre calles X e Y' }) +
      '<div class="co-ship-result" id="coShipResult"><span class="muted">Elige tu comuna para cotizar</span><span class="price"></span></div>' +
      '<div class="co-formerr" data-for="_step2"></div>' +
      '<div class="co-nav">' +
        '<button class="co-btn ghost" data-back="1"><i data-lucide="arrow-left"></i> Volver</button>' +
        '<button class="co-btn primary grow" data-next="3" id="coToPay" disabled>Revisar y pagar <i data-lucide="arrow-right"></i></button>' +
      '</div>' +
    '</div>';

    // Paso 3 — Revisar y pagar
    var p3 = '<div class="co-panel" data-step="3"><h2>Revisa y paga</h2>' +
      '<p class="co-sub">Confirma tus datos antes de ir a Flow.</p>' +
      '<div class="co-recap" id="coRecap"></div>' +
      '<div class="co-formerr" data-for="_step3"></div>' +
      '<div class="co-nav" style="flex-direction:column;margin-top:20px">' +
        '<button class="co-btn primary pay" id="coPay"><i data-lucide="credit-card"></i> Ir a pagar con Flow</button>' +
        '<p class="co-legal">Al continuar te redirigimos a Flow para completar el pago de forma segura. Usamos tu RUT y teléfono solo para emitir la boleta y coordinar la entrega con el courier.</p>' +
      '</div>' +
    '</div>';

    return '<div class="co-card">' + p1 + p2 + p3 + '</div>';
  }

  function renderApp() {
    app.innerHTML = '<div class="co-grid"><section class="co-form">' + stepsHTML() + panelsHTML() + '</section>' + summaryHTML() + '</div>';
    fillRegiones();
    renderMethodSel();
    renderMethodFields();
    // Restaura comuna si venía guardada (tras poblar el select de comunas).
    if (F.region) { var rs = document.querySelector('[name="region"]'); if (rs) { rs.value = F.region; onRegionChange(); if (F.comuna) { var cs = document.querySelector('[name="comuna"]'); if (cs) cs.value = F.comuna; } } }
    wire();
    showStep(step);
    icons();
    // Si venía una comuna guardada, re-cotiza para no mostrar el envío en blanco.
    if (val('comuna')) requestQuote();
  }

  /* ---------------- regiones / comunas ---------------- */
  function fillRegiones() {
    var rSel = document.querySelector('[name="region"]');
    if (!rSel) return;
    if (!comunas.length) { rSel.innerHTML = '<option value="">No se pudieron cargar</option>'; return; }
    rSel.innerHTML = '<option value="">Selecciona…</option>' +
      comunas.map(function (r, i) { return '<option value="' + i + '">' + esc(r.region) + '</option>'; }).join('');
  }
  function onRegionChange() {
    var rSel = document.querySelector('[name="region"]'), cSel = document.querySelector('[name="comuna"]');
    var r = comunas[rSel.value];
    if (!r) { cSel.innerHTML = '<option value="">Elige región primero</option>'; cSel.disabled = true; resetShip(); return; }
    cSel.innerHTML = '<option value="">Selecciona…</option>' +
      r.comunas.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    cSel.disabled = false; resetShip();
  }

  /* ---------------- método de despacho (Blue-retiro / Chilexpress-domicilio) ---------------- */
  function methodSelHTML() {
    if (!methods || methods.length <= 1) return '';
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">' + methods.map(function (m) {
      var active = activeMethod && m.id === activeMethod.id;
      return '<button type="button" data-method="' + esc(m.id) + '" style="flex:1;min-width:160px;text-align:left;padding:13px 14px;border:1.5px solid ' + (active ? 'var(--color-brand)' : 'var(--border-soft)') + ';border-radius:12px;background:' + (active ? '#fff7ec' : '#fff') + '">' +
        '<div style="font-family:var(--font-title);font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:7px"><i data-lucide="' + esc(m.icon || 'package') + '" style="width:16px;height:16px;color:var(--color-brand)"></i>' + esc(m.label) + '</div>' +
        '<div style="font-size:.78rem;color:#8a8a8a;margin-top:3px">' + esc(m.descripcion || '') + '</div>' +
      '</button>';
    }).join('') + '</div>';
  }
  function renderMethodSel() {
    var c = document.getElementById('coMethodSel');
    if (!c) return;
    c.innerHTML = methodSelHTML();
    c.querySelectorAll('[data-method]').forEach(function (b) {
      b.addEventListener('click', function () { setActiveMethod(b.getAttribute('data-method')); });
    });
    icons();
  }
  function methodFieldsHTML() {
    if (!activeMethod) return '';
    if (activeMethod.needsPunto) {
      return '<div class="co-field"><label>Elige tu Punto Blue de retiro</label>' +
          '<div style="border:1.5px solid var(--border-soft);border-radius:11px;overflow:hidden">' +
            '<iframe src="' + BLUE_MAP + '" title="Mapa de Puntos Blue" style="width:100%;height:330px;border:0;display:block" loading="lazy"></iframe>' +
          '</div>' +
          '<small style="color:#8a8a8a;font-size:.8rem;display:block;margin-top:8px">Busca un Punto Blue que <b>reciba paquetes</b> 📦 y cópialo abajo. ' +
            '<a href="' + BLUE_FINDER + '" target="_blank" rel="noopener" style="color:var(--color-brand);font-weight:600">Abrir buscador ↗</a></small>' +
        '</div>' +
        field('punto', 'Tu Punto Blue elegido', { ph: 'Ej: Punto Blue Copec — Av. X 123' });
    }
    return field('direccion', 'Dirección — calle y número', { autocomplete: 'street-address', ph: 'Av. Los Carrera 1234, depto 5B' });
  }
  function renderMethodFields() {
    var c = document.getElementById('coMethodFields');
    if (c) { c.innerHTML = methodFieldsHTML(); icons(); }
  }
  function setActiveMethod(id) {
    var m = methods.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    activeMethod = m;
    saveForm();
    renderMethodSel();
    renderMethodFields();
    resetShip();
    if (val('comuna')) requestQuote();
  }

  /* ---------------- cotización de envío ---------------- */
  function resetShip() { shipping = { cost: null, servicio: '', ok: false }; renderShip(); refreshSummary(); toggleToPay(); }
  function etaText(e) {
    if (!e) return '';
    return e.desde === e.hasta ? 'Llega el ' + e.hastaLabel
      : 'Llega entre el ' + e.desdeLabel + ' y el ' + e.hastaLabel;
  }
  function renderShip() {
    var box = document.getElementById('coShipResult'); if (!box) return;
    box.classList.toggle('ok', shipping.ok);
    if (quoting) { box.style.flexDirection = 'row'; box.style.alignItems = 'center'; box.innerHTML = '<span class="muted">Calculando envío…</span><span class="price"></span>'; return; }
    if (!shipping.ok) { box.style.flexDirection = 'row'; box.style.alignItems = 'center'; box.innerHTML = '<span class="muted">' + (shipping.msg ? esc(shipping.msg) : 'Elige tu comuna para cotizar') + '</span><span class="price"></span>'; return; }
    box.style.flexDirection = 'column'; box.style.alignItems = 'stretch';
    var eta = etaText(shipping.entrega);
    var retiro = shipping.metodo === 'retiro_punto';
    var svcTxt = retiro ? 'Punto Blue' : 'Chilexpress ' + shipping.servicio;
    var locTxt = (retiro ? 'Retiro en ' : 'Envío a ') + val('comuna');
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">' +
        '<span>' + esc(locTxt) + ' · <b>' + esc(svcTxt) + '</b></span>' +
        '<span class="price">' + money(shipping.cost) + '</span></div>' +
      (eta ? '<div style="margin-top:8px;color:#5a5a5a;font-size:.85rem;display:flex;align-items:center;gap:7px;font-weight:500">' +
        '<i data-lucide="calendar-clock" style="width:16px;height:16px;color:var(--color-brand)"></i><span>' + esc(eta) + '</span></div>' : '');
    icons();
  }
  async function requestQuote() {
    var comuna = val('comuna');
    if (!comuna) { resetShip(); return; }
    quoting = true; shipping = { cost: null, servicio: '', ok: false }; renderShip(); toggleToPay();
    try {
      var res = await fetch('/api/shipping/quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: activeMethod ? activeMethod.id : 'blue_retiro', comuna: comuna, items: lineItems() })
      });
      var data = await res.json().catch(function () { return null; });
      quoting = false;
      if (data && data.ok) { shipping = { cost: data.costo, servicio: data.servicio || '', ok: true, entrega: data.entrega || null, courier: data.courier, metodo: data.metodo }; }
      else { shipping = { cost: null, servicio: '', ok: false, msg: (data && data.error) || 'No pudimos cotizar el envío.' }; }
    } catch (e) { quoting = false; shipping = { cost: null, servicio: '', ok: false, msg: 'No pudimos cotizar el envío. Reintenta.' }; }
    renderShip(); refreshSummary(); toggleToPay();
  }
  function toggleToPay() {
    var btn = document.getElementById('coToPay'); if (btn) btn.disabled = !(shipping.ok && !quoting);
  }
  function refreshSummary() {
    // Reemplaza solo el aside de resumen (evita perder foco del formulario).
    var old = document.querySelector('.co-summary');
    if (!old) return;
    var tmp = document.createElement('div'); tmp.innerHTML = summaryHTML();
    old.replaceWith(tmp.firstElementChild);
    wireSummary(); icons();
  }

  /* ---------------- navegación de pasos ---------------- */
  function showStep(n) {
    step = n;
    document.querySelectorAll('.co-panel').forEach(function (p) { p.classList.toggle('active', Number(p.dataset.step) === n); });
    // Actualiza el stepper.
    var form = document.querySelector('.co-form');
    var newSteps = document.createElement('div'); newSteps.innerHTML = stepsHTML();
    form.querySelector('.co-steps').replaceWith(newSteps.firstElementChild);
    if (n === 3) renderRecap();
    icons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setErr(name, msg) {
    var el = document.querySelector('.co-err[data-for="' + name + '"]');
    if (el) { el.textContent = msg || ''; var f = el.closest('.co-field'); if (f) f.classList.toggle('err', !!msg); }
  }
  function setFormErr(scope, msg) { var el = document.querySelector('.co-formerr[data-for="' + scope + '"]'); if (el) el.textContent = msg || ''; }

  function validateStep1() {
    var ok = true; setFormErr('_step1', '');
    ['email', 'nombre', 'rut', 'telefono'].forEach(function (n) { setErr(n, ''); });
    if (!EMAIL_RE.test(val('email'))) { setErr('email', 'Email inválido.'); ok = false; }
    var nom = val('nombre'); if (nom.length < 5 || nom.indexOf(' ') === -1) { setErr('nombre', 'Ingresa nombre y apellido.'); ok = false; }
    if (!validRut(val('rut'))) { setErr('rut', 'RUT inválido. Revisa el dígito verificador.'); ok = false; }
    if (!normPhone(val('telefono'))) { setErr('telefono', 'Móvil inválido (ej: 9 1234 5678).'); ok = false; }
    if (!ok) setFormErr('_step1', 'Revisa los campos marcados.');
    return ok;
  }
  function validateStep2() {
    var ok = true; setFormErr('_step2', '');
    ['comuna', 'direccion', 'punto'].forEach(function (n) { setErr(n, ''); });
    if (!val('comuna')) { setErr('comuna', 'Selecciona tu comuna.'); ok = false; }
    if (activeMethod && activeMethod.needsPunto) {
      if (val('punto').length < 4) { setErr('punto', 'Indica tu Punto Blue de retiro (búscalo en el mapa).'); ok = false; }
    } else {
      var dir = val('direccion'); if (dir.length < 6 || !/\d/.test(dir)) { setErr('direccion', 'Ingresa calle y número.'); ok = false; }
    }
    if (ok && !shipping.ok) { setFormErr('_step2', 'Espera la cotización (o elige una comuna con cobertura).'); ok = false; }
    return ok;
  }

  function renderRecap() {
    var el = document.getElementById('coRecap'); if (!el) return;
    var retiro = activeMethod && activeMethod.needsPunto;
    var envioV = (retiro ? 'Retiro en: ' + esc(val('punto')) : esc(val('direccion'))) + '<br>' + esc(val('comuna')) +
      (val('referencia') ? '<br><span style="color:#9a9a9a">' + esc(val('referencia')) + '</span>' : '');
    var despachoV = (retiro ? 'Punto Blue' : 'Chilexpress ' + esc(shipping.servicio)) + ' · ' + money(shipping.cost);
    var rows = [
      { k: 'Contacto', v: esc(val('nombre')) + '<br>' + esc(val('email')) + ' · ' + esc(val('telefono')), edit: 1 },
      { k: 'RUT', v: esc(fmtRut(val('rut'))), edit: 1 },
      { k: retiro ? 'Retiro' : 'Envío', v: envioV, edit: 2 },
      { k: 'Despacho', v: despachoV, edit: 2 }
    ];
    el.innerHTML = rows.map(function (r) {
      return '<div class="r"><span class="k">' + r.k + '</span><span class="v">' + r.v +
        ' <a class="edit" href="#" data-edit="' + r.edit + '">Editar</a></span></div>';
    }).join('');
  }

  /* ---------------- envío de la orden ---------------- */
  async function submitOrder() {
    if (!validateStep1()) { showStep(1); return; }
    if (!validateStep2()) { showStep(2); return; }
    var btn = document.getElementById('coPay'); var orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="co-spin"></span> Conectando con Flow…';
    setFormErr('_step3', '');
    try {
      var res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: val('email'), items: lineItems(),
          method: activeMethod ? activeMethod.id : 'blue_retiro',
          shipping: { nombre: val('nombre'), rut: val('rut'), telefono: val('telefono'), comuna: val('comuna'), referencia: val('referencia'), direccion: val('direccion'), punto: val('punto') }
        })
      });
      var data = await res.json().catch(function () { return null; });
      if (!res.ok || !data || !data.redirect) {
        var msg = (data && data.error) || (res.status >= 500 ? 'No pudimos iniciar el pago. Intenta en unos segundos.' : 'No pudimos iniciar el pago.');
        // Si el server marcó la comuna sin cobertura, vuelve al paso de envío.
        if (data && data.fields && data.fields.comuna) { showStep(2); setErr('comuna', data.fields.comuna); resetShip(); }
        throw new Error(msg);
      }
      location.href = data.redirect;
    } catch (e) {
      setFormErr('_step3', e.message);
      btn.disabled = false; btn.innerHTML = orig; icons();
    }
  }

  /* ---------------- wiring ---------------- */
  function wireSummary() {
    var head = document.getElementById('coSumHead');
    if (head) head.addEventListener('click', function () { document.getElementById('coSumCard').classList.toggle('open'); });
  }
  function wire() {
    // Persistir en cada cambio.
    app.addEventListener('input', saveForm);
    app.addEventListener('change', saveForm);
    // Región / comuna.
    var rSel = document.querySelector('[name="region"]');
    if (rSel) rSel.addEventListener('change', onRegionChange);
    var cSel = document.querySelector('[name="comuna"]');
    if (cSel) cSel.addEventListener('change', requestQuote);
    // Formatea RUT al salir.
    var rut = document.querySelector('[name="rut"]');
    if (rut) rut.addEventListener('blur', function () { if (rut.value.trim()) rut.value = fmtRut(rut.value); });
    // Best-effort: si el widget de mapa de Blue emite el punto elegido, autocompletamos.
    window.addEventListener('message', function (e) {
      if (String(e.origin || '').indexOf('blue.cl') === -1) return;
      var d = e.data, text = '';
      if (d && typeof d === 'object') {
        text = d.nombre || d.name || d.label || d.punto || '';
        var dir = d.direccion || d.address || d.direccion_completa || '';
        if (dir) text += (text ? ' — ' : '') + dir;
      } else if (typeof d === 'string' && d.length > 3 && d.length < 200) { text = d; }
      if (text) { var pf = document.querySelector('[name="punto"]'); if (pf) { pf.value = text; saveForm(); if (val('comuna')) requestQuote(); } }
    });
    // Navegación (delegada).
    app.addEventListener('click', function (e) {
      var next = e.target.closest('[data-next]');
      var back = e.target.closest('[data-back]');
      var edit = e.target.closest('[data-edit]');
      var pay = e.target.closest('#coPay');
      if (next) { e.preventDefault(); var to = Number(next.dataset.next); if (to === 2 && !validateStep1()) return; if (to === 3 && !validateStep2()) return; showStep(to); }
      else if (back) { e.preventDefault(); showStep(Number(back.dataset.back)); }
      else if (edit) { e.preventDefault(); showStep(Number(edit.dataset.edit)); }
      else if (pay) { e.preventDefault(); submitOrder(); }
    });
    wireSummary();
  }

  function icons() { if (window.lucide) lucide.createIcons(); }

  /* ---------------- init ---------------- */
  (async function init() {
    app.innerHTML = '<div class="co-card co-state"><i data-lucide="loader"></i><h2>Cargando tu pedido…</h2></div>';
    icons();
    var cart = readCart();
    if (!Object.keys(cart).length) { renderEmpty(); return; }
    await Promise.all([loadProducts(), loadComunas(), loadMethods()]);
    buildLines(cart);
    if (!lines.length) { renderEmpty(); return; }
    renderApp();
  })();
})();
