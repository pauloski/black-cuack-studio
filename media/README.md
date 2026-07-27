# media/ — video de fondo de la landing del flipbook

La landing `flipbook.html` usa un video en loop de fondo. Deja aquí dos archivos:

| Archivo | Qué es | Obligatorio |
|---|---|---|
| `flipbook-loop.mp4` | El loop de fondo (H.264, **sin audio**) | Sí |
| `flipbook-poster.jpg` | Primer frame, se ve mientras carga el video | Recomendado |

## ⚠️ Límite: 25 MB por archivo (Cloudflare Pages)

El video **debe pesar menos de 25 MB** (ideal < 10 MB, mejor < 5). Un loop de fondo
no necesita alta calidad: es corto, va tapado por un scrim oscuro y sin audio.

### Comprimir con ffmpeg

```bash
# Loop de fondo optimizado: 1080p, sin audio, ~2-6 MB según duración.
ffmpeg -i original.mov \
  -an \
  -vf "scale=1920:-2" \
  -c:v libx264 -profile:v high -crf 28 -preset slow \
  -movflags +faststart \
  -pix_fmt yuv420p \
  media/flipbook-loop.mp4

# Poster (primer frame):
ffmpeg -i media/flipbook-loop.mp4 -vframes 1 -q:v 3 media/flipbook-poster.jpg
```

Sube el `crf` (28 → 30/32) o baja la resolución (`1280:-2`) si aún supera 25 MB.
Recorta la duración a 5–12 s para un loop más liviano (`-t 8`).

## Si el video no baja de 25 MB

Alternativa: subirlo a **Cloudflare Stream** (o R2) y cambiar el `<video>` de
`flipbook.html` por el embed/HLS. Avísale a quien mantenga el código.

## Mientras no exista el archivo

La landing no se rompe: el hero muestra un **degradado de marca** de fondo hasta
que subas `flipbook-loop.mp4`.
