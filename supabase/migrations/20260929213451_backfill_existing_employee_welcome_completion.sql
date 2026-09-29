-- Existing linked users must not be forced through the new invited-employee welcome.
update public.employees
set welcome_completed_at = coalesce(welcome_completed_at, now())
where user_id is not null;
