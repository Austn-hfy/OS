import { z } from "zod";

const sourceTalentSchema = z.object({
  id: z.uuid(),
  stageName: z.string().min(1).max(200),
  homeMarket: z.string().max(200),
  genres: z.array(z.string().max(100)).max(100),
  instagramHandle: z.string().max(160),
}).passthrough();

export type ClientSafeTalent = Readonly<{
  id: string;
  stageName: string;
  homeMarket: string;
  genres: string[];
  instagramHandle: string;
}>;

/** The only projection from privileged Talent rows into a hotel-facing roster. */
export function projectClientSafeTalent(candidate: unknown): ClientSafeTalent {
  const row = sourceTalentSchema.parse(candidate);
  return Object.freeze({
    id: row.id,
    stageName: row.stageName,
    homeMarket: row.homeMarket,
    genres: [...row.genres],
    instagramHandle: row.instagramHandle,
  });
}

export function projectClientSafeRoster(rows: unknown[]): ClientSafeTalent[] {
  return rows.map(projectClientSafeTalent);
}
