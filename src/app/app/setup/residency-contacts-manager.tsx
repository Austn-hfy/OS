"use client";

import { useActionState, useState, useTransition } from "react";
import { generateResidencySetupLinkAction, inviteResidencyContactAction, removeResidencyContactAction, saveResidencyContactAction, sendResidencySetupEmailAction, type ResidencyActionState } from "@/app/app/actions";

type ContactRow = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  accessRole: "manager" | "calendar_viewer" | null;
  invitationStatus: "not_invited" | "invited" | "active" | "revoked";
  isPrimary: boolean;
  hasAccount: boolean;
  isInternalTest: boolean;
};

const initialState: ResidencyActionState = { status: "idle", message: "" };
type ContactDraft = { id: string; name: string; title: string; email: string; phone: string; accessRole: "none" | "manager" | "calendar_viewer"; isPrimary: boolean };
const blankContact: ContactDraft = { id: "", name: "", title: "", email: "", phone: "", accessRole: "none", isPrimary: false };

function roleLabel(role: ContactRow["accessRole"]) {
  if (role === "manager") return "Residency Manager";
  if (role === "calendar_viewer") return "Calendar Viewer";
  return "Contact only";
}

export function ResidencyContactsManager({ residencyId, contacts }: { residencyId: string; contacts: ContactRow[] }) {
  const [draft, setDraft] = useState<ContactDraft>(blankContact);
  const [state, saveAction, pending] = useActionState(saveResidencyContactAction, initialState);
  const [inviteState, setInviteState] = useState(initialState);
  const [preparedSetupLink, setPreparedSetupLink] = useState("");
  const [removingContactId, setRemovingContactId] = useState("");
  const [inviting, startInvite] = useTransition();

  function edit(contact: ContactRow) {
    setDraft({
      id: contact.id,
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      accessRole: contact.accessRole ?? "none",
      isPrimary: contact.isPrimary,
    });
    setInviteState(initialState);
    setPreparedSetupLink("");
  }

  function invite(contactId: string) {
    startInvite(async () => setInviteState(await inviteResidencyContactAction({ contactId })));
  }

  function sendSetupEmail(contactId: string) {
    startInvite(async () => {
      setPreparedSetupLink("");
      setInviteState(await sendResidencySetupEmailAction({ contactId }));
    });
  }

  function copySetupLink(contactId: string) {
    startInvite(async () => {
      const result = await generateResidencySetupLinkAction({ contactId });
      if (result.status !== "success" || !result.setupLink) {
        setPreparedSetupLink("");
        setInviteState({ status: "error", message: result.message });
        return;
      }
      setPreparedSetupLink(result.setupLink);
      try {
        await navigator.clipboard.writeText(result.setupLink);
        setInviteState({ status: "success", message: result.message });
      } catch {
        setInviteState({ status: "error", message: "Clipboard access was blocked. Try again from this secure owner screen." });
      }
    });
  }

  function removeContact(contact: ContactRow) {
    const confirmed = window.confirm(`Remove ${contact.name} from this Residency? Their Residency login access will be revoked, unused setup links will stop working, and the contact will disappear from the active team. Access to any other Residency will not be affected.`);
    if (!confirmed) return;
    setRemovingContactId(contact.id);
    startInvite(async () => {
      const result = await removeResidencyContactAction({ contactId: contact.id });
      setInviteState(result);
      setRemovingContactId("");
      if (result.status === "success" && draft.id === contact.id) {
        setDraft(blankContact);
        setPreparedSetupLink("");
      }
    });
  }

  return <section className="card residency-contacts-manager">
    <div className="setup-card-heading"><div><p className="eyebrow">Contacts &amp; access</p><h2>Residency team</h2><p className="subhead">Keep operational contacts here. Login access is optional and must be invited deliberately.</p></div><button className="button secondary" type="button" onClick={() => setDraft(blankContact)}>+ Add contact</button></div>
    <div className="residency-contacts-layout">
      <div className="residency-contact-list">
        {contacts.map((contact) => <article className={draft.id === contact.id ? "selected" : ""} key={contact.id}>
          <button type="button" onClick={() => edit(contact)}><span><strong>{contact.name}</strong><small>{contact.title || "Title not set"}</small></span><span><small>{roleLabel(contact.accessRole)}</small>{contact.isInternalTest ? <em>Internal test</em> : null}{contact.isPrimary ? <em>Primary</em> : null}</span></button>
          <div>
            <span className={`contact-invite-status ${contact.invitationStatus}`}>{contact.invitationStatus.replaceAll("_", " ")}</span>
            <span className="contact-access-actions">
              {contact.accessRole && contact.hasAccount ? <>
                <button className="text-action" type="button" onClick={() => sendSetupEmail(contact.id)} disabled={inviting}>{inviting ? "Sending…" : "Send setup email"}</button>
                <button className="text-action" type="button" onClick={() => copySetupLink(contact.id)} disabled={inviting}>Copy link</button>
              </> : contact.accessRole && contact.invitationStatus !== "active" ? <button className="text-action" type="button" onClick={() => invite(contact.id)} disabled={inviting}>{inviting ? "Sending…" : contact.invitationStatus === "invited" ? "Resend invite" : "Send invite"}</button> : null}
              <button className="text-action danger" type="button" onClick={() => removeContact(contact)} disabled={inviting}>{removingContactId === contact.id ? "Removing…" : "Remove contact"}</button>
            </span>
          </div>
        </article>)}
        {!contacts.length ? <div className="empty"><strong>No contacts yet</strong><p>Add the manager, event contact, or anyone HFY works with regularly.</p></div> : null}
      </div>

      <form action={saveAction} className="residency-contact-form">
        <input name="id" type="hidden" value={draft.id} />
        <input name="residencyId" type="hidden" value={residencyId} />
        <div className="setup-form-heading"><strong>{draft.id ? "Edit contact" : "New contact"}</strong><span>Saving does not send an invitation.</span></div>
        <div className="row"><div className="field"><label>Name</label><input name="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></div><div className="field"><label>Title / role</label><input name="title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="General Manager" /></div></div>
        <div className="row"><div className="field"><label>Email</label><input name="email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></div><div className="field"><label>Phone</label><input name="phone" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></div></div>
        <div className="field"><label>Login access</label><select name="accessRole" value={draft.accessRole} onChange={(event) => setDraft({ ...draft, accessRole: event.target.value as typeof draft.accessRole })}><option value="none">No login — contact only</option><option value="manager">Residency Manager — client-safe overview and calendar</option><option value="calendar_viewer">Calendar Viewer — read-only calendar</option></select><small>Client accounts never receive payouts, rates, invoices, internal notes, or artist payment data.</small></div>
        <label className="checkbox-row"><input name="isPrimary" type="checkbox" checked={draft.isPrimary} onChange={(event) => setDraft({ ...draft, isPrimary: event.target.checked })} /> Primary day-to-day contact</label>
        {state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}
        {inviteState.status !== "idle" ? <p className={inviteState.status === "error" ? "error" : "success"} aria-live="polite">{inviteState.message}</p> : null}
        {preparedSetupLink ? <p><a className="text-action" href={preparedSetupLink} target="_blank" rel="noreferrer">Open private setup page</a></p> : null}
        <div className="setup-card-actions"><span>Invite access from the saved contact list when ready.</span><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save contact"}</button></div>
      </form>
    </div>
  </section>;
}
