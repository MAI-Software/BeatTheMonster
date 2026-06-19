# Tus canciones (una carpeta por enemigo)

Cada enemigo tiene su **propia carpeta**. La canción que pongas ahí se asocia
directamente a ese enemigo y suena en su combate, sincronizada a sus beats.

```
public/songs/
  god-is-dead.mp3   -> canción global (suena en TODOS los combates por defecto)
  goblin_scout/     -> Goblin Explorador
  orc_grunt/        -> Orco Recluta
  troll_stone/      -> Trol de Piedra
  orc_berserker/    -> Orco Berserker
  ogre_brute/       -> Ogro Brutal
  portal_demon/     -> Demonio del Portal
```

> La canción global `god-is-dead.mp3` está activa para todos los combates. Las
> carpetas por enemigo son opcionales: si pones una, aparece como opción extra en
> el selector antes del combate.

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
