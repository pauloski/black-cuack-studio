/* BlackQuack — configuración pública de Contentful.
   Se carga ANTES de api.js y bq-v5.js.

   El Delivery Token (CDA) es de solo lectura y se entrega al navegador en cada
   request: es público por diseño y va versionado a propósito. Los secretos
   reales (Flow secretKey, tokens de Management API) NUNCA van en esta capa. */
window.BQ_CONFIG = {
  CONTENTFUL_SPACE_ID: 'jsyka3qmf5vm',
  CONTENTFUL_ACCESS_TOKEN: 'eRQByYc_-IOt1625TvG7jWTv59-ZjGzfb9S_ZeGPLww',
  CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_CONTENT_TYPE: 'product',

  /* Marca (FRONTEND). Fuente de verdad de los valores de marca que consume el JS
     del navegador. Para un fork "llave en mano": cambiar estos valores aquí.
     NOTA (cero build step): el texto ESTÁTICO del HTML (títulos <title>, footer,
     copy) no se lee desde aquí — se ajusta con un find/replace al forkear. Los
     colores viven en css/bq-v5.css (:root); el prefijo de orden y lo del backend,
     en functions/_lib/brand.js. Mantener los tres alineados. */
  BRAND: {
    name: 'BlackQuack',
    tagline: 'Make some Quack',
    email: 'hola@blackquack.cl',
    orderPrefix: 'BQ-',   // debe coincidir con functions/_lib/brand.js
    socials: {
      instagram: '',
      tiktok: '',
      facebook: ''
    }
  }
};
