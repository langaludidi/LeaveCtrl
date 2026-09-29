export function safeCsvCell(value: string | number) {
  const original = String(value ?? "");
  const text =
    typeof value === "string" && /^[=+\-@]/.test(original.trimStart())
      ? `'${original}`
      : original;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
