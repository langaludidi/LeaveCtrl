create or replace function public.backup_private_state_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'billing_operators',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', b.user_id,
            'created_at', b.created_at
          )
          order by b.user_id
        )
        from private.billing_operators b
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.backup_private_state_v1()
from public, anon, authenticated;

grant execute on function public.backup_private_state_v1()
to service_role;
