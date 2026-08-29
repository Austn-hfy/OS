import { z } from "zod";

export const TALENT_GENRES = ["Electronic/House", "Open Format", "Vinyl"] as const;

export const talentGenreSchema = z.enum(TALENT_GENRES);
export const talentGenresSchema = z.array(talentGenreSchema).min(1).max(TALENT_GENRES.length);

export type TalentGenre = (typeof TALENT_GENRES)[number];

export function parseTalentGenres(formData: FormData): TalentGenre[] {
  return talentGenresSchema.parse(formData.getAll("genres"));
}
