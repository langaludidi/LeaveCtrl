-- Enforce decision accountability at the database boundary.
-- UI validation is not the security boundary: direct RPC callers must also supply
-- meaningful context whenever they decline leave/TOIL or a cancellation request.

create or replace function private.require_decline_reason(p_decision text, p_note text)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if lower(btrim(coalesce(p_decision, ''))) = 'decline'
     and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'decline_reason_required';
  end if;
end;
$$;

revoke all on function private.require_decline_reason(text,text) from public, anon, authenticated;
grant execute on function private.require_decline_reason(text,text) to service_role;

create or replace function public.decide_leave_request(p_request_id uuid,p_decision text,p_note text default null)
returns public.leave_request_status language plpgsql security definer set search_path=public
as $$
declare v_user_id uuid:=auth.uid(); v_request public.leave_requests%rowtype; v_entitlement_id uuid; v_actor_employee_id uuid; v_authorised boolean:=false; v_new_status public.leave_request_status;
begin
 if v_user_id is null then raise exception 'authentication_required'; end if;
 perform private.require_decline_reason(p_decision,p_note);
 select * into v_request from public.leave_requests where id=p_request_id for update;
 if v_request.id is null then raise exception 'request_not_found'; end if;
 if v_request.status<>'pending_approval' then raise exception 'request_not_pending'; end if;
 select e.id into v_actor_employee_id from public.employees e where e.organisation_id=v_request.organisation_id and e.user_id=v_user_id and e.employment_status='active' limit 1;
 if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;
 v_authorised:=private.manages_employee(v_request.employee_id) or private.has_org_role(v_request.organisation_id,array['hr_admin'::public.member_role,'org_admin'::public.member_role]);
 if not v_authorised then raise exception 'not_authorised'; end if;
 if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;
 select id into v_entitlement_id from public.leave_entitlements where organisation_id=v_request.organisation_id and employee_id=v_request.employee_id and leave_type_id=v_request.leave_type_id and v_request.start_date between cycle_start and cycle_end order by cycle_start desc limit 1;
 insert into public.leave_ledger_entries(organisation_id,employee_id,leave_type_id,entitlement_id,request_id,entry_type,quantity,effective_date,reason,source_metadata,created_by) values(v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,v_request.start_date,'Release pending leave reservation',jsonb_build_object('decision',lower(p_decision)),v_user_id);
 if lower(p_decision)='approve' then v_new_status:='approved'; insert into public.leave_ledger_entries(organisation_id,employee_id,leave_type_id,entitlement_id,request_id,entry_type,quantity,effective_date,reason,source_metadata,created_by) values(v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,v_entitlement_id,v_request.id,'leave_approved',-v_request.quantity,v_request.start_date,'Approved leave',jsonb_build_object('approved_by',v_user_id),v_user_id); else v_new_status:='declined'; end if;
 update public.leave_requests set status=v_new_status,decided_at=now(),decided_by=v_user_id,updated_at=now() where id=v_request.id;
 insert into public.approval_actions(organisation_id,request_id,actor_user_id,action,note) values(v_request.organisation_id,v_request.id,v_user_id,case when v_new_status='approved' then 'approved'::public.approval_action_type else 'declined'::public.approval_action_type end,nullif(btrim(p_note),''));
 insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload) values(v_request.organisation_id,v_user_id,'leave_request',v_request.id,case when v_new_status='approved' then 'leave.request.approved' else 'leave.request.declined' end,jsonb_build_object('quantity',v_request.quantity,'note',nullif(btrim(p_note),'')));
 return v_new_status;
end;$$;

create or replace function public.decide_leave_cancellation(p_request_id uuid,p_decision text,p_note text default null)
returns public.leave_request_status language plpgsql security definer set search_path=public
as $$
declare v_user_id uuid:=auth.uid(); v_request public.leave_requests%rowtype; v_actor_employee_id uuid; v_entitlement_id uuid; v_authorised boolean:=false; v_new_status public.leave_request_status;
begin
 if v_user_id is null then raise exception 'authentication_required'; end if; perform private.require_decline_reason(p_decision,p_note);
 select * into v_request from public.leave_requests where id=p_request_id for update; if v_request.id is null then raise exception 'request_not_found'; end if; if v_request.status<>'cancellation_requested' then raise exception 'cancellation_not_pending'; end if;
 select e.id into v_actor_employee_id from public.employees e where e.organisation_id=v_request.organisation_id and e.user_id=v_user_id and e.employment_status='active' limit 1; if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;
 v_authorised:=private.manages_employee(v_request.employee_id) or private.has_org_role(v_request.organisation_id,array['hr_admin'::public.member_role,'org_admin'::public.member_role]); if not v_authorised then raise exception 'not_authorised'; end if; if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;
 if lower(p_decision)='approve' then select id into v_entitlement_id from public.leave_entitlements where organisation_id=v_request.organisation_id and employee_id=v_request.employee_id and leave_type_id=v_request.leave_type_id and v_request.start_date between cycle_start and cycle_end order by cycle_start desc limit 1; insert into public.leave_ledger_entries(organisation_id,employee_id,leave_type_id,entitlement_id,request_id,entry_type,quantity,effective_date,reason,source_metadata,created_by) values(v_request.organisation_id,v_request.employee_id,v_request.leave_type_id,v_entitlement_id,v_request.id,'leave_reversed',v_request.quantity,private.organisation_business_date(v_request.organisation_id),'Approved leave cancellation',jsonb_build_object('cancelled_by',v_user_id),v_user_id); v_new_status:='cancelled'; else v_new_status:='approved'; end if;
 update public.leave_requests set status=v_new_status,decided_at=now(),decided_by=v_user_id,updated_at=now() where id=v_request.id;
 insert into public.approval_actions(organisation_id,request_id,actor_user_id,action,note) values(v_request.organisation_id,v_request.id,v_user_id,case when v_new_status='cancelled' then 'cancel_approved'::public.approval_action_type else 'cancel_declined'::public.approval_action_type end,nullif(btrim(p_note),''));
 insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload) values(v_request.organisation_id,v_user_id,'leave_request',v_request.id,case when v_new_status='cancelled' then 'leave.cancellation.approved' else 'leave.cancellation.declined' end,jsonb_build_object('quantity',v_request.quantity,'note',nullif(btrim(p_note),''))); return v_new_status;
