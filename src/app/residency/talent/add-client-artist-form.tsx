"use client";

import { useActionState, useState } from "react";
import { createClientOwnedArtistAction, type ClientSettingsActionState } from "@/app/residency/actions";
import { TALENT_GENRES } from "@/domain/talent-genres";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function AddClientArtistForm() {
  const [state, action, pending] = useActionState(createClientOwnedArtistAction, initialState);
  const [genre, setGenre] = useState<string>(TALENT_GENRES[0]);
  return <section className="card client-add-artist">
    <header className="client-add-artist-heading"><div><p className="eyebrow">Talent roster</p><h2>Add an artist</h2></div></header>
    <form action={action}>
      <div className="field"><label htmlFor="client-artist-name">Name</label><input id="client-artist-name" name="name" required maxLength={200} placeholder="Artist or stage name" /></div>
      <div className="field"><label htmlFor="client-artist-contact">Contact <span>(optional)</span></label><input id="client-artist-contact" name="contact" maxLength={300} placeholder="Email, phone, or preferred contact" /></div>
      <div className="field"><label htmlFor="client-artist-genre">Genre</label><select id="client-artist-genre" name="genre" value={genre} onChange={(event) => setGenre(event.target.value)}>{TALENT_GENRES.map((preset) => <option value={preset} key={preset}>{preset}</option>)}<option value="custom">Custom</option></select>{genre === "custom" ? <input aria-label="Custom genre" name="customGenre" required maxLength={80} placeholder="Enter genre" /> : <input name="customGenre" type="hidden" value="" />}</div>
      <button className="button" disabled={pending} type="submit">{pending ? "Adding…" : "+ Add Artist"}</button>
      {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
    </form>
  </section>;
}
