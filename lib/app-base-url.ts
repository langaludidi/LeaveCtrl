type AppBaseUrlInput = {
  configuredUrl?: string | null;
  vercelProductionUrl?: string | null;
  requestOrigin?: string | null;
  production?: boolean;
};

function normaliseHttpUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function resolveAppBaseUrl({
  configuredUrl,
  vercelProductionUrl,
  requestOrigin,
  production = false,
}: AppBaseUrlInput) {
  const configured = normaliseHttpUrl(configuredUrl);
  if (configured) return configured;

  const vercelProduction = normaliseHttpUrl(vercelProductionUrl);
  if (vercelProduction) return vercelProduction;

  // Request headers are useful for localhost/dev previews, but must not determine
  // production email redirects because they are request-controlled input.
  if (!production) return normaliseHttpUrl(requestOrigin);

  return undefined;
}
