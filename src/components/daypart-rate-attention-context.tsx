"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { DaypartRateAttentionAudience } from "@/domain/daypart-rate-attention";

export type DaypartRateAttentionReport = {
  residencyId: string;
  audience: Exclude<DaypartRateAttentionAudience, "all">;
  needsAttention: boolean;
};

const DaypartRateAttentionReportContext = createContext<((report: DaypartRateAttentionReport) => void) | null>(null);

export function DaypartRateAttentionReportProvider({
  children,
  onReport,
}: {
  children: ReactNode;
  onReport: (report: DaypartRateAttentionReport) => void;
}) {
  return <DaypartRateAttentionReportContext value={onReport}>{children}</DaypartRateAttentionReportContext>;
}

export function useReportDaypartRateAttention({ residencyId, audience, needsAttention }: DaypartRateAttentionReport) {
  const onReport = useContext(DaypartRateAttentionReportContext);

  useEffect(() => {
    onReport?.({ residencyId, audience, needsAttention });
  }, [audience, needsAttention, onReport, residencyId]);
}
