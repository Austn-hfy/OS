import type { ReactNode } from "react";

/**
 * The shared page-level frame for non-calendar workspaces.
 *
 * Route content stays responsible for its own controls, lists, forms, and
 * overlays; this component only provides the calm, single-surface hierarchy
 * used across Developer, HFY Programming, and Residency workspaces.
 */
export function WorkspaceSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`workspace-surface ${className}`.trim()}>{children}</section>;
}
