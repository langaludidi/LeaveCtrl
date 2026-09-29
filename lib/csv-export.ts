export function safeCsvCell(value: string | number) {
  const original = String(value ?? "");
  const text = /^[=+\-@]/.test(original.trimStart())
    ? `'${original}`
    : original;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
