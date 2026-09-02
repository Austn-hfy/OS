"use client";

import Link from "next/link";

export type WorkspaceNavIconName =
  | "calendar"
  | "dayparts"
  | "invoices"
  | "operations"
  | "overview"
  | "payouts"
  | "pipeline"
  | "residencies"
  | "settings"
  | "setup"
  | "talent"
  | "workqueue";

export function WorkspaceNavIcon({ name }: { name: WorkspaceNavIconName }) {
  return <span className="residency-nav-icon" aria-hidden="true">{
    name === "calendar" ? <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
      : name === "dayparts" ? <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></svg>
        : name === "talent" ? <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5M17 7v8M14 10h6" /></svg>
          : name === "payouts" ? <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4zM8 10h8M8 14h5" /></svg>
            : name === "invoices" ? <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" /></svg>
              : name === "residencies" ? <svg viewBox="0 0 24 24"><path d="M4 21V6l8-3 8 3v15M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4" /></svg>
                : name === "operations" ? <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                  : name === "pipeline" ? <svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6.5 7.5l4.2 8.7M17.5 7.5l-4.2 8.7" /></svg>
                    : name === "workqueue" ? <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></svg>
                      : name === "overview" ? <svg viewBox="0 0 24 24"><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></svg>
                        : name === "setup" ? <svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></svg>
                          : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1z" /></svg>
  }</span>;
}

export function WorkspaceNavLink({
  href,
  label,
  description,
  icon,
  active,
  attention = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: WorkspaceNavIconName;
  active: boolean;
  attention?: boolean;
}) {
  return <Link className={`residency-nav-item ${active ? "active" : ""} ${attention ? "needs-attention" : ""}`} href={href}>
    <WorkspaceNavIcon name={icon} />
    <span className="residency-nav-copy"><strong>{label}</strong><small>{description}</small></span>
    <span className="residency-nav-end" aria-hidden="true">{attention ? <span className="residency-nav-attention">!</span> : null}<span className="residency-nav-arrow">›</span></span>
  </Link>;
}
