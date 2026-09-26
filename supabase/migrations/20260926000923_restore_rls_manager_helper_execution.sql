
grant execute on function private.manages_employee(uuid) to authenticated;

comment on function private.manages_employee(uuid) is
'RLS authorization helper. Execute is granted to authenticated because public-table policies invoke it. The private schema is not exposed as a client RPC surface.';
