import { getPipelineLeads } from "@/data/internal";
import { LeadsWorkspace } from "./leads-workspace";

export default async function LeadsPage() {
  const leads = await getPipelineLeads();
  return <LeadsWorkspace leads={leads} />;
}
