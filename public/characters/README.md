# Imágenes de personajes

Pon aquí las imágenes del **entrenador** y de los **enemigos**. Son opcionales: si
falta una, el juego usa un marcador de color con la inicial.

## Estructura

```
public/characters/
  coach/
    coach.png        -> retrato del entrenador (tutorial)
  enemies/
    goblin_scout.png    -> cara del Goblin Explorador (junto a su vida)
    orc_grunt.png
    troll_stone.png
    orc_berserker.png
    ogre_brute.png
    portal_demon.png
```

## Reglas

- **Entrenador:** `public/characters/coach/coach.png`. Se ve grande en el tutorial.
  Recomendado: imagen vertical tipo retrato, fondo transparente (`.png`).
- **Enemigos:** `public/characters/enemies/<id>.png`, donde `<id>` es el identificador
  del enemigo (ver lista arriba). En combate **solo se ve la CARA** junto a la barra
  de vida, así que recorta a primer plano de la cara, cuadrada, fondo transparente.
- Formatos: `.png` (mejor, con transparencia) o `.jpg`.
- Tamaño sugerido cara: 256×256. Entrenador: ~600×900.

Tras añadir imágenes, reconstruye (`npm run build`) o recarga en dev.
