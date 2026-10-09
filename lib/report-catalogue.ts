export type ReportReadiness = "available" | "partial" | "requires-data";
export type ReportAudience = "employee" | "manager" | "hr" | "payroll" | "executive";
export type ReportDefinition = {
  id: number;
  title: string;
  category: string;
  readiness: ReportReadiness;
  audiences: readonly ReportAudience[];
  note: string;
};
export const reportCatalogue: readonly ReportDefinition[] = [
  { id: 1, title: "Employee Leave Balance", category: "Balances", readiness: "partial", audiences: ["employee","manager","hr"], note: "Current annual balances and pending requests exist; accrual and carry-forward need ledger reconciliation." },
  { id: 2, title: "Leave History", category: "Balances", readiness: "partial", audiences: ["employee","manager","hr"], note: "Request records exist; complete approver and decision histories require validation." },
  { id: 3, title: "Leave Liability", category: "Finance", readiness: "available", audiences: ["hr","payroll","executive"], note: "Estimated liability and remuneration-based calculations already appear in Reports; verify missing remuneration." },
  { id: 4, title: "Leave Calendar", category: "Planning", readiness: "partial", audiences: ["employee","manager","hr"], note: "Calendar exists; report-period and department exports remain to be added." },
  { id: 5, title: "Department Leave Summary", category: "Planning", readiness: "partial", audiences: ["manager","hr","executive"], note: "Department and leave data exist; historical aggregation needs implementation." },
  { id: 6, title: "Leave Usage Analysis", category: "Analytics", readiness: "partial", audiences: ["manager","hr","executive"], note: "Approved request data exists; reporting must distinguish requested from actually taken days." },
  { id: 7, title: "Leave Type Breakdown", category: "Analytics", readiness: "partial", audiences: ["manager","hr","executive"], note: "Configured leave types exist; per-type usage aggregation needs implementation." },
  { id: 8, title: "Sick Leave", category: "Compliance", readiness: "partial", audiences: ["hr"], note: "Sensitive medical evidence must never be exposed through broad reporting roles." },
  { id: 9, title: "Pending Leave Requests", category: "Governance", readiness: "partial", audiences: ["manager","hr"], note: "Pending status exists; approval age, assignment and escalation need validation." },
  { id: 10, title: "Leave Rejections", category: "Governance", readiness: "partial", audiences: ["manager","hr"], note: "Rejection reasons and decision history require source verification." },
  { id: 11, title: "Attendance vs Leave", category: "Compliance", readiness: "requires-data", audiences: ["manager","hr","payroll"], note: "Actual attendance and unauthorised absence data cannot be inferred from leave requests." },
  { id: 12, title: "Leave Forecast", category: "Planning", readiness: "partial", audiences: ["manager","hr","executive"], note: "Future approved and pending leave can inform a forecast; predictions must be labelled." },
  { id: 13, title: "Leave Compliance", category: "Compliance", readiness: "partial", audiences: ["hr","executive"], note: "Requires effective-dated South African policy rules and validated leave ledger." },
  { id: 14, title: "Leave Encashment", category: "Finance", readiness: "requires-data", audiences: ["hr","payroll"], note: "Use actual approved payouts and payroll values, not inferred liability." },
  { id: 15, title: "Public Holiday Impact", category: "Planning", readiness: "partial", audiences: ["manager","hr","executive"], note: "Holiday calendar exists; impact calculations need implementation." },
  { id: 16, title: "Absenteeism", category: "Compliance", readiness: "requires-data", audiences: ["hr","executive"], note: "Requires verified absence events; never label sick leave as abuse." },
  { id: 17, title: "Approval Performance", category: "Governance", readiness: "partial", audiences: ["manager","hr","executive"], note: "Approval-event timestamps and delegation must be verified for reliable turnaround." },
  { id: 18, title: "Executive Dashboard", category: "Finance", readiness: "partial", audiences: ["executive"], note: "Combine validated workforce, leave and financial metrics with explicit coverage gaps." },
] as const;
