type AnnualBalance = {
  employee_id: string | null;
  entitlement_id: string | null;
  available_balance: number | null;
};

type Request = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  status: string;
};

type LedgerEntry = {
  entitlement_id: string | null;
  request_id: string | null;
  quantity: number;
};

type RequestDay = {
  request_id: string;
  leave_date: string;
  chargeable_quantity: number;
};

/** Add back only outstanding annual reservations charged to the current balance. */
export function annualLeaveLiabilityByEmployee({
  balances, requests, ledger, days, annualLeaveTypeId, businessDate,
}: {
  balances: AnnualBalance[];
  requests: Request[];
  ledger: LedgerEntry[];
  days: RequestDay[];
  annualLeaveTypeId: string;
  businessDate: string;
}) {
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const netByEntitlement = new Map<string, Map<string, number>>();
  for (const entry of ledger) {
    if (!entry.request_id || !entry.entitlement_id) continue;
    const net = netByEntitlement.get(entry.entitlement_id) ?? new Map<string, number>();
    net.set(entry.request_id, (net.get(entry.request_id) ?? 0) + Number(entry.quantity));
    netByEntitlement.set(entry.entitlement_id, net);
  }

  const futureDays = new Map<string, number>();
  for (const day of days) {
    if (day.leave_date <= businessDate) continue;
    futureDays.set(day.request_id,
      (futureDays.get(day.request_id) ?? 0) + Number(day.chargeable_quantity));
  }

  const result = new Map<string, number>();
  for (const balance of balances) {
    if (!balance.employee_id || !balance.entitlement_id) continue;
    let liability = Number(balance.available_balance ?? 0);
    for (const [requestId, net] of netByEntitlement.get(balance.entitlement_id) ?? []) {
      const request = requestById.get(requestId);
      if (!request || request.employee_id !== balance.employee_id ||
          request.leave_type_id !== annualLeaveTypeId) continue;
      const reserved = Math.max(0, -net);
      if (request.status === "pending_approval" || request.status === "submitted") {
        liability += reserved;
      } else if (request.status === "approved" || request.status === "cancellation_requested") {
        liability += Math.min(reserved, futureDays.get(requestId) ?? 0);
      }
    }
    result.set(balance.employee_id, Math.max(0, liability));
  }
  return result;
}

/** Financial totals must not stop at the Data API's first result page. */
export async function readAllReportRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await page(from, from + pageSize - 1);
    if (result.error) throw new Error("Annual leave liability source unavailable");
    const current = result.data ?? [];
    rows.push(...current);
    if (current.length < pageSize) return rows;
  }
}
