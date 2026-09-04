"use client";

import { useState, useTransition } from "react";
import {
  copyPublicCalendarLinkAction,
  createPublicCalendarLinkAction,
  replacePublicCalendarLinkAction,
  stopPublicCalendarLinkAction,
  updatePublicCalendarLinkAction,
  type PublicCalendarLinkActionResult,
} from "@/app/app/calendar-share-actions";
import type { ManagedPublicCalendarLink, PublicCalendarLinkSettings } from "@/data/internal";
import styles from "./public-calendar-link-manager.module.css";

type ShareableDaypart = { id: string; name: string; room: string; color: string };
type Scope = "all" | "selected";
type ManagerView = "list" | "create" | "created" | "edit" | "stop" | "replace" | "history";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function linkScopeLabel(link: ManagedPublicCalendarLink) {
  if (link.scope === "all") return "All Dayparts";
  if (link.dayparts.length === 0) return "No available Dayparts";
  const names = link.dayparts.map((daypart) => daypart.name);
  return names.length <= 2 ? names.join(" + ") : `${names.slice(0, 2).join(" + ")} + ${names.length - 2} more`;
}

function linkScopeCount(link: ManagedPublicCalendarLink) {
  if (link.scope === "all") return "All Dayparts";
  return `${link.dayparts.length} ${link.dayparts.length === 1 ? "Daypart" : "Dayparts"}`;
}

