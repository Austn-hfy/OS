import { getArtistLookupData, getResidencyList } from "@/data/internal";
import { ArtistLookup } from "./artist-lookup";

export default async function TalentPage({ searchParams }: { searchParams: Promise<{ residency?: string }> }) {
  const { residency } = await searchParams;
  const [rows, residencies] = await Promise.all([getArtistLookupData(residency), getResidencyList()]);
  const selected = residencies.find((item) => item.id === residency);
  return (
    <>
      <header className="page-header artist-lookup-page-header"><div><p className="eyebrow">{selected?.name ?? "Shared roster"}</p><h1>Artist Lookup</h1><p className="subhead">Search the roster, then open one artist to see outstanding pay, upcoming bookings, contact information, and payment details.</p></div></header>
      <ArtistLookup artists={rows} residencies={residencies} currentResidency={selected ?? null} />
    </>
  );
}
