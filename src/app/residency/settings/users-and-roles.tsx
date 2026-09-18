"use client";

import { useActionState, useState, useTransition } from "react";
import { enterClientViewAsAction } from "./client-view-as-actions";
import { changeResidencyUserRoleAction, inviteResidencyUsersAction, removeResidencyUserAction, resendResidencyInvitationAction, setPrimaryResidencyContactAction, type AccountActionState } from "./actions";
import { ResidencySectionHeader, ResidencySurfaceCard } from "@/components/residency-design-system";

type ResidencyUser = {
  id: string;
  userId: string | null;
  membershipId: string | null;
  name: string;
  email: string;
  phone: string;
  accessRole: "manager" | "calendar_viewer" | null;
  state: "pending" | "active";
  isPrimary: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  invitedBy: { displayName: string; email: string } | null;
  roleChangedAt: string | null;
  roleChangedBy: { displayName: string; email: string } | null;
  roleHistory: Array<{ actor: string; previousRole: string | null; newRole: string | null; changedAt: string }>;
};

const initialState: AccountActionState = { status: "idle", message: "" };
const roleDetails = {
  manager: { label: "Manager", description: "Full workspace, Account, users, roles, and Billing." },
  calendar_viewer: { label: "Calendar viewer", description: "Calendar only. No Account, Billing, Talent, or Finances access." },
} as const;

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";
}

export function UsersAndRoles({ users, currentUserId }: { users: ResidencyUser[]; currentUserId: string }) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteResidencyUsersAction, initialState);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: (formData: FormData) => Promise<void>, formData: FormData, success: string) {
    setMessage("");
    startTransition(async () => {
      try {
        await action(formData);
        setMessage(success);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to complete this change.");
      }
    });
  }

  return <ResidencySurfaceCard className="settings-account-section residency-users-card">
    <ResidencySectionHeader eyebrow="Users & roles" title={`People with access · ${users.length}/4`} description="Pending invitations and active users both count toward the four-user limit." />
    <form action={inviteAction} className="residency-user-invite-form">
      <div className="field wide"><label htmlFor="invite-emails">Email addresses</label><textarea id="invite-emails" name="emails" rows={3} placeholder="alex@example.com, jordan@example.com" disabled={users.length >= 4} required /></div>
      <fieldset className="residency-role-options"><legend>Access role</legend><label className="residency-role-option"><input type="radio" name="role" value="calendar_viewer" defaultChecked /><span><strong>{roleDetails.calendar_viewer.label}</strong><small>{roleDetails.calendar_viewer.description}</small></span></label><label className="residency-role-option"><input type="radio" name="role" value="manager" /><span><strong>{roleDetails.manager.label}</strong><small>{roleDetails.manager.description}</small></span></label></fieldset>
      <div className="residency-user-invite-actions">{inviteState.status !== "idle" ? <p className={inviteState.status === "error" ? "error" : "success"} role="status">{inviteState.message}</p> : null}<button className="button" type="submit" disabled={invitePending || users.length >= 4}>{invitePending ? "Sending…" : users.length >= 4 ? "Four-user limit reached" : "Send invitations"}</button></div>
    </form>
    <div className="residency-user-list">
      {users.map((user) => <article className={`residency-user-row ${user.state}`} key={user.id}>
        <div className="residency-user-identity"><div><strong>{user.state === "active" ? user.name : user.email}</strong>{user.isPrimary ? <span className="status active">Primary contact</span> : null}<span className={`status ${user.state === "active" ? "active" : "pending"}`}>{user.state === "active" ? "Enrolled" : "Invitation pending"}</span></div><span>{user.state === "active" ? user.email : `Invited ${formatDate(user.invitedAt)}`} · by {user.invitedBy?.displayName ?? user.invitedBy?.email ?? "HFY"}</span></div>
        <div className="residency-user-role"><strong>{user.accessRole ? roleDetails[user.accessRole].label : "No access"}</strong><span>{user.accessRole ? roleDetails[user.accessRole].description : "No workspace access."}</span>{user.roleHistory[0] ? <small>Changed from {user.roleHistory[0].previousRole?.replaceAll("_", " ")} to {user.roleHistory[0].newRole?.replaceAll("_", " ")} by {user.roleHistory[0].actor} on {formatDate(user.roleHistory[0].changedAt)}</small> : user.roleChangedAt ? <small>Last changed by {user.roleChangedBy?.displayName ?? user.roleChangedBy?.email ?? "HFY"} on {formatDate(user.roleChangedAt)}</small> : null}</div>
        <div className="residency-user-actions">
          {user.state === "active" ? <>
            <form action={(formData) => run(changeResidencyUserRoleAction, formData, "Role updated.")}><input type="hidden" name="contactId" value={user.id} /><select name="role" defaultValue={user.accessRole ?? "calendar_viewer"} aria-label={`Role for ${user.name}`} disabled={pending || user.userId === currentUserId}><option value="calendar_viewer">Calendar viewer</option><option value="manager">Manager</option></select><button className="button secondary" type="submit" disabled={pending || user.userId === currentUserId}>Save role</button></form>
            {!user.isPrimary ? <form action={(formData) => run(setPrimaryResidencyContactAction, formData, "Primary contact updated.")}><input type="hidden" name="contactId" value={user.id} /><button className="button secondary" type="submit" disabled={pending}>Make primary</button></form> : null}
            {user.membershipId && user.userId !== currentUserId ? <form action={enterClientViewAsAction}><input type="hidden" name="membershipId" value={user.membershipId} /><button className="button secondary" type="submit">View as {user.name}</button></form> : null}
            {user.userId !== currentUserId ? <form action={(formData) => run(removeResidencyUserAction, formData, `${user.name} was removed.`)}><input type="hidden" name="contactId" value={user.id} /><button className="button danger" type="submit" disabled={pending || user.isPrimary}>Remove</button></form> : <small>Your own manager access cannot be removed here.</small>}
          </> : <>
            <form action={(formData) => run(resendResidencyInvitationAction, formData, `Invitation resent to ${user.email}.`)}><input type="hidden" name="contactId" value={user.id} /><button className="button secondary" type="submit" disabled={pending}>Resend</button></form>
            <form action={(formData) => run(removeResidencyUserAction, formData, `Invitation to ${user.email} was revoked.`)}><input type="hidden" name="contactId" value={user.id} /><button className="button danger" type="submit" disabled={pending}>Revoke</button></form>
          </>}
        </div>
      </article>)}
    </div>
    {message ? <p className={/unable|cannot|final|error/i.test(message) ? "error" : "success"} role="status">{message}</p> : null}
  </ResidencySurfaceCard>;
}
