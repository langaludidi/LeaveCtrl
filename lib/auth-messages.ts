export function signInErrorMessage(message: string) {
  const normalised = message.toLowerCase();

  if (normalised.includes("email") && normalised.includes("confirm")) {
    return "Confirm your email address before signing in.";
  }

  if (normalised.includes("rate") || normalised.includes("too many")) {
    return "Too many sign-in attempts. Please try again shortly.";
  }

  return "Email or password is incorrect.";
}

export function signUpErrorMessage(message: string) {
  const normalised = message.toLowerCase();

  if (
    normalised.includes("password") &&
    (normalised.includes("weak") ||
      normalised.includes("pwned") ||
      normalised.includes("compromised"))
  ) {
    return "Choose a stronger password that you have not used elsewhere.";
  }

  if (normalised.includes("rate") || normalised.includes("too many")) {
    return "Too many account requests. Please try again shortly.";
  }

  return "We could not create the account. Please check the details and try again.";
}
