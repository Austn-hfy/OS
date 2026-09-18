"use client";

import { useState } from "react";
import { RateNeededWarning } from "@/components/rate-needed-warning";
import type { getResidencyClientFinances } from "@/data/residency-client";
import { ClientAssignmentRateDialog } from "../talent/client-assignment-rate-dialog";

type ClientTalentRow = Awaited<ReturnType<typeof getResidencyClientFinances>>["clientTalent"][number];

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

export function ClientTalentFinances({ rows, timeZone, canManage }: { rows: ClientTalentRow[]; timeZone: string; canManage: boolean }) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const selectedAssignment = rows.find((row) => row.id === selectedAssignmentId) ?? null;

  if (!rows.length) return <div className="empty">Nothing is currently owed to talent sourced directly by this Residency.</div>;

  return <>
    <div className="table-wrap finance-table-wrap finance-table-wrap--direct" role="region" aria-label="Direct talent obligations" tabIndex={0}><table className="finance-table finance-table--direct"><thead><tr><th>Artist</th><th>Activity</th><th>Date</th><th>Status</th><th>Amount owed</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.artist}</strong></td><td>{row.shiftName}</td><td>{date(row.serviceDate)}</td><td><span className={`status ${row.bookingStatus}`}>{row.bookingStatus.replaceAll("_", " ")}</span></td><td>{row.owedCents === null ? canManage ? <button className="finance-rate-needed-button" type="button" onClick={() => setSelectedAssignmentId(row.id)} aria-label={`Set rate for ${row.artist} on ${date(row.serviceDate)}`}><RateNeededWarning /><small>Edit rate →</small></button> : <RateNeededWarning /> : money(row.owedCents)}</td></tr>)}</tbody></table></div>
    {selectedAssignment ? <ClientAssignmentRateDialog
      key={selectedAssignment.id}
      assignment={{
        id: selectedAssignment.id,
        shiftName: selectedAssignment.shiftName,
        room: selectedAssignment.room,
        serviceDate: selectedAssignment.serviceDate,
        startsAt: selectedAssignment.startsAt,
        endsAt: selectedAssignment.endsAt,
        bookingStatus: selectedAssignment.bookingStatus,
        defaultRateCents: selectedAssignment.defaultRateCents,
        overrideRateCents: selectedAssignment.overrideRateCents,
        amountCents: selectedAssignment.owedCents,
      }}
      artistName={selectedAssignment.artist}
      timeZone={timeZone}
      canManage={canManage}
      viewportAnchored
      onClose={() => setSelectedAssignmentId(null)}
    /> : null}
  </>;
}
