/* Métodos de despacho ofrecidos, controlados POR AMBIENTE (feature flag).

   Producción sale SOLO con Blue-retiro; Chilexpress queda listo pero deshabilitado
   — no se pierde: vive detrás del flag y se enciende cuando haya empresa + llaves
   prod. Se controla con la variable de entorno SHIPPING_METHODS (coma-separada):
     - Producción (main):  SHIPPING_METHODS=blue_retiro   (o sin setear → default)
     - Preview / local:    SHIPPING_METHODS=blue_retiro,chilexpress_domicilio

   El checkout muestra SOLO los métodos habilitados. Con uno solo, va directo (sin
   selector); con dos o más, muestra la elección. */

export const METHODS = {
  blue_retiro: {
    id: 'blue_retiro',
    courier: 'blue',
    metodo: 'retiro_punto',
    label: 'Retiro en Punto Blue',
    descripcion: 'Retíralo en un local cercano. Más económico.',
    icon: 'package',
    needsPunto: true,      // requiere elegir un Punto Blue de destino
    needsDireccion: false,
  },
  chilexpress_domicilio: {
    id: 'chilexpress_domicilio',
    courier: 'chilexpress',
    metodo: 'domicilio',
    label: 'Despacho a domicilio',
    descripcion: 'Te lo llevamos a tu dirección con Chilexpress.',
    icon: 'home',
    needsPunto: false,
    needsDireccion: true,  // requiere dirección de entrega
  },
};

const DEFAULT = 'blue_retiro';

export function enabledMethodIds(env) {
  const raw = (env && env.SHIPPING_METHODS) || DEFAULT;
  return String(raw).split(',').map((s) => s.trim()).filter((id) => METHODS[id]);
}

export function enabledMethods(env) {
  return enabledMethodIds(env).map((id) => METHODS[id]);
}

export function methodById(id) {
  return METHODS[id] || null;
}

export function isMethodEnabled(env, id) {
  return enabledMethodIds(env).includes(id);
}
