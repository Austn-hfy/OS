type InternalNavigationItem = {
  href: string;
  label: string;
};

type InternalNavigationLocation = {
  mode: "developer" | "hfy";
  pathname: string;
  residencyId: string | null;
  section: string | null;
  view: string | null;
};

export function isInternalNavigationItemActive(
  item: InternalNavigationItem,
  location: InternalNavigationLocation,
) {
  const { href, label } = item;
  const { mode, pathname, residencyId, section, view } = location;

  if (label === "Work Queue") return pathname === "/app" && !residencyId && view !== "operations";
  if (label === "Operations") return pathname === "/app" && (Boolean(residencyId) || view === "operations");
  if (label === "Pipeline") return pathname.startsWith("/app/leads");

  const target = new URL(href, "https://hfy.app");
  if (mode === "developer" && target.pathname === "/app") {
    return pathname === target.pathname && section === target.searchParams.get("section");
  }

  return pathname === target.pathname;
}
