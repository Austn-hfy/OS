"use client";

import { useActionState } from "react";
import { updateClientOwnedRateAction, type ClientSettingsActionState } from "@/app/residency/actions";

export type ClientRateAssignment = {
  id: string;
  shiftName: string;
  room: string;
  serviceDate: string;
  startsAt: string;
  endsAt: string;
  bookingStatus: string;
  defaultRateCents: number | null;
  overrideRateCents: number | null;
  amountCents: number | null;
};

const initialRateState: ClientSettingsActionState = { status: "idle", message: "" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function hourlyRate(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function serviceDateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ClientAssignmentRateDialog({ assignment, artistName, timeZone, canManage, onClose }: { assignment: ClientRateAssignment; artistName: string; timeZone: string; canManage: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateClientOwnedRateAction, initialRateState);
  const effectiveRateCents = assignment.overrideRateCents ?? assignment.defaultRateCents;
  const rateSource = assignment.overrideRateCents !== null ? "Artist override" : assignment.defaultRateCents !== null ? "Session default" : "Rate needed";
  const defaultRateLabel = assignment.defaultRateCents === null ? "No session default has been set." : `Session default: ${hourlyRate(assignment.defaultRateCents)} per hour.`;

  return <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="quick-modal client-assignment-rate-modal" role="dialog" aria-modal="true" aria-labelledby="client-assignment-rate-title"><header className="quick-modal-header"><div><p className="eyebrow">{serviceDateLabel(assignment.serviceDate)}</p><h2 id="client-assignment-rate-title">{assignment.shiftName}</h2><p>{artistName} · {assignment.room}</p></div><button className="quick-modal-close" type="button" aria-label="Close booking details" onClick={onClose}>×</button></header><div className="quick-modal-body">
    <dl className="client-assignment-booking-summary"><div><dt>Artist</dt><dd>{artistName}</dd></div><div><dt>Date</dt><dd>{serviceDateLabel(assignment.serviceDate)}</dd></div><div><dt>Hours</dt><dd>{timeLabel(assignment.startsAt, timeZone)}–{timeLabel(assignment.endsAt, timeZone)}</dd></div><div><dt>Status</dt><dd>{assignment.bookingStatus.replaceAll("_", " ")}</dd></div></dl>
    <section className="client-assignment-rate-editor"><div><p className="eyebrow">Booking rate</p><h3>{assignment.amountCents === null ? "Rate needed" : `${money(assignment.amountCents)} currently owed`}</h3><span className={`client-rate-source ${assignment.overrideRateCents !== null ? "override" : ""}`}>{rateSource}</span></div>{canManage ? <form action={action} className="client-rate-form"><input type="hidden" name="assignmentId" value={assignment.id} /><label htmlFor={`artist-booking-rate-${assignment.id}`}>Artist hourly rate</label><div className="client-rate-control"><span>$</span><input id={`artist-booking-rate-${assignment.id}`} name="rate" type="number" min="0.01" step="0.01" defaultValue={effectiveRateCents === null ? "" : (effectiveRateCents / 100).toFixed(2)} placeholder="Enter rate" required={assignment.defaultRateCents === null} /><button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save rate"}</button></div><small>{assignment.defaultRateCents === null ? "Enter the hourly rate for this artist and booking." : `${defaultRateLabel} Clear this field and save to return to that default.`}</small>{state.status !== "idle" ? <p className={state.status === "error" ? "error" : "success"} aria-live="polite">{state.message}</p> : null}</form> : <p className="artist-section-empty">A Residency manager can update this booking rate.</p>}</section>
  </div></section></div>;
}
