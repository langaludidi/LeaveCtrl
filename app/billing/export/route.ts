import { billingIdentity, BillingError } from "@/lib/billing/server";
import { billingFailure } from "@/lib/billing/http";
export const dynamic = "force-dynamic";
function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function GET() {
  try {
    const { supabase, orgId } = await billingIdentity();
    let rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("billing_payments")
        .select(
          "reference,price_id,amount,currency,paid_at,period_end,refunded_amount,disputed",
        )
        .eq("organisation_id", orgId)
        .order("paid_at", { ascending: false })
        .order("reference")
        .range(offset, offset + 499);
      if (error) throw new BillingError("payment_history_unavailable", 503);
      rows.push(...(data ?? []));
      if (!data || data.length < 500) break;
      if (offset >= 99500)
        throw new BillingError("export_requires_support", 413);
    }
    const fields = [
      "reference",
      "price_id",
      "amount",
      "currency",
      "paid_at",
      "period_end",
      "refunded_amount",
      "disputed",
    ];
    return new Response(
      [
        fields.join(","),
        ...rows.map((row) => fields.map((key) => csv(row[key])).join(",")),
      ].join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=leavectrl-payments.csv",
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch (e) {
    return billingFailure(e);
  }
}
