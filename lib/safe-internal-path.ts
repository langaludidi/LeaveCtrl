const INTERNAL_BASE = "https://leavectrl.invalid";

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/"
) {
  if (!value || !value.startsWith("/") || /[\\\r\n]/.test(value)) {
    return fallback;
  }

  try {
    const target = new URL(value, INTERNAL_BASE);
    if (target.origin !== INTERNAL_BASE) return fallback;

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
