/* BlackQuack — capa de datos Contentful (CDA).
   Requiere js/config.js cargado antes. Expone window.fetchProducts().

   Contentful entrega los Assets aparte del entry (fields.image es un Link).
   Este módulo los resuelve contra `includes.Asset` y devuelve URLs planas. */
(function () {
  'use strict';

  var CFG = window.BQ_CONFIG || {};
  var CDN = 'https://cdn.contentful.com';

  /* Los originales del space pesan ~23MB y miden 7339px de ancho. La Images API
     los redimensiona en el edge de Contentful: sin esto la tienda es injugable. */
  var IMG = { main: 'fm=webp&q=80&w=1200&h=1200&fit=fill', view: 'fm=webp&q=75&w=900' };

  function assetUrl(asset, params) {
    var url = asset && asset.fields && asset.fields.file && asset.fields.file.url;
    if (!url) return null;
    // La CDA devuelve URLs protocol-relative ("//images.ctfassets.net/...").
    if (url.indexOf('//') === 0) url = 'https:' + url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + params;
  }

  function indexBy(list) {
    var map = {};
    for (var i = 0; i < (list || []).length; i++) map[list[i].sys.id] = list[i];
    return map;
  }

  var resolve = function (link, map) {
    return link && link.sys ? map[link.sys.id] : null;
  };

  /* Una variante de productVariant → objeto plano. price cae al del producto
     si la variante no lo trae; stock es el inventario INICIAL (Contentful),
     no el stock en vivo (ese vive en D1 y lo pinta /api/stock). */
  function mapVariant(entry, productPrice) {
    var f = (entry && entry.fields) || {};
    return {
      variant_id: entry.sys.id,
      size: f.size || '',
      color: f.color || '',
      design: f.design || '',
      price: Math.round(Number(f.price != null ? f.price : productPrice) || 0),
      initial_stock: f.stock != null ? Number(f.stock) : null
    };
  }

  function mapEntry(entry, assets, entries) {
    var f = entry.fields || {};
    var views = (f.image_views || [])
      .map(function (link) { return assetUrl(resolve(link, assets), IMG.view); })
      .filter(Boolean);

    var price = Math.round(Number(f.price) || 0);
    // variants es un array de referencias a productVariant; se resuelve contra includes.Entry.
    var variants = (f.variants || [])
      .map(function (link) { return resolve(link, entries); })
      .filter(Boolean)
      .map(function (v) { return mapVariant(v, price); });

    return {
      id: f.id || entry.sys.id,
      product_title: f.product_title || '',
      // El field ID en Contentful es "descripcin" (perdió la tilde al crearse).
      descripcion: f.descripcin || f['descripción'] || f.descripcion || '',
      category: f.category || '',
      // CLP no usa decimales: entero limpio, listo para el amount de Flow.
      price: price,
      // stock global: fallback para productos SIMPLES (sin variants).
      stock: f.stock != null ? Number(f.stock) : null,
      variants: variants,
      image_url: assetUrl(resolve(f.image, assets), IMG.main),
      image_views: views,
      // details es un documento Rich Text de Contentful; se convierte a HTML
      // más abajo (renderAllDetails). detalles_html queda listo para inyectar.
      details_doc: f.details || null,
      detalles_html: ''
    };
  }

  /* Renderizador de Rich Text (paquete oficial de Contentful), cargado bajo
     demanda vía ESM desde CDN — el sitio no tiene bundler. Se cachea tras la 1ª. */
  var _renderer = null;
  async function loadRenderer() {
    if (_renderer) return _renderer;
    var mod = await import('https://esm.sh/@contentful/rich-text-html-renderer@16.6.10');
    // Marcas semánticas: negrita → <strong>, cursiva → <em> (por defecto usa <b>/<i>).
    var opts = {
      renderMark: {
        bold: function (t) { return '<strong>' + t + '</strong>'; },
        italic: function (t) { return '<em>' + t + '</em>'; },
        underline: function (t) { return '<u>' + t + '</u>'; }
      }
    };
    _renderer = function (doc) { return mod.documentToHtmlString(doc, opts); };
    return _renderer;
  }

  async function renderAllDetails(products) {
    if (!products.some(function (p) { return p.details_doc; })) return;
    var render;
    try {
      render = await loadRenderer();
    } catch (e) {
      console.warn('[BQ] renderer de Rich Text no disponible:', e.message);
      return; // degradación elegante: la PDP funciona sin la sección Detalles
    }
    products.forEach(function (p) {
      if (p.details_doc) {
        try { p.detalles_html = render(p.details_doc); } catch (e) { /* ignora */ }
      }
    });
  }

  async function fetchProducts() {
    if (!CFG.CONTENTFUL_SPACE_ID || !CFG.CONTENTFUL_ACCESS_TOKEN) {
      throw new Error('BQ_CONFIG incompleto: falta space id o access token.');
    }

    var url = CDN + '/spaces/' + CFG.CONTENTFUL_SPACE_ID +
      '/environments/' + (CFG.CONTENTFUL_ENVIRONMENT || 'master') + '/entries' +
      '?access_token=' + encodeURIComponent(CFG.CONTENTFUL_ACCESS_TOKEN) +
      '&content_type=' + (CFG.CONTENTFUL_CONTENT_TYPE || 'product') +
      // include=2 para resolver variants (referencias) en una sola llamada.
      '&include=2&limit=100&order=fields.id';

    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      var detail = await res.text().catch(function () { return ''; });
      throw new Error('Contentful ' + res.status + ': ' + detail.slice(0, 200));
    }

    var data = await res.json();
    var assets = indexBy((data.includes || {}).Asset);
    var entries = indexBy((data.includes || {}).Entry);
    var products = (data.items || []).map(function (e) { return mapEntry(e, assets, entries); });
    await renderAllDetails(products); // convierte los Rich Text 'details' a HTML
    return products;
  }

  window.fetchProducts = fetchProducts;
})();
