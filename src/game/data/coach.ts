// The coach: tutorial script. Lines are spoken aloud (TTS) and shown in a bubble.
export const COACH_NAME = "Entrenador Vega";

export interface CoachStep { text: string; img?: string }

export const TUTORIAL_STEPS: CoachStep[] = [
  { text: "Escúchame bien. Se ha abierto un PORTAL en el gimnasio. De ahí están saliendo monstruos: orcos, troles, cosas peores." },
  { text: "Nadie más puede contenerlos. Solo tú, tus puños y tu ritmo. Vas a salvar al mundo a puñetazos." },
  { text: "Antes de cada asalto, sube la GUARDIA: las dos manos a la altura de la cara. En cuanto estés firme, empezamos.", img: "tutorial/pose1.webp" },
  { text: "Para golpear, empuja el puño hacia la cámara JUSTO cuando el círculo quede alineado en el centro de tu lado. Cuanto más centrado, mejor: eso es un PERFECT." },
  { text: "Para esquivar, inclina la cabeza hacia la señal y déjala ahí en el momento justo, igual que los golpes." },
  { text: "Encadena PERFECTs y desatarás tu Estado de Flujo, tu modo furia. Respira, siente el ritmo… y al ring." },
];
