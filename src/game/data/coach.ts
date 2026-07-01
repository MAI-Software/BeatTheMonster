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
