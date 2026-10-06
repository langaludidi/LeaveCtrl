-- Billing is organisation-scoped. Browser redirects, JWT metadata and
-- customer email addresses never grant a subscription.
create table public.billing_prices (
  id text primary key,
  plan_code text not null,
  name text not null,
  interval text not null check (interval in ('monthly','annual')),
  amount integer not null check (amount > 0),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  employee_limit integer not null check (employee_limit > 0),
  features text[] not null default array['leave','policy','coverage','reporting'],
  active boolean not null default true
);
insert into public.billing_prices(id,plan_code,name,interval,amount,employee_limit) values
  ('starter_monthly_v1','starter','Starter','monthly',24900,15),
  ('starter_annual_v1','starter','Starter','annual',249000,15),
  ('team_monthly_v1','team','Team','monthly',59900,50),
  ('team_annual_v1','team','Team','annual',599000,50),
  ('business_monthly_v1','business','Business','monthly',129900,150),
  ('business_annual_v1','business','Business','annual',1299000,150),
  ('organisation_monthly_v1','organisation','Organisation','monthly',219900,300),
  ('organisation_annual_v1','organisation','Organisation','annual',2199000,300);

create function private.immutable_billing_price() returns trigger
language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-'active') is distinct from (to_jsonb(old)-'active') then
    raise exception 'billing_prices_require_a_new_version';
  end if;
  return new;
end $$;
revoke all on function private.immutable_billing_price() from public,anon,authenticated;
create trigger billing_price_version before update on public.billing_prices
  for each row execute function private.immutable_billing_price();

