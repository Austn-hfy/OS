import type { ReactNode } from "react";

/** Shared two-pane frame used by both HFY and Residency talent workspaces. */
export function TalentWorkspaceShell({ sidebar, detail, overlays }: { sidebar: ReactNode; detail: ReactNode; overlays?: ReactNode }) {
  return <>
    <div className="artist-lookup-shell">
      <aside className="artist-roster-panel">{sidebar}</aside>
      <section className="artist-detail-panel">{detail}</section>
    </div>
    {overlays}
  </>;
}
