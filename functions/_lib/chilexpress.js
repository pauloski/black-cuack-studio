/* Cliente de la API Cotizador (Rating) de Chilexpress.

   Se llama SOLO desde el servidor: la subscription key es secreta y la API tiene
   CORS. El navegador nunca la toca — igual criterio que la firma de Flow.

   Contrato confirmado en el portal de developers (v1.0):
   POST {host}/rating/api/v1.0/rates/courier
   Auth: header Ocp-Apim-Subscription-Key = Primary Key de la suscripción "Cotizador".
   Respuesta OK: statusCode 0, tarifas en data.courierServiceOptions[].serviceValue. */

const HOSTS = {
  qa: 'https://testservices.wschilexpress.com',
  prod: 'https://services.wschilexpress.com',
};

// CHX_SANDBOX "0" = producción; cualquier otro valor (o ausente) = QA. Mismo
// criterio conservador que FLOW_SANDBOX: no se asume producción por accidente.
function host(env) {
  return env.CHX_SANDBOX === '0' ? HOSTS.prod : HOSTS.qa;
}

/* Servicios de ENVÍO hacia el cliente que ofrecemos. La API mezcla en la misma
   respuesta servicios de DEVOLUCIÓN (ej. cod 14 "EXPRESS LDEV", 47 "CHEX LOG
   DEVOLUCION ESPECIAL") que NO sirven para despachar a un comprador y podrían
   colarse como "el más barato". Por eso se filtra por whitelist de servicios de ida:
   2=PRIORITARIO · 3=EXPRESS · 4=EXTENDIDO · 5=EXTREMOS · 41/42=Encomiendas grandes. */
const FORWARD_SERVICE_CODES = new Set([2, 3, 4, 5, 41, 42]);

/* Caja por defecto (cm) para todo el catálogo de ropa/impresos. Chilexpress
   calcula el peso volumétrico a partir de estas dimensiones y cobra por el mayor
   entre peso físico y volumétrico (campo didUseVolumetricWeight en la respuesta).
   Si algún producto necesita otra caja, se puede sobreescribir por producto. */
export const DEFAULT_BOX = { height: 10, width: 25, length: 35 };

/* Cotiza un envío A DOMICILIO para (origen, destino, peso). Devuelve la opción
   MÁS BARATA de las que ofrece Chilexpress.

   Params: { originCode, destCode } códigos de cobertura de 4 letras (API Cobertura);
   weightKg peso total del paquete en kg; box {height,width,length} cm; declaredWorth
   valor declarado en CLP (para seguro/indemnización).

   Retorna { ok:true, costo, servicio, serviceTypeCode, finalWeight }
   o { ok:false, error, errors }. NUNCA lanza por respuestas de negocio (sin
   cobertura, etc.); solo lanza si falta la key (error de configuración). */
export async function quoteShipping(env, { originCode, destCode, weightKg, box = DEFAULT_BOX, declaredWorth = 0 }) {
  const key = env.CHX_RATING_KEY;
  if (!key) throw new Error('Falta CHX_RATING_KEY en el entorno de la Function.');

  const body = {
    originCountyCode: originCode,
    destinationCountyCode: destCode,
    package: {
      weight: String(weightKg),
      height: String(box.height),
      width: String(box.width),
      length: String(box.length),
    },
    productType: 3,   // 3 = Encomienda (1 = Documento)
    contentType: 1,
    declaredWorth: String(Math.round(declaredWorth) || 0),
    deliveryTime: 0,  // 0 = todos los servicios disponibles
  };

  let res, data;
  try {
    res = await fetch(host(env) + '/rating/api/v1.0/rates/courier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Ocp-Apim-Subscription-Key': key,
      },
      body: JSON.stringify(body),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    return { ok: false, error: 'No pudimos conectar con Chilexpress.', errors: [e.message] };
  }

  // statusCode 0 = OK (confirmado en el portal). Cualquier otro trae statusDescription.
  if (!res.ok || !data || data.statusCode !== 0) {
    return {
      ok: false,
      error: (data && data.statusDescription) || ('Chilexpress respondió ' + res.status),
      errors: (data && data.errors) || null,
    };
  }

  const options = (data.data && data.data.courierServiceOptions) || [];
  // Solo servicios de ENVÍO hacia el cliente (excluye devoluciones/especiales).
  const forward = options.filter((o) => FORWARD_SERVICE_CODES.has(Number(o.serviceTypeCode)));
  if (!forward.length) {
    return { ok: false, error: 'Chilexpress no tiene servicio de despacho para ese destino.' };
  }

  // La más barata por serviceValue (pesos, string en la respuesta).
  const cheapest = forward.reduce((min, o) =>
    Number(o.serviceValue) < Number(min.serviceValue) ? o : min
  );

  return {
    ok: true,
    costo: Math.round(Number(cheapest.serviceValue)),
    servicio: cheapest.serviceDescription,        // "EXPRESS", "PRIORITARIO", ...
    serviceTypeCode: cheapest.serviceTypeCode,    // 3 = CHEX, 2 = PREX, ...
    finalWeight: cheapest.finalWeight,            // peso con el que se valorizó
  };
}
