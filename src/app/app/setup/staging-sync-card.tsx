"use client";

import { useMemo, useState } from "react";

type LastSync = {
  actorLabel: string;
  completedAt: string;
  residencyName: string;
  daypartCount: number;
  artistCount: number;
} | null;

type SyncSummary = {
  residencyName: string;
  residencyWillBeCreated: boolean;
  dayparts: number;
  daypartsToCreate: number;
  daypartsToRefresh: number;
  stagingOnlyDaypartsToDeactivate: number;
  weeklyDayRules: number;
  singleDateExceptions: number;
  assignedArtists: number;
  artistsToCreate: number;
  artistsToRefresh: number;
  rosterAssignments: number;
  stagingOnlyRosterAssignmentsToDeactivate: number;
  syntheticPaymentProfiles: number;
  productionTaxDocumentsDetectedByPresence: number;
  productionTaxFilesRead: 0;
  operationalRecordsCopied: 0;
  nonSelectedResidenciesTouched: 0;
};

type SyncResponse = {
  action?: "preview" | "apply";
  completedAt?: string;
  confirmationToken?: string;
  error?: string;
  expiresAt?: string;
  summary?: SyncSummary[];
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function requestSync(action: "preview" | "apply", confirmationToken?: string): Promise<SyncResponse> {
  const response = await fetch("/api/internal/staging-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, confirmationToken, residencySlug: "ace-hotel" }),
  });
  const result = await response.json() as SyncResponse;
  if (!response.ok) throw new Error(result.error || "HFY OS could not complete this request.");
  return result;
}

export function StagingSyncCard({ initialLastSync }: { initialLastSync: LastSync }) {
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [preview, setPreview] = useState<SyncSummary | null>(null);
  const [confirmationToken, setConfirmationToken] = useState("");
  const [confirmationExpiresAt, setConfirmationExpiresAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "previewing" | "applying" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const changeCount = useMemo(() => preview ? (
    preview.daypartsToCreate
    + preview.daypartsToRefresh
    + preview.stagingOnlyDaypartsToDeactivate
    + preview.artistsToCreate
    + preview.artistsToRefresh
    + preview.stagingOnlyRosterAssignmentsToDeactivate
  ) : 0, [preview]);

  async function runPreview() {
    setStatus("previewing");
    setMessage("");
    setPreview(null);
    setConfirmed(false);
    try {
      const result = await requestSync("preview");
      setPreview(result.summary?.[0] ?? null);
      setConfirmationToken(result.confirmationToken ?? "");
      setConfirmationExpiresAt(result.expiresAt ?? "");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The preview could not be created.");
    }
  }

  async function applySync() {
    if (!confirmed || !confirmationToken) return;
    setStatus("applying");
    setMessage("");
    try {
      const result = await requestSync("apply", confirmationToken);
      const completedAt = result.completedAt ?? new Date().toISOString();
      const applied = result.summary?.[0] ?? preview;
      setLastSync(applied ? {
        actorLabel: "Current Developer",
        completedAt,
        residencyName: applied.residencyName,
        daypartCount: applied.dayparts,
        artistCount: applied.assignedArtists,
      } : lastSync);
      setPreview(null);
      setConfirmationToken("");
      setConfirmationExpiresAt("");
      setConfirmed(false);
      setStatus("success");
      setMessage("Ace’s sanitized production structure is now refreshed in staging.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The staging sync could not be applied.");
    }
  }

  return <section className="card staging-sync-card" aria-labelledby="staging-sync-title">
    <div className="setup-card-heading staging-sync-heading">
      <div><p className="eyebrow">Staging data</p><h2 id="staging-sync-title">Sync Production Structure</h2><p>Refresh a sanitized structural copy for realistic staging reviews.</p></div>
      <strong>Staging only</strong>
    </div>
    <div className="staging-sync-scope">
      <label htmlFor="staging-sync-residency">Residency</label>
      <select id="staging-sync-residency" value="ace-hotel" disabled><option value="ace-hotel">Ace Hotel.</option></select>
      <p>Test 1, Test 2, and every non-selected staging Residency remain untouched.</p>
    </div>
    <div className="staging-sync-boundary">
      <strong>What this copies</strong>
      <span>Residency settings, Dayparts, Day Rules, date exceptions, artist names and genres, and roster assignments.</span>
      <strong>What never crosses over</strong>
      <span>Real contacts, authentication, ACH/tax information, private notes, Shifts, bookings, payouts, invoices, or share links.</span>
    </div>
    {lastSync ? <div className="staging-sync-last-run"><span>Last successful sync</span><strong>{lastSync.residencyName} · {formatTimestamp(lastSync.completedAt)}</strong><small>{lastSync.daypartCount} Dayparts and {lastSync.artistCount} sanitized artists · {lastSync.actorLabel}</small></div> : <div className="staging-sync-last-run empty"><span>Last successful sync</span><strong>No dashboard sync recorded yet</strong></div>}
    {preview ? <div className="staging-sync-preview" aria-live="polite">
      <div><p className="eyebrow">Preview ready</p><h3>{changeCount} structural records will be refreshed</h3><small>Preview expires {formatTimestamp(confirmationExpiresAt)}. If production changes first, HFY OS will require a new preview.</small></div>
      <dl>
        <div><dt>Dayparts</dt><dd>{preview.dayparts}</dd></div>
        <div><dt>Weekly rules</dt><dd>{preview.weeklyDayRules}</dd></div>
        <div><dt>Date exceptions</dt><dd>{preview.singleDateExceptions}</dd></div>
        <div><dt>Assigned artists</dt><dd>{preview.assignedArtists}</dd></div>
        <div><dt>Roster assignments</dt><dd>{preview.rosterAssignments}</dd></div>
        <div><dt>Other Residencies touched</dt><dd>{preview.nonSelectedResidenciesTouched}</dd></div>
      </dl>
      {(preview.stagingOnlyDaypartsToDeactivate || preview.stagingOnlyRosterAssignmentsToDeactivate) ? <p className="staging-sync-warning">This refresh will deactivate {preview.stagingOnlyDaypartsToDeactivate} staging-only Dayparts and {preview.stagingOnlyRosterAssignmentsToDeactivate} staging-only roster assignments inside Ace only.</p> : null}
      <label className="staging-sync-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>I reviewed this preview</strong><small>Apply these sanitized changes to Ace in staging.</small></span></label>
    </div> : null}
    {message ? <p className={status === "error" ? "error staging-sync-message" : "success staging-sync-message"} role="status">{message}</p> : null}
    <div className="setup-card-actions staging-sync-actions">
      <span>Nothing runs automatically. Every refresh starts here.</span>
      <div>
        <button className="button secondary" type="button" onClick={runPreview} disabled={status === "previewing" || status === "applying"}>{status === "previewing" ? "Checking…" : preview ? "Refresh preview" : "Preview Sync"}</button>
        {preview ? <button className="button" type="button" onClick={applySync} disabled={!confirmed || status === "applying"}>{status === "applying" ? "Syncing…" : "Sync Ace Now"}</button> : null}
      </div>
    </div>
  </section>;
}
