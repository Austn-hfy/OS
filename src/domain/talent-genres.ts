import { z } from "zod";

export const TALENT_GENRES = ["Electronic/House", "Open Format", "Vinyl"] as const;

export const talentGenreSchema = z.enum(TALENT_GENRES);
export const talentGenresSchema = z.array(talentGenreSchema).min(1).max(TALENT_GENRES.length);
export const clientArtistGenreSchema = z.string().trim().min(1, "Enter a custom genre.").max(80);

export type TalentGenre = (typeof TALENT_GENRES)[number];

export function parseTalentGenres(formData: FormData): TalentGenre[] {
  return talentGenresSchema.parse(formData.getAll("genres"));
}

export function resolveClientArtistGenre(genre: string, customGenre: string): string {
  return genre === "custom"
    ? clientArtistGenreSchema.parse(customGenre)
    : talentGenreSchema.parse(genre);
}
