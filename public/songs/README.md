# Tus canciones (una carpeta por enemigo)

Cada enemigo tiene su **propia carpeta**. La canción que pongas ahí se asocia
directamente a ese enemigo y suena en su combate, sincronizada a sus beats.

```
public/songs/
  joe_mixen/       -> Joe Mixen
  rciardo_noxin/   -> Rcicardo Noxin
  vladi_pootin/    -> Vladi Pootin
  kym_jongun/      -> Kym Jong-Fun
  elon_tusk/       -> Elon Tusk
  doni_crump/      -> Doni Crump
```

## Cómo añadir música a un enemigo

1. Copia tu audio (`.mp3`, `.ogg`, `.wav`, `.m4a`) dentro de la carpeta del enemigo,
   p.ej. `public/songs/doni_crump/final.mp3`
2. Edita el `manifest.json` de **esa misma carpeta**:

```json
[
  { "id": "final", "name": "Tema Final", "file": "final.mp3" }
]
```

Campos:
- `id` — identificador único dentro de la carpeta (sin espacios)
- `name` — nombre mostrado en el selector antes del combate
- `file` — nombre exacto del archivo en esa carpeta
- `bpm` *(opcional)* — si lo conoces

3. Reconstruye (`npm run build`) o recarga en dev.

> Si la carpeta del enemigo no tiene canciones (`manifest.json` vacío `[]`), ese
> combate usa el **ritmo interno** del juego (metrónomo según el BPM del enemigo).

## Notas
- Usa música de la que tengas derechos. No subas material con copyright a un sitio público.
- `.mp3` / `.ogg` son los más compatibles en móvil.
- Para añadir un nuevo enemigo/modo: crea una carpeta con su `id` y un `manifest.json`.
