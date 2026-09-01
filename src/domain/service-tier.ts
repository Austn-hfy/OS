export type ServiceTier = "operations_only" | "complete";

export const serviceTierLabels: Record<ServiceTier, string> = {
  operations_only: "Platform",
  complete: "Full Programming",
};

export function formatServiceTier(tier: string) {
  if (tier === "operations_only" || tier === "complete") return serviceTierLabels[tier];
  return tier.replaceAll("_", " ");
}
