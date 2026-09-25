import { AppShell } from "@/components/AppShell";

export default function TeamPage() {
  return <AppShell>
    <section className="page-head">
      <h1>Team</h1>
      <p>People, reporting lines, schedules and operational availability.</p>
    </section>
    <section className="card" style={{padding:24}}>
      <h2>Team availability</h2>
      <p style={{color:"#64748b",fontSize:13,lineHeight:1.6}}>This area will surface coverage, capability constraints and manager relationships without turning LeaveCtrl into a full HRIS.</p>
    </section>
  </AppShell>;
}
