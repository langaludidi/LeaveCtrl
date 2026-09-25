import { AppShell } from "@/components/AppShell";

export default function RequestsPage() {
  return <AppShell>
    <section className="page-head">
      <h1>Requests</h1>
      <p>One place for your requests and manager approval work.</p>
    </section>
    <section className="card" style={{padding:24}}>
      <h2>My Work</h2>
      <p style={{color:"#64748b",fontSize:13,lineHeight:1.6}}>The persistent workflow inbox will separate action-required tasks from ordinary notifications.</p>
    </section>
  </AppShell>;
}
