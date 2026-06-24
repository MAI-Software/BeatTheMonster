// Cosmetic appearances for the player and the coach. Purely visual — extra copies
// only give album points. More can be added later (gacha/shop).
export interface Skin {
  id: string;
  name: string;
  kind: "player" | "coach";
  gender?: "male" | "female"; // player skins map to a gender
  img: string;
}

export const PLAYER_SKINS: Skin[] = [
  { id: "player_male", name: "Basic M", kind: "player", gender: "male", img: "characters/player/male.webp" },
  { id: "player_female", name: "Basic F", kind: "player", gender: "female", img: "characters/player/female.webp" },
];

export const COACH_SKINS: Skin[] = [
  { id: "coach_vega", name: "Basic M", kind: "coach", img: "characters/coach/coach_body.webp" },
  { id: "coach_vega_f", name: "Basic F", kind: "coach", img: "characters/coach/coach_female.webp" },
];

export const ALL_SKINS = [...PLAYER_SKINS, ...COACH_SKINS];

export function playerSkinImg(gender: "male" | "female" | null): string {
  return (PLAYER_SKINS.find((s) => s.gender === (gender ?? "male")) ?? PLAYER_SKINS[0]).img;
}
export function coachSkinImg(id: string): string {
  return (COACH_SKINS.find((s) => s.id === id) ?? COACH_SKINS[0]).img;
}
export function getSkin(id: string): Skin | undefined {
  return ALL_SKINS.find((s) => s.id === id);
}
