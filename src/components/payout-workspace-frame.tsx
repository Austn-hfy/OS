import type { ReactNode } from "react";

/** Shared visual frame for HFY and Residency payout workspaces. */
export function PayoutWorkspaceFrame({ tabs, filters, list, detailOpen = false, drawer }: { tabs: ReactNode; filters: ReactNode; list: ReactNode; detailOpen?: boolean; drawer?: ReactNode }) {
  return <>
    {tabs}
    {filters}
    <div className={`payout-workspace-shell ${detailOpen ? "detail-open" : ""}`}>{list}</div>
    {drawer}
  </>;
}
