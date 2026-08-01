# Por qué es infraestructura de costo casi cero (y hasta dónde aguanta)

> Material de **venta + transparencia**. Explica en simple por qué la tienda opera
> gratis, cuánto tráfico/ventas aguanta, y qué pasa si el cliente crece. Cada
> cliente vive en **sus propias cuentas gratuitas**, así que la cuota completa es
> suya.

## El titular

> **Tu tienda puede recibir del orden de ~90.000 visitas al mes sin pagar un peso
> de infraestructura.** Solo empezarías a pagar algo cuando ya seas una tienda
> genuinamente popular — un "problema de éxito". Shopify o Wix te cobran desde la
> visita número 1; acá pagas $0 hasta ser grande.

## Por qué es casi gratis (en simple)

1. **El sitio se sirve desde una red global con ancho de banda ilimitado gratis
   (Cloudflare).** El tráfico no cuesta — ni siquiera los videos o imágenes pesadas
   del diseño. Donde otras plataformas cobran por tráfico, acá es $0.
2. **Las fotos se optimizan solas** (formato WebP, tamaño justo): pesan ~40× menos
   que la foto original. El consumo de datos es mínimo.
3. **El catálogo se guarda en caché "en el borde"**: aunque entren mil personas, el
   sistema consulta el gestor de contenido apenas ~una vez por minuto, no una vez
   por visita. Eso es lo que normalmente hace explotar los planes gratuitos — y acá
   está resuelto.
4. **Cada cliente tiene sus propias cuentas gratuitas**, así que toda la cuota es
   suya, sin compartir con nadie.

## Cuánto aguanta (traducido a lo que importa)

| Métrica del negocio | Capacidad en plan gratuito |
|---|---|
| **Visitas al mes** | ~**90.000** antes de acercarse a cualquier límite (~3.000/día) |
| **Ventas/órdenes** | Holgado hasta **cientos de pedidos por día** |
| **Productos** | Hasta ~100 en la base actual (ampliable) |
| **Uso típico de un emprendedor** (cientos a pocos miles de visitas/mes) | **< 5%** de la cuota gratuita |

Traducción: un emprendedor promedio usa una fracción mínima del plan. La
infraestructura no es un costo hasta que la tienda se vuelve realmente exitosa.

## Los límites exactos (transparencia)

Cada cliente, en **sus** cuentas gratuitas:

| Servicio | Qué hace | Límite gratuito | ¿Preocupa? |
|---|---|---|---|
| **Cloudflare Pages** | sirve el sitio (páginas, imágenes, video) | **ancho de banda ILIMITADO** | No |
| **Contentful — imágenes** | banda de las fotos de producto | **50 GB/mes** | Primer límite real (~90K visitas) |
| **Contentful — operaciones** | consultas al catálogo/CMS | **100.000/mes** | No (desacoplado del tráfico) |
| **Cloudflare D1** | stock en vivo | ~5 M lecturas/día · 100 K escrituras/día | No |
| **Cloudflare KV** | órdenes | 100 K lecturas/día · ~1 K escrituras/día | Solo si >~300 ventas/día |

**Costo real por tienda:** infraestructura **$0/mes**. Único costo fijo: el
**dominio** (~$10.000 CLP/año). Los pagos (Flow) cobran una comisión por transacción,
igual que cualquier pasarela — eso lo paga la venta, no la tienda.

## ¿Y si creces más allá del plan gratis?

Es un **problema de éxito** y llega tarde:

- El **primer límite** que tocarías (~90.000 visitas/mes) es la banda de imágenes.
- La solución también es barata: cachear las imágenes en Cloudflare (sigue casi
  gratis) o pasar al **primer plan pago del gestor de contenido**, recién ahí.
- Para entonces, tu tienda ya factura lo suficiente para que ese costo sea
  irrelevante frente a tus ventas.

Compáralo con el modelo de arriendo: en Shopify/Wix pagas mensualidad fija **desde
el día uno**, tengas 10 visitas o 10.000. Acá el costo aparece **solo si te va muy
bien**, y aun así es una fracción de lo que pagarías arrendando.

## Frases listas para la propuesta

- *"Misma arquitectura que mueve a los gigantes, a tu escala — y con costo de
  infraestructura cercano a cero."*
- *"No pagas por existir. Pagas (poco) solo si te vuelves popular."*
- *"Hasta ~90.000 visitas al mes sin costo de infraestructura. La mayoría de las
  tiendas nunca llega a pagar un peso por esto."*
- *"En Shopify arriendas y pagas desde la primera visita. Acá eres dueño y pagas
  $0 hasta que el éxito lo justifique."*

> Nota de precisión (para ti, no para la slide): las ~90.000 visitas asumen ~0,55 MB
> de imágenes por visita nueva; visitas repetidas casi no consumen (caché del
> navegador). Son visitas ÚNICAS; en páginas vistas totales aguanta bastante más.
