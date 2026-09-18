"use client";

import { useActionState, useState, useTransition } from "react";
import { enterClientViewAsAction } from "./client-view-as-actions";
import {
  changeResidencyUserRoleAction,
  inviteResidencyUsersAction,
  removeResidencyUserAction,
  requestResidencyUserPasswordResetAction,
  resendResidencyInvitationAction,
  setPrimaryResidencyContactAction,
  type AccountActionState,
} from "./actions";
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

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? email.slice(0, 2);
  return letters.toLocaleUpperCase();
}

export function UsersAndRoles({ users, currentUserId }: { users: ResidencyUser[]; currentUserId: string }) {
  const [inviteState, inviteAction, invitePending] = useActionState(inviteResidencyUsersAction, initialState);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const seatsAvailable = Math.max(0, 4 - users.length);

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
    <ResidencySectionHeader
      eyebrow="Users & roles"
      title="People with access"
      description="Pending invitations and active users both count toward the four-user limit."
      aside={<span className="residency-user-seat-count">{users.length} of 4 seats · {seatsAvailable} available</span>}
      split
    />

    <form action={inviteAction} className="residency-user-invite-form">
      <div className="field residency-user-invite-email">
        <label htmlFor="invite-emails">Email addresses</label>
        <input id="invite-emails" name="emails" type="text" inputMode="email" placeholder="alex@example.com, jordan@example.com" disabled={users.length >= 4} required />
        <small>Separate multiple addresses with commas.</small>
      </div>
      <div className="field residency-user-invite-role">
        <label htmlFor="invite-role">Access role</label>
        <select id="invite-role" name="role" defaultValue="calendar_viewer" disabled={users.length >= 4}>
          <option value="calendar_viewer">Calendar viewer</option>
          <option value="manager">Manager</option>
        </select>
        <small>Calendar-only or full workspace access.</small>
      </div>
      <button className="button residency-user-invite-submit" type="submit" disabled={invitePending || users.length >= 4}>
        {invitePending ? "Sending…" : users.length >= 4 ? "Four-user limit reached" : "Send invitations"}
      </button>
      {inviteState.status !== "idle" ? <p className={inviteState.status === "error" ? "error" : "success"} role="status">{inviteState.message}</p> : null}
    </form>

    <div className="residency-user-roster" role="table" aria-label="People with access">
      <div className="residency-user-roster-header" role="row" aria-hidden="true">
        <span>Person</span>
        <span>Access</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      <div className="residency-user-list" role="rowgroup">
        {users.map((user) => <article className={`residency-user-row ${user.state}`} role="row" key={user.id}>
          <div className="residency-user-identity" role="cell">
            <span className="residency-user-avatar" aria-hidden="true">{initials(user.name, user.email)}</span>
            <span>
              <strong>{user.state === "active" ? user.name : user.email}</strong>
              <small>{user.state === "active" ? user.email : `Invited ${formatDate(user.invitedAt)} by ${user.invitedBy?.displayName ?? user.invitedBy?.email ?? "HFY"}`}</small>
            </span>
          </div>

          <div className="residency-user-access" role="cell">
            {user.state === "active" ? <form className="residency-user-role-form" action={(formData) => run(changeResidencyUserRoleAction, formData, "Role updated.")}>
              <input type="hidden" name="contactId" value={user.id} />
              <select name="role" defaultValue={user.accessRole ?? "calendar_viewer"} aria-label={`Role for ${user.name}`} disabled={pending || user.userId === currentUserId}>
                <option value="calendar_viewer">Calendar viewer</option>
                <option value="manager">Manager</option>
              </select>
              <button className="button secondary" type="submit" disabled={pending || user.userId === currentUserId}>Save</button>
            </form> : <div className="residency-user-pending-role">
              <strong>{user.accessRole ? roleDetails[user.accessRole].label : "No access"}</strong>
              <small>{user.accessRole ? roleDetails[user.accessRole].description : "No workspace access."}</small>
            </div>}
          </div>

          <div className="residency-user-status" role="cell">
            {user.isPrimary ? <span className="status active">Primary contact</span> : null}
            <span className={`status ${user.state === "active" ? "active" : "pending"}`}>{user.state === "active" ? "Enrolled" : "Invitation pending"}</span>
          </div>

          <div className="residency-user-actions" role="cell">
            {user.state === "active" ? <>
              {user.membershipId && user.userId !== currentUserId ? <form action={enterClientViewAsAction}>
                <input type="hidden" name="membershipId" value={user.membershipId} />
                <button className="button secondary" type="submit">View as</button>
              </form> : null}
              <form action={(formData) => run(requestResidencyUserPasswordResetAction, formData, `Password reset link sent to ${user.email}.`)}>
                <input type="hidden" name="contactId" value={user.id} />
                <button className="button secondary" type="submit" disabled={pending}>Reset password</button>
              </form>
              {!user.isPrimary ? <form action={(formData) => run(setPrimaryResidencyContactAction, formData, "Primary contact updated.")}>
                <input type="hidden" name="contactId" value={user.id} />
                <button className="button secondary" type="submit" disabled={pending}>Make primary</button>
              </form> : null}
              {user.userId !== currentUserId ? <form action={(formData) => run(removeResidencyUserAction, formData, `${user.name} was removed.`)}>
                <input type="hidden" name="contactId" value={user.id} />
                <button className="button danger" type="submit" disabled={pending || user.isPrimary}>Remove</button>
              </form> : null}
            </> : <>
              <form action={(formData) => run(resendResidencyInvitationAction, formData, `Invitation resent to ${user.email}.`)}>
                <input type="hidden" name="contactId" value={user.id} />
                <button className="button secondary" type="submit" disabled={pending}>Resend invite</button>
              </form>
              <form action={(formData) => run(removeResidencyUserAction, formData, `Invitation to ${user.email} was revoked.`)}>
                <input type="hidden" name="contactId" value={user.id} />
                <button className="button danger" type="submit" disabled={pending}>Revoke</button>
              </form>
            </>}
          </div>

          {user.state === "active" && (user.roleHistory[0] || user.roleChangedAt) ? <small className="residency-user-audit">
            {user.roleHistory[0]
              ? `Changed from ${user.roleHistory[0].previousRole?.replaceAll("_", " ")} to ${user.roleHistory[0].newRole?.replaceAll("_", " ")} by ${user.roleHistory[0].actor} on ${formatDate(user.roleHistory[0].changedAt)}`
              : `Last changed by ${user.roleChangedBy?.displayName ?? user.roleChangedBy?.email ?? "HFY"} on ${formatDate(user.roleChangedAt)}`}
          </small> : null}
        </article>)}
      </div>
    </div>
    {message ? <p className={/unable|cannot|final|error/i.test(message) ? "error" : "success"} role="status">{message}</p> : null}
  </ResidencySurfaceCard>;
}
