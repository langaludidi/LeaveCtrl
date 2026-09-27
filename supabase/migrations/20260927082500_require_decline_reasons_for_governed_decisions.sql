-- Enforce decision accountability at the database boundary.
-- The UI requires decline context; this helper prevents direct RPC callers bypassing it.

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

-- The four governed decision RPCs in production call private.require_decline_reason
-- immediately after authentication and before locking/mutating their request.
-- Full function bodies are maintained in the live migration history; this repository
-- migration records the invariant and helper privilege boundary for rebuild/review.
-- A clean database rebuild should apply the canonical decision function definitions
-- from the corresponding production migration snapshot before release.
