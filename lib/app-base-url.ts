export const CANONICAL_PRODUCTION_APP_URL = "https://www.leavectrl.co.za";

type AppBaseUrlInput = {
  configuredUrl?: string | null;
  requestOrigin?: string | null;
  vercelEnv?: string | null;
  production?: boolean;
  previewAuthEnabled?: boolean;
};

type EmailAuthAvailabilityInput = {
  vercelEnv?: string | null;
  previewAuthEnabled?: boolean;
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

function isLocalDevelopmentOrigin(value: string) {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function isVercelPreviewOrigin(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}

export function isPreviewEmailAuthEnabled(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function canInitiateEmailAuth({
  vercelEnv,
  previewAuthEnabled = false,
}: EmailAuthAvailabilityInput) {
  return vercelEnv !== "preview" || previewAuthEnabled;
}

export function resolveAppBaseUrl({
  configuredUrl,
  requestOrigin,
  vercelEnv,
  production = false,
  previewAuthEnabled = false,
}: AppBaseUrlInput) {
  const configured = normaliseHttpUrl(configuredUrl);
  const origin = normaliseHttpUrl(requestOrigin);

  // Production authentication is deterministic. Neither a stale environment
  // variable nor a Vercel alias may move a customer away from the canonical app.
  if (vercelEnv === "production") {
    return CANONICAL_PRODUCTION_APP_URL;
  }

  // Preview auth email flows are disabled by default. If they are deliberately
  // enabled, the flow must stay on the exact Vercel preview origin where PKCE
  // started so its verifier cookie remains available for the callback exchange.
  if (vercelEnv === "preview") {
    if (previewAuthEnabled && origin && isVercelPreviewOrigin(origin)) {
      return origin;
    }
    return CANONICAL_PRODUCTION_APP_URL;
  }

  // Non-Vercel production is still pinned to the canonical customer domain.
  if (production) {
    return CANONICAL_PRODUCTION_APP_URL;
  }

  // Local development should remain local even when a canonical production URL
  // is present in the environment.
  if (origin && isLocalDevelopmentOrigin(origin)) return origin;
  if (configured && isLocalDevelopmentOrigin(configured)) return configured;

  return configured ?? origin;
}

export function authCallbackOriginAllowed({
  configuredUrl,
  requestOrigin,
  vercelEnv,
  production = false,
  previewAuthEnabled = false,
}: AppBaseUrlInput) {
  const origin = normaliseHttpUrl(requestOrigin);
  if (!origin) return false;

  if (vercelEnv === "production") {
    return origin === CANONICAL_PRODUCTION_APP_URL;
  }

  if (vercelEnv === "preview") {
    return previewAuthEnabled && isVercelPreviewOrigin(origin);
  }

  if (production) {
    return origin === CANONICAL_PRODUCTION_APP_URL;
  }

  const configured = normaliseHttpUrl(configuredUrl);
  return (
    isLocalDevelopmentOrigin(origin) ||
    (!!configured && origin === configured)
  );
}
