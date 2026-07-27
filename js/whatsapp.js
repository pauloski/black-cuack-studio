/* BlackQuack — botón flotante de WhatsApp, configurable desde Contentful.

   Autocontenido: inyecta su propio CSS + DOM. Solo hay que incluir
   <script src="/js/whatsapp.js" defer></script> en la página.

   Lee UNA entrada del content type `whatsappWidget` (singleton) en Contentful:
     activo                 Boolean  — interruptor maestro (mostrar/ocultar)
     telefono               Symbol   — número con código país, ej. "56912345678"
     mensajePredeterminado  Text     — texto que se pre-rellena en el chat
     saludo                 Symbol   — burbuja de saludo (opcional)
     diasDisponibles        [Symbol] — ["lunes","martes",...] (acepta con/sin tilde)
     horaInicio             Symbol   — "09:00"
     horaFin                Symbol   — "18:00"
     ocultarFueraDeHorario  Boolean  — true: se oculta fuera de horario;
                                       false: se muestra con mensajeFueraDeHorario
     mensajeFueraDeHorario  Text     — texto alterno fuera de horario (opcional)

   El horario se evalúa en zona horaria de Chile (America/Santiago), no en la del
   dispositivo del visitante. Falla en silencio: si no hay entrada, `activo` es
   false, o Contentful no responde, no se pinta nada. */
