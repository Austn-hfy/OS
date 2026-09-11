"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveShiftChangeRequestAction, type ResidencyActionState } from "@/app/app/actions";
import { formatDate } from "@/components/format";
import type { getPendingShiftChangeRequests } from "@/data/internal";
import { shiftChangeRequestTypeLabel } from "@/domain/shift-change-requests";

type RequestRow = Awaited<ReturnType<typeof getPendingShiftChangeRequests>>[number];

const initialState: ResidencyActionState = { status: "idle", message: "" };

function displayTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function displaySubmittedAt(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function ShiftChangeRequestQueue({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, ResidencyActionState>>({});
  const visibleRequests = requests.filter((request) => !resolvedIds.includes(request.id));

  async function resolve(request: RequestRow, decision: "approved" | "denied") {
    const resolutionNote = resolutionNotes[request.id]?.trim() ?? "";
    if (decision === "denied" && !resolutionNote) {
      setFeedback((current) => ({ ...current, [request.id]: { status: "error", message: "Add a note explaining why this request is denied." } }));
      return;
    }
    if (decision === "approved" && request.requestType !== "change_time") {
      const description = request.requestType === "cancel_occurrence"
        ? "cancel this dated Shift"
        : "remove this and future occurrences";
      if (!window.confirm(`Approve this request and ${description}? Protected Invoice or payout history will block the change.`)) return;
    }

    const formData = new FormData();
    formData.set("requestId", request.id);
    formData.set("decision", decision);
    formData.set("resolutionNote", resolutionNote);
    setPendingId(request.id);
    setFeedback((current) => ({ ...current, [request.id]: initialState }));
    try {
      const result = await resolveShiftChangeRequestAction(formData);
      setFeedback((current) => ({ ...current, [request.id]: result }));
      if (result.status === "success") {
        setResolvedIds((current) => current.includes(request.id) ? current : [...current, request.id]);
        router.refresh();
      }
    } catch {
      setFeedback((current) => ({ ...current, [request.id]: { status: "error", message: "Unable to resolve this request. Try again." } }));
    } finally {
      setPendingId(null);
    }
  }

  return <section className="shift-change-request-queue" id="shift-change-requests">
    <div className="section-heading hfy-request-section-heading"><div><p className="eyebrow">Residency change requests</p><h2>Shift Requests</h2><p className="subhead">Approve a safe schedule change or explain why it cannot be made. Protected financial history is never force-deleted.</p></div><span className="status hfy-request-pending-count">{visibleRequests.length} pending</span></div>
    {visibleRequests.length ? <div className="shift-change-request-list">{visibleRequests.map((request) => {
      const requestFeedback = feedback[request.id] ?? initialState;
      const resolving = pendingId === request.id;
      return <article className="card shift-change-request-card" key={request.id}>
        <header><div><p className="eyebrow">{request.residencyName}</p><h3>{request.shiftName}</h3><span>{request.room} · {formatDate(request.serviceDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span></div><span className="status hfy-request-pending">{shiftChangeRequestTypeLabel(request.requestType)}</span></header>
        <div className="shift-change-request-facts">
          <div><span>Current time</span><strong>{displayTime(request.startsAt, request.residencyTimezone)}–{displayTime(request.endsAt, request.residencyTimezone)}</strong></div>
          <div><span>Assigned talent</span><strong>{request.talentNames.join(" + ") || "Unfilled"}</strong></div>
          {request.requestType === "change_time" && request.proposedStartAt && request.proposedEndAt ? <div className="proposed"><span>Proposed time</span><strong>{displayTime(request.proposedStartAt, request.residencyTimezone)}–{displayTime(request.proposedEndAt, request.residencyTimezone)}</strong></div> : null}
        </div>
        <blockquote><span>Manager note</span><p>{request.managerNote}</p></blockquote>
        <div className="shift-change-request-submitter"><span>Submitted by</span><strong>{request.requestedByName}</strong><small>{request.requestedByEmail} · {displaySubmittedAt(request.createdAt, request.residencyTimezone)}</small></div>
        <div className="shift-change-request-resolution">
          <div className="field"><label htmlFor={`resolution-note-${request.id}`}>Resolution note <span>{request.requestType === "change_time" ? "optional to approve" : "optional to approve; required to deny"}</span></label><textarea id={`resolution-note-${request.id}`} maxLength={2000} value={resolutionNotes[request.id] ?? ""} onChange={(event) => { setResolutionNotes((current) => ({ ...current, [request.id]: event.target.value })); setFeedback((current) => ({ ...current, [request.id]: initialState })); }} placeholder="Explain the decision to the Residency manager" /></div>
          <div className="shift-change-request-actions"><button className="button secondary" type="button" disabled={resolving || !(resolutionNotes[request.id] ?? "").trim()} onClick={() => void resolve(request, "denied")}>{resolving ? "Working…" : "Deny"}</button><button className="button" type="button" disabled={resolving} onClick={() => void resolve(request, "approved")}>{resolving ? "Working…" : "Approve"}</button></div>
          {requestFeedback.status !== "idle" ? <p className={requestFeedback.status === "error" ? "error" : "success"} aria-live="polite">{requestFeedback.message}</p> : null}
        </div>
      </article>;
    })}</div> : <div className="card empty">No pending Shift change requests.</div>}
  </section>;
}
