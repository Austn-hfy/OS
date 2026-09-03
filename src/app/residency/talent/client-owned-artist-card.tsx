"use client";

import { useActionState, useState, type FormEvent } from "react";
import {
  archiveClientOwnedArtistAction,
  permanentlyDeleteClientOwnedArtistAction,
  restoreClientOwnedArtistAction,
  updateClientOwnedArtistAction,
  type ClientSettingsActionState,
} from "@/app/residency/actions";
import type { ClientSafeManagedTalent } from "@/domain/client-safe-talent";
import { TALENT_GENRES } from "@/domain/talent-genres";

const initialState: ClientSettingsActionState = { status: "idle", message: "" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function creationLabel(artist: ClientSafeManagedTalent, residencyName: string): string {
  if (artist.creationSource === "hfy_on_behalf") return `Added by HFY on behalf of ${residencyName}`;
  if (artist.creationSource === "residency_member") return `Added by the ${residencyName} team`;
  return "Creator source unavailable";
}

export function ClientOwnedArtistCard({ artist, canManage, residencyName, outstandingOwedCents, outstandingAssignmentCount }: { artist: ClientSafeManagedTalent; canManage: boolean; residencyName: string; outstandingOwedCents: number; outstandingAssignmentCount: number }) {
  const [editing, setEditing] = useState(false);
  const [genre, setGenre] = useState(artist.genres[0] ?? TALENT_GENRES[0]);
  const [updateState, updateAction, updating] = useActionState(updateClientOwnedArtistAction, initialState);
  const [archiveState, archiveAction, archiving] = useActionState(archiveClientOwnedArtistAction, initialState);

  function confirmArchive(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Archive ${artist.stageName}? They will leave future scheduling choices, while existing bookings stay intact.`)) event.preventDefault();
  }

  return <article className="card client-safe-talent-card">
    <header className="client-owned-artist-header"><div><span className="status client-owned">Residency artist</span><h2>{artist.stageName}</h2></div>{canManage && !editing ? <button className="button secondary" type="button" onClick={() => setEditing(true)}>Edit</button> : null}</header>
    <p className="client-artist-creation-source">{creationLabel(artist, residencyName)}</p>
    {editing ? <form className="client-owned-artist-form" action={updateAction}>
      <input type="hidden" name="artistId" value={artist.id} />
      <div className="field"><label htmlFor={`artist-name-${artist.id}`}>Name</label><input id={`artist-name-${artist.id}`} name="name" required maxLength={200} defaultValue={artist.stageName} /></div>
      <div className="field"><label htmlFor={`artist-contact-${artist.id}`}>Contact <span>(optional)</span></label><input id={`artist-contact-${artist.id}`} name="contact" maxLength={300} defaultValue={artist.clientContact} /></div>
      <div className="field"><label htmlFor={`artist-market-${artist.id}`}>Home market <span>(optional)</span></label><input id={`artist-market-${artist.id}`} name="homeMarket" maxLength={200} defaultValue={artist.homeMarket} /></div>
      <div className="field"><label htmlFor={`artist-instagram-${artist.id}`}>Instagram <span>(optional)</span></label><input id={`artist-instagram-${artist.id}`} name="instagramHandle" maxLength={160} defaultValue={artist.instagramHandle} /></div>
      <div className="field"><label htmlFor={`artist-genre-${artist.id}`}>Genre</label><select id={`artist-genre-${artist.id}`} name="genre" value={genre} onChange={(event) => setGenre(event.target.value)}>{TALENT_GENRES.map((preset) => <option value={preset} key={preset}>{preset}</option>)}<option value="custom">Custom</option></select>{genre === "custom" ? <input aria-label="Custom genre" name="customGenre" required maxLength={80} defaultValue={artist.genres[0]} /> : <input name="customGenre" type="hidden" value="" />}</div>
      <div className="client-owned-artist-actions"><button className="button" type="submit" disabled={updating}>{updating ? "Saving…" : "Save changes"}</button><button className="button secondary" type="button" onClick={() => setEditing(false)} disabled={updating}>{updateState.status === "success" ? "Done" : "Cancel"}</button></div>
      {updateState.status !== "idle" ? <p className={updateState.status === "error" ? "error" : "success"} aria-live="polite">{updateState.message}</p> : null}
    </form> : <div className="client-artist-profile-row"><dl className="client-artist-facts"><div><dt>Genre</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Home market</dt><dd>{artist.homeMarket || "Not listed"}</dd></div><div><dt>Instagram</dt><dd>{artist.instagramHandle || "Not listed"}</dd></div><div><dt>Contact</dt><dd>{artist.clientContact || "Not listed"}</dd></div></dl><aside className="client-artist-owed-summary"><span>Outstanding owed</span><strong>{money(outstandingOwedCents)}</strong><small>{outstandingAssignmentCount} Assignment{outstandingAssignmentCount === 1 ? "" : "s"}</small></aside></div>}
    {canManage && !editing ? <form className="client-owned-artist-delete" action={archiveAction} onSubmit={confirmArchive}>
      <input type="hidden" name="artistId" value={artist.id} />
      <button className="button secondary danger-button" type="submit" disabled={archiving}>{archiving ? "Archiving…" : "Archive Artist"}</button>
      <small>Removes this artist from future scheduling without erasing their record or booking history.</small>
      {archiveState.status === "error" ? <p className="error" aria-live="polite">{archiveState.message}</p> : null}
    </form> : null}
  </article>;
}

export function ArchivedClientOwnedArtistCard({ artist, canManage, residencyName }: { artist: ClientSafeManagedTalent; canManage: boolean; residencyName: string }) {
  const [restoreState, restoreAction, restoring] = useActionState(restoreClientOwnedArtistAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(permanentlyDeleteClientOwnedArtistAction, initialState);

  function confirmPermanentDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Permanently delete ${artist.stageName}? This cannot be undone.`)) event.preventDefault();
  }

  return <article className="card client-safe-talent-card archived-client-artist-card">
    <header className="client-owned-artist-header"><div><span className="status inactive">Archived</span><h2>{artist.stageName}</h2></div></header>
    <p className="client-artist-creation-source">{creationLabel(artist, residencyName)}</p>
    <dl><div><dt>Genre</dt><dd>{artist.genres.length ? artist.genres.join(", ") : "Not listed"}</dd></div><div><dt>Home market</dt><dd>{artist.homeMarket || "Not listed"}</dd></div><div><dt>Instagram</dt><dd>{artist.instagramHandle || "Not listed"}</dd></div><div><dt>Archived</dt><dd>{artist.archivedAt ? new Date(artist.archivedAt).toLocaleDateString() : "Not listed"}</dd></div></dl>
    {canManage ? <div className="archived-client-artist-actions">
      <form action={restoreAction}><input type="hidden" name="artistId" value={artist.id} /><button className="button secondary" type="submit" disabled={restoring}>{restoring ? "Restoring…" : "Restore Artist"}</button></form>
      {artist.hasBookingHistory ? <p className="warning">This artist has booking history, so the record must remain archived and cannot be permanently deleted.</p> : <form action={deleteAction} onSubmit={confirmPermanentDelete}><input type="hidden" name="artistId" value={artist.id} /><button className="button secondary danger-button" type="submit" disabled={deleting}>{deleting ? "Deleting…" : "Permanently Delete"}</button></form>}
      {restoreState.status === "error" ? <p className="error" aria-live="polite">{restoreState.message}</p> : null}
      {deleteState.status === "error" ? <p className="error" aria-live="polite">{deleteState.message}</p> : null}
    </div> : null}
  </article>;
}
