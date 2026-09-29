export type PasswordPolicyResult = {
  valid: boolean;
  message: string;
};

export function validatePassword(password: string): PasswordPolicyResult {
  if (password.length < 12) {
    return {
      valid: false,
      message: "Use at least 12 characters.",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Add at least one lowercase letter.",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Add at least one uppercase letter.",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Add at least one number.",
    };
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      valid: false,
      message: "Add at least one symbol.",
    };
  }

  return {
    valid: true,
    message: "",
  };
}
