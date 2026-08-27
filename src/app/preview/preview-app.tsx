"use client";

import { useEffect, useMemo, useState } from "react";
import { ArtistSearchPicker } from "@/components/artist-search-picker";
import { MonthCalendar, calendarToneForSlot } from "@/components/month-calendar";
import { clockToMinute, formatCompactMinuteRange, formatLocalMinute, hasOverlappingAssignmentMinutes, minuteToClock, projectDaypartSlots, resolveAssignmentMinutes, resolveEndMinute, slotSchedulingStatus } from "@/domain/dayparts";
import { monthLabel, monthRange, shiftMonthKey } from "@/lib/calendar";
import { PreviewArtistLookup } from "./preview-artist-lookup";
import { PreviewDaypartManager, type PreviewDaypart } from "./preview-daypart-manager";
import { PreviewPayouts } from "./preview-payouts";
import { PreviewInvoices } from "./preview-invoices";
import { PreviewLeads } from "./preview-leads";
import { ResidencyCreateFields } from "@/app/app/residency-create-form";
import { PrivacyModeProvider } from "@/components/privacy-mode";

type View = "overview" | "calendar" | "talent" | "payouts" | "invoices" | "setup" | "settings" | "leads";
type BookingStatus = "pending_hfy_confirmation" | "confirmed" | "completed" | "cancelled";
type PreviewAssignmentDraft = { id: string; artistId: string; start: string; end: string; confirmed?: boolean };
type SavedPreviewSlot = {
  id: string;
  date: string;
  daypartId: string;
  name: string;
  room: string;
  start: string;
  end: string;
  assignments: PreviewAssignmentDraft[];
  color: string;
};

