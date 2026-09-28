-- LeaveCtrl V1 routes application mutations through governed RPCs so that
-- authorization, ledger changes and audit events remain atomic. Remove generic
-- Data API write privileges from signed-in and anonymous clients. Notifications
-- keep the one intentional direct write: marking a user's own item as read.

revoke insert, update, delete, truncate, references, trigger
on all tables in schema public
from authenticated, anon;

grant update(read_at)
on public.notifications
to authenticated;
