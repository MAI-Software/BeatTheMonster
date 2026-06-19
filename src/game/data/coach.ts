// The coach: tutorial script. Lines are spoken aloud (TTS) and shown in a bubble.
export const COACH_NAME = "Entrenador Vega";

export interface CoachStep { text: string }

export const TUTORIAL_STEPS: CoachStep[] = [
  { text: "¡Bienvenido al ring, campeón! Soy el Entrenador Vega. En un minuto te enseño a pelear." },
  { text: "Lo primero: la GUARDIA. Sube las dos manos a la altura de la cara. Antes de cada asalto te pido la guardia: mantenla quieta y empezamos." },
  { text: "Ese triángulo de la pantalla eres tú. La punta de arriba es tu cabeza: se mueve cuando mueves la tuya." },
  { text: "Para golpear: cuando una mitad se llene de color hasta arriba, lanza ese puño. Izquierda azul, derecha naranja. Empuja la mano hacia la cámara, como un golpe de verdad." },
  { text: "Para esquivar: si aparece una esfera roja a un lado, inclina la cabeza hacia ella. Si llegas a tiempo, la esquivas y no recibes daño." },
  { text: "Encadena golpes PERFECT para montar un Super Combo y cargar tu Estado de Flujo, tu modo furia." },
  { text: "Eso es todo. Practica los puños y las esquivas por separado, y cuando te veas listo, al combate. ¡Vamos!" },
];
