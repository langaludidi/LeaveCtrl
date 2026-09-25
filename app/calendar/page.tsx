import { AppShell } from "@/components/AppShell";

export default function CalendarPage() {
  return <AppShell>
    <section className="page-head">
      <h1>Calendar</h1>
      <p>Team and personal leave visibility will be connected to the leave ledger in the next slice.</p>
    </section>
    <section className="card" style={{padding:24}}>
      <h2>Calendar foundation</h2>
      <p style={{color:"#64748b",fontSize:13,lineHeight:1.6}}>Approved leave, public holidays, working schedules and privacy-aware team availability will project into this view.</p>
    </section>
  </AppShell>;
}
