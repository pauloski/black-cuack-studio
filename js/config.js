/* BlackQuack — configuración pública de Contentful.
   Se carga ANTES de api.js y bq-v5.js.

   El Delivery Token (CDA) es de solo lectura y se entrega al navegador en cada
   request: es público por diseño y va versionado a propósito. Los secretos
   reales (Flow secretKey, tokens de Management API) NUNCA van en esta capa. */
window.BQ_CONFIG = {
  CONTENTFUL_SPACE_ID: 'jsyka3qmf5vm',
  CONTENTFUL_ACCESS_TOKEN: 'eRQByYc_-IOt1625TvG7jWTv59-ZjGzfb9S_ZeGPLww',
  CONTENTFUL_ENVIRONMENT: 'master',
  CONTENTFUL_CONTENT_TYPE: 'product'
};
