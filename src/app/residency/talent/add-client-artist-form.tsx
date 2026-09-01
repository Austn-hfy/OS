"use client";

import { useActionState } from "react";
import { createClientOwnedArtistAction, type ClientSettingsActionState } from "@/app/residency/actions";
import { TALENT_GENRES } from "@/domain/talent-genres";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function AddClientArtistForm() {
  const [state, action, pending] = useActionState(createClientOwnedArtistAction, initialState);
  return <section className="card client-add-artist">
    <header className="client-add-artist-heading"><div><p className="eyebrow">Talent roster</p><h2>Add an artist</h2></div><p>Add a client-owned artist using only the essentials. Payment, tax, payout, and earnings records stay outside HFY.</p></header>
    <form action={action}>
      <div className="field"><label htmlFor="client-artist-name">Name</label><input id="client-artist-name" name="name" required maxLength={200} placeholder="Artist or stage name" /></div>
      <div className="field"><label htmlFor="client-artist-contact">Contact <span>(optional)</span></label><input id="client-artist-contact" name="contact" maxLength={300} placeholder="Email, phone, or preferred contact" /></div>
      <div className="field"><label htmlFor="client-artist-genre">Genre</label><select id="client-artist-genre" name="genre" defaultValue={TALENT_GENRES[0]}>{TALENT_GENRES.map((genre) => <option key={genre}>{genre}</option>)}</select></div>
      <button className="button" disabled={pending} type="submit">{pending ? "Adding…" : "+ Add Artist"}</button>
      {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </form>
  </section>;
}
