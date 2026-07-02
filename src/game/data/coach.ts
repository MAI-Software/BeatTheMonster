// The coach: tutorial script. Lines are spoken aloud (TTS) and shown in a bubble.
export const COACH_NAME = "Entrenador Vega";

export interface CoachStep { text: string; img?: string }

export const TUTORIAL_STEPS: CoachStep[] = [
  { text: "Escúchame. Se ha abierto un PORTAL en el gimnasio y de él salen criaturas: orcos, troles… y cosas peores." },
  { text: "Esto es un gimnasio de BOXEO. Solo hay una forma de contenerlas: a base de leches. Tus puños y tu ritmo." },
  { text: "En combate lo primero es la GUARDIA: las dos manos a la altura de la cara, firme y erguido." },
  { text: "Tu cabeza y tus puños se colocan en el TRIÁNGULO de combate. Desde ahí golpeas y esquivas al ritmo." },
  { text: "Suficiente charla. Vamos al ring: te enseño a pelear paso a paso." },
];

// Prefight guide: enemy portrait -> song -> the fight button, in order.
export const PREFIGHT_GUIDE = {
  enemy: (name: string): string[] => [`Este es tu rival: ${name}.`],
  song: (song: string): string[] => [`Sonará "${song}" durante el combate.`],
  start: ["Cuando estés listo, pulsa <b>LUCHAR</b>."] as string[],
};

// In-combat guide: HP bar -> triangle -> punch drill -> dodge drill -> go.
export const COMBAT_GUIDE = {
  hp: ["Aquí ves la vida de tu rival. Baja con cada golpe que aciertes."],
  triangle: ["Este es tu triángulo de combate: desde aquí golpeas y esquivas."],
  punchIntro: ["Vamos a entrenar los puñetazos. Golpea el lado marcado.", "¡Dame 5!"],
  dodgeIntro: ["¡Bien! Ahora las esquivas: inclina la cabeza para llevar la bola hasta la señal, sobre el triángulo.", "¡Dame 5!"],
  ready: ["Ya estás preparado. Ponte en guardia...", "¡y machácalo!"],
};

// Result guide: material (captions the reveal popup) -> XP -> coins, in order.
export const RESULT_GUIDE = {
  material: "Esto es un material. Te servirá más adelante para mejorar tu equipo.",
  xp: ["Cada combate te da experiencia: sube tu nivel."],
  coins: ["Y monedas: te sirven para entrenar tus estadísticas."],
};