create table public.billing_accounts (
  organisation_id uuid primary key references public.organisations(id),
  trial_until timestamptz not null,
  price_id text references public.billing_prices(id),
  paid_until timestamptz,
  provider_status text,
  subscription_code text unique,
  customer_code text,
  provider_event_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  organisation_id uuid not null references public.organisations(id),
  actor_user_id uuid not null references auth.users(id),
  email text not null,
  price_id text not null references public.billing_prices(id),
  amount integer not null check (amount > 0),
  currency text not null check (currency='ZAR'),
  status text not null default 'pending' check (status in ('pending','ready','paid','failed','expired')),
  plan_code text,
  checkout_url text,
  initialising_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_unsettled_billing_checkout on public.billing_checkouts(organisation_id)
  where status in ('pending','ready');
create index billing_checkouts_actor_idx on public.billing_checkouts(actor_user_id);
create index billing_checkouts_price_idx on public.billing_checkouts(price_id);
create table public.billing_subscriptions (
  subscription_code text primary key,
  organisation_id uuid not null references public.organisations(id),
  price_id text not null references public.billing_prices(id),
  plan_code text not null,
  customer_code text not null,
  status text not null,
  provider_event_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index billing_subscriptions_org_idx on public.billing_subscriptions(organisation_id);
create index billing_subscriptions_customer_plan_idx on public.billing_subscriptions(customer_code,plan_code);
create index billing_subscriptions_price_idx on public.billing_subscriptions(price_id);
create table public.billing_payments (
  reference text primary key,
  transaction_id text not null unique,
  organisation_id uuid not null references public.organisations(id),
  checkout_id uuid references public.billing_checkouts(id),
  price_id text not null references public.billing_prices(id),
  amount integer not null check (amount > 0),
  currency text not null check (currency='ZAR'),
  plan_code text not null,
  customer_code text not null,
  paid_at timestamptz not null,
  period_end timestamptz not null,
  refunded_amount integer not null default 0 check (refunded_amount>=0 and refunded_amount<=amount),
  disputed boolean not null default false,
  created_at timestamptz not null default now()
);
create index billing_payments_org_idx on public.billing_payments(organisation_id,paid_at desc);
create index billing_payments_checkout_idx on public.billing_payments(checkout_id);
create index billing_payments_price_idx on public.billing_payments(price_id);
create table public.billing_adjustments (
  adjustment_key text primary key,
  transaction_id text not null references public.billing_payments(transaction_id),
  kind text not null check (kind in ('refund','dispute')),
  amount integer not null check (amount>=0),
  active boolean not null,
  updated_at timestamptz not null default now()
);
create index billing_adjustments_transaction_idx on public.billing_adjustments(transaction_id);
create table public.billing_events (
  event_key text primary key,
  event_type text not null,
  reference text,
  subscription_code text,
  status text not null default 'received' check (status in ('received','processed','review','ignored')),
  note text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
-- No card authorisations, provider email tokens, credentials or raw webhook
-- payloads are persisted in public tables.
create table private.billing_operators (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.billing_operators enable row level security;
revoke all on private.billing_operators from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['billing_prices','billing_accounts','billing_checkouts','billing_subscriptions','billing_payments','billing_events','billing_adjustments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select on public.billing_prices to authenticated;
create policy billing_prices_read on public.billing_prices for select to authenticated using (active);
grant select on public.billing_accounts,public.billing_checkouts,public.billing_payments,public.billing_subscriptions to authenticated;
create policy billing_accounts_admin_read on public.billing_accounts for select to authenticated
  using (private.has_org_role(organisation_id,array['org_admin'::public.member_role]));
create policy billing_checkouts_admin_read on public.billing_checkouts for select to authenticated
  using (private.has_org_role(organisation_id,array['org_admin'::public.member_role]));
create policy billing_payments_admin_read on public.billing_payments for select to authenticated
  using (private.has_org_role(organisation_id,array['org_admin'::public.member_role]));
create policy billing_subscriptions_admin_read on public.billing_subscriptions for select to authenticated
  using (private.has_org_role(organisation_id,array['org_admin'::public.member_role]));

create function private.seed_billing_trial() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.billing_accounts(organisation_id,trial_until)
  values(new.id,new.created_at+interval '30 days') on conflict do nothing;
  return new;
end $$;
revoke all on function private.seed_billing_trial() from public,anon,authenticated;
create trigger organisation_billing_trial after insert on public.organisations
  for each row execute function private.seed_billing_trial();
insert into public.billing_accounts(organisation_id,trial_until)
select id,created_at+interval '30 days' from public.organisations;

create function private.billing_access(p_org_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'organisation_id',a.organisation_id,
    'state',case when a.paid_until>now() then 'active' when a.price_id is null and a.trial_until>now() then 'trial' else 'read_only' end,
    'can_write',coalesce(a.paid_until>now() or (a.price_id is null and a.trial_until>now()),false),
    'plan_name',coalesce(p.name,'Trial'), 'plan_code',p.plan_code,'price_id',a.price_id,'interval',p.interval,
    'employee_limit',coalesce(p.employee_limit,300), 'features',coalesce(to_jsonb(p.features),'["leave","policy","coverage","reporting"]'::jsonb),
    'active_employees',(select count(*) from public.employees e where e.organisation_id=a.organisation_id and e.employment_status='active'),
    'access_until',case when a.price_id is not null then a.paid_until else a.trial_until end,
    'paid_until',a.paid_until,'trial_until',a.trial_until,
    'provider_status',a.provider_status,'has_subscription',a.subscription_code is not null
  ) from public.billing_accounts a left join public.billing_prices p on p.id=a.price_id where a.organisation_id=p_org_id;
$$;
revoke all on function private.billing_access(uuid) from public,anon,authenticated;
create function public.get_billing_summary_v1(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_org_member(p_org_id) then raise exception 'billing_access_denied'; end if;
  return private.billing_access(p_org_id) || jsonb_build_object('can_manage',private.has_org_role(p_org_id,array['org_admin'::public.member_role]));
end $$;
revoke all on function public.get_billing_summary_v1(uuid) from public,anon;
grant execute on function public.get_billing_summary_v1(uuid) to authenticated;

create function public.start_billing_checkout_v1(p_org_id uuid,p_price_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.billing_accounts; p public.billing_prices; c public.billing_checkouts; v_email text; v_count integer;
begin
  if not private.has_org_role(p_org_id,array['org_admin'::public.member_role]) then raise exception 'billing_admin_required'; end if;
  select * into a from public.billing_accounts where organisation_id=p_org_id for update;
  if not found then raise exception 'billing_account_missing'; end if;
  if a.paid_until>now() or a.subscription_code is not null and coalesce(a.provider_status,'active') not in ('cancelled','completed') then
    raise exception 'existing_subscription_requires_management';
  end if;
  select * into p from public.billing_prices where id=p_price_id and active;
  if not found then raise exception 'invalid_billing_price'; end if;
  select count(*) into v_count from public.employees where organisation_id=p_org_id and employment_status='active';
  if v_count>p.employee_limit then raise exception 'plan_employee_limit_exceeded'; end if;
  select * into c from public.billing_checkouts where organisation_id=p_org_id and status in ('pending','ready') for update;
  if found then
    if c.price_id<>p.id then raise exception 'checkout_already_pending'; end if;
    return to_jsonb(c);
  end if;
  select lower(email) into v_email from auth.users where id=auth.uid();
  if nullif(v_email,'') is null then raise exception 'verified_billing_email_required'; end if;
  insert into public.billing_checkouts(reference,organisation_id,actor_user_id,email,price_id,amount,currency)
  values('lctrl_'||replace(gen_random_uuid()::text,'-',''),p_org_id,auth.uid(),v_email,p.id,p.amount,p.currency) returning * into c;
  insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload)
  values(p_org_id,auth.uid(),'billing_checkout',c.id,'billing.checkout_started',jsonb_build_object('price_id',p.id,'amount',p.amount,'currency',p.currency));
  return to_jsonb(c);
end $$;
revoke all on function public.start_billing_checkout_v1(uuid,text) from public,anon;
grant execute on function public.start_billing_checkout_v1(uuid,text) to authenticated;

create function public.claim_billing_checkout_v1(p_reference text,p_plan_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts;
begin
  if p_plan_code !~ '^PLN_[A-Za-z0-9]+$' then raise exception 'invalid_checkout_plan'; end if;
  select * into c from public.billing_checkouts where reference=p_reference for update;
  if not found then raise exception 'checkout_not_pending'; end if;
  if c.status in ('ready','paid') then return to_jsonb(c); end if;
  if c.status<>'pending' then raise exception 'checkout_not_pending'; end if;
  if c.initialising_until>now() then raise exception 'checkout_initialising'; end if;
  -- Only one request initialises a given reference. Retries keep its original
  -- provider plan; they cannot silently change the expected transaction.
  update public.billing_checkouts
  set plan_code=coalesce(plan_code,p_plan_code),initialising_until=now()+interval '90 seconds',updated_at=now()
  where reference=p_reference returning * into c;
  return to_jsonb(c);
end $$;
revoke all on function public.claim_billing_checkout_v1(text,text) from public,anon,authenticated;
grant execute on function public.claim_billing_checkout_v1(text,text) to service_role;

create function public.complete_billing_checkout_v1(p_reference text,p_plan_code text,p_checkout_url text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_plan_code !~ '^PLN_[A-Za-z0-9]+$' or p_checkout_url !~ '^https://checkout[.]paystack[.]com/' then raise exception 'invalid_checkout_details'; end if;
  update public.billing_checkouts set plan_code=p_plan_code,checkout_url=p_checkout_url,status='ready',initialising_until=null,updated_at=now()
  where reference=p_reference and status='pending' and (plan_code is null or plan_code=p_plan_code);
  if not found and not exists(select 1 from public.billing_checkouts where reference=p_reference and plan_code=p_plan_code and status in ('ready','paid')) then
    raise exception 'checkout_not_pending';
  end if;
end $$;
revoke all on function public.complete_billing_checkout_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.complete_billing_checkout_v1(text,text,text) to service_role;

create function public.record_billing_payment_v1(
  p_reference text,p_transaction_id text,p_amount integer,p_currency text,p_paid_at timestamptz,
  p_customer_code text,p_email text,p_plan_code text,p_mode text,p_subscription_code text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_checkouts; s public.billing_subscriptions; a public.billing_accounts;
  p public.billing_prices; v_org uuid; v_price text; v_end timestamptz; v_existing public.billing_payments; v_matches integer;
begin
  if p_mode is distinct from 'live' then raise exception 'test_payment_cannot_grant_live_access'; end if;
  if p_transaction_id !~ '^[0-9]+$' or p_customer_code !~ '^CUS_[A-Za-z0-9]+$' or p_plan_code !~ '^PLN_[A-Za-z0-9]+$' then raise exception 'invalid_payment_identity'; end if;
  if p_paid_at>now()+interval '5 minutes' then raise exception 'invalid_payment_date'; end if;
  select * into c from public.billing_checkouts where reference=p_reference;
  if found then
    if c.amount<>p_amount or c.currency<>p_currency or c.email<>lower(p_email) or c.plan_code is distinct from p_plan_code then raise exception 'payment_checkout_mismatch'; end if;
    if p_paid_at<c.created_at-interval '5 minutes' then raise exception 'payment_before_checkout'; end if;
    v_org:=c.organisation_id; v_price:=c.price_id;
  else
    select count(*) into v_matches from public.billing_subscriptions
      where customer_code=p_customer_code and plan_code=p_plan_code and (p_subscription_code is null or subscription_code=p_subscription_code);
    if v_matches<>1 then raise exception 'unmapped_or_ambiguous_renewal'; end if;
    select * into s from public.billing_subscriptions where customer_code=p_customer_code and plan_code=p_plan_code
      and (p_subscription_code is null or subscription_code=p_subscription_code);
    v_org:=s.organisation_id; v_price:=s.price_id;
  end if;
  select * into a from public.billing_accounts where organisation_id=v_org for update;
  select * into v_existing from public.billing_payments where reference=p_reference or transaction_id=p_transaction_id;
  if found then
    if v_existing.reference<>p_reference or v_existing.transaction_id<>p_transaction_id or v_existing.organisation_id<>v_org then raise exception 'payment_identity_collision'; end if;
    return jsonb_build_object('applied',false,'organisation_id',v_org,'reference',p_reference);
  end if;
  select * into p from public.billing_prices where id=v_price;
  if p.amount<>p_amount or p.currency<>p_currency then raise exception 'payment_price_mismatch'; end if;
  -- Paystack monthly renewals created on days 29-31 recur on day 28.
  v_end:=case when p.interval='annual' then p_paid_at+interval '1 year'
    else date_trunc('month',p_paid_at at time zone 'UTC') at time zone 'UTC' + interval '1 month'
      + (least(extract(day from p_paid_at at time zone 'UTC'),28)::integer-1)*interval '1 day'
      + (p_paid_at-(date_trunc('day',p_paid_at at time zone 'UTC') at time zone 'UTC')) end;
  insert into public.billing_payments(reference,transaction_id,organisation_id,checkout_id,price_id,amount,currency,plan_code,customer_code,paid_at,period_end)
  values(p_reference,p_transaction_id,v_org,c.id,v_price,p_amount,p_currency,p_plan_code,p_customer_code,p_paid_at,v_end);
  if a.paid_until>now() and a.price_id<>v_price then raise exception 'conflicting_paid_subscription'; end if;
  if a.paid_until is null or v_end>a.paid_until then
    update public.billing_accounts set price_id=v_price,paid_until=v_end,customer_code=p_customer_code,updated_at=now()
    where organisation_id=v_org;
  end if;
  update public.billing_checkouts set status='paid',updated_at=now() where id=c.id;
  insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload)
  values(v_org,c.actor_user_id,'billing_account',v_org,'billing.payment_verified',jsonb_build_object('reference',p_reference,'price_id',v_price,'amount',p_amount,'period_end',v_end));
  return jsonb_build_object('applied',true,'organisation_id',v_org,'reference',p_reference,'paid_until',v_end);
end $$;
revoke all on function public.record_billing_payment_v1(text,text,integer,text,timestamptz,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_billing_payment_v1(text,text,integer,text,timestamptz,text,text,text,text,text) to service_role;

create function public.record_billing_subscription_v1(p_subscription_code text,p_customer_code text,p_plan_code text,p_status text,p_event_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_price text; v_matches integer; a public.billing_accounts; s public.billing_subscriptions;
begin
  if p_subscription_code !~ '^SUB_[A-Za-z0-9]+$' or p_status not in ('active','non-renewing','attention','cancelled','completed') then raise exception 'invalid_subscription'; end if;
  select * into s from public.billing_subscriptions where subscription_code=p_subscription_code;
  if found then
    if s.customer_code<>p_customer_code or s.plan_code<>p_plan_code then raise exception 'subscription_identity_mismatch'; end if;
    v_org:=s.organisation_id; v_price:=s.price_id;
  else
    select count(distinct organisation_id) into v_matches from public.billing_payments where customer_code=p_customer_code and plan_code=p_plan_code;
    if v_matches<>1 then raise exception 'subscription_requires_verified_payment'; end if;
    select organisation_id,price_id into v_org,v_price from public.billing_payments
      where customer_code=p_customer_code and plan_code=p_plan_code order by paid_at desc limit 1;
  end if;
  select * into a from public.billing_accounts where organisation_id=v_org for update;
  insert into public.billing_subscriptions(subscription_code,organisation_id,price_id,plan_code,customer_code,status,provider_event_at)
  values(p_subscription_code,v_org,v_price,p_plan_code,p_customer_code,p_status,p_event_at)
  on conflict(subscription_code) do update set status=excluded.status,provider_event_at=excluded.provider_event_at
    where public.billing_subscriptions.provider_event_at<=excluded.provider_event_at;
  if a.subscription_code is not null and a.subscription_code<>p_subscription_code and coalesce(a.provider_status,'active') not in ('cancelled','completed') then
    raise exception 'duplicate_provider_subscription';
  end if;
  if a.provider_event_at is null or a.provider_event_at<=p_event_at then
    update public.billing_accounts set subscription_code=p_subscription_code,provider_status=p_status,
      customer_code=p_customer_code,provider_event_at=p_event_at,updated_at=now() where organisation_id=v_org;
  end if;
  -- Lifecycle events never extend or truncate a paid period.
  return v_org;
end $$;
revoke all on function public.record_billing_subscription_v1(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_billing_subscription_v1(text,text,text,text,timestamptz) to service_role;

create function public.adjust_billing_payment_v1(p_adjustment_key text,p_transaction_id text,p_kind text,p_amount integer,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.billing_payments; a public.billing_accounts; v_end timestamptz; v_price text; v_refunded integer; v_disputed boolean;
begin
  select * into v from public.billing_payments where transaction_id=p_transaction_id;
  if not found then raise exception 'payment_not_recorded'; end if;
  select * into a from public.billing_accounts where organisation_id=v.organisation_id for update;
  if p_kind not in ('refund','dispute') or p_amount<0 or p_amount>v.amount or p_adjustment_key !~ '^(refund|dispute):[0-9]+$' then raise exception 'invalid_payment_adjustment'; end if;
  if exists(select 1 from public.billing_adjustments where adjustment_key=p_adjustment_key and (transaction_id<>p_transaction_id or kind<>p_kind or amount<>p_amount)) then raise exception 'adjustment_identity_mismatch'; end if;
  insert into public.billing_adjustments(adjustment_key,transaction_id,kind,amount,active)
  values(p_adjustment_key,p_transaction_id,p_kind,p_amount,p_active)
  on conflict(adjustment_key) do update set active=excluded.active,updated_at=now();
  select coalesce(sum(amount) filter(where kind='refund' and active),0),coalesce(bool_or(active) filter(where kind='dispute'),false)
    into v_refunded,v_disputed from public.billing_adjustments where transaction_id=p_transaction_id;
  update public.billing_payments set refunded_amount=v_refunded,disputed=v_disputed where reference=v.reference;
  select period_end,price_id into v_end,v_price from public.billing_payments
    where organisation_id=v.organisation_id and refunded_amount<amount and not disputed order by period_end desc limit 1;
  update public.billing_accounts set paid_until=v_end,price_id=coalesce(v_price,price_id),updated_at=now() where organisation_id=v.organisation_id;
  insert into public.audit_events(organisation_id,entity_type,entity_id,event_type,payload)
  values(v.organisation_id,'billing_account',v.organisation_id,'billing.payment_adjusted',jsonb_build_object('reference',v.reference,'adjustment_key',p_adjustment_key,'refunded_amount',v_refunded,'disputed',v_disputed));
  return v.organisation_id;
end $$;
revoke all on function public.adjust_billing_payment_v1(text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.adjust_billing_payment_v1(text,text,text,integer,boolean) to service_role;

create function public.record_billing_event_v1(p_event_key text,p_event_type text,p_reference text,p_subscription_code text) returns text
language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  if p_event_key !~ '^[a-f0-9]{64}$' or length(p_event_type)>100 or length(p_reference)>100 or length(p_subscription_code)>100 then
    raise exception 'invalid_billing_event';
  end if;
  insert into public.billing_events(event_key,event_type,reference,subscription_code)
  values(p_event_key,p_event_type,p_reference,p_subscription_code) on conflict do nothing;
  select status into v_status from public.billing_events where event_key=p_event_key;
  return v_status;
end $$;
revoke all on function public.record_billing_event_v1(text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_billing_event_v1(text,text,text,text) to service_role;

create function public.finish_billing_event_v1(p_event_key text,p_status text,p_note text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('processed','ignored','review') or length(p_note)>100 then raise exception 'invalid_billing_event_status'; end if;
  -- A slower failed retry must not downgrade an event already committed by
  -- another worker. Business ledgers are independently idempotent.
  update public.billing_events set status=p_status,note=p_note,
    processed_at=case when p_status in ('processed','ignored') then now() else null end
  where event_key=p_event_key and status not in ('processed','ignored');
end $$;
revoke all on function public.finish_billing_event_v1(text,text,text) from public,anon,authenticated;
grant execute on function public.finish_billing_event_v1(text,text,text) to service_role;

create function public.record_billing_operator_reconciliation_v1(p_org_id uuid,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_verified_email_identity(auth.uid()) or not exists(select 1 from private.billing_operators where user_id=auth.uid()) then raise exception 'billing_operator_required'; end if;
  if p_reference !~ '^[A-Za-z0-9_-]{6,100}$' or not exists(select 1 from public.billing_accounts where organisation_id=p_org_id) then raise exception 'invalid_reconciliation'; end if;
  insert into public.audit_events(organisation_id,actor_user_id,entity_type,entity_id,event_type,payload)
  values(p_org_id,auth.uid(),'billing_account',p_org_id,'billing.operator_reconciled',jsonb_build_object('reference',p_reference));
end $$;
revoke all on function public.record_billing_operator_reconciliation_v1(uuid,text) from public,anon;
grant execute on function public.record_billing_operator_reconciliation_v1(uuid,text) to authenticated;

create function public.billing_operations_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_verified_email_identity(auth.uid()) or not exists(select 1 from private.billing_operators where user_id=auth.uid()) then raise exception 'billing_operator_required'; end if;
  return jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select b.organisation_id,o.name,b.price_id,b.paid_until,b.trial_until,b.provider_status from public.billing_accounts b join public.organisations o on o.id=b.organisation_id order by b.updated_at desc limit 200) a),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (select * from public.billing_events order by received_at desc limit 100) e));
end $$;
revoke all on function public.billing_operations_v1() from public,anon;
grant execute on function public.billing_operations_v1() to authenticated;

create function private.enforce_billing_write_access() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_access jsonb; v_count integer;
begin
  if tg_table_name='organisations' then v_org:=coalesce(new.id,old.id);
  elsif tg_op='DELETE' then v_org:=old.organisation_id;
  else v_org:=new.organisation_id; end if;
  -- Serialise employee capacity with checkout/payment changes on this account.
  perform 1 from public.billing_accounts where organisation_id=v_org for update;
  v_access:=private.billing_access(v_org);
  if not coalesce((v_access->>'can_write')::boolean,false) then raise exception 'subscription_read_only'; end if;
  if tg_table_name='employees' and tg_op<>'DELETE' then
    if new.employment_status='active' and (tg_op='INSERT' or old.employment_status<>'active' or old.organisation_id<>new.organisation_id) then
      select count(*) into v_count from public.employees where organisation_id=v_org and employment_status='active' and id<>new.id;
      if v_count>=(v_access->>'employee_limit')::integer then raise exception 'subscription_employee_limit'; end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.enforce_billing_write_access() from public,anon,authenticated;
do $$
declare t text;
begin
  foreach t in array array['employees','departments','work_schedules','employee_schedule_assignments','leave_types','leave_policy_versions','leave_entitlements','leave_requests','leave_request_days','leave_ledger_entries','approval_actions','blocked_periods','coverage_rules','locations','employee_employment_conditions','employee_remuneration_history','overtime_settings','overtime_events','employee_variable_earnings','toil_ledger_entries','overtime_event_payments','toil_requests','leave_evidence','absence_types','absence_events'] loop
    execute format('create trigger billing_write_access before insert or update or delete on public.%I for each row execute function private.enforce_billing_write_access()',t);
  end loop;
end $$;
create trigger billing_write_access before update on public.organisations for each row execute function private.enforce_billing_write_access();
