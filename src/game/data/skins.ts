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
  { id: "coach_vega", name: "Basic M", kind: "coach", gender: "male", img: "characters/coach/coach_body.webp" },
  { id: "coach_vega_f", name: "Basic F", kind: "coach", gender: "female", img: "characters/coach/coach_female.webp" },
];

// Dialogue-only portrait (cropped/centered above the waist) — used in the tutorial
// popups (guide spotlight bubble), not the full-body art (hero/wardrobe/charselect).
const COACH_DIALOG_IMG: Record<"male" | "female", string> = {
  male: "characters/coach/dialog_m.webp",
  female: "characters/coach/dialog_f.webp",
};

export const ALL_SKINS = [...PLAYER_SKINS, ...COACH_SKINS];

export function playerSkinImg(gender: "male" | "female" | null): string {
  return (PLAYER_SKINS.find((s) => s.gender === (gender ?? "male")) ?? PLAYER_SKINS[0]).img;
}
export function coachSkinImg(id: string): string {
  return (COACH_SKINS.find((s) => s.id === id) ?? COACH_SKINS[0]).img;
}
export function coachDialogImg(id: string): string {
  const skin = COACH_SKINS.find((s) => s.id === id) ?? COACH_SKINS[0];
  return COACH_DIALOG_IMG[skin.gender ?? "male"];
}
export function getSkin(id: string): Skin | undefined {
  return ALL_SKINS.find((s) => s.id === id);
}
