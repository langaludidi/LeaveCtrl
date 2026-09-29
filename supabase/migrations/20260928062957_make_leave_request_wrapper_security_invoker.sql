-- submit_leave_request is only a compatibility wrapper around the governed v2 RPC.
-- It does not need elevated privileges of its own.
alter function public.submit_leave_request(uuid,date,date,text) security invoker;
revoke all on function public.submit_leave_request(uuid,date,date,text) from public, anon;
grant execute on function public.submit_leave_request(uuid,date,date,text) to authenticated, service_role;
