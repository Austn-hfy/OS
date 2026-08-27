"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { PRIVACY_MODE_COOKIE } from "@/lib/privacy-mode";

type PrivacyModeContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null);

export function PrivacyModeProvider({ initialEnabled, children }: { initialEnabled: boolean; children: ReactNode }) {
  const [enabled, setEnabledState] = useState(initialEnabled);

  useEffect(() => {
    document.body.classList.toggle("privacy-mode-active", enabled);
    return () => document.body.classList.remove("privacy-mode-active");
  }, [enabled]);

  function setEnabled(nextEnabled: boolean) {
    setEnabledState(nextEnabled);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${PRIVACY_MODE_COOKIE}=${nextEnabled ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  }

  return <PrivacyModeContext.Provider value={{ enabled, setEnabled }}>{children}</PrivacyModeContext.Provider>;
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext);
  if (!context) throw new Error("Privacy Mode controls must be rendered inside PrivacyModeProvider.");
  return context;
}

export function PrivateValue({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { enabled } = usePrivacyMode();
  return <span className={`private-value ${enabled ? "masked" : ""} ${className}`.trim()} aria-label={enabled ? "Financial value hidden by Privacy Mode" : undefined}>{enabled ? "••••" : children}</span>;
}

export function SensitiveInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const { enabled } = usePrivacyMode();
  return <span className={`sensitive-input ${enabled ? "masked" : ""}`.trim()}>
    <input {...props} className={className} readOnly={enabled || props.readOnly} tabIndex={enabled ? -1 : props.tabIndex} />
    {enabled ? <span className="sensitive-input-mask" aria-label="Financial value hidden by Privacy Mode">••••</span> : null}
  </span>;
}

export function PrivacyPdfLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { enabled } = usePrivacyMode();
  return <a {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || !enabled) return;
    if (!window.confirm("Privacy Mode is on, but this invoice PDF contains client billing amounts. Open it anyway?")) event.preventDefault();
  }} />;
}

export function PrivacyModeToggle() {
  const { enabled, setEnabled } = usePrivacyMode();
  return <button className={`privacy-mode-toggle ${enabled ? "active" : ""}`} type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
    <span className="privacy-mode-icon" aria-hidden="true">{enabled ? (
      <svg viewBox="0 0 24 24"><path d="M3 3l18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M9.9 4.3A10.9 10.9 0 0 1 12 4c5.5 0 9 5.1 9 5.1a12.8 12.8 0 0 1-2.1 2.5" /><path d="M6.2 6.2C4.2 7.5 3 9.1 3 9.1S6.5 14.2 12 14.2c.8 0 1.6-.1 2.3-.3" /></svg>
    ) : (
      <svg viewBox="0 0 24 24"><path d="M3 12s3.5-5.1 9-5.1 9 5.1 9 5.1-3.5 5.1-9 5.1S3 12 3 12Z" /><circle cx="12" cy="12" r="2.4" /></svg>
    )}</span>
    <span><strong>Privacy Mode</strong><small>{enabled ? "On · values hidden" : "Off · values visible"}</small></span>
  </button>;
}

export function PrivacyModeIndicator() {
  const { enabled } = usePrivacyMode();
  return enabled ? <div className="privacy-mode-indicator" role="status"><span aria-hidden="true">●</span> Privacy Mode On</div> : null;
}