(function () {
  'use strict';

  var CFG = window.BQ_CONFIG || {};
  // Fallback a los mismos valores PÚBLICos de js/config.js (CDA es read-only y ya
  // viaja al navegador). Permite que el widget funcione en páginas que no cargan
  // config.js. Si el token CDA rota, actualizar aquí y en js/config.js.
  var SPACE = CFG.CONTENTFUL_SPACE_ID || 'jsyka3qmf5vm';
  var TOKEN = CFG.CONTENTFUL_ACCESS_TOKEN || 'eRQByYc_-IOt1625TvG7jWTv59-ZjGzfb9S_ZeGPLww';
  var ENV = CFG.CONTENTFUL_ENVIRONMENT || 'master';
  var CDN = 'https://cdn.contentful.com';

  var CACHE_KEY = 'bq_wa_cfg';
  var CACHE_TTL = 5 * 60 * 1000; // 5 min: evita refetch en cada navegación.

  var DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  // getDay() → índice; el 0 es domingo. Mapea el weekday de Intl (inglés) a índice.
  var EN2IDX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

  function norm(s) {
    // Minúsculas y sin tildes (mapeo explícito: evita depender de rangos Unicode
    // de marcas combinantes, frágiles de editar).
    return String(s || '').trim().toLowerCase()
      .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
      .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
  }

  /* Día (0-6) y minutos del día actuales en horario de Chile, sin depender de la
     zona del visitante. */
  function ahoraSantiago() {
    try {
      var p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Santiago', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var wd = '', h = '0', m = '0';
      p.forEach(function (x) {
        if (x.type === 'weekday') wd = x.value;
        else if (x.type === 'hour') h = x.value;
        else if (x.type === 'minute') m = x.value;
      });
      var hh = parseInt(h, 10) % 24; // Intl a veces da "24" a medianoche
      return { dia: EN2IDX[wd.toLowerCase()], min: hh * 60 + parseInt(m, 10) };
    } catch (e) {
      var d = new Date(); // fallback: hora local del dispositivo
      return { dia: d.getDay(), min: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function hhmmAMin(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    return (parseInt(m[1], 10) % 24) * 60 + parseInt(m[2], 10);
  }

  /* ¿Estamos dentro del horario y día configurados? Sin días → todos los días.
     Sin horas válidas → 24 h. Ventana simple del mismo día (inicio < fin). */
  function dentroDeHorario(cfg) {
    var now = ahoraSantiago();
    var dias = (cfg.diasDisponibles || []).map(norm).filter(Boolean);
    if (dias.length) {
      var hoy = DIAS[now.dia];
      if (dias.indexOf(hoy) === -1) return false;
    }
    var ini = hhmmAMin(cfg.horaInicio), fin = hhmmAMin(cfg.horaFin);
    if (ini == null || fin == null || ini >= fin) return true; // sin ventana válida → siempre
    return now.min >= ini && now.min < fin;
  }

  async function loadConfig() {
    // Cache corta en sessionStorage.
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && (Date.now() - c.t) < CACHE_TTL) return c.v;
    } catch (e) {}
    var url = CDN + '/spaces/' + SPACE + '/environments/' + ENV + '/entries' +
      '?access_token=' + encodeURIComponent(TOKEN) +
      '&content_type=whatsappWidget&limit=1';
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Contentful ' + res.status);
    var data = await res.json();
    var item = (data.items || [])[0];
    var cfg = item ? item.fields : null;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: cfg })); } catch (e) {}
    return cfg;
  }

  function waHref(telefono, texto) {
    var num = String(telefono || '').replace(/[^0-9]/g, '');
    var base = 'https://wa.me/' + num;
    return texto ? base + '?text=' + encodeURIComponent(texto) : base;
  }

  function injectStyles() {
    if (document.getElementById('bq-wa-style')) return;
    var css =
      '#bqWa{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:var(--font-body,"Plus Jakarta Sans",sans-serif)}' +
      '#bqWa .bq-wa-bubble{max-width:240px;background:#fff;color:#333;border:1px solid #e6e6e6;border-radius:14px;padding:11px 14px;font-size:.86rem;line-height:1.4;box-shadow:0 8px 26px rgba(20,20,20,.14);position:relative;animation:bqWaIn .4s cubic-bezier(.34,1.4,.5,1)}' +
      '#bqWa .bq-wa-bubble .bq-wa-x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#444;color:#fff;border:none;cursor:pointer;font-size:14px;line-height:22px;text-align:center;padding:0}' +
      '#bqWa .bq-wa-btn{width:60px;height:60px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:0 8px 24px rgba(37,211,102,.45);cursor:pointer;transition:transform .2s,box-shadow .2s;border:none}' +
      '#bqWa .bq-wa-btn:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 30px rgba(37,211,102,.55)}' +
      '#bqWa .bq-wa-btn svg{width:34px;height:34px;fill:#fff}' +
      '#bqWa .bq-wa-dot{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#e5484d;border:2px solid #fff}' +
      '#bqWa.bq-wa-off .bq-wa-btn{background:#8a8a8a;box-shadow:0 8px 24px rgba(20,20,20,.25)}' +
      '@keyframes bqWaIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '@media(max-width:520px){#bqWa{right:14px;bottom:14px}#bqWa .bq-wa-btn{width:54px;height:54px}#bqWa .bq-wa-btn svg{width:30px;height:30px}}';
    var st = document.createElement('style');
    st.id = 'bq-wa-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

  function render(cfg) {
    if (!cfg || cfg.activo === false || !cfg.telefono) return;
    var abierto = dentroDeHorario(cfg);
    var ocultar = cfg.ocultarFueraDeHorario === true;
    if (!abierto && ocultar) return; // fuera de horario y configurado para ocultarse

    var texto = (!abierto && cfg.mensajeFueraDeHorario) ? cfg.mensajeFueraDeHorario : (cfg.mensajePredeterminado || '');
    var href = waHref(cfg.telefono, texto);
    var saludo = (!abierto && cfg.mensajeFueraDeHorario) ? cfg.mensajeFueraDeHorario : (cfg.saludo || '');

    injectStyles();
    var wrap = document.createElement('div');
    wrap.id = 'bqWa';
    if (!abierto) wrap.className = 'bq-wa-off';

    var bubbleHTML = saludo
      ? '<div class="bq-wa-bubble" id="bqWaBubble"><button class="bq-wa-x" aria-label="Cerrar">×</button>' + escapeHtml(saludo) + '</div>'
      : '';

    wrap.innerHTML =
      bubbleHTML +
      '<a class="bq-wa-btn" href="' + href + '" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp">' +
        WA_SVG +
        (abierto ? '<span class="bq-wa-dot" title="En línea"></span>' : '') +
      '</a>';

    document.body.appendChild(wrap);

    var x = wrap.querySelector('.bq-wa-x');
    if (x) x.addEventListener('click', function (e) {
      e.preventDefault();
      var b = document.getElementById('bqWaBubble');
      if (b) b.style.display = 'none';
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    loadConfig()
      .then(render)
      .catch(function (e) { /* falla en silencio: sin widget si Contentful no responde */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
