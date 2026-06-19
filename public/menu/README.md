# Imágenes del menú (recorrido por el gimnasio)

El menú principal usa una imagen de fondo. Al moverte por las opciones, el fondo
panea y hace transición para simular que caminas por el gimnasio.

- **Base / por defecto:** `gym.svg` (se usa si una opción no tiene su propia imagen).
- **Por opción (opcional):** crea un archivo con el nombre de la opción y el juego
  hará crossfade hacia él al enfocarla:

```
public/menu/
  gym.svg          <- fondo base (obligatorio)
  campaign.svg     <- Campaña
  practice.svg     <- Práctica
  tutorial.svg     <- Tutorial
  training.svg     <- Entrenar
  equip.svg        <- Equipo & Flow
  gacha.svg        <- Gacha
  challenges.svg   <- Desafíos
  ranking.svg      <- Ranking
```

Formatos: `.svg`, `.png` o `.jpg` (cambia la extensión también en el código si no es
`.svg`, o deja que caiga a `gym.svg` por defecto). Recomendado: imagen apaisada,
fondo de gimnasio/ring, buen contraste para que se lea el texto encima.
