import { AppShell } from "@/components/AppShell";

export default function ReportsPage() {
  return <AppShell>
    <section className="page-head">
      <h1>Reports</h1>
      <p>Leave utilisation, balances, coverage and compliance-oriented operational reporting.</p>
    </section>
    <section className="card" style={{padding:24}}>
      <h2>Reporting foundation</h2>
      <p style={{color:"#64748b",fontSize:13,lineHeight:1.6}}>Exports and financial leave-liability views will be added after the authoritative ledger is in place.</p>
    </section>
  </AppShell>;
}
