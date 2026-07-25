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

  var BLUE_FINDER = 'https://www.blue.cl/lockers-puntos/encuentra-tu-punto';     // buscador oficial (link externo)
  var puntos = [];          // Puntos Blue de la comuna elegida (del endpoint /api/bluexpress/puntos)
  var puntosComuna = '';    // comuna para la que se cargó `puntos` (evita refetch)
  var puntosLoading = false;
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']; // getDay() → día Blue

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
      punto: val('punto'), puntoId: val('puntoId'), method: activeMethod ? activeMethod.id : (F.method || '')
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
    // Con comuna guardada: recarga puntos (Blue), reponiendo el punto elegido, y re-cotiza.
    if (val('comuna')) {
      if (activeMethod && activeMethod.needsPunto) {
        if (F.puntoId) setPunto(F.puntoId, F.punto);   // onRegionChange lo limpió; lo reponemos antes de cargar
        loadPuntos(val('comuna'));
      }
      requestQuote();
    }
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
    // Cambió la región → la comuna y el punto anteriores dejan de aplicar.
    if (activeMethod && activeMethod.needsPunto) resetPuntos();
    if (!r) { cSel.innerHTML = '<option value="">Elige región primero</option>'; cSel.disabled = true; resetShip(); return; }
    cSel.innerHTML = '<option value="">Selecciona…</option>' +
      r.comunas.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    cSel.disabled = false; resetShip();
  }
  function onComunaChange() {
    saveForm();
    if (activeMethod && activeMethod.needsPunto) {
      // Nueva comuna → punto anterior inválido; carga los puntos de la nueva.
      setPunto('', '');
      var comuna = val('comuna');
      if (comuna) loadPuntos(comuna); else resetPuntos();
    }
    requestQuote();
  }

  /* ---------------- método de despacho (Blue-retiro / Chilexpress-domicilio) ---------------- */
  function methodPriceHint(m) {
    return m.courier === 'blue' ? 'Desde $1.900' : 'A tu dirección';
  }
  function methodSelHTML() {
    if (!methods || methods.length <= 1) return '';
    return '<div class="co-methods">' + methods.map(function (m) {
      var active = activeMethod && m.id === activeMethod.id;
      var cheap = m.courier === 'blue';
      return '<button type="button" class="co-method' + (active ? ' active' : '') + '" data-method="' + esc(m.id) + '">' +
        (cheap ? '<span class="co-method-badge"><i data-lucide="sparkles"></i> Más barato</span>' : '') +
        '<span class="co-method-ico"><i data-lucide="' + esc(m.icon || 'package') + '"></i></span>' +
        '<span class="co-method-main">' +
          '<span class="co-method-title">' + esc(m.label) + '</span>' +
          '<span class="co-method-desc">' + esc(m.descripcion || '') + '</span>' +
          '<span class="co-method-price">' + esc(methodPriceHint(m)) + '</span>' +
        '</span>' +
        '<span class="co-method-check"><i data-lucide="check"></i></span>' +
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
      // La lista de puntos la puebla renderPuntos() según región+comuna elegidas.
      return '<div class="co-punto-block" data-field="punto">' +
          '<span class="co-punto-label">Elige tu Punto Blue de retiro</span>' +
          '<div id="coPuntos"></div>' +
          '<input type="hidden" name="punto" value="' + esc(F.punto || '') + '">' +
          '<input type="hidden" name="puntoId" value="' + esc(F.puntoId || '') + '">' +
          '<small class="co-err" data-for="punto"></small>' +
        '</div>';
    }
    return field('direccion', 'Dirección — calle y número', { autocomplete: 'street-address', ph: 'Av. Los Carrera 1234, depto 5B' });
  }
  function renderMethodFields() {
    var c = document.getElementById('coMethodFields');
    if (!c) return;
    c.innerHTML = methodFieldsHTML(); icons();
    if (activeMethod && activeMethod.needsPunto) {
      var comuna = val('comuna');
      if (comuna) loadPuntos(comuna); else renderPuntos();
    }
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

  /* ---------------- Puntos Blue de retiro ---------------- */
  function horarioHoy(p) {
    var hoy = DIAS[new Date().getDay()];
    var a = (p.horarios || []).filter(function (h) { return h.day === hoy; })[0];
    if (!a) return { txt: 'Cerrado hoy', open: false };
    return { txt: a.startTime + '–' + a.endTime, open: true };
  }
  function mapsLink(p) {
    var q = (p.lat != null && p.lng != null) ? (p.lat + ',' + p.lng)
      : ((p.direccion && p.direccion.completa) || p.nombre || 'Blue Express');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function puntoLabel(p) {
    var dir = (p.direccion && p.direccion.completa) || '';
    return p.nombre + (dir ? ' — ' + dir : '');
  }
  function setPunto(id, label) {
    var hi = document.querySelector('[name="puntoId"]'), hp = document.querySelector('[name="punto"]');
    if (hi) hi.value = id || '';
    if (hp) hp.value = label || '';
    saveForm();
  }
  async function loadPuntos(comuna) {
    // Cache por comuna: no re-consulta si ya la tenemos.
    if (puntosComuna === comuna && puntos.length) { renderPuntos(); preselectPunto(); return; }
    puntos = []; puntosComuna = comuna; puntosLoading = true; renderPuntos();
    try {
      var res = await fetch('/api/bluexpress/puntos?comuna=' + encodeURIComponent(comuna) + '&limit=200');
      var d = await res.json().catch(function () { return null; });
      // Solo puntos donde el cliente puede RETIRAR su paquete.
      if (d && d.ok && Array.isArray(d.puntos)) puntos = d.puntos.filter(function (p) { return p.permiteRetiro !== false; });
    } catch (e) { /* estado de error se muestra en renderPuntos */ }
    puntosLoading = false; renderPuntos(); preselectPunto();
  }
  function puntoCardHTML(p) {
    var h = horarioHoy(p);
    var copec = (p.tipo || '').toLowerCase().indexOf('copec') !== -1;
    var sel = String(p.id) === String(val('puntoId'));
    var dir = (p.direccion && p.direccion.completa) || '';
    return '<label class="co-punto' + (sel ? ' sel' : '') + '" data-punto="' + esc(p.id) + '">' +
      '<input type="radio" name="_puntoRadio" value="' + esc(p.id) + '"' + (sel ? ' checked' : '') + '>' +
      '<span class="co-punto-body">' +
        '<span class="co-punto-top"><span class="co-punto-name">' + esc(p.nombre) + '</span>' +
          '<span class="co-punto-tag' + (copec ? ' copec' : '') + '">' + (copec ? 'Copec' : 'Punto Blue') + '</span></span>' +
        (dir ? '<span class="co-punto-addr">' + esc(dir) + '</span>' : '') +
        '<span class="co-punto-meta">' +
          '<span class="co-punto-hours ' + (h.open ? 'open' : 'closed') + '"><i data-lucide="clock"></i>' + esc(h.open ? 'Hoy ' + h.txt : h.txt) + '</span>' +
          '<a class="co-punto-map" href="' + esc(mapsLink(p)) + '" target="_blank" rel="noopener"><i data-lucide="map-pin"></i>Ver en mapa</a>' +
        '</span>' +
      '</span>' +
    '</label>';
  }
  function renderPuntos(filter) {
    var c = document.getElementById('coPuntos'); if (!c) return;
    var comuna = val('comuna');
    if (!comuna) { c.innerHTML = '<div class="co-punto-state"><i data-lucide="map-pin"></i>Elige región y comuna para ver los Puntos Blue disponibles.</div>'; icons(); return; }
    if (puntosLoading) { c.innerHTML = '<div class="co-punto-state"><span class="co-spin" style="border-color:rgba(243,146,0,.3);border-top-color:var(--color-brand)"></span> Buscando puntos en ' + esc(comuna) + '…</div>'; icons(); return; }
    if (!puntos.length) {
      c.innerHTML = '<div class="co-punto-state"><i data-lucide="frown"></i>No hay Puntos Blue en ' + esc(comuna) + '. Prueba una comuna cercana o revisa el ' +
        '<a href="' + BLUE_FINDER + '" target="_blank" rel="noopener" style="color:var(--color-brand);font-weight:600">buscador oficial ↗</a>.</div>';
      icons(); return;
    }
    var q = (filter || '').trim().toLowerCase();
    var list = q ? puntos.filter(function (p) {
      return (p.nombre + ' ' + ((p.direccion && p.direccion.completa) || '')).toLowerCase().indexOf(q) !== -1;
    }) : puntos;
    var search = puntos.length > 6 ? '<input class="co-punto-search" id="coPuntoSearch" placeholder="Buscar por nombre o dirección…" value="' + esc(filter || '') + '">' : '';
    var count = '<div class="co-punto-count">' + list.length + ' punto' + (list.length === 1 ? '' : 's') + ' disponible' + (list.length === 1 ? '' : 's') + ' en ' + esc(comuna) + '</div>';
    c.innerHTML = search + count + '<div class="co-punto-list">' + list.map(puntoCardHTML).join('') + '</div>';
    icons();
    // Reponer el foco en el buscador tras el re-render.
    var sb = document.getElementById('coPuntoSearch');
    if (sb && q) { sb.focus(); sb.setSelectionRange(sb.value.length, sb.value.length); }
  }
  function preselectPunto() {
    // Si el punto guardado ya no está en la comuna actual, límpialo.
    var id = val('puntoId');
    if (id && !puntos.some(function (p) { return String(p.id) === String(id); })) setPunto('', '');
    toggleToPay();
  }
  function selectPunto(id) {
    var p = puntos.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!p) return;
    setPunto(p.id, puntoLabel(p));
    setErr('punto', '');
    // Marca visual sin re-render (conserva el scroll de la lista).
    document.querySelectorAll('.co-punto').forEach(function (el) {
      el.classList.toggle('sel', el.getAttribute('data-punto') === String(id));
    });
    toggleToPay();
  }
  function resetPuntos() { puntos = []; puntosComuna = ''; setPunto('', ''); renderPuntos(); }

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
    // Blue exige además haber elegido un Punto Blue de la lista.
    var needPunto = activeMethod && activeMethod.needsPunto;
    var puntoOk = !needPunto || (val('puntoId') && val('punto'));
    var btn = document.getElementById('coToPay'); if (btn) btn.disabled = !(shipping.ok && !quoting && puntoOk);
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
      if (val('punto').length < 4) { setErr('punto', 'Elige tu Punto Blue de retiro de la lista.'); ok = false; }
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
          shipping: { nombre: val('nombre'), rut: val('rut'), telefono: val('telefono'), comuna: val('comuna'), referencia: val('referencia'), direccion: val('direccion'), punto: val('punto'), puntoId: val('puntoId') }
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
    if (cSel) cSel.addEventListener('change', onComunaChange);
    // Formatea RUT al salir.
    var rut = document.querySelector('[name="rut"]');
    if (rut) rut.addEventListener('blur', function () { if (rut.value.trim()) rut.value = fmtRut(rut.value); });
    // Buscador dentro de la lista de Puntos Blue (delegado, sobrevive re-renders).
    app.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'coPuntoSearch') renderPuntos(e.target.value);
    });
    // Selección de un Punto Blue de la lista.
    app.addEventListener('change', function (e) {
      if (e.target && e.target.name === '_puntoRadio') selectPunto(e.target.value);
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
