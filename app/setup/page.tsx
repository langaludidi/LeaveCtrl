import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { InitialPolicyForm } from "@/components/InitialPolicyForm";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

export default async function SetupPage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const { data: annualType } = await supabase
    .from("leave_types")
    .select("id")
    .eq("organisation_id", employee.organisation_id)
    .eq("code", "ANNUAL")
    .maybeSingle();

  let existingDays = 15;
  if (annualType) {
    const { data: policy } = await supabase
      .from("leave_policy_versions")
      .select("entitlement_amount")
      .eq("organisation_id", employee.organisation_id)
      .eq("leave_type_id", annualType.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    existingDays = Number(policy?.entitlement_amount ?? 15);
  }

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head setup-head">
        <Link className="back-link" href="/">← Back to Home</Link>
        <div className="split">
          <div>
            <h1>Organisation setup</h1>
            <p>Configure the first authoritative leave policy. More policy types and statutory rule packs will be added behind this same versioned model.</p>
          </div>
          <strong>Foundation setup</strong>
        </div>
      </section>

      <section className="setup-grid">
        <InitialPolicyForm existingDays={existingDays}/>

        <aside className="setup-side">
          <div className="card progress-card">
            <div className="ring">1 <small>of 1</small></div>
            <div>
              <h3>Ready for the first workflow</h3>
              <p>Once this policy is saved, you can submit a real leave request against the ledger.</p>
            </div>
          </div>

          <div className="card info-card">
            <InfoIcon/>
            <div>
              <h3>What happens next?</h3>
              <p>LeaveCtrl creates the leave type, policy version, entitlement and opening ledger entry as one governed transaction.</p>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function InfoIcon() {
  return <span className="summary-icon">i</span>;
}
