-- App middleware is not a database authorization boundary. Every privileged
-- authenticated RPC must reject an identity without native email challenge evidence.
do $$
declare
  v_function record;
  v_definition text;
  v_source text;
  v_count integer := 0;
begin
  for v_function in
    select p.oid,p.prosrc,l.lanname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.prosecdef
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
  loop
    if v_function.lanname <> 'plpgsql' then
      raise exception 'privileged_rpc_language_requires_review:%',v_function.oid::regprocedure;
    end if;
    v_source := regexp_replace(v_function.prosrc,
      '(^|\n)([ \t]*)begin([ \t]*(\n|$))',
      E'\\1\\2begin\\3  if auth.uid() is null then raise exception ''authentication_required''; end if;\n  if not private.is_verified_email_identity(auth.uid()) then raise exception ''email_verification_required''; end if;\n',
      'i');
    if v_source = v_function.prosrc then
      raise exception 'privileged_rpc_body_requires_review:%',v_function.oid::regprocedure;
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
    -- Retain arguments, defaults, volatility, pinned search_path and existing ACLs.
    execute replace(v_definition,v_function.prosrc,v_source);
    v_count := v_count+1;
  end loop;
  if v_count <> 48 then raise exception 'privileged_rpc_surface_requires_review:%',v_count; end if;
end $$;
