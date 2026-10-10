/** These routes enforce their own machine authorization or are public entry points. */
export function bypassesSessionAuthentication(pathname: string) {
  return pathname === "/api/billing/webhook" ||
    pathname === "/api/cron/database-backup" || pathname === "/subscribe";
}

export function cronAuthorizationMatches(authorization: string | null, configuredSecret?: string) {
  const secret = configuredSecret?.trim();
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
