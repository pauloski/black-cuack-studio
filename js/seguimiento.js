/* BlackQuack — página de seguimiento del pedido (seguimiento.html).
   Lee ?order=BQ-XXXX (o un buscador) y pinta el estado desde /api/order/status. */
(function () {
  'use strict';

  var app = document.getElementById('sgApp');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var CLP = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'); };
  function icons() { if (window.lucide) lucide.createIcons(); }

  // Pasos visibles (espejo de functions/_lib/fulfillment.js). Índice por estado:
  var STEPS = [
    { key: 'en_preparacion', label: 'En preparación', icon: 'package' },
    { key: 'despachado', label: 'Despachado', icon: 'package-check' },
    { key: 'en_transito', label: 'En camino', icon: 'truck' },
    { key: 'entregado', label: 'Entregado', icon: 'home' },
  ];
  // Mapea el fulfillment del backend al índice de la barra.
  var STEP_INDEX = { en_preparacion: 0, despachado: 1, en_transito: 2, en_reparto: 2, entregado: 3 };

  function stepsHTML(fulfillment) {
    var cur = STEP_INDEX[fulfillment];
    if (cur == null) cur = 0;
    return '<div class="sg-steps">' + STEPS.map(function (s, i) {
      var cls = i < cur ? 'done' : (i === cur ? 'current' : '');
      var ic = i < cur ? 'check' : s.icon;
      return '<div class="sg-step ' + cls + '"><div class="dot"><i data-lucide="' + ic + '"></i></div><div class="lbl">' + esc(s.label) + '</div></div>';
    }).join('') + '</div>';
  }

  function etaText(e) {
    if (!e) return null;
    return e.desde === e.hasta ? 'Alrededor del ' + e.hastaLabel
      : 'Entre el ' + e.desdeLabel + ' y el ' + e.hastaLabel;
  }

  function searchHTML(msg) {
    return '<div class="sg-card">' +
      '<h1 class="sg-h">Sigue tu pedido</h1>' +
      '<p class="sg-sub">Ingresa el número de orden que te llegó al pagar (empieza con <b>BQ-</b>).</p>' +
      (msg ? '<p style="color:#e5484d;font-size:.86rem;margin-bottom:12px;font-weight:600">' + esc(msg) + '</p>' : '') +
      '<div class="sg-search">' +
        '<input id="sgInput" type="text" placeholder="BQ-XXXXXXXX" autocomplete="off" spellcheck="false">' +
        '<button class="sg-btn" id="sgGo"><i data-lucide="search"></i> Buscar</button>' +
      '</div></div>';
  }

  function renderSearch(msg) {
    app.innerHTML = searchHTML(msg);
    var input = document.getElementById('sgInput');
    var go = function () {
      var code = (input.value || '').trim().toUpperCase();
      if (code) { history.replaceState(null, '', 'seguimiento.html?order=' + encodeURIComponent(code)); load(code); }
    };
    document.getElementById('sgGo').addEventListener('click', go);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    input.focus();
    icons();
  }

  function renderOrder(d) {
    var cancelled = d.fulfillment === 'cancelado';
    var pendingPay = d.pago !== 'paid';
    var eta = etaText(d.entrega);
    var itemsTxt = (d.items || []).map(function (i) {
      return esc(i.title) + (i.variant ? ' (' + esc(i.variant) + ')' : '') + ' ×' + i.qty;
    }).join(', ');

    var head =
      '<div class="sg-badge' + (cancelled ? ' cancel' : '') + '">' +
        '<i data-lucide="' + (cancelled ? 'x-circle' : 'package') + '"></i> ' +
        esc(d.fulfillmentLabel || (pendingPay ? 'Pendiente de pago' : 'En preparación')) + '</div>' +
      '<h1 class="sg-h">Orden <span class="sg-order-code">' + esc(d.order) + '</span></h1>' +
      '<p class="sg-sub">' + (cancelled
        ? 'Este pedido fue cancelado o no se completó el pago.'
        : pendingPay
          ? 'Estamos esperando la confirmación del pago.'
          : 'Sigue el avance de tu pedido acá.') + '</p>';

    var progress = (cancelled || pendingPay) ? '' : stepsHTML(d.fulfillment);

    var rows = '';
    if (eta && !cancelled) rows += '<div class="r"><span class="k">Entrega estimada</span><span class="v">' + esc(eta) + '</span></div>';
    if (d.comuna) rows += '<div class="r"><span class="k">Despacho a</span><span class="v">' + esc(d.comuna) + '</span></div>';
    if (itemsTxt) rows += '<div class="r"><span class="k">Productos</span><span class="v">' + itemsTxt + '</span></div>';
    if (d.amount != null) rows += '<div class="r"><span class="k">Total pagado</span><span class="v">' + esc(CLP(d.amount)) + '</span></div>';

    var track = '';
    if (d.tracking && d.tracking.ot) {
      track = '<div class="sg-track">' +
        '<div style="font-family:var(--font-title);font-weight:600;font-size:.8rem;color:#8a6d3b;margin-bottom:6px">N° DE SEGUIMIENTO CHILEXPRESS</div>' +
        '<div class="num">' + esc(d.tracking.ot) + '</div>' +
        (d.tracking.url ? '<a href="' + esc(d.tracking.url) + '" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Seguir en Chilexpress</a>' : '') +
      '</div>';
    }

    app.innerHTML = '<div class="sg-card">' + head + progress +
      (rows ? '<div class="sg-info">' + rows + '</div>' : '') + track +
      (!cancelled && !pendingPay ? '<p class="sg-note">Preparamos y dejamos tu paquete en Chilexpress en un plazo de 2 días hábiles. Los tiempos de entrega son estimados.</p>' : '') +
      '<div style="margin-top:20px"><a class="sg-btn ghost" href="seguimiento.html"><i data-lucide="search"></i> Buscar otra orden</a></div>' +
    '</div>';
    icons();
  }

  async function load(code) {
    app.innerHTML = '<div class="sg-card sg-state"><i data-lucide="loader"></i><h2>Buscando tu pedido…</h2></div>';
    icons();
    try {
      var res = await fetch('/api/order/status?order=' + encodeURIComponent(code));
      var d = await res.json().catch(function () { return null; });
      if (!res.ok || !d || !d.ok) { renderSearch((d && d.error) || 'No encontramos esa orden. Revisa el número.'); return; }
      renderOrder(d);
    } catch (e) {
      renderSearch('No pudimos consultar el estado. Reintenta en unos segundos.');
    }
  }

  var code = (new URLSearchParams(location.search).get('order') || '').trim().toUpperCase();
  if (/^BQ-[A-Z0-9]{4,}$/.test(code)) load(code);
  else renderSearch('');
})();
