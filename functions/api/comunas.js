/* GET /api/comunas — regiones y comunas para poblar el selector del checkout.

   Se sirve desde acá para que exista UNA sola lista: la misma que valida el
   servidor. Si el frontend tuviera su copia, tarde o temprano divergirían y el
   cliente podría elegir una comuna que el checkout después rechaza. */

import { REGIONES } from '../_lib/comunas.js';

export async function onRequest({ request }) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  return new Response(JSON.stringify(REGIONES), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Lista estática: que la cachee el edge y el navegador.
      'Cache-Control': 'public, max-age=86400, s-maxage=604800'
    }
  });
}
