-- Active statutory parental leave categories belong in the employee catalogue.
-- Event-based categories remain protected by the existing request guard; manual-allocation
-- parental leave remains unusable until HR records the applicable entitlement.
update public.leave_types
set employee_visible = true,
    updated_at = now()
where active = true
  and is_statutory = true
  and category = 'parental'
  and code in ('MATERNITY','PARENTAL','ADOPTION','COMMISSIONING_PARENTAL');
