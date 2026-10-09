"use client";

import { useCallback } from "react";

export function PrintReportButton() {
  const print = useCallback(() => window.print(), []);
  return <button type="button" className="btn secondary" onClick={print}>Print / Save PDF</button>;
}
