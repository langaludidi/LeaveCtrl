import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BookLeaveForm } from "@/components/BookLeaveForm";
import { ToilRequestForm } from "@/components/ToilRequestForm";
import { getCurrentContext, roleLabel } from "@/lib/current-context";

export default async function BookLeavePage() {
  const { supabase, employee, displayName, roles } = await getCurrentContext();
  if (!employee) return null;

  const [{ data: leaveTypes }, { data: balances }, { data: toilBalance }] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, name, code")
      .eq("organisation_id", employee.organisation_id)
      .eq("active", true)
      .order("name"),
    supabase
      .from("leave_balances")
      .select("leave_type_id, available_balance")
      .eq("employee_id", employee.id),
    supabase
      .from("toil_balances")
      .select("available_hours")
      .eq("employee_id", employee.id)
      .maybeSingle(),
  ]);

  const activeTypes = leaveTypes ?? [];
  const balancesByType = Object.fromEntries(
    (balances ?? []).map((row) => [
      row.leave_type_id ?? "",
      Number(row.available_balance ?? 0),
    ])
  );
  const availableToilHours = Number(toilBalance?.available_hours ?? 0);

  return (
    <AppShell displayName={displayName} role={roleLabel(roles)}>
      <section className="page-head">
        <Link className="back-link" href="/">← Back to Home</Link>
        <h1>Book Leave</h1>
        <p>
          Submit annual or other configured leave, or use earned TOIL when you have a
          positive TOIL balance.
        </p>
      </section>

      {activeTypes.length ? (
        <BookLeaveForm leaveTypes={activeTypes} balancesByType={balancesByType} />
      ) : (
        <section className="card empty-state-card">
          <h2>Leave policy setup is not complete</h2>
          <p>Your organisation needs at least one active leave type and entitlement before a request can be submitted.</p>
          <Link href="/setup" className="btn primary">Complete setup</Link>
        </section>
      )}

      <ToilRequestForm availableHours={availableToilHours} />
    </AppShell>
  );
}
