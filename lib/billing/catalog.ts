export const BILLING_PLANS = [
  {
    code: "starter",
    name: "Starter",
    maxEmployees: 15,
    monthly: 24900,
    annual: 249000,
  },
  {
    code: "team",
    name: "Team",
    maxEmployees: 50,
    monthly: 59900,
    annual: 599000,
  },
  {
    code: "business",
    name: "Business",
    maxEmployees: 150,
    monthly: 129900,
    annual: 1299000,
  },
  {
    code: "organisation",
    name: "Organisation",
    maxEmployees: 300,
    monthly: 219900,
    annual: 2199000,
  },
] as const;

export type BillingPeriod = "monthly" | "annual";
export const CORE_FEATURES = [
  "leave",
  "policy",
  "coverage",
  "reporting",
] as const;

export function selectedPrice(plan: unknown, interval: unknown) {
  const found = BILLING_PLANS.find((p) => p.code === plan);
  if (!found || (interval !== "monthly" && interval !== "annual")) return null;
  return {
    ...found,
    interval,
    priceId: `${found.code}_${interval}_v1`,
    amount: found[interval],
  };
}

export const zar = (cents: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );

export type BillingSummary = {
  organisation_id: string;
  state: "trial" | "active" | "read_only";
  can_write: boolean;
  plan_name: string;
  plan_code: string | null;
  price_id: string | null;
  interval: BillingPeriod | null;
  employee_limit: number;
  active_employees: number;
  features: string[];
  access_until: string | null;
  paid_until: string | null;
  trial_until: string;
  can_manage: boolean;
  provider_status: string | null;
  has_subscription: boolean;
};
