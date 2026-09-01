import { getCompanyRosterData } from "@/data/internal";
import { CompanyRoster } from "./company-roster";

export default async function CompanyRosterPage() {
  const { artists, residencies } = await getCompanyRosterData();
  return <>
    <header className="page-header"><div><p className="eyebrow">Scheduling roster</p><h1>Roster</h1><p className="subhead">Assign artists to the Residency rosters where they should appear for new bookings. Shared artists may be assigned to more than one Residency; exclusive artists may only be assigned to their exclusive Residency.</p></div></header>
    <CompanyRoster artists={artists} residencies={residencies} />
  </>;
}
