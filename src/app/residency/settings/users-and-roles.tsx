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
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const seatsAvailable = Math.max(0, 4 - users.length);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];

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

    <div className="residency-user-focus-layout">
      <div className="residency-user-focus-list" role="group" aria-label="People with access">
        {users.map((user) => <button
          aria-controls="residency-user-focus-detail"
          aria-pressed={selectedUser?.id === user.id}
          className="residency-user-focus-option"
          key={user.id}
          onClick={() => setSelectedUserId(user.id)}
          type="button"
        >
          <span className="residency-user-avatar" aria-hidden="true">{initials(user.name, user.email)}</span>
          <span>
            <strong>{user.state === "active" ? user.name : user.email}</strong>
            <small>{user.accessRole ? roleDetails[user.accessRole].label : "No access"} · {user.state === "active" ? "Enrolled" : "Pending"}</small>
          </span>
        </button>)}
      </div>

      {selectedUser ? <section className={`residency-user-focus-detail ${selectedUser.state}`} id="residency-user-focus-detail" key={selectedUser.id} aria-live="polite">
        <div className="residency-user-focus-detail-head">
          <div className="residency-user-identity">
            <span className="residency-user-avatar" aria-hidden="true">{initials(selectedUser.name, selectedUser.email)}</span>
            <span>
              <strong>{selectedUser.state === "active" ? selectedUser.name : selectedUser.email}</strong>
              <small>{selectedUser.state === "active" ? selectedUser.email : `Invited ${formatDate(selectedUser.invitedAt)} by ${selectedUser.invitedBy?.displayName ?? selectedUser.invitedBy?.email ?? "HFY"}`}</small>
            </span>
          </div>

          <div className="residency-user-status">
            {selectedUser.isPrimary ? <span className="status active">Primary contact</span> : null}
            <span className={`status ${selectedUser.state === "active" ? "active" : "pending"}`}>{selectedUser.state === "active" ? "Enrolled" : "Invitation pending"}</span>
          </div>
        </div>

        <div className="residency-user-focus-detail-grid">
          <div className="residency-user-access">
            <small className="residency-user-focus-label">Access role</small>
            {selectedUser.state === "active" ? <form className="residency-user-role-form" action={(formData) => run(changeResidencyUserRoleAction, formData, "Role updated.")}>
              <input type="hidden" name="contactId" value={selectedUser.id} />
              <select name="role" defaultValue={selectedUser.accessRole ?? "calendar_viewer"} aria-label={`Role for ${selectedUser.name}`} disabled={pending || selectedUser.userId === currentUserId}>
                <option value="calendar_viewer">Calendar viewer</option>
                <option value="manager">Manager</option>
              </select>
              <button className="button secondary" type="submit" disabled={pending || selectedUser.userId === currentUserId}>Update role</button>
            </form> : <div className="residency-user-pending-role">
              <strong>{selectedUser.accessRole ? roleDetails[selectedUser.accessRole].label : "No access"}</strong>
              <small>{selectedUser.accessRole ? roleDetails[selectedUser.accessRole].description : "No workspace access."}</small>
            </div>}
          </div>

          <div className="residency-user-focus-access-copy">
            <small className="residency-user-focus-label">{selectedUser.state === "active" ? "Account access" : "Invitation"}</small>
            <p>{selectedUser.state === "active"
              ? selectedUser.accessRole ? roleDetails[selectedUser.accessRole].description : "No workspace access."
              : `Sent ${formatDate(selectedUser.invitedAt)} by ${selectedUser.invitedBy?.displayName ?? selectedUser.invitedBy?.email ?? "HFY"}.`}</p>
          </div>
        </div>

        {selectedUser.state === "active" && (selectedUser.roleHistory[0] || selectedUser.roleChangedAt) ? <small className="residency-user-audit">
          {selectedUser.roleHistory[0]
            ? `Changed from ${selectedUser.roleHistory[0].previousRole?.replaceAll("_", " ")} to ${selectedUser.roleHistory[0].newRole?.replaceAll("_", " ")} by ${selectedUser.roleHistory[0].actor} on ${formatDate(selectedUser.roleHistory[0].changedAt)}`
            : `Last changed by ${selectedUser.roleChangedBy?.displayName ?? selectedUser.roleChangedBy?.email ?? "HFY"} on ${formatDate(selectedUser.roleChangedAt)}`}
        </small> : null}

        <div className="residency-user-focus-actions">
          <div className="residency-user-actions">
            {selectedUser.state === "active" ? <>
              {selectedUser.membershipId && selectedUser.userId !== currentUserId ? <form action={enterClientViewAsAction}>
                <input type="hidden" name="membershipId" value={selectedUser.membershipId} />
                <button className="button secondary" type="submit">View as</button>
              </form> : null}
              <form action={(formData) => run(requestResidencyUserPasswordResetAction, formData, `Password reset link sent to ${selectedUser.email}.`)}>
                <input type="hidden" name="contactId" value={selectedUser.id} />
                <button className="button secondary" type="submit" disabled={pending}>Reset password</button>
              </form>
              {!selectedUser.isPrimary ? <form action={(formData) => run(setPrimaryResidencyContactAction, formData, "Primary contact updated.")}>
                <input type="hidden" name="contactId" value={selectedUser.id} />
                <button className="button secondary" type="submit" disabled={pending}>Make primary</button>
              </form> : null}
            </> : <form action={(formData) => run(resendResidencyInvitationAction, formData, `Invitation resent to ${selectedUser.email}.`)}>
              <input type="hidden" name="contactId" value={selectedUser.id} />
              <button className="button secondary" type="submit" disabled={pending}>Resend invite</button>
            </form>}
          </div>

          {selectedUser.state === "active"
            ? selectedUser.userId !== currentUserId ? <form action={(formData) => run(removeResidencyUserAction, formData, `${selectedUser.name} was removed.`)}>
              <input type="hidden" name="contactId" value={selectedUser.id} />
              <button className="button danger" type="submit" disabled={pending || selectedUser.isPrimary}>Remove</button>
            </form> : null
            : <form action={(formData) => run(removeResidencyUserAction, formData, `Invitation to ${selectedUser.email} was revoked.`)}>
              <input type="hidden" name="contactId" value={selectedUser.id} />
              <button className="button danger" type="submit" disabled={pending}>Revoke</button>
            </form>}
        </div>
      </section> : <p className="residency-user-focus-empty">No people have access yet.</p>}
    </div>
    {message ? <p className={/unable|cannot|final|error/i.test(message) ? "error" : "success"} role="status">{message}</p> : null}
  </ResidencySurfaceCard>;
}
