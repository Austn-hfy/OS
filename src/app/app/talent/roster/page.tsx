import { redirect } from "next/navigation";

export default async function CompanyRosterPage() {
  redirect("/app/talent?mode=hfy");
}
