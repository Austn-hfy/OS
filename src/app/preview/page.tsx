import { notFound } from "next/navigation";
import { PreviewApp } from "./preview-app";

export const dynamic = "force-dynamic";

export default function PreviewPage() {
  if (process.env.HFY_DEMO_MODE !== "1") notFound();
  return <PreviewApp />;
}
