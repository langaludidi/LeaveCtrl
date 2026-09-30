export type EmailVerificationUser = {
  id?: string | null;
  email_confirmed_at?: string | null;
  confirmation_sent_at?: string | null;
  invited_at?: string | null;
};

export function hasVerifiedEmailOwnership(
  user: EmailVerificationUser | null | undefined
) {
  if (!user) return false;

  // For LeaveCtrl email identities, confirmation evidence must show both that
  // Supabase sent a native confirmation/invitation challenge and that the
  // identity later became confirmed. This intentionally fails closed if Auth
  // is accidentally configured to auto-confirm new email/password signups.
  return Boolean(
    user.email_confirmed_at &&
      (user.confirmation_sent_at || user.invited_at)
  );
}