function replaceLink(links: ManagedPublicCalendarLink[], next: ManagedPublicCalendarLink) {
  const withoutCurrent = links.filter((link) => link.id !== next.id);
  return [next, ...withoutCurrent].sort((left, right) => {
    if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) return left.revokedAt ? 1 : -1;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function PublicCalendarLinkManager({ residencyId, linkSettings, dayparts }: {
  residencyId: string;
  linkSettings: PublicCalendarLinkSettings;
  dayparts: ShareableDaypart[];
}) {
  const [links, setLinks] = useState(linkSettings.links);
  const [view, setView] = useState<ManagerView>("list");
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [selectedDaypartIds, setSelectedDaypartIds] = useState<string[]>([]);
  const [createdResult, setCreatedResult] = useState<{ link: ManagedPublicCalendarLink; url: string } | null>(null);
  const [fallbackUrls, setFallbackUrls] = useState<Record<string, string>>({});
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PublicCalendarLinkActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const activeLinks = links.filter((link) => !link.revokedAt);
  const stoppedLinks = links.filter((link) => Boolean(link.revokedAt));
  const selectedLink = selectedLinkId ? links.find((link) => link.id === selectedLinkId) ?? null : null;

  function resetFeedback() {
    setFeedback(null);
    setCopiedLinkId(null);
    setFallbackUrls({});
  }

  function openList() {
    resetFeedback();
    setSelectedLinkId(null);
    setView("list");
  }

  function openCreate(prefill?: ManagedPublicCalendarLink) {
    resetFeedback();
    setSelectedLinkId(null);
    setName(prefill?.name ?? "");
    setScope(prefill?.scope ?? "all");
    setSelectedDaypartIds(prefill?.dayparts.map((daypart) => daypart.id).filter((id) => dayparts.some((daypart) => daypart.id === id)) ?? []);
    setView("create");
  }

  function openEdit(link: ManagedPublicCalendarLink) {
    resetFeedback();
    setSelectedLinkId(link.id);
    setName(link.name);
    setScope(link.scope);
    setSelectedDaypartIds(link.dayparts.map((daypart) => daypart.id).filter((id) => dayparts.some((daypart) => daypart.id === id)));
    setView("edit");
  }

  function openConfirmation(nextView: "stop" | "replace", link: ManagedPublicCalendarLink) {
    resetFeedback();
    setSelectedLinkId(link.id);
    setView(nextView);
  }

  function toggleDaypart(daypartId: string) {
    setSelectedDaypartIds((current) => current.includes(daypartId)
      ? current.filter((id) => id !== daypartId)
      : [...current, daypartId]);
  }

  async function writeClipboard(url: string, linkId: string) {
    try {
      await navigator.clipboard.writeText(url);
      setFallbackUrls((current) => {
        const next = { ...current };
        delete next[linkId];
        return next;
      });
      setCopiedLinkId(linkId);
      window.setTimeout(() => setCopiedLinkId((current) => current === linkId ? null : current), 2200);
      return true;
    } catch {
      setFallbackUrls((current) => ({ ...current, [linkId]: url }));
      setFeedback({ status: "error", message: "Automatic copy was blocked. Use the URL shown below." });
      return false;
    }
  }

  function copyExistingLink(link: ManagedPublicCalendarLink) {
    resetFeedback();
    startTransition(async () => {
      const result = await copyPublicCalendarLinkAction({ residencyId, linkId: link.id });
      if (result.status === "success" && result.url) {
        await writeClipboard(result.url, link.id);
      } else {
        setFeedback(result);
      }
    });
  }

  function submitCreate() {
    resetFeedback();
    startTransition(async () => {
      const result = await createPublicCalendarLinkAction({ residencyId, name, scope, daypartIds: selectedDaypartIds });
      if (result.status === "success" && result.link && result.url) {
        const createdLink = result.link;
        setLinks((current) => replaceLink(current, createdLink));
        setCreatedResult({ link: createdLink, url: result.url });
        setView("created");
      } else {
        setFeedback(result);
      }
    });
  }

  function submitEdit() {
    if (!selectedLink) return;
    resetFeedback();
    startTransition(async () => {
      const result = await updatePublicCalendarLinkAction({
        residencyId,
        linkId: selectedLink.id,
        name,
        scope,
        daypartIds: selectedDaypartIds,
      });
      if (result.status === "success" && result.link) {
        const updatedLink = result.link;
        setLinks((current) => replaceLink(current, updatedLink));
        setFeedback(result);
        setView("list");
      } else {
        setFeedback(result);
      }
    });
  }

  function confirmStop() {
    if (!selectedLink) return;
    resetFeedback();
    startTransition(async () => {
      const result = await stopPublicCalendarLinkAction({ residencyId, linkId: selectedLink.id });
      if (result.status === "success" && result.link) {
        const stoppedLink = result.link;
        setLinks((current) => replaceLink(current, stoppedLink));
        setFeedback(result);
        setView("history");
      } else {
        setFeedback(result);
      }
    });
  }

  function confirmReplace() {
    if (!selectedLink) return;
    resetFeedback();
    startTransition(async () => {
      const result = await replacePublicCalendarLinkAction({ residencyId, linkId: selectedLink.id });
      if (result.status === "success" && result.link && result.url) {
        const replacedLink = result.link;
        setLinks((current) => replaceLink(current, replacedLink));
        setCreatedResult({ link: replacedLink, url: result.url });
        setView("created");
      } else {
        setFeedback(result);
      }
    });
  }

  function copyCreatedLink() {
    if (!createdResult) return;
    resetFeedback();
    void writeClipboard(createdResult.url, createdResult.link.id);
  }

  function feedbackMessage() {
    return feedback ? <p className={feedback.status === "error" ? styles.errorMessage : styles.successMessage} role={feedback.status === "error" ? "alert" : "status"}>{feedback.message}</p> : null;
  }

  function manualCopyFallback(linkId: string, linkName: string) {
    const url = fallbackUrls[linkId];
    if (!url) return null;
    return <div className={styles.manualCopyFallback} role="group" aria-label={`Manual copy for ${linkName}`}>
      <span><strong>Copy manually</strong><small>Select the URL, then copy it.</small></span>
      <input readOnly value={url} aria-label={`${linkName} calendar link`} onFocus={(event) => event.currentTarget.select()} />
    </div>;
  }

  function linkSummary(link: ManagedPublicCalendarLink, stopped = false) {
    return <div className={styles.linkDetails}>
      <div className={styles.linkNameRow}>
        <strong>{link.name}</strong>
        <span className={stopped ? styles.stoppedStatus : styles.activeStatus}>{stopped ? "Stopped" : "Active"}</span>
        {!stopped && !link.recoverable ? <span className={styles.legacyStatus}>Older link</span> : null}
      </div>
      <div className={styles.scopeSummary}>
        <span>{linkScopeCount(link)}</span>
        <p>{link.scope === "all" ? "Every scheduled Daypart" : linkScopeLabel(link)}</p>
      </div>
      <small>{stopped && link.revokedAt ? `Stopped ${formatDate(link.revokedAt)} · ` : ""}Created {formatDate(link.createdAt)}{link.createdBy ? ` by ${link.createdBy}` : ""}{!stopped && link.updatedAt !== link.createdAt ? ` · Updated ${formatDate(link.updatedAt)}` : ""}</small>
    </div>;
  }

  function renderDaypartSelector() {
    if (scope !== "selected") return null;
    return <div className={styles.daypartChildPanel}>
      <div className={styles.daypartChildHeading}>
        <span><strong>Included Dayparts</strong><small>Attached to “Select Dayparts” above</small></span>
        <span aria-live="polite">{selectedDaypartIds.length} selected</span>
      </div>
      <div className={styles.daypartGrid} aria-label="Dayparts included in this calendar link">
        {dayparts.map((daypart) => <label className={`${styles.daypartOption} ${selectedDaypartIds.includes(daypart.id) ? styles.daypartOptionSelected : ""}`} key={daypart.id}>
          <input type="checkbox" checked={selectedDaypartIds.includes(daypart.id)} onChange={() => toggleDaypart(daypart.id)} />
          <span className={styles.daypartColor} style={{ backgroundColor: daypart.color }} aria-hidden="true" />
          <span><strong>{daypart.name}</strong><small>{daypart.room}</small></span>
        </label>)}
      </div>
      {dayparts.length === 0 ? <p className={styles.emptyInline}>No active Dayparts are available.</p> : null}
    </div>;
  }

  function renderScopeSelector() {
    return <fieldset className={styles.scopeFieldset}>
      <legend>What should this link include?</legend>
      <div className={styles.scopeOptions}>
        <label className={`${styles.scopeOption} ${scope === "all" ? styles.scopeOptionSelected : ""}`}>
          <input type="radio" name="calendar-link-scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
          <span><strong>Include all Dayparts</strong><small>Every scheduled Daypart in this Residency.</small></span>
        </label>
        <label className={`${styles.scopeOption} ${scope === "selected" ? styles.scopeOptionSelected : ""}`}>
          <input type="radio" name="calendar-link-scope" value="selected" checked={scope === "selected"} disabled={!dayparts.length} onChange={() => setScope("selected")} />
          <span><strong>Select Dayparts</strong><small>Only the rooms or programs selected below.</small></span>
        </label>
      </div>
      {renderDaypartSelector()}
    </fieldset>;
  }

  if (view === "create" || view === "edit") {
    const editing = view === "edit";
    const valid = name.trim().length >= 2 && name.trim().length <= 80 && (scope === "all" || selectedDaypartIds.length > 0);
    return <section className={`${styles.manager} ${styles.formView}`}>
      <button className={styles.backButton} type="button" onClick={openList}>← Back to existing links</button>
      <div className={styles.formHeading}>
        <h3>{editing ? "Edit calendar link" : "Create a new link"}</h3>
        <p>{editing ? "Changes appear immediately for everyone using this link." : "Name the audience, then choose what they should be able to see."}</p>
      </div>
      <div className={styles.formSurface}>
        <div className={styles.nameField}>
          <label htmlFor="calendar-share-link-name">Link name</label>
          <input id="calendar-share-link-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Social Media Team" />
          <small>Use the person, team, or purpose so you can recognize it later.</small>
        </div>
        {renderScopeSelector()}
        {editing ? <div className={styles.persistenceNote}><strong>The URL stays the same</strong><span>Existing bookmarks automatically show the updated selection.</span></div> : null}
      </div>
      {feedbackMessage()}
      <div className={styles.formActions}>
        {editing && selectedLink ? <button className={styles.replaceTextButton} type="button" disabled={pending} onClick={() => openConfirmation("replace", selectedLink)}>Replace URL</button> : null}
        <button className={styles.secondaryButton} type="button" disabled={pending} onClick={openList}>Cancel</button>
        <button className={styles.primaryButton} type="button" disabled={pending || !valid} onClick={editing ? submitEdit : submitCreate}>{pending ? "Saving…" : editing ? "Save changes" : "Create link"}</button>
      </div>
    </section>;
  }

  if (view === "created" && createdResult) {
    return <section className={styles.centerPanel}>
      <span className={styles.successIcon} aria-hidden="true">✓</span>
      <h3>{createdResult.link.name} is ready</h3>
      <p>This link stays active until you stop it. You can return here and copy it again at any time.</p>
      <div className={styles.linkResult}>
        <span><strong>Ready to share</strong><small>{linkScopeCount(createdResult.link)} · Active until you stop it</small></span>
        <button className={styles.primaryButton} type="button" onClick={copyCreatedLink} aria-live="polite">{copiedLinkId === createdResult.link.id ? "Copied to clipboard" : "Copy link"}</button>
      </div>
      {feedbackMessage()}
      {manualCopyFallback(createdResult.link.id, createdResult.link.name)}
      <div className={styles.centerActions}><button className={styles.secondaryButton} type="button" onClick={() => openEdit(createdResult.link)}>Edit link</button><button className={styles.primaryButton} type="button" onClick={openList}>Done</button></div>
    </section>;
  }

  if ((view === "stop" || view === "replace") && selectedLink) {
    const replacing = view === "replace";
    return <section className={styles.centerPanel}>
      <span className={styles.warningIcon} aria-hidden="true">!</span>
      <h3>{replacing ? `Replace “${selectedLink.name}” with a new URL?` : `Stop sharing “${selectedLink.name}”?`}</h3>
      <p>{replacing ? "The existing URL will stop working immediately. Everyone who still needs access must receive the new URL." : "Anyone using this link will lose access immediately. This exact URL cannot be reactivated."}</p>
      <div className={styles.confirmSummary}><strong>{selectedLink.name}</strong><span>{linkScopeLabel(selectedLink)} · Created {formatDate(selectedLink.createdAt)}</span></div>
      {feedbackMessage()}
      <div className={styles.centerActions}>
        <button className={styles.secondaryButton} type="button" disabled={pending} onClick={openList}>{replacing ? "Keep current URL" : "Keep active"}</button>
        <button className={styles.dangerButton} type="button" disabled={pending} onClick={replacing ? confirmReplace : confirmStop}>{pending ? "Working…" : replacing ? "Replace URL" : "Stop sharing"}</button>
      </div>
    </section>;
  }

  if (view === "history") {
    return <section className={styles.manager}>
      <button className={styles.backButton} type="button" onClick={openList}>← Back to existing links</button>
      <div className={styles.sectionHeading}><div><h3>Stopped links</h3><p>These URLs no longer provide access and cannot be reactivated.</p></div><span>{stoppedLinks.length} stopped</span></div>
      {feedbackMessage()}
      {stoppedLinks.length ? <div className={styles.linkList}>{stoppedLinks.map((link) => <article className={`${styles.linkItem} ${styles.stoppedItem}`} key={link.id}>
        {linkSummary(link, true)}
        <div className={styles.linkActions}><button className={styles.secondaryButton} type="button" onClick={() => openCreate(link)}>Create replacement</button></div>
      </article>)}</div> : <div className={styles.emptyHistory}><strong>No stopped links</strong><span>Links you stop will remain here as a record.</span></div>}
    </section>;
  }

  return <section className={styles.manager}>
    {activeLinks.length ? <>
      <div className={styles.sectionHeading}><div><h3>Existing links</h3><p>Copy, update, or stop any calendar link you have shared.</p></div><span>{activeLinks.length} active</span></div>
      {feedbackMessage()}
      <div className={styles.linkList}>{activeLinks.map((link) => <article className={styles.linkItem} key={link.id}>
        {linkSummary(link)}
        <div className={styles.linkActions}>
          {link.recoverable ? <button className={styles.primaryButton} type="button" disabled={pending} onClick={() => copyExistingLink(link)} aria-live="polite">{copiedLinkId === link.id ? "Copied to clipboard" : "Copy link"}</button> : <button className={styles.primaryButton} type="button" disabled={pending} onClick={() => openConfirmation("replace", link)}>Replace URL</button>}
          <button className={styles.secondaryButton} type="button" disabled={pending} onClick={() => openEdit(link)}>Edit</button>
          <button className={styles.stopTextButton} type="button" disabled={pending} onClick={() => openConfirmation("stop", link)}>Stop</button>
        </div>
        {manualCopyFallback(link.id, link.name)}
      </article>)}</div>
      <div className={styles.divider} />
      <div className={styles.createCallout}><div><strong>Create another calendar link</strong><span>Give each audience its own link so it can be managed separately.</span></div><button className={styles.primaryButton} type="button" onClick={() => openCreate()}>Create new link</button></div>
    </> : <div className={styles.centerPanel}>
      <span className={styles.emptyIcon} aria-hidden="true">↗</span>
      <h3>No active calendar links</h3>
      <p>Create a named link for a hotel team, social partner, or anyone else who needs a read-only calendar.</p>
      {feedbackMessage()}
      <div className={styles.centerActions}><button className={styles.primaryButton} type="button" onClick={() => openCreate()}>Create your first link</button></div>
    </div>}
    {stoppedLinks.length ? <button className={styles.historyButton} type="button" onClick={() => { resetFeedback(); setView("history"); }}>View stopped links ({stoppedLinks.length})</button> : null}
  </section>;
}
