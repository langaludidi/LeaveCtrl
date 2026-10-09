import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { annualLeaveLiabilityByEmployee, readAllReportRows } from "@/lib/leave-liability";

type AnnualBalance = Pick<Database["public"]["Views"]["leave_balances"]["Row"],
  "employee_id" | "entitlement_id" | "available_balance">;

async function readIdBatches<T>(ids: string[], read: (batch: string[]) => Promise<T[]>) {
  const rows: T[] = [];
  // Bound PostgREST URL length as well as response size.
  for (let offset = 0; offset < ids.length; offset += 100) {
    rows.push(...await read(ids.slice(offset, offset + 100)));
  }
  return rows;
}

export async function loadAnnualLeaveLiability(
  supabase: SupabaseClient<Database>,
  balances: AnnualBalance[],
  annualLeaveTypeId: string | undefined,
  businessDate: string,
) {
  if (!annualLeaveTypeId || !balances.length) return new Map<string, number>();
  const entitlementIds = balances.flatMap((balance) => balance.entitlement_id ? [balance.entitlement_id] : []);
  if (!entitlementIds.length) return new Map<string, number>();

  // Do not use the year-to-date activity query to establish outstanding liability.
  // The current entitlement's ledger is the owner of reservations in its balance.
  const ledger = await readIdBatches(entitlementIds, (batch) => readAllReportRows((from, to) => supabase
    .from("leave_ledger_entries")
    .select("entitlement_id, request_id, quantity")
    .in("entitlement_id", batch)
    .not("request_id", "is", null).order("id").range(from, to)));
  const requestIds = [...new Set(ledger.flatMap((entry) => entry.request_id ? [entry.request_id] : []))];
  const [requests, days] = requestIds.length ? await Promise.all([
    readIdBatches(requestIds, (batch) => readAllReportRows((from, to) => supabase.from("leave_requests")
      .select("id, employee_id, leave_type_id, status")
      .in("id", batch).eq("leave_type_id", annualLeaveTypeId)
      .order("id").range(from, to))),
    readIdBatches(requestIds, (batch) => readAllReportRows((from, to) => supabase.from("leave_request_days")
      .select("request_id, leave_date, chargeable_quantity")
      .in("request_id", batch).gt("leave_date", businessDate)
      .order("id").range(from, to))),
  ]) : [[], []];
  return annualLeaveLiabilityByEmployee({
    balances, ledger, requests, days, annualLeaveTypeId, businessDate,
  });
}