end;$$;

create or replace function public.decide_toil_request(p_request_id uuid,p_decision text,p_note text default null)
returns text language plpgsql security definer set search_path=public,private
as $$
declare v_user_id uuid:=auth.uid(); v_request public.toil_requests%rowtype; v_actor_employee_id uuid; v_authorised boolean:=false; v_status text;
begin
 if v_user_id is null then raise exception 'authentication_required'; end if; perform private.require_decline_reason(p_decision,p_note);
 select * into v_request from public.toil_requests where id=p_request_id for update; if v_request.id is null then raise exception 'request_not_found'; end if; if v_request.status<>'pending_approval' then raise exception 'request_not_pending'; end if;
 select id into v_actor_employee_id from public.employees where organisation_id=v_request.organisation_id and user_id=v_user_id and employment_status='active' limit 1; if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;
 v_authorised:=private.manages_employee(v_request.employee_id) or private.has_org_role(v_request.organisation_id,array['hr_admin'::public.member_role,'org_admin'::public.member_role]); if not v_authorised then raise exception 'not_authorised'; end if; if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;
 insert into public.toil_ledger_entries(organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by) values(v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,v_request.leave_date,'Release pending TOIL reservation',v_user_id);
 if lower(p_decision)='approve' then insert into public.toil_ledger_entries(organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by) values(v_request.organisation_id,v_request.employee_id,'used',-v_request.hours,v_request.leave_date,'Approved TOIL usage',v_user_id); v_status:='approved'; else v_status:='declined'; end if;
 update public.toil_requests set status=v_status,decided_at=now(),decided_by=v_user_id,updated_at=now() where id=v_request.id;
 insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload) values(v_request.organisation_id,v_user_id,'toil_request',v_request.id,case when v_status='approved' then 'toil.request.approved' else 'toil.request.declined' end,jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))); return v_status;
end;$$;

create or replace function public.decide_toil_cancellation(p_request_id uuid,p_decision text,p_note text default null)
returns text language plpgsql security definer set search_path=public,private
as $$
declare v_user_id uuid:=auth.uid(); v_request public.toil_requests%rowtype; v_actor_employee_id uuid; v_authorised boolean:=false; v_status text;
begin
 if v_user_id is null then raise exception 'authentication_required'; end if; perform private.require_decline_reason(p_decision,p_note);
 select * into v_request from public.toil_requests where id=p_request_id for update; if v_request.id is null then raise exception 'request_not_found'; end if; if v_request.status<>'cancellation_requested' then raise exception 'cancellation_not_pending'; end if;
 select id into v_actor_employee_id from public.employees where organisation_id=v_request.organisation_id and user_id=v_user_id and employment_status='active' limit 1; if v_actor_employee_id=v_request.employee_id then raise exception 'self_approval_not_allowed'; end if;
 v_authorised:=private.manages_employee(v_request.employee_id) or private.has_org_role(v_request.organisation_id,array['hr_admin'::public.member_role,'org_admin'::public.member_role]); if not v_authorised then raise exception 'not_authorised'; end if; if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;
 if lower(p_decision)='approve' then insert into public.toil_ledger_entries(organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by) values(v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,private.organisation_business_date(v_request.organisation_id),'Approved TOIL cancellation',v_user_id); v_status:='cancelled'; else v_status:='approved'; end if;
 update public.toil_requests set status=v_status,decided_at=now(),decided_by=v_user_id,updated_at=now() where id=v_request.id;
 insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload) values(v_request.organisation_id,v_user_id,'toil_request',v_request.id,case when v_status='cancelled' then 'toil.cancellation.approved' else 'toil.cancellation.declined' end,jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))); return v_status;
end;$$;

revoke execute on function private.require_decline_reason(text,text) from authenticated;
