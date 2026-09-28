-- LeaveCtrl has no unauthenticated Data API surface. Authentication pages use
-- Supabase Auth directly; workforce data starts only after an authenticated session.

revoke select
on all tables in schema public
from anon;
