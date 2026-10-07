export async function retrySubscriptionLinkAfterPaymentRace<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  delays = [250, 750, 1500],
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null;

      if (
        code !== "subscription_requires_verified_payment" ||
        attempt >= delays.length
      )
        throw error;

      await wait(delays[attempt]);
    }
  }
}
