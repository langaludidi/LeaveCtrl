export const CANONICAL_PRODUCTION_APP_URL = "https://www.leavectrl.co.za";

type AppBaseUrlInput = {
  configuredUrl?: string | null;
  requestOrigin?: string | null;
  vercelEnv?: string | null;
  production?: boolean;
  previewAuthEnabled?: boolean;
};

type EmailAuthAvailabilityInput = {
  requestOrigin?: string | null;
  vercelEnv?: string | null;
  production?: boolean;
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
  requestOrigin,
  vercelEnv,
  production = false,
  previewAuthEnabled = false,
}: EmailAuthAvailabilityInput) {
  const origin = normaliseHttpUrl(requestOrigin);

  // A production PKCE flow must start on the same canonical origin that will
  // receive and exchange the one-time code. Vercel aliases are not accepted.
  if (vercelEnv === "production" || (production && vercelEnv !== "preview")) {
    return origin === CANONICAL_PRODUCTION_APP_URL;
  }

  // Preview auth email flows are opt-in and stay on the exact preview origin.
  if (vercelEnv === "preview") {
    return (
      previewAuthEnabled &&
      !!origin &&
      isVercelPreviewOrigin(origin)
    );
  }

  // Development email auth is local-only.
  return !!origin && isLocalDevelopmentOrigin(origin);
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

  if (vercelEnv === "production") {
    return CANONICAL_PRODUCTION_APP_URL;
  }

  if (vercelEnv === "preview") {
    if (previewAuthEnabled && origin && isVercelPreviewOrigin(origin)) {
      return origin;
    }
    return CANONICAL_PRODUCTION_APP_URL;
  }

  if (production) {
    return CANONICAL_PRODUCTION_APP_URL;
  }

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
