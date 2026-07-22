/* Estados de despacho (fulfillment) — SEPARADOS del estado de pago (`status`).
   Etiquetas, pasos visibles para el cliente, link de tracking y la vista pública
   (sin datos personales) de una orden. */

export const FULFILLMENT_LABELS = {
  pendiente_pago: 'Pendiente de pago',
  en_preparacion: 'En preparación',
  despachado: 'Despachado',
  en_transito: 'En tránsito',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// Pasos de la barra de progreso que ve el cliente (los intermedios de Chilexpress
// se agrupan como "En camino" hasta que exista el tracking automático).
export const FULFILLMENT_STEPS = [
  { key: 'en_preparacion', label: 'En preparación' },
  { key: 'despachado', label: 'Despachado' },
  { key: 'en_transito', label: 'En camino' },
  { key: 'entregado', label: 'Entregado' },
];

export const COURIER_LABELS = { chilexpress: 'Chilexpress', blue: 'Blue Express' };

/* Deep-link al seguimiento público por número de OT/OS, según courier. Verificar
   los formatos si cambian; si fallan, el cliente igual tiene el número. */
export function trackingUrl(ot, courier) {
  if (!ot) return null;
  if (courier === 'blue') {
    // Seguimiento Blue Express por N° de OS. (Verificar el deep-link exacto.)
    return 'https://www.blue.cl/seguimiento?os=' + encodeURIComponent(ot);
  }
  return 'https://www.chilexpress.cl/Views/ChilexpressCL/Resultado-busqueda.aspx?DATA=' + encodeURIComponent(ot);
}

/* Vista PÚBLICA de una orden (sin RUT, dirección, teléfono ni email). La consume
   la página de seguimiento del cliente. */
export function publicOrderView(o) {
  const courier = o.courier || null;             // 'chilexpress' | 'blue'
  const metodo = (o.shipping && o.shipping.metodo) || null; // 'domicilio' | 'retiro_punto'
  return {
    order: o.commerceOrder || null,
    pago: o.status || null,                    // paid | pending | rejected | ...
    fulfillment: o.fulfillment || null,
    fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment] || null,
    entrega: o.entrega || null,                // ventana estimada { desde, hasta, labels }
    comuna: (o.shipping && o.shipping.comuna) || null,
    metodo,                                     // domicilio / retiro_punto
    punto: (o.shipping && o.shipping.punto) || null, // Punto Blue (si retiro)
    courier,
    courierLabel: COURIER_LABELS[courier] || null,
    tracking: o.tracking ? { ot: o.tracking.ot || null, url: trackingUrl(o.tracking && o.tracking.ot, courier) } : null,
    amount: o.amount != null ? o.amount : null,
    items: (o.lines || []).map((l) => ({ title: l.product_title, variant: l.variant_label || '', qty: l.qty })),
    created_at: o.created_at || null,
  };
}