const initialPreviewDayparts: PreviewDaypart[] = [
  {
    id: "pool",
    name: "Pool",
    room: "Pool",
    color: "#2783DC",
    defaultTalentRateCents: null,
    activeUntil: null,
    active: true,
    sortOrder: 10,
    rules: [
      { weekday: 0, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
      { weekday: 5, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
      { weekday: 6, startMinute: 720, endMinute: 1140, defaultDjCount: 2 },
    ],
  },
  {
    id: "amigo",
    name: "Amigo Room",
    room: "Amigo Room",
    color: "#E98332",
    defaultTalentRateCents: null,
    activeUntil: null,
    active: true,
    sortOrder: 20,
    rules: [
      { weekday: 5, startMinute: 1260, endMinute: 1440, defaultDjCount: 1 },
      { weekday: 6, startMinute: 1260, endMinute: 1440, defaultDjCount: 1 },
    ],
  },
];

const residencies = [
  { id: "ace-parity", name: "Ace Hotel", location: "Palm Springs, CA", tier: "Operations Only", shifts: 2, open: 1, ready: "$0", receivables: "$0", attention: 0 },
  { id: "hotel-v", name: "Hotel V", location: "Demo Residency", tier: "Operations Only", shifts: 0, open: 0, ready: "$0", receivables: "$0", attention: 0 },
];

const shifts = [
  { id: "ace-pool", residencyId: "ace-parity", serviceDate: "2026-08-29", date: "Saturday, August 29", room: "Pool", name: "Pool", time: "12:00 PM–7:00 PM" },
  { id: "ace-amigo", residencyId: "ace-parity", serviceDate: "2026-08-29", date: "Saturday, August 29", room: "Amigo Room", name: "Amigo Room", time: "9:00 PM–12:00 AM" },
];

const artists = [
  { id: "elaine", name: "Elaine", market: "Los Angeles", genres: "Disco · House", approved: ["ace-parity"] },
  { id: "maya", name: "Maya Lane", market: "Los Angeles", genres: "Disco · House · Soul", approved: ["ace-parity"] },
  { id: "sol", name: "Sol Selects", market: "Palm Springs", genres: "Balearic · Funk", approved: ["ace-parity"] },
  { id: "nico", name: "Nico Bloom", market: "Los Angeles", genres: "House · Global", approved: ["ace-parity"] },
];

const initialBookings: Array<{ id: string; shiftId: string; residencyId: string; artist: string; time: string; status: BookingStatus }> = [
  { id: "b1", shiftId: "ace-pool", residencyId: "ace-parity", artist: "Maya Lane", time: "12:00 PM–3:00 PM", status: "confirmed" },
  { id: "b2", shiftId: "ace-pool", residencyId: "ace-parity", artist: "Sol Selects", time: "3:00 PM–7:00 PM", status: "confirmed" },
  { id: "b3", shiftId: "ace-amigo", residencyId: "ace-parity", artist: "Nico Bloom", time: "9:00 PM–12:00 AM", status: "pending_hfy_confirmation" },
];

function Status({ value }: { value: string }) {
  return <span className={`status ${value}`}>{value.replaceAll("_", " ")}</span>;
}

export function PreviewApp() {
  const [view, setView] = useState<View>("overview");
  const [residencyId, setResidencyId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [bookings, setBookings] = useState(initialBookings);
  const [previewDayparts, setPreviewDayparts] = useState(initialPreviewDayparts);
  const [residencyDefaultRate, setResidencyDefaultRate] = useState("80.00");
  const [daypartsExpanded, setDaypartsExpanded] = useState(false);
  const [daypartsPanelResidencyId, setDaypartsPanelResidencyId] = useState<string | null>(null);

  const residency = residencies.find((item) => item.id === residencyId) ?? residencies[0];
  const inResidency = residencyId !== null;
  const inPipeline = !inResidency && view === "leads";
  const residencyShifts = shifts.filter((shift) => shift.residencyId === residency.id);
  const residencyBookings = bookings.filter((booking) => booking.residencyId === residency.id);

  const counts = useMemo(() => ({
    pending: bookings.filter((booking) => booking.status === "pending_hfy_confirmation").length,
    confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
  }), [bookings]);

  function openResidency(id: string) {
    setResidencyId(id);
    setView("overview");
    setSwitcherOpen(false);
    setDaypartsExpanded(false);
    setDaypartsPanelResidencyId(null);
  }

  function openDashboard() {
    setResidencyId(null);
    setView("overview");
    setSwitcherOpen(false);
    setDaypartsExpanded(false);
    setDaypartsPanelResidencyId(null);
  }

  function updateBooking(id: string, status: BookingStatus) {
    setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, status } : booking));
  }

  return (
    <PrivacyModeProvider initialEnabled={false}><div className={`shell ${!inResidency && view === "overview" ? "hfy-style-pilot" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">HFY</span><span className="brand-copy"><strong>HFY OS</strong><span>Programming desk</span></span></div>
        <div className="context-switcher-wrap">
          <button className="context-switcher" type="button" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen((open) => !open)}>
            <span><small>{inResidency ? "Residency workspace" : inPipeline ? "Pipeline workspace" : "HFY workspace"}</small><strong>{inResidency ? residency.name : inPipeline ? "Pipeline" : "Dashboard"}</strong></span>
            <span className={`context-chevron ${switcherOpen ? "open" : ""}`} aria-hidden="true">⌄</span>
          </button>
          {switcherOpen ? (
            <div className="context-menu">
              <button className={!inResidency && !inPipeline ? "selected" : ""} type="button" onClick={openDashboard}>
                <span className="context-option-icon">HFY</span><span><strong>Main dashboard</strong><small>Company-wide overview</small></span>
              </button>
              <div className="context-menu-label">Residencies</div>
              {residencies.map((item) => (
                <button className={residencyId === item.id ? "selected" : ""} type="button" onClick={() => openResidency(item.id)} key={item.id}>
                  <span className="context-option-icon hotel">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.location}</small></span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mode-switch" aria-label="HFY mode"><button className={!inPipeline ? "active" : ""} type="button" onClick={openDashboard}>Operations</button><button className={inPipeline ? "active" : ""} type="button" onClick={() => { setResidencyId(null); setView("leads"); setSwitcherOpen(false); }}>Pipeline</button></div>
        <div className="sidebar-context">
          <span>{inPipeline ? "Pre-signature" : inResidency ? residency.tier : "Company-wide"}</span>
          <p>{inPipeline ? "Leads before they move into Operations." : inResidency ? residency.location : "Every new-system residency in one place."}</p>
        </div>
        <nav className="nav preview-nav">
          <p className="nav-label">{inPipeline ? "Pipeline" : inResidency ? "Residency" : "HFY company"}</p>
          {(inPipeline
            ? (["leads"] as View[])
            : inResidency
            ? (["overview", "calendar", "payouts", "invoices", "setup"] as View[])
            : (["overview", "calendar", "talent", "settings"] as View[])
          ).map((item) => <div className="nav-entry" key={item}><button className={view === item ? "active" : ""} type="button" onClick={() => setView(item)}>{item === "settings" ? "Admin settings" : item === "talent" ? "Artist Lookup" : item}</button>{item === "calendar" ? <div className={`day-parts-nav ${daypartsExpanded ? "expanded" : ""}`}><button className="day-parts-nav-toggle" type="button" aria-expanded={daypartsExpanded} onClick={() => { if (inResidency) { const willOpen = daypartsPanelResidencyId !== residency.id; setDaypartsExpanded(willOpen); setDaypartsPanelResidencyId(willOpen ? residency.id : null); } else setDaypartsExpanded((open) => !open); }}><span>Day Parts</span><span aria-hidden="true">⌄</span></button>{!inResidency && daypartsExpanded ? <div className="day-parts-nav-list">{residencies.map((item) => <button className={daypartsPanelResidencyId === item.id ? "active" : ""} type="button" onClick={() => setDaypartsPanelResidencyId(item.id)} key={item.id}>{item.name}</button>)}</div> : null}</div> : null}</div>)}
        </nav>
        <div className="sidebar-footer"><p>Aus<br />Local preview</p><span className="preview-badge">Sample data only</span></div>
      </aside>
      <main className={`main ${view === "calendar" ? "calendar-main" : ""} ${inResidency && view === "calendar" ? "residency-calendar-main" : ""}`}>
        <div className="preview-ribbon inline">LOCAL PREVIEW · NOTHING HERE IS SAVED</div>
        {inResidency && view !== "overview" && view !== "calendar" ? (
          <div className="toolbar preview-toolbar residency-toolbar">
            <div><p className="eyebrow">Current residency</p><strong>{residency.name}</strong></div>
          </div>
        ) : null}

        {!inResidency && view === "overview" ? <Overview onOpen={openResidency} pending={counts.pending} confirmed={counts.confirmed} /> : null}
        {!inResidency && view === "calendar" ? <CompanyCalendar bookings={bookings} dayparts={previewDayparts} /> : null}
        {!inResidency && view === "talent" ? <PreviewArtistLookup /> : null}
        {!inResidency && view === "settings" ? <CompanySettings /> : null}
        {inPipeline ? <PreviewLeads /> : null}
        {inResidency && view === "overview" ? <ResidencyOverview residency={residency} pending={residencyBookings.filter((item) => item.status === "pending_hfy_confirmation").length} onNavigate={setView} /> : null}
        {inResidency && view === "calendar" ? <Calendar residency={residency} shifts={residencyShifts} bookings={residencyBookings} dayparts={previewDayparts} onUpdate={updateBooking} /> : null}
        {inResidency && view === "payouts" ? <PreviewPayouts /> : null}
        {inResidency && view === "invoices" ? <Invoices residency={residency} /> : null}
        {inResidency && view === "setup" ? <Setup residency={residency} dayparts={previewDayparts} onDaypartsChange={setPreviewDayparts} defaultTalentRate={residencyDefaultRate} onDefaultTalentRateChange={setResidencyDefaultRate} /> : null}
      </main>
      {daypartsPanelResidencyId ? <div className="day-parts-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDaypartsPanelResidencyId(null); }}><aside className="day-parts-panel" role="dialog" aria-modal="true"><header className="day-parts-panel-header"><div><p className="eyebrow">{residencies.find((item) => item.id === daypartsPanelResidencyId)?.name}</p><h2>Day Parts</h2><p>Review and edit the standing weekly schedule without leaving the calendar.</p></div><button className="quick-modal-close" type="button" onClick={() => { setDaypartsPanelResidencyId(null); if (inResidency) setDaypartsExpanded(false); }}>×</button></header><div className="day-parts-panel-scroll"><PreviewDaypartManager dayparts={previewDayparts} onChange={setPreviewDayparts} /></div></aside></div> : null}
    </div></PrivacyModeProvider>
  );
}

function Overview({ onOpen }: { onOpen: (id: string) => void; pending: number; confirmed: number }) {
  const [creating, setCreating] = useState(false);
  return <section className="hfy-company-overview"><header className="page-header"><div><p className="eyebrow">HFY company</p><h1>Overview</h1><p className="subhead">See every residency at once, then open one to work inside that program. Ace remains live in Airtable; its clearly labeled sandbox here is build-and-prove only.</p></div></header><section className="active-residencies-section"><div className="section-heading active-residencies-heading"><div><p className="eyebrow">Operations</p><h2>Active Residencies</h2><p className="subhead">Open a program or create the next Residency from this company workspace.</p></div><button className="button" type="button" onClick={() => setCreating(true)}>+ Create New Residency</button></div><div className="active-residencies-grid">{residencies.map((item) => <button className="card residency-card residency-card-button" type="button" aria-label={`Open ${item.name} residency`} onClick={() => onOpen(item.id)} key={item.id}><div className="residency-card-top"><div><h2>{item.name}</h2><p className="location">{item.location}</p></div><span className={`pill ${item.tier === "Complete" ? "complete" : ""}`}>{item.tier}</span></div><div className="metrics"><div className="metric"><strong>{item.shifts}</strong><span>Upcoming shifts</span></div><div className="metric"><strong>{item.open}</strong><span>Open / pending</span></div><div className="metric"><strong>{item.ready}</strong><span>Ready to pay</span></div><div className="metric"><strong>{item.receivables}</strong><span>Receivables</span></div></div><div className="residency-card-status"><span className={`residency-health ${item.attention ? "attention" : ""}`}>{item.attention ? "1 item needs attention" : "No open exceptions"}</span><span className="preview-link">Open residency →</span></div></button>)}</div></section>{creating ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className="quick-modal residency-create-modal" role="dialog" aria-modal="true"><header className="quick-modal-header"><div><p className="eyebrow">Operations</p><h2>Create New Residency</h2><p>Preview only—nothing entered here will be saved.</p></div><button className="quick-modal-close" type="button" onClick={() => setCreating(false)}>×</button></header><div className="quick-modal-body"><form className="residency-create-form" onSubmit={(event) => { event.preventDefault(); setCreating(false); }}><ResidencyCreateFields /><div className="residency-create-actions"><button className="button secondary" type="button" onClick={() => setCreating(false)}>Cancel</button><button className="button" type="submit">Create Residency</button></div></form></div></section></div> : null}</section>;
}

function ResidencyOverview({ residency, pending, onNavigate }: { residency: typeof residencies[number]; pending: number; onNavigate: (view: View) => void }) {
  return <><header className="page-header"><div><p className="eyebrow">Residency dashboard</p><h1>{residency.name}</h1><p className="subhead">Everything below belongs only to this residency program.</p></div><span className={`pill ${residency.tier === "Complete" ? "complete" : ""}`}>{residency.tier}</span></header><section className="grid residency-overview-grid"><article className="card residency-summary-card"><p className="eyebrow">Program snapshot</p><div className="metrics"><div className="metric"><strong>{residency.shifts}</strong><span>Upcoming shifts</span></div><div className="metric"><strong>{pending}</strong><span>Pending confirmation</span></div><div className="metric"><strong>{residency.ready}</strong><span>Ready to pay</span></div><div className="metric"><strong>{residency.receivables}</strong><span>Receivables</span></div></div></article><article className="card residency-profile-card"><div><p className="eyebrow">Residency profile</p><h2>Program details</h2></div><dl><div><dt>Location</dt><dd>{residency.location}</dd></div><div><dt>Service tier</dt><dd>{residency.tier}</dd></div><div><dt>Timezone</dt><dd>America/Los_Angeles</dd></div></dl><button className="button secondary" type="button" onClick={() => onNavigate("setup")}>Open residency setup</button></article></section><section className="workspace-shortcuts"><button className="card workspace-shortcut" type="button" onClick={() => onNavigate("calendar")}><span>01</span><strong>Calendar</strong><small>Shifts and confirmations</small></button><button className="card workspace-shortcut" type="button" onClick={() => onNavigate("payouts")}><span>02</span><strong>Payouts</strong><small>Residency-specific artist payments</small></button><button className="card workspace-shortcut" type="button" onClick={() => onNavigate("invoices")}><span>03</span><strong>Invoices</strong><small>Billing and delivery</small></button></section></>;
}

function CompanyCalendar({ bookings, dayparts }: { bookings: typeof initialBookings; dayparts: PreviewDaypart[] }) {
  const [monthKey, setMonthKey] = useState("2026-08");
  const [filter, setFilter] = useState("all");
  const visibleShifts = shifts.filter((shift) => filter === "all" || shift.residencyId === filter);
  const events = visibleShifts.map((shift) => {
    const home = residencies.find((item) => item.id === shift.residencyId);
    const booked = bookings.filter((item) => item.shiftId === shift.id && item.status !== "cancelled");
    const daypart = dayparts.find((item) => item.room === shift.room);
    return {
      id: shift.id,
      date: shift.serviceDate,
      title: filter === "all" ? `${daypart?.name ?? shift.name} · ${home?.name ?? "Residency"}` : daypart?.name ?? shift.name,
      time: `${shift.time} · ${booked.length ? `${booked.length} DJ${booked.length === 1 ? "" : "s"}` : "Needs DJ"}`,
      residencyName: home?.name ?? "Residency",
      color: daypart?.color,
      tone: calendarToneForSlot(shift.room, "navy"),
    };
  });

  return <div className="calendar-page"><header className="page-header calendar-page-header calendar-command-bar"><div className="calendar-title"><p className="eyebrow">HFY company</p><h1>Calendar</h1></div><div className="calendar-command-controls"><div className="field calendar-filter"><label>Residency calendar</label><select aria-label="Residency calendar" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All residencies</option>{residencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><div className="calendar-month-cluster"><div className="calendar-needs-summary clear"><strong>{events.length}</strong><span>scheduled slots shown</span></div><div className="month-navigation"><button className="calendar-arrow" type="button" aria-label="Previous month" onClick={() => setMonthKey((value) => shiftMonthKey(value, -1))}>←</button><h2>{monthLabel(monthKey)}</h2><button className="calendar-arrow" type="button" aria-label="Next month" onClick={() => setMonthKey((value) => shiftMonthKey(value, 1))}>→</button></div></div></div></header><MonthCalendar compact monthKey={monthKey} events={events} ariaLabel="HFY company programming calendar" /></div>;
}

function CompanySettings() {
  return <><header className="page-header card"><div><p className="eyebrow">HFY company</p><h1>Company Invoices</h1><p className="subhead">Manage the company identity and sender details used on client Invoices.</p></div></header><section className="card invoice-settings-form"><div className="invoice-settings-heading"><div><p className="eyebrow">Invoice branding</p><h2>HFY sender details</h2></div></div><div className="invoice-settings-section"><div className="form-grid two"><div className="field"><label>Company name</label><input defaultValue="Hear For You" /></div><div className="field"><label>Billing email</label><input defaultValue="billing@hearforyou.group" /></div></div><div className="field"><label>Billing address</label><textarea rows={3} /></div><div className="field"><label>Company logo</label><input type="file" /></div></div><div className="invoice-form-footer"><button className="button" type="button">Save invoice branding</button></div></section></>;
}

function Calendar({ residency, shifts: residencyShiftRows, bookings: bookingRows, dayparts, onUpdate }: { residency: typeof residencies[number]; shifts: typeof shifts; bookings: typeof initialBookings; dayparts: PreviewDaypart[]; onUpdate: (id: string, status: BookingStatus) => void }) {
  const [monthKey, setMonthKey] = useState("2026-08");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [activeDaypartId, setActiveDaypartId] = useState("pool");
  const [customHours, setCustomHours] = useState(false);
  const [customStart, setCustomStart] = useState("12:00");
  const [customEnd, setCustomEnd] = useState("19:00");
  const [aceSelections, setAceSelections] = useState<Record<string, PreviewAssignmentDraft[]>>({});
  const [existingAssignments, setExistingAssignments] = useState<PreviewAssignmentDraft[]>([
    { id: "existing-1", artistId: "maya", start: "12:00", end: "15:00" },
    { id: "existing-2", artistId: "sol", start: "15:00", end: "19:00" },
  ]);
  const [savedAceSlots, setSavedAceSlots] = useState<SavedPreviewSlot[]>([]);
  const [previewReplacement, setPreviewReplacement] = useState<PreviewAssignmentDraft | null>(null);
  const [genericShiftId, setGenericShiftId] = useState<string | null>(null);
  const [calendarStatusFilter, setCalendarStatusFilter] = useState<"needs" | "all" | "filled">("needs");
  const [calendarDaypartFilter, setCalendarDaypartFilter] = useState("all");
  const [addMode, setAddMode] = useState<"choose" | "daypart" | "one-time">("choose");
  const [oneTimeSlot, setOneTimeSlot] = useState({ name: "", room: "", color: "#7A65D1", start: "18:00", end: "21:00" });

  useEffect(() => {
    if (!modal) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setModal(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modal]);

  useEffect(() => {
    const savedStatus = window.localStorage.getItem("hfy-preview-calendar-status");
    const savedDaypart = window.localStorage.getItem("hfy-preview-calendar-daypart");
    const restoreFilters = window.setTimeout(() => {
      if (savedStatus === "needs" || savedStatus === "all" || savedStatus === "filled") setCalendarStatusFilter(savedStatus);
      if (savedDaypart && (savedDaypart === "all" || dayparts.some((daypart) => daypart.id === savedDaypart))) setCalendarDaypartFilter(savedDaypart);
    }, 0);
    return () => window.clearTimeout(restoreFilters);
  }, [dayparts]);

  if (residency.id !== "ace-parity") {
    const genericShift = residencyShiftRows.find((shift) => shift.id === genericShiftId);
    const genericEvents = residencyShiftRows.map((shift) => {
      const activeBookings = bookingRows.filter((booking) => booking.shiftId === shift.id && booking.status !== "cancelled");
      return { id: shift.id, date: shift.serviceDate, title: shift.room, time: `${shift.time} · ${activeBookings.length ? `${activeBookings.length} DJ${activeBookings.length === 1 ? "" : "s"}` : "Open"}`, residencyName: residency.name, tone: calendarToneForSlot(shift.room, "navy") };
    });
    return <div className="calendar-page"><header className="page-header calendar-page-header calendar-command-bar"><div className="calendar-title"><p className="eyebrow">{residency.name}</p><h1>Calendar</h1></div><div className="calendar-command-controls"><div className="calendar-month-cluster"><div className="calendar-needs-summary clear"><strong>{genericEvents.length}</strong><span>scheduled slots shown</span></div><div className="month-navigation"><button className="calendar-arrow" type="button" aria-label="Previous month" onClick={() => setMonthKey((value) => shiftMonthKey(value, -1))}>←</button><h2>{monthLabel(monthKey)}</h2><button className="calendar-arrow" type="button" aria-label="Next month" onClick={() => setMonthKey((value) => shiftMonthKey(value, 1))}>→</button></div></div></div></header><MonthCalendar compact monthKey={monthKey} events={genericEvents} selectedDate={genericShift?.serviceDate} onEventClick={(event) => setGenericShiftId(event.id)} ariaLabel={`${residency.name} programming calendar`} />{genericShift ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setGenericShiftId(null); }}><section className="quick-modal quick-modal-edit" role="dialog" aria-modal="true" aria-labelledby="generic-shift-title"><header className="quick-modal-header"><div><p className="eyebrow">{genericShift.date}</p><h2 id="generic-shift-title">Manage DJs · {genericShift.room}</h2></div><button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setGenericShiftId(null)}>×</button></header><div className="quick-modal-body"><div className="quick-time-summary"><span>{genericShift.room}</span><strong>{genericShift.time}</strong></div><div className="booking-list preview-bookings">{bookingRows.filter((booking) => booking.shiftId === genericShift.id && booking.status !== "cancelled").map((booking) => <div className="booking" key={booking.id}><div><strong>{booking.artist}</strong><div className="muted">{booking.time}</div></div><div className="preview-actions"><Status value={booking.status} />{booking.status === "pending_hfy_confirmation" ? <><button className="button lime" type="button" onClick={() => onUpdate(booking.id, "confirmed")}>Confirm</button><button className="button secondary" type="button" onClick={() => onUpdate(booking.id, "cancelled")}>Decline</button></> : null}</div></div>)}{!bookingRows.some((booking) => booking.shiftId === genericShift.id && booking.status !== "cancelled") ? <p className="muted">No DJ assigned yet.</p> : null}</div><footer className="quick-modal-footer"><button className="button" type="button" onClick={() => setGenericShiftId(null)}>Done</button></footer></div></section></div> : null}</div>;
  }

  const weekday = selectedDate ? new Date(`${selectedDate}T00:00:00Z`).getUTCDay() : -1;
  const daypartSuggestions = dayparts.flatMap((daypart) => {
    if (!daypart.active || (daypart.activeUntil && selectedDate && selectedDate > daypart.activeUntil)) return [];
    const recurringRule = daypart.rules.find((item) => item.weekday === weekday);
    const rule = recurringRule ?? daypart.rules[0];
    if (!rule) return [];
    return [{
      ...daypart,
      recurringToday: Boolean(recurringRule),
      start: minuteToClock(rule.startMinute),
      end: minuteToClock(rule.endMinute),
      time: `${formatLocalMinute(rule.startMinute)}–${formatLocalMinute(rule.endMinute)}`,
    }];
  });
  const oneTimeDaypart = { id: "one-time", name: oneTimeSlot.name, room: oneTimeSlot.room, color: oneTimeSlot.color, defaultTalentRateCents: null, activeUntil: null, active: true, sortOrder: 0, rules: [], recurringToday: false, start: oneTimeSlot.start, end: oneTimeSlot.end, time: `${formatLocalMinute(clockToMinute(oneTimeSlot.start))}–${formatLocalMinute(resolveEndMinute(clockToMinute(oneTimeSlot.start), oneTimeSlot.end))}` };
  const activeDaypart = activeDaypartId === "one-time" ? oneTimeDaypart : daypartSuggestions.find((item) => item.id === activeDaypartId) ?? daypartSuggestions[0];
  const activeShiftStart = customHours ? customStart : activeDaypart?.start ?? "12:00";
  const activeShiftEnd = customHours ? customEnd : activeDaypart?.end ?? "19:00";
  const activeAssignments = activeDaypart ? aceSelections[activeDaypart.id] ?? [] : [];
  const aceArtistOptions = artists.filter((artist) => artist.approved.includes("ace-parity")).map((artist) => ({ id: artist.id, name: artist.name, meta: `${artist.market} · ${artist.genres}` }));
  let assignmentWarning = "";
  let draftTimeInvalid = true;
  if (activeDaypart) {
    if (!activeAssignments.length) {
      assignmentWarning = `Add at least one DJ to the ${activeDaypart.name} slot.`;
    } else {
      try {
        const shiftStartMinute = clockToMinute(activeShiftStart);
        const shiftEndMinute = resolveEndMinute(shiftStartMinute, activeShiftEnd);
        const windows = activeAssignments.map((assignment) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, assignment.start, assignment.end));
        if (windows.some((window) => !window.withinShift)) {
          assignmentWarning = `The ${activeDaypart.name} slot is only ${formatLocalMinute(shiftStartMinute)}–${formatLocalMinute(shiftEndMinute)}. Please adjust DJ times.`;
        } else if (hasOverlappingAssignmentMinutes(windows)) {
          assignmentWarning = `DJ times overlap in the ${activeDaypart.name} slot. Adjust the times before adding this DJ.`;
        } else {
          draftTimeInvalid = false;
          const unfinished = activeAssignments.find((assignment) => !assignment.confirmed);
          if (unfinished) {
            const artist = artists.find((item) => item.id === unfinished.artistId);
            assignmentWarning = `Finish adding ${artist?.name ?? "this DJ"}: confirm their hours before saving the ${activeDaypart.name} slot.`;
          }
        }
      } catch {
        assignmentWarning = "Choose valid DJ start and end times.";
      }
    }
  }
  const savedExistingPool = savedAceSlots.some((slot) => slot.date === "2026-08-29" && slot.daypartId === "pool");
  const savedExistingAmigo = savedAceSlots.some((slot) => slot.date === "2026-08-29" && slot.daypartId === "amigo");
  const poolDaypart = dayparts.find((daypart) => daypart.id === "pool") ?? initialPreviewDayparts[0];
  const amigoDaypart = dayparts.find((daypart) => daypart.id === "amigo") ?? initialPreviewDayparts[1];
  const actualEvents = [...(savedExistingPool ? [] : [{
    id: "ace-existing-pool",
    date: "2026-08-29",
    title: poolDaypart.name,
    time: `12–7 PM · ${existingAssignments.length} DJs`,
    residencyName: "",
    color: poolDaypart.color,
    daypartId: "pool",
    schedulingStatus: "filled" as const,
  }]), ...(savedExistingAmigo ? [] : [{
    id: "ace-existing-amigo",
    date: "2026-08-29",
    title: amigoDaypart.name,
    time: "9 PM–12 AM · 1 DJ",
    residencyName: "",
    color: amigoDaypart.color,
    daypartId: "amigo",
    schedulingStatus: "filled" as const,
  }]), ...savedAceSlots.map((slot) => {
    const startMinute = clockToMinute(slot.start);
    const endMinute = resolveEndMinute(startMinute, slot.end);
    const matchedDaypart = dayparts.find((daypart) => daypart.id === slot.daypartId);
    const coverage = slot.assignments.filter((assignment) => assignment.confirmed).map((assignment) => resolveAssignmentMinutes(startMinute, endMinute, assignment.start, assignment.end)).filter((window) => window.withinShift);
    const schedulingStatus = slotSchedulingStatus(startMinute, endMinute, coverage);
    const statusLabel = schedulingStatus === "empty" ? "Needs DJ" : schedulingStatus === "partial" ? "Partial" : `${slot.assignments.length} DJ${slot.assignments.length === 1 ? "" : "s"}`;
    return {
      id: slot.id,
      date: slot.date,
      title: matchedDaypart?.name ?? slot.name,
      time: `${formatCompactMinuteRange(startMinute, endMinute)} · ${statusLabel}`,
      residencyName: "",
      color: matchedDaypart?.color ?? slot.color,
      daypartId: matchedDaypart?.id ?? slot.daypartId,
      schedulingStatus,
    };
  })];
  const projectionRange = monthRange(monthKey);
  const actualKeys = new Set([
    ...(savedExistingPool ? [] : ["pool:2026-08-29"]),
    ...(savedExistingAmigo ? [] : ["amigo:2026-08-29"]),
    ...savedAceSlots.map((slot) => `${slot.daypartId}:${slot.date}`),
  ]);
  const projectedSlots = projectDaypartSlots(dayparts, projectionRange.from, projectionRange.to, actualKeys);
  const aceEvents = [...actualEvents, ...projectedSlots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    title: slot.name,
    time: `${formatCompactMinuteRange(slot.startMinute, slot.endMinute)} · Needs DJ`,
    residencyName: "Projected from Setup",
    color: slot.color,
    daypartId: slot.daypartId,
    schedulingStatus: "empty" as const,
  }))];
  const needsDjCount = aceEvents.filter((event) => event.schedulingStatus === "empty" || event.schedulingStatus === "partial").length;
  const filteredAceEvents = aceEvents.filter((event) => {
    const matchesStatus = calendarStatusFilter === "all"
      || (calendarStatusFilter === "needs" && (event.schedulingStatus === "empty" || event.schedulingStatus === "partial"))
      || (calendarStatusFilter === "filled" && event.schedulingStatus === "filled");
    return matchesStatus && (calendarDaypartFilter === "all" || event.daypartId === calendarDaypartFilter);
  });
  let previewReplacementWarning = "";
  if (previewReplacement?.start && previewReplacement.end) {
    const replacementWindow = resolveAssignmentMinutes(720, 1140, previewReplacement.start, previewReplacement.end);
    const otherWindows = existingAssignments.filter((assignment) => assignment.id !== previewReplacement.id).map((assignment) => resolveAssignmentMinutes(720, 1140, assignment.start, assignment.end));
    if (!replacementWindow.withinShift) {
      previewReplacementWarning = "The Pool slot is only 12:00 PM–7:00 PM. Please adjust DJ times.";
    } else if (hasOverlappingAssignmentMinutes([replacementWindow, ...otherWindows])) {
      previewReplacementWarning = "This DJ's time overlaps another DJ in the Pool slot.";
    }
  }

  function openAceDate(date: string, preferredDaypartId?: string) {
    const clickedWeekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const matching = dayparts.filter((daypart) => daypart.active
      && (!daypart.activeUntil || date <= daypart.activeUntil)
      && daypart.rules.length);
    const savedForDate = savedAceSlots.filter((slot) => slot.date === date);
    const hasExistingPool = date === "2026-08-29" && !savedExistingPool;
    const hasExistingAmigo = date === "2026-08-29" && !savedExistingAmigo;
    const firstUnscheduled = matching.find((daypart) => !savedForDate.some((slot) => slot.daypartId === daypart.id) && !(hasExistingPool && daypart.id === "pool") && !(hasExistingAmigo && daypart.id === "amigo"));
    setSelectedDate(date);
    setActiveDaypartId(preferredDaypartId ?? firstUnscheduled?.id ?? matching[0]?.id ?? "");
    setAceSelections(Object.fromEntries(matching.map((daypart) => {
      const savedSlot = savedForDate.find((slot) => slot.daypartId === daypart.id);
      const assignments = savedSlot?.assignments
        ?? (hasExistingPool && daypart.id === "pool" ? existingAssignments.map((assignment) => ({ ...assignment, confirmed: true })) : undefined)
        ?? (hasExistingAmigo && daypart.id === "amigo" ? [{ id: "existing-amigo-1", artistId: "nico", start: "21:00", end: "00:00", confirmed: true }] : []);
      return [daypart.id, assignments];
    })));
    const preferred = matching.find((daypart) => daypart.id === preferredDaypartId);
    const preferredRule = preferred?.rules.find((rule) => rule.weekday === clickedWeekday);
    setCustomHours(Boolean(preferred && !preferredRule));
    setAddMode(preferredDaypartId ? "daypart" : "choose");
    setOneTimeSlot({ name: "", room: "", color: "#7A65D1", start: "18:00", end: "21:00" });
    setPreviewReplacement(null);
    setModal("add");
  }

  function addAceArtist(daypartId: string, artistId: string) {
    setAceSelections((current) => ({
      ...current,
      [daypartId]: [...(current[daypartId] ?? []), (() => {
        const shiftStartMinute = clockToMinute(activeShiftStart);
        const shiftEndMinute = resolveEndMinute(shiftStartMinute, activeShiftEnd);
        const confirmedEnds = (current[daypartId] ?? []).filter((assignment) => assignment.confirmed).map((assignment) => resolveAssignmentMinutes(shiftStartMinute, shiftEndMinute, assignment.start, assignment.end).endMinute);
        const nextStartMinute = confirmedEnds.length ? Math.max(...confirmedEnds) : shiftStartMinute;
        return { id: crypto.randomUUID(), artistId, start: nextStartMinute < shiftEndMinute ? minuteToClock(nextStartMinute) : activeShiftStart, end: activeShiftEnd, confirmed: false };
      })()],
    }));
  }

  function confirmAceAssignment(daypartId: string, assignmentId: string) {
    setAceSelections((current) => ({
      ...current,
      [daypartId]: (current[daypartId] ?? []).map((assignment) => assignment.id === assignmentId ? { ...assignment, confirmed: true } : assignment),
    }));
  }

  function updateAceAssignment(daypartId: string, assignmentId: string, next: Partial<PreviewAssignmentDraft>) {
    setAceSelections((current) => ({
      ...current,
      [daypartId]: (current[daypartId] ?? []).map((assignment) => assignment.id === assignmentId ? { ...assignment, ...next } : assignment),
    }));
  }

  function removeAceAssignment(daypartId: string, assignmentId: string) {
    setAceSelections((current) => ({
      ...current,
      [daypartId]: (current[daypartId] ?? []).filter((assignment) => assignment.id !== assignmentId),
    }));
  }

  function submitAceDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (assignmentWarning || !activeDaypart || !selectedDate) return;
    const savedDaypartId = activeDaypart.id === "one-time" ? `one-time-${crypto.randomUUID()}` : activeDaypart.id;
    const nextSlot: SavedPreviewSlot = {
      id: `ace-preview-${selectedDate}-${savedDaypartId}`,
      date: selectedDate,
      daypartId: savedDaypartId,
      name: activeDaypart.name,
      room: activeDaypart.room,
      start: activeShiftStart,
      end: activeShiftEnd,
      assignments: activeAssignments.map((assignment) => ({ ...assignment, confirmed: true })),
      color: activeDaypart.color,
    };
    setSavedAceSlots((current) => [...current.filter((slot) => !(slot.date === selectedDate && slot.daypartId === activeDaypart.id)), nextSlot]);
    setModal(null);
  }

  return <div className="calendar-page">
    <header className="page-header calendar-page-header calendar-command-bar"><div className="calendar-title"><p className="eyebrow">Ace parity sandbox</p><h1>Calendar</h1></div><div className="calendar-command-controls"><div className="calendar-view-filters"><div className="field"><label htmlFor="preview-calendar-status">Status</label><select id="preview-calendar-status" value={calendarStatusFilter} onChange={(event) => { const next = event.target.value as "needs" | "all" | "filled"; setCalendarStatusFilter(next); window.localStorage.setItem("hfy-preview-calendar-status", next); }}><option value="needs">Needs coverage</option><option value="all">All slots</option><option value="filled">Scheduled</option></select></div><div className="field"><label htmlFor="preview-calendar-daypart">Daypart</label><select id="preview-calendar-daypart" value={calendarDaypartFilter} onChange={(event) => { setCalendarDaypartFilter(event.target.value); window.localStorage.setItem("hfy-preview-calendar-daypart", event.target.value); }}><option value="all">All Dayparts</option>{dayparts.filter((daypart) => daypart.active).map((daypart) => <option value={daypart.id} key={daypart.id}>{daypart.name}</option>)}</select></div></div><div className="calendar-month-cluster"><div className={`calendar-needs-summary ${needsDjCount ? "attention" : "clear"}`}><strong>{needsDjCount}</strong><span>{needsDjCount === 1 ? "slot needs coverage" : "slots need coverage"}</span></div><div className="month-navigation"><button className="calendar-arrow" type="button" aria-label="Previous month" onClick={() => setMonthKey((value) => shiftMonthKey(value, -1))}>←</button><h2>{monthLabel(monthKey)}</h2><button className="calendar-arrow" type="button" aria-label="Next month" onClick={() => setMonthKey((value) => shiftMonthKey(value, 1))}>→</button></div></div></div></header>
    <MonthCalendar compact monthKey={monthKey} events={filteredAceEvents} selectedDate={modal ? selectedDate : null} onDateClick={openAceDate} onEventClick={(event) => {
      const projected = projectedSlots.find((slot) => slot.id === event.id);
      const saved = savedAceSlots.find((slot) => slot.id === event.id);
      if (event.id !== "ace-existing-pool") {
        openAceDate(event.date, projected?.daypartId ?? saved?.daypartId ?? (event.id === "ace-existing-amigo" ? "amigo" : undefined));
        return;
      }
      setSelectedDate(event.date);
      setPreviewReplacement(null);
      setModal("edit");
    }} />
    {modal ? (
      <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setModal(null); }}>
        <section className={`quick-modal ${modal === "edit" ? "quick-modal-edit" : ""}`} role="dialog" aria-modal="true" aria-labelledby="preview-quick-title">
          <header className="quick-modal-header">
            <div><p className="eyebrow">{selectedDate ? new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "Calendar"}</p><h2 id="preview-quick-title">{modal === "add" ? "Add a music slot" : "Manage DJs · Pool"}</h2></div>
            <button className="quick-modal-close" type="button" aria-label="Close popup" onClick={() => setModal(null)}>×</button>
          </header>
          <div className="quick-modal-body">
            {modal === "add" ? (
              addMode === "choose" ? <div className="quick-add-choice"><button className="quick-add-choice-card" type="button" onClick={() => { const next = daypartSuggestions.find((daypart) => daypart.id === activeDaypartId) ?? daypartSuggestions[0]; if (!next) return; setActiveDaypartId(next.id); setCustomStart(next.start); setCustomEnd(next.end); setCustomHours(!next.recurringToday); setAddMode("daypart"); }}><span>Existing Daypart</span><strong>Use a setup Daypart</strong><small>Choose any active Daypart and adjust its hours for this date.</small></button><button className="quick-add-choice-card one-time" type="button" onClick={() => { setActiveDaypartId("one-time"); setCustomStart(oneTimeSlot.start); setCustomEnd(oneTimeSlot.end); setCustomHours(true); setAddMode("one-time"); }}><span>One-time</span><strong>Create a one-time slot</strong><small>Add something unique without changing the standing schedule.</small></button></div> : !activeDaypart ? <div className="empty quick-empty">No active Daypart is available.</div> : (
                <form className="quick-book-form" onSubmit={submitAceDate}>
                  {addMode === "daypart" ? <div className="quick-slot-picker">{daypartSuggestions.map((daypart) => <button className={`quick-slot-option ${activeDaypart?.id === daypart.id ? "active" : ""}`} style={{ "--daypart-color": daypart.color } as React.CSSProperties} type="button" onClick={() => { setActiveDaypartId(daypart.id); setCustomHours(!daypart.recurringToday); setCustomStart(daypart.start); setCustomEnd(daypart.end); }} key={daypart.id}><span><strong>{daypart.name}</strong><small>{daypart.recurringToday ? `${daypart.room} · ${daypart.time}` : `${daypart.room} · not normally scheduled this day`}</small></span></button>)}</div> : <div className="quick-one-time-fields"><div className="field"><label>Slot name</label><input value={oneTimeSlot.name} onChange={(event) => setOneTimeSlot({ ...oneTimeSlot, name: event.target.value })} placeholder="Movie Night" required /></div><div className="field"><label>Room / space</label><input value={oneTimeSlot.room} onChange={(event) => setOneTimeSlot({ ...oneTimeSlot, room: event.target.value })} placeholder="Pool" required /></div><div className="field"><label>Calendar color</label><div className="daypart-color-control"><input aria-label="One-time slot color" type="color" value={oneTimeSlot.color} onChange={(event) => setOneTimeSlot({ ...oneTimeSlot, color: event.target.value.toUpperCase() })} /><strong>{oneTimeSlot.color}</strong></div></div></div>}
                  {addMode === "daypart" ? <div className="quick-time-choice"><button className={!customHours ? "active" : ""} type="button" disabled={!activeDaypart.recurringToday} onClick={() => setCustomHours(false)}>Use standing hours</button><button className={customHours ? "active" : ""} type="button" onClick={() => setCustomHours(true)}>Custom hours</button></div> : null}
                  {customHours ? <div className="quick-time-fields"><div className="field"><label>Slot starts</label><input type="time" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div><div className="field"><label>Slot ends</label><input type="time" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div></div> : <div className="quick-time-summary"><span>{activeDaypart?.room}</span><strong>{activeDaypart?.time}</strong></div>}
                  <div className="quick-assignment-heading"><div><strong>DJ assignments</strong><small>Add one artist or several; individual hours determine coverage and pay.</small></div></div>
                  <div className="quick-assignment-list">{activeAssignments.map((assignment, index) => {
                    const artist = artists.find((item) => item.id === assignment.artistId);
                    return <div className={`quick-assignment-card ${assignment.confirmed ? "confirmed" : "draft"}`} key={assignment.id}><div className="quick-assignment-card-heading"><div><span>DJ {index + 1}</span><strong>{artist?.name}</strong><small>{assignment.confirmed ? "✓ Added" : "Finish this DJ"}</small></div><div className="quick-card-actions">{assignment.confirmed ? <button type="button" onClick={() => activeDaypart && updateAceAssignment(activeDaypart.id, assignment.id, { confirmed: false })}>Edit</button> : null}<button type="button" onClick={() => activeDaypart && removeAceAssignment(activeDaypart.id, assignment.id)}>Remove</button></div></div><div className="quick-dj-time-fields"><div className="field"><label>Starts</label><input aria-label={`${artist?.name} start time`} type="time" value={assignment.start} disabled={Boolean(assignment.confirmed)} onChange={(event) => activeDaypart && updateAceAssignment(activeDaypart.id, assignment.id, { start: event.target.value })} /></div><div className="field"><label>Ends</label><input aria-label={`${artist?.name} end time`} type="time" value={assignment.end} disabled={Boolean(assignment.confirmed)} onChange={(event) => activeDaypart && updateAceAssignment(activeDaypart.id, assignment.id, { end: event.target.value })} /></div></div>{!assignment.confirmed ? <button className="button quick-confirm-dj" type="button" disabled={draftTimeInvalid} onClick={() => activeDaypart && confirmAceAssignment(activeDaypart.id, assignment.id)}>Add DJ</button> : null}</div>;
                  })}</div>
                  {activeDaypart && !activeAssignments.some((assignment) => !assignment.confirmed) ? <ArtistSearchPicker artists={aceArtistOptions} excludedIds={activeAssignments.map((assignment) => assignment.artistId)} onSelect={(artistId) => addAceArtist(activeDaypart.id, artistId)} /> : null}
                  {assignmentWarning ? <p className={assignmentWarning.startsWith("Finish adding") || !activeAssignments.length ? "draft-notice" : "error"} aria-live="polite">{assignmentWarning}</p> : null}
                  <footer className="quick-modal-footer"><button className="button secondary" type="button" onClick={() => setAddMode("choose")}>Back</button><span>All DJs added?</span><button className="button secondary" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button" type="submit" disabled={Boolean(assignmentWarning) || !activeDaypart.name.trim() || !activeDaypart.room.trim()}>Save {activeDaypart.name || "music"} slot</button></footer>
                </form>
              )
            ) : (
              <>
                <div className="quick-time-summary"><span>Pool</span><strong>12:00 PM–7:00 PM</strong></div>
                <p className="quick-guidance">Change or remove one DJ at a time. A replacement is not saved until you confirm both the DJ and their hours.</p>
                <div className="quick-reschedule-list">{existingAssignments.map((assignment, index) => {
                  const artist = artists.find((item) => item.id === assignment.artistId);
                  const changing = previewReplacement?.id === assignment.id;
                  const replacement = changing ? artists.find((item) => item.id === previewReplacement.artistId) : undefined;
                  return <div className={`quick-reschedule-row ${changing ? "changing" : ""}`} key={assignment.id}>
                    <div className="quick-existing-dj"><span>DJ {index + 1}</span><strong>{artist?.name}</strong><small>{formatLocalMinute(clockToMinute(assignment.start))}–{formatLocalMinute(resolveEndMinute(clockToMinute(assignment.start), assignment.end))}</small></div>
                    <div className="quick-existing-actions"><button className="button secondary" type="button" onClick={() => setPreviewReplacement({ ...assignment, artistId: "", start: "", end: "" })}>Change DJ</button><button className="remove-dj-button" type="button" onClick={() => { setExistingAssignments((current) => current.filter((item) => item.id !== assignment.id)); if (previewReplacement?.id === assignment.id) setPreviewReplacement(null); }}>Remove DJ</button></div>
                    {changing && previewReplacement ? <div className="replacement-editor">
                      <div className="replacement-step"><span>1</span><div><strong>Choose the replacement DJ</strong><small>The current DJ remains unchanged until you save.</small></div></div>
                      {replacement ? <div className="replacement-selected"><div><span>Replacement</span><strong>{replacement.name}</strong></div><button type="button" onClick={() => setPreviewReplacement({ ...previewReplacement, artistId: "" })}>Choose someone else</button></div> : <ArtistSearchPicker label="Choose replacement" artists={aceArtistOptions} excludedIds={existingAssignments.map((item) => item.artistId)} onSelect={(artistId) => setPreviewReplacement({ ...previewReplacement, artistId })} />}
                      <div className="replacement-step"><span>2</span><div><strong>Confirm their hours</strong><small>These hours determine this DJ&apos;s payout.</small></div></div>
                      <div className="quick-dj-time-fields"><div className="field"><label>Starts</label><input aria-label="Replacement DJ start time" type="time" value={previewReplacement.start} onChange={(event) => setPreviewReplacement({ ...previewReplacement, start: event.target.value })} /></div><div className="field"><label>Ends</label><input aria-label="Replacement DJ end time" type="time" value={previewReplacement.end} onChange={(event) => setPreviewReplacement({ ...previewReplacement, end: event.target.value })} /></div></div>
                      {previewReplacementWarning ? <p className="error" aria-live="polite">{previewReplacementWarning}</p> : null}
                      <div className="replacement-actions"><button className="button secondary" type="button" onClick={() => setPreviewReplacement(null)}>Cancel change</button><button className="button" type="button" disabled={!previewReplacement.artistId || !previewReplacement.start || !previewReplacement.end || Boolean(previewReplacementWarning)} onClick={() => { setExistingAssignments((current) => current.map((item) => item.id === previewReplacement.id ? { ...previewReplacement } : item)); setPreviewReplacement(null); }}>Save DJ change</button></div>
                    </div> : null}
                  </div>;
                })}</div>
                <footer className="quick-modal-footer"><button className="button" type="button" onClick={() => setModal(null)}>Done</button></footer>
              </>
            )}
          </div>
        </section>
      </div>
    ) : null}
  </div>;
}

function Invoices({ residency }: { residency: typeof residencies[number] }) {
  return <PreviewInvoices residencyName={residency.name} />;
}

function Setup({ residency, dayparts, onDaypartsChange, defaultTalentRate, onDefaultTalentRateChange }: { residency: typeof residencies[number]; dayparts: PreviewDaypart[]; onDaypartsChange: (dayparts: PreviewDaypart[]) => void; defaultTalentRate: string; onDefaultTalentRateChange: (rate: string) => void }) {
  const [savedRate, setSavedRate] = useState(defaultTalentRate);
  const [clientRate, setClientRate] = useState("150.00");
  const [approvedIds, setApprovedIds] = useState(() => new Set(artists.filter((artist) => artist.approved.includes(residency.id)).map((artist) => artist.id)));
  const [publicLink, setPublicLink] = useState("");
  return <><header className="page-header card"><div><p className="eyebrow">{residency.name} · Preview</p><h1>Residency setup</h1><p className="subhead">Program details, standing hours, rate defaults, approved artists, and client contacts for this Residency.</p></div></header><PreviewDaypartManager dayparts={dayparts} onChange={onDaypartsChange} /><section className="residency-setup-grid">
    <form className="card residency-profile-editor" onSubmit={(event) => event.preventDefault()}><div><p className="eyebrow">Residency profile</p><h2>Program details</h2><p className="subhead">The operating identity and internal context for this Residency.</p></div><div className="residency-profile-fields"><div className="field"><label>Residency name</label><input defaultValue={residency.name} /></div><div className="field"><label>City / State</label><input defaultValue={residency.location} /></div><div className="field"><label>Timezone</label><input defaultValue="America/Los_Angeles" /></div><div className="field"><label>Service tier</label><select defaultValue="operations_only"><option value="operations_only">Operations Only</option><option value="complete">Complete</option></select></div><div className="field wide"><label>Internal notes</label><textarea rows={3} placeholder="Operating context or internal reminders" /></div></div><button className="button" type="submit">Save Residency profile</button></form>
    <form className="card residency-rate-editor" onSubmit={(event) => { event.preventDefault(); setSavedRate(defaultTalentRate); }}><div><p className="eyebrow">Default rates</p><h2>Talent and client</h2><p className="subhead">Fallback hourly rates for new calendar work.</p></div><div className="residency-rate-fields"><div className="field"><label>Talent rate ($/hr)</label><input type="number" min="0" step="0.01" value={defaultTalentRate} onChange={(event) => onDefaultTalentRateChange(event.target.value)} /><small>Used after Assignment and Daypart overrides.</small></div><div className="field"><label>Client rate ($/hr)</label><input type="number" min="0" step="0.01" value={clientRate} onChange={(event) => setClientRate(event.target.value)} /><small>Used when a Shift has no override.</small></div></div>{savedRate === defaultTalentRate ? <p className="privacy-note">Rate changes apply to new work only.</p> : <p className="draft-notice">Save these defaults before leaving Setup.</p>}<button className="button" type="submit">Save default rates</button></form>
    <section className="card approved-dj-manager"><div className="setup-card-heading"><div><p className="eyebrow">Approved DJs</p><h2>Residency artist list</h2><p className="subhead">Checked artists are available when scheduling this Residency.</p></div><strong>{approvedIds.size} approved</strong></div><label className="approved-dj-search"><span>Search artists</span><input type="search" placeholder="Artist name or market" /></label><div className="approved-dj-list">{artists.map((artist) => <label className="approved-dj-row" key={artist.id}><input type="checkbox" checked={approvedIds.has(artist.id)} onChange={() => setApprovedIds((current) => { const next = new Set(current); if (next.has(artist.id)) next.delete(artist.id); else next.add(artist.id); return next; })} /><span><strong>{artist.name}</strong><small>{artist.market}</small></span></label>)}</div><div className="setup-card-actions"><span>Existing bookings are never removed.</span><button className="button" type="button">Save approved DJs</button></div></section>
    <section className="card residency-contacts-manager"><div className="setup-card-heading"><div><p className="eyebrow">Contacts &amp; access</p><h2>Residency team</h2><p className="subhead">Keep operational contacts here. Login access is optional and invited deliberately.</p></div><button className="button secondary" type="button">+ Add contact</button></div><div className="residency-contacts-layout"><div className="residency-contact-list"><article className="selected"><button type="button"><span><strong>Ace Manager</strong><small>General Manager</small></span><span><small>Contact only</small><em>Primary</em></span></button><div><span className="contact-invite-status">not invited</span></div></article></div><form className="residency-contact-form" onSubmit={(event) => event.preventDefault()}><div className="setup-form-heading"><strong>Edit contact</strong><span>Saving does not send an invitation.</span></div><div className="row"><div className="field"><label>Name</label><input defaultValue="Ace Manager" /></div><div className="field"><label>Title / role</label><input defaultValue="General Manager" /></div></div><div className="row"><div className="field"><label>Email</label><input type="email" placeholder="manager@example.com" /></div><div className="field"><label>Phone</label><input placeholder="Phone number" /></div></div><div className="field"><label>Login access</label><select defaultValue="none"><option value="none">No login — contact only</option><option value="manager">Residency Manager — client-safe overview and calendar</option><option value="calendar_viewer">Calendar Viewer — read-only calendar</option></select><small>Client accounts never receive rates, payouts, invoices, or internal data.</small></div><label className="checkbox-row"><input type="checkbox" defaultChecked /> Primary day-to-day contact</label><div className="setup-card-actions"><span>Invite from the saved list when ready.</span><button className="button" type="submit">Save contact</button></div></form></div></section>
    <article className="card residency-setup-card public-calendar-link-card"><div><p className="eyebrow">Calendar sharing</p><h2>Public calendar link</h2><p className="subhead">A read-only link exposing only Instagram handles and scheduled date/time.</p></div><div className="public-calendar-boundary"><strong>{publicLink ? "An active link exists" : "No public link yet"}</strong><span>The token never expires. Regenerating it immediately revokes the previous link.</span></div>{publicLink ? <div className="public-calendar-copy"><label>New link</label><div><input readOnly value={publicLink} /><button className="button secondary" type="button">Copy</button></div><small>Preview token only. Nothing here is saved.</small></div> : null}<button className={publicLink ? "button secondary" : "button"} type="button" onClick={() => setPublicLink(`https://hfy.app/share/calendar/${crypto.randomUUID().replaceAll("-", "")}`)}>{publicLink ? "Regenerate link" : "Create public link"}</button></article>
  </section></>;
}
