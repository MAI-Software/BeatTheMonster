# Tus canciones

Pon aquí tus archivos de audio (`.mp3`, `.ogg`, `.wav`, `.m4a`) y añádelos a
`manifest.json`. El juego analiza los **beats** de la canción y sincroniza los
golpes con el ritmo.

## Cómo añadir una canción

1. Copia el archivo en esta carpeta, p.ej. `mi-tema.mp3`
2. Edita `manifest.json`:

```json
[
  { "id": "mitema", "name": "Mi Tema", "file": "mi-tema.mp3" },
  { "id": "otra",   "name": "Otra Canción", "file": "otra.ogg" }
]
```

Campos:
- `id` — identificador único (sin espacios)
- `name` — nombre que se muestra en el selector
- `file` — nombre exacto del archivo en esta carpeta
- `bpm` *(opcional)* — si lo sabes, ayuda a afinar el ritmo

3. Reconstruye (`npm run build`) o, en dev, recarga la página.

> Si dejas `manifest.json` vacío (`[]`), el juego usa su **ritmo interno**
> (metrónomo) basado en el BPM del enemigo.

## Notas

- Usa canciones de las que tengas derechos. No subas material con copyright a un
  sitio público.
- Formatos recomendados: `.mp3` o `.ogg` (compatibles con navegadores móviles).
- Archivos muy largos tardan más en analizar al iniciar el combate.
