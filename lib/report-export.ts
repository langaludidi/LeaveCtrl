import { safeCsvCell } from "./csv-export";

export type ReportExportMetadata = {
  reportTitle: string;
  organisationName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  reference: string;
  filters?: Record<string, string>;
  classification?: "Internal" | "Confidential" | "Restricted";
  dataCutoff?: string;
};

export const REPORT_BRAND = "LeaveCtrl";
export const REPORT_TAGLINE = "Leave & Workforce Availability";
export const REPORT_TIME_ZONE = "Africa/Johannesburg";

export function reportTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid report timestamp");
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: REPORT_TIME_ZONE,
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date) + " SAST";
}

export function reportReference(isoDate: string, identifier: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid report timestamp");
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date).replace(/\D/g, "");
  const suffix = identifier.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48);
  if (!suffix) throw new Error("Report identifier required");
  return `LC-RPT-${stamp}-${suffix}`;
}

/** CSV cannot embed a logo. Its header carries the same brand and provenance as visual exports. */
export function reportCsv(
  metadata: ReportExportMetadata,
  headings: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const fields: (readonly (string | number)[])[] = [
    [REPORT_BRAND, REPORT_TAGLINE],
    ["Report", metadata.reportTitle],
    ["Organisation", metadata.organisationName],
    ["Reporting period", `${metadata.periodStart} to ${metadata.periodEnd}`],
    ["Generated", reportTimestamp(metadata.generatedAt)],
    ["Reference", metadata.reference],
    ["Classification", metadata.classification ?? "Internal"],
    ...(metadata.dataCutoff ? [["Data cut-off", metadata.dataCutoff]] : []),
    ...Object.entries(metadata.filters ?? {}).map(([key, value]) => [`Filter: ${key}`, value]),
    [],
    headings,
    ...rows,
  ];
  return "\uFEFF" + fields.map((row) => row.map(safeCsvCell).join(",")).join("\r\n") + "\r\n";
}
