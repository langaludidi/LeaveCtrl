import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

// Only native email-confirmed Auth identities in the disposable local stack.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url !== 'http://127.0.0.1:54321') throw new Error('Local Supabase required');
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: key, 'Content-Type': 'application/json' };
const roles = ['employee','manager','hr_admin','org_admin','reporter','auditor'];
const organisation = randomUUID();
const otherOrganisation = randomUUID();
const people = [];
for (const role of [...roles, 'other_tenant']) {
  const email = `${role}-${randomBytes(4).toString('hex')}@example.test`;
  const password = `Release-${randomBytes(24).toString('hex')}!`;
  const response = await fetch(`${url}/auth/v1/signup`, {
    method:'POST', headers, body:JSON.stringify({email,password}),
  });
  if (!response.ok) throw new Error(`Native signup failed: ${response.status}`);
  await response.json();
  let message;
  for (let attempt=0; attempt<20; attempt++) {
    const inbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    message = inbox.messages?.find(m => m.To?.some(to => to.Address === email));
    if (message) break;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if (!message) throw new Error(`Native confirmation email missing for ${role}`);
  const mail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
  const link = mail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)?.[1]?.replaceAll('&amp;','&');
  if (!link || !link.startsWith(url+'/')) throw new Error('Invalid local confirmation link');
  const verified = await fetch(link, {redirect:'manual'});
  if (verified.status !== 303 && verified.status !== 302) throw new Error('Native confirmation failed');
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method:'POST',headers,body:JSON.stringify({email,password}),
  });
  if (!login.ok) throw new Error('Confirmed identity cannot sign in');
  const session = await login.json();
  if (session.user.email !== email || !session.user.email_confirmed_at || !session.user.confirmation_sent_at) throw new Error('Email challenge evidence missing');
  people.push({role,email,password,userId:session.user.id,employeeId:randomUUID(),accessToken:session.access_token});
}
const sqlString = value => "'"+value.replaceAll("'","''")+"'";
let sql = `insert into public.organisations(id,name,onboarding_completed_at) values ('${organisation}','Acceptance organisation',now()),('${otherOrganisation}','Other acceptance tenant',now());\n`;
for (const person of people) {
  const org = person.role==='other_tenant' ? otherOrganisation : organisation;
  const role = person.role==='other_tenant' ? 'employee' : person.role;
  sql += `insert into public.organisation_memberships(organisation_id,user_id,role,is_active) values ('${org}','${person.userId}','${role}',true);\n`;
  sql += `insert into public.employees(id,organisation_id,user_id,employee_number,first_name,last_name,email,start_date,employment_status,welcome_completed_at) values ('${person.employeeId}','${org}','${person.userId}',${sqlString(role)},${sqlString(role)},'Acceptance',${sqlString(person.email)},current_date-100,'active',now());\n`;
}
const container = execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n').find(name=>name.startsWith('supabase_db_'));
if (!container) throw new Error('Disposable database missing');
execFileSync('docker',['exec','-i',container,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,stdio:['pipe','ignore','inherit']});
const administrator = people.find(p=>p.role==='org_admin');
async function administer(name, data) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method:'POST',headers:{...headers,Authorization:`Bearer ${administrator.accessToken}`},
    body:JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Fixture configuration ${name} failed: ${await response.text()}`);
  return response.json();
}
const today = new Date().toISOString().slice(0,10);
const year = today.slice(0,4);
const schedule = await administer('create_work_schedule',{p_name:'Acceptance weekdays'});
for (const person of people.filter(p=>p.role!=='other_tenant')) {
  await administer('assign_employee_schedule',{
    p_employee_id:person.employeeId,p_work_schedule_id:schedule,p_effective_from:`${year}-01-01`,
  });
}
await administer('configure_initial_leave_policy',{
  p_annual_days:15,p_cycle_start:`${year}-01-01`,p_cycle_end:`${year}-12-31`,
});
const employee = people.find(p=>p.role==='employee');
await administer('set_employee_opening_balance',{
  p_employee_id:employee.employeeId,p_leave_type_code:'ANNUAL',p_balance:15,
  p_reason:'Disposable acceptance fixture opening balance',
});
await administer('assign_employee_manager',{
  p_employee_id:employee.employeeId,p_manager_employee_id:people.find(p=>p.role==='manager').employeeId,
});
writeFileSync(process.env.ACCEPTANCE_FIXTURES,JSON.stringify({organisation,otherOrganisation,people:people.filter(p=>p.role!=='other_tenant')}),{mode:0o600});
console.log('PASS: six native email-confirmed identities and isolated tenant fixtures');
