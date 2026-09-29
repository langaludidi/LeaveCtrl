"use client";

import { FormEvent, useMemo, useState } from "react";
import { Baby, Plus, Scale, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Person = { id: string; name: string };
type LeaveTypePolicy = {
  id: string;
  code: string;
  name: string;
  isStatutory: boolean;
  entitlementMethod: string;
  entitlementAmount: number | null;
  cycleMonths: number | null;
  cycleBasis: string;
};

const methodLabels: Record<string, string> = {
  statutory_annual_schedule_floor: "Schedule-aware statutory floor",
  statutory_sick: "Six-week / 36-month statutory cycle",
  statutory_family_responsibility: "Eligibility-aware annual entitlement",
  manual_allocation: "HR event allocation",
  no_balance: "No balance required",
  fixed_days: "Employer-defined fixed entitlement",
};

export function LeavePolicyControls({
  people,
  leaveTypes,
  businessDate,
}: {
  people: Person[];
  leaveTypes: LeaveTypePolicy[];
  businessDate: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const builtIns = useMemo(
    () =>
      leaveTypes.filter((type) =>
        ["ANNUAL", "SICK", "FAMILY_RESPONSIBILITY", "PARENTAL_INTERIM", "UNPAID"].includes(type.code)
      ),
    [leaveTypes]
  );

  const employerDefined = useMemo(
    () =>
      leaveTypes.filter(
        (type) =>
          !type.isStatutory &&
          !["UNPAID"].includes(type.code)
      ),
    [leaveTypes]
  );

  const openingBalanceTypes = useMemo(
    () =>
      leaveTypes.filter(
        (type) =>
          type.code === "ANNUAL" ||
          (!type.isStatutory && type.entitlementMethod === "fixed_days")
      ),
    [leaveTypes]
  );

  async function createEmployerLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("employer-leave");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("configure_employer_leave_type", {
      p_code: String(form.get("code") ?? "").trim(),
      p_name: String(form.get("name") ?? "").trim(),
      p_entitlement_days: Number(form.get("days") ?? 0),
      p_cycle_basis: String(form.get("cycle_basis") ?? "employment_anniversary"),
      p_cycle_months: Number(form.get("cycle_months") ?? 12),
      p_colour_token: String(form.get("colour") ?? "slate"),
      p_effective_from: businessDate,
    });

    setSaving("");
    if (rpcError) {
      const friendly: Record<string, string> = {
        reserved_leave_type_code: "That code is reserved for a built-in LeaveCtrl leave type.",
        invalid_leave_type_code: "Use a short code with letters, numbers or underscores.",
        leave_type_name_required: "Enter a leave type name.",
        invalid_entitlement_days: "Enter an entitlement between 0 and 366 days.",
      };
      setError(friendly[rpcError.message] ?? "The employer leave type could not be saved.");
      return;
    }

    event.currentTarget.reset();
    setNotice("Employer leave type saved and provisioned for active employees.");
    router.refresh();
  }

  async function setOpeningBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("opening-balance");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employee") ?? "");
    const leaveTypeCode = String(form.get("leaveType") ?? "");
    const balance = Number(form.get("balance") ?? 0);
    const reason = String(form.get("reason") ?? "").trim();

    if (!employeeId || !leaveTypeCode || !Number.isFinite(balance) || reason.length < 3) {
      setSaving("");
      setError("Select an employee and leave type, enter the opening position and record the reason.");
      return;
    }

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("set_employee_opening_balance", {
      p_employee_id: employeeId,
      p_leave_type_code: leaveTypeCode,
      p_balance: balance,
      p_reason: reason,
    });

    setSaving("");
    if (rpcError) {
      setError("The opening leave position could not be saved.");
      return;
    }

    event.currentTarget.reset();
    setNotice(`Opening leave position saved. Current balance: ${Number(data ?? balance)} days.`);
    router.refresh();
  }

  async function adjustParentalAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("parental-allocation");
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const employeeId = String(form.get("employee") ?? "");
    const adjustment = Number(form.get("adjustment") ?? 0);
    const reason = String(form.get("reason") ?? "").trim();

    if (!employeeId || !adjustment || reason.length < 3) {
      setSaving("");
      setError("Select an employee, enter a non-zero day adjustment and record the allocation reason.");
      return;
    }

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("adjust_manual_leave_allocation", {
      p_employee_id: employeeId,
      p_leave_type_code: "PARENTAL_INTERIM",
      p_adjustment: adjustment,
      p_reason: reason,
    });

    setSaving("");
    if (rpcError) {
      setError("The parental leave allocation could not be adjusted.");
      return;
    }

    event.currentTarget.reset();
    setNotice(`Parental leave allocation updated. Available balance: ${Number(data ?? 0)} days.`);
    router.refresh();
  }

  return (
    <section className="leave-policy-controls">
      {error ? <div className="auth-alert error" role="alert">{error}</div> : null}
      {notice ? <div className="auth-alert success" role="status" aria-live="polite">{notice}</div> : null}

      <section className="card data-card">
        <div className="card-title">
          <div>
            <h2>Leave types & statutory engines</h2>
            <p className="card-subtitle">
              Built-in South African leave types are protected. Employer leave can be added without changing the statutory baseline.
            </p>
          </div>
          <Scale size={20}/>
        </div>
        <div className="leave-engine-grid">
          {builtIns.map((type) => (
            <div className="leave-engine-row" key={type.id}>
              <div>
                <strong>{type.name}</strong>
                <span>{type.code.replaceAll("_", " ")}</span>
              </div>
              <div>
                <strong>{methodLabels[type.entitlementMethod] ?? type.entitlementMethod.replaceAll("_", " ")}</strong>
                <span>
                  {type.entitlementMethod === "no_balance"
                    ? "Approval workflow without an entitlement balance"
                    : type.entitlementMethod === "manual_allocation"
                      ? "Balance becomes available after HR confirms the event allocation"
                      : type.entitlementAmount !== null
                        ? `${type.entitlementAmount} configured day${type.entitlementAmount === 1 ? "" : "s"} · ${type.cycleMonths ?? 12}-month cycle`
                        : `${type.cycleMonths ?? 12}-month governed cycle`}
                </span>
              </div>
              <span className={type.isStatutory ? "verified-pill" : "status-pill neutral"}>
                {type.isStatutory ? "Statutory" : "Operational"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="admin-two-col">
        <form className="card admin-mini-card" onSubmit={createEmployerLeave}>
          <div className="card-title">
            <div>
              <h2>Employer-defined leave</h2>
              <p className="card-subtitle">
                Add study, special, wellness, cultural or other policy leave. Statutory codes cannot be overridden.
              </p>
            </div>
            <Plus size={19}/>
          </div>

          <div className="field-row">
            <label>
              Leave name
              <input name="name" placeholder="Study Leave" required />
            </label>
            <label>
              Code
              <input name="code" placeholder="STUDY" required />
            </label>
          </div>

          <div className="field-row">
            <label>
              Entitlement
              <input name="days" type="number" min="0" max="366" step="0.5" defaultValue="5" required />
            </label>
            <label>
              Cycle months
              <input name="cycle_months" type="number" min="1" max="60" defaultValue="12" required />
            </label>
          </div>

          <label>
            Cycle basis
            <select className="native-field" name="cycle_basis" defaultValue="employment_anniversary">
              <option value="employment_anniversary">Employment anniversary</option>
              <option value="organisation_fixed">Organisation fixed</option>
            </select>
          </label>

          <label>
            Colour
            <select className="native-field" name="colour" defaultValue="slate">
              <option value="slate">Slate</option>
              <option value="teal">Teal</option>
              <option value="blue">Blue</option>
              <option value="amber">Amber</option>
              <option value="purple">Purple</option>
              <option value="rose">Rose</option>
            </select>
          </label>

          {employerDefined.length ? (
            <div className="configured-leave-list">
              <strong>Configured employer leave</strong>
              {employerDefined.map((type) => (
                <span key={type.id}>{type.name} · {type.entitlementAmount ?? 0} days</span>
              ))}
            </div>
          ) : null}

          <button className="btn primary" type="submit" disabled={saving === "employer-leave"}>
            {saving === "employer-leave" ? "Saving…" : "Add employer leave type"}
          </button>
        </form>

        <form className="card admin-mini-card" onSubmit={adjustParentalAllocation}>
          <div className="card-title">
            <div>
              <h2>Parental leave allocation</h2>
              <p className="card-subtitle">
                The current interim parental regime is event-based. HR records the employee&apos;s confirmed allocation rather than LeaveCtrl guessing the family split.
              </p>
            </div>
            <Baby size={19}/>
          </div>

          <label>
            Employee
            <select className="native-field" name="employee" required disabled={!people.length}>
              {!people.length ? (
                <option value="">No active employees available</option>
              ) : (
                <>
                  <option value="">Select employee</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </>
              )}
            </select>
          </label>

          <label>
            Adjustment in days
            <input
              name="adjustment"
              type="number"
              min="-366"
              max="366"
              step="0.5"
              placeholder="e.g. 30"
              required
            />
            <span className="field-help">Use a positive value to allocate leave and a negative value only to correct a prior allocation.</span>
          </label>

          <label>
            Allocation reason / case reference
            <textarea
              name="reason"
              maxLength={500}
              placeholder="Record the parental event and the allocation confirmed by HR."
              required
            />
          </label>

          <button className="btn primary" type="submit" disabled={saving === "parental-allocation" || !people.length}>
            {saving === "parental-allocation" ? "Saving…" : "Update parental allocation"}
          </button>
        </form>
      </div>

      <div className="admin-two-col opening-balance-row">
        <form className="card admin-mini-card" onSubmit={setOpeningBalance}>
          <div className="card-title">
            <div>
              <h2>Opening leave position</h2>
              <p className="card-subtitle">
                Record the employee&apos;s verified opening or migration balance. LeaveCtrl posts an auditable ledger adjustment.
              </p>
            </div>
            <WalletCards size={19}/>
          </div>

          <label>
            Employee
            <select className="native-field" name="employee" required disabled={!people.length}>
              <option value="">Select employee</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>

          <label>
            Leave type
            <select className="native-field" name="leaveType" required disabled={!openingBalanceTypes.length}>
              <option value="">Select leave type</option>
              {openingBalanceTypes.map((type) => (
                <option key={type.id} value={type.code}>{type.name}</option>
              ))}
            </select>
          </label>

          <label>
            Opening position in days
            <input name="balance" type="number" min="-366" max="366" step="0.5" required />
          </label>

          <label>
            Reason / migration reference
            <input name="reason" placeholder="Opening balance confirmed by HR" required />
          </label>

          <button
            className="btn primary"
            type="submit"
            disabled={saving === "opening-balance" || !people.length || !openingBalanceTypes.length}
          >
            {saving === "opening-balance" ? "Saving…" : "Save opening position"}
          </button>
        </form>
      </div>
    </section>
  );
}
