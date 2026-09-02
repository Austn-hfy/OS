"use client";

import { useActionState, useState, type FormEvent } from "react";
import {
  deleteClientOwnedArtistAction,
  updateClientOwnedArtistAction,
  type ClientSettingsActionState,
} from "@/app/residency/actions";
import type { ClientSafeTalent } from "@/domain/client-safe-talent";
import { TALENT_GENRES } from "@/domain/talent-genres";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

export function ClientOwnedArtistCard({ artist, canManage }: { artist: ClientSafeTalent; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [genre, setGenre] = useState(artist.genres[0] ?? TALENT_GENRES[0]);
  const [updateState, updateAction, updating] = useActionState(updateClientOwnedArtistAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteClientOwnedArtistAction, initialState);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete ${artist.stageName} from this Residency roster? Existing booking history will be preserved.`)) event.preventDefault();
  }

  return <article className="card client-safe-talent-card">
    <header className="client-owned-artist-header"><div><span className="status client-owned">Residency artist</span><h2>{artist.stageName}</h2></div>{canManage && !editing ? <button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit</button> : null}</header>
    {editing ? <form className="client-owned-artist-form" action={updateAction}>
      <input type="hidden" name="artistId" value={artist.id} />
      <div className="field"><label htmlFor={`artist-name-${artist.id}`}>Name</label><input id={`artist-name-${artist.id}`} name="name" required maxLength={200} defaultValue={artist.stageName} /></div>
      <div className="field"><label htmlFor={`artist-contact-${artist.id}`}>Contact <span>(optional)</span></label><input id={`artist-contact-${artist.id}`} name="contact" maxLength={300} defaultValue={artist.clientContact} /></div>
      <div className="field"><label htmlFor={`artist-market-${artist.id}`}>Home market <span>(optional)</span></label><input id={`artist-market-${artist.id}`} name="homeMarket" maxLength={200} defaultValue={artist.homeMarket} /></div>
      <div className="field"><label htmlFor={`artist-instagram-${artist.id}`}>Instagram <span>(optional)</span></label><input id={`artist-instagram-${artist.id}`} name="instagramHandle" maxLength={160} defaultValue={artist.instagramHandle} /></div>
      <div className="field"><label htmlFor={`artist-genre-${artist.id}`}>Genre</label><select id={`artist-genre-${artist.id}`} name="genre" value={genre} onChange={(event) => setGenre(event.target.value)}>{TALENT_GENRES.map((preset) => <option value={preset} key={preset}>{preset}</option>)}<option value="custom">Custom</option></select>{genre === "custom" ? <input aria-label="Custom genre" name="customGenre" required maxLength={80} defaultValue={artist.genres[0]} /> : <input name="customGenre" type="hidden" value="" />}</div>
      <div className="client-owned-artist-actions"><button className="button" type="submit" disabled={updating}>{updating ? "Saving…" : "Save changes"}</button><button className="button secondary" type="button" onClick={() => setEditing(false)} disabled={updating}>{updateState.status === "success" ? "Done" : "Cancel"}</button></div>
      {updateState.status !== "idle" ? <p className={updateState.status === "error" ? "error" : "success"} aria-live="polite">{updateState.message}</p> : null}
    </form> : <dl><div><dt>Genre</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Home market</dt><dd>{artist.homeMarket || "Not listed"}</dd></div><div><dt>Instagram</dt><dd>{artist.instagramHandle || "Not listed"}</dd></div><div><dt>Contact</dt><dd>{artist.clientContact || "Not listed"}</dd></div></dl>}
    {canManage && !editing ? <form className="client-owned-artist-delete" action={deleteAction} onSubmit={confirmDelete}>
      <input type="hidden" name="artistId" value={artist.id} />
      <button className="button secondary danger-button" type="submit" disabled={deleting}>{deleting ? "Deleting…" : "Delete Artist"}</button>
      <small>Removes this artist from future scheduling. Existing bookings remain intact.</small>
      {deleteState.status === "error" ? <p className="error" aria-live="polite">{deleteState.message}</p> : null}
    </form> : null}
  </article>;
}
