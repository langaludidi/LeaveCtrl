import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(process.env.ACCEPTANCE_FIXTURES,'utf8'));
const entries = {
  employee:['Employee','/my-leave'],manager:['Manager','/requests'],
  hr_admin:['HR Admin','/team'],org_admin:['Organisation Admin','/setup'],
  reporter:['Reporter','/reports'],auditor:['Auditor','/audit'],
};
for (const person of fixtures.people) {
  test(`${person.role}: native sign-in, discover assigned role and open its journey`, async ({page,request})=>{
    await page.goto('/login');
    await page.getByLabel('Email address',{exact:true}).fill(person.email);
    await page.getByLabel('Password',{exact:true}).fill(person.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page).not.toHaveURL(/\/login|\/confirm-email|\/access\/unavailable/);
    // Follow the visible access link after the application's landing redirect.
    // A manual goto while the server redirect is pending races WebKit navigation.
    await page.locator('main .access-context').click();
    await expect(page.getByRole('heading',{name:'My roles & access',exact:true})).toBeVisible();
    const assigned = page.locator(`.role-access-summary`).first().locator(`[data-role="${person.role}"]`);
    await expect(assigned.getByRole('heading',{name:entries[person.role][0],exact:true})).toBeVisible();
    await assigned.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(entries[person.role][1]+'(?:\\?|$)'));
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const navigation = await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      return {domContentLoadedMs:n.domContentLoadedEventEnd,transferBytes:n.transferSize};
    });
    // Candidate budgets on the isolated runner; production network metrics are separate.
    expect(navigation.domContentLoadedMs).toBeLessThan(5000);
    expect(navigation.transferBytes).toBeLessThan(1_000_000);
    await test.info().attach('candidate-navigation-budget',{body:JSON.stringify(navigation),contentType:'application/json'});
    const accessibility = await new AxeBuilder({page}).analyze();
    expect(accessibility.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
    const headers = {apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${person.accessToken}`};
    const foreign = await request.get(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/employees?select=id&organisation_id=eq.${fixtures.otherOrganisation}`,{headers});
    expect(foreign.status()).toBe(200);
    expect(await foreign.json()).toEqual([]);
    if (!['org_admin','hr_admin'].includes(person.role)) {
      const mutation = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/create_department`,{headers,data:{p_name:'Forbidden mutation',p_code:'DENY'}});
      expect(mutation.ok()).toBe(false);
    }
    await page.screenshot({path:`test-results/${person.role}-${test.info().project.name}.png`,fullPage:true});
  });
}

test('employee and manager: book, approve, cancel and restore the ledger balance', async ({browser,request})=>{
  // One project owns this shared fixture; the six-role matrix remains parallel.
  test.skip(test.info().project.name!=='chromium-1440');
  test.setTimeout(90_000);
  const employee = fixtures.people.find(p=>p.role==='employee');
  const manager = fixtures.people.find(p=>p.role==='manager');
  const headers = {apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${employee.accessToken}`};
  const rest = process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/';
  async function read(path) {
    const response = await request.get(rest+path,{headers});
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const balancePath = `leave_balances?select=leave_type_id,available_balance&employee_id=eq.${employee.employeeId}`;
  const opening = await read(balancePath);
  expect(opening).toHaveLength(1);
  const openingBalance = Number(opening[0].available_balance);
  expect(openingBalance).toBe(15);
  const contexts = [];
  async function signIn(person) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByLabel('Email address',{exact:true}).fill(person.email);
    await page.getByLabel('Password',{exact:true}).fill(person.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page).not.toHaveURL(/\/login|\/confirm-email/);
    await expect(page.locator('main .access-context')).toBeVisible();
    return page;
  }
  try {
    const employeePage = await signIn(employee);
    await employeePage.goto('http://127.0.0.1:3000/book-leave');
    const leaveTypes = await employeePage.getByRole('combobox',{name:'Leave type',exact:true}).locator('option').evaluateAll(options=>options.map(o=>({id:o.value,name:o.textContent})));
    expect(leaveTypes.some(o=>o.id===opening[0].leave_type_id),'Booking and balance must reference the same annual type').toBe(true);
    await test.step('Choose the annual leave type',async()=>{
      await employeePage.getByRole('combobox',{name:'Leave type',exact:true}).selectOption(opening[0].leave_type_id);
    });
    const day = new Date();
    day.setUTCDate(day.getUTCDate()+3);
    while ([0,6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate()+1);
    const date = day.toISOString().slice(0,10);
    await test.step('Enter a future working date',async()=>{
      await employeePage.getByLabel('Start date',{exact:true}).fill(date);
      await employeePage.getByLabel('End date',{exact:true}).fill(date);
    });
    await test.step('Evaluate and submit through the booking screen',async()=>{
      await employeePage.getByRole('button',{name:'Check request',exact:true}).click();
      await employeePage.getByRole('button',{name:'Submit request',exact:true}).click();
    });
    await expect(employeePage).toHaveURL(/\/requests\?submitted=1/);
    const rows = await read(`leave_requests?select=id,status,quantity&employee_id=eq.${employee.employeeId}`);
    expect(rows).toHaveLength(1);
    const leave = rows[0];
    expect(leave.status).toBe('pending_approval');
    expect(Number(leave.quantity)).toBe(1);
    expect(Number((await read(balancePath))[0].available_balance)).toBe(openingBalance-1);
    const status = async () => (await read(`leave_requests?select=status&id=eq.${leave.id}`))[0].status;
    const detail = `http://127.0.0.1:3000/requests/leave/${leave.id}`;
    const managerPage = await signIn(manager);
    await managerPage.goto(detail);
    await managerPage.getByRole('button',{name:'Approve request',exact:true}).click();
    await expect.poll(status).toBe('approved');
    expect(Number((await read(balancePath))[0].available_balance)).toBe(openingBalance-1);
    await employeePage.goto(detail);
    employeePage.once('dialog',dialog=>dialog.accept());
    await employeePage.getByRole('button',{name:'Cancel leave',exact:true}).click();
    await expect.poll(status).toBe('cancellation_requested');
    await managerPage.goto(detail);
    await managerPage.getByRole('button',{name:'Approve cancellation',exact:true}).click();
    await expect.poll(status).toBe('cancelled');
    expect(Number((await read(balancePath))[0].available_balance)).toBe(openingBalance);
  } finally {
    for (const context of contexts) await context.close().catch(()=>{});
  }
});

for (const founder of fixtures.founders) {
  test(`${founder.role}: explicit employment choice and organisation setup`,async ({page,request})=>{
    test.skip(test.info().project.name!=='chromium-1440');
    await page.goto('/login');
    await page.getByLabel('Email address',{exact:true}).fill(founder.email);
    await page.getByLabel('Password',{exact:true}).fill(founder.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page).toHaveURL(/\/access\/no-membership/);
    await expect(page.locator('h1')).toBeVisible();
    await page.goto('/onboarding');
    const employment = page.getByRole('checkbox',{name:'I am also an employee of this organisation'});
    await expect(employment).not.toBeChecked();
    await page.getByLabel('Organisation name',{exact:true}).fill(`Native ${founder.role}`);
    await page.getByLabel('First name',{exact:true}).fill('Founder');
    await page.getByLabel('Last name',{exact:true}).fill('Acceptance');
    await page.getByLabel('Verified work email',{exact:true}).fill(founder.email);
    const isEmployee = founder.role==='founder_employee';
    if (isEmployee) {
      await employment.check();
      await page.getByLabel(/Employment start date/).fill(new Date().toISOString().slice(0,10));
    }
    await page.getByRole('button',{name:'Create organisation and continue',exact:true}).click();
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole('heading',{name:'Set up your organisation',exact:true})).toBeVisible();
    const headers = {apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${founder.accessToken}`};
    async function accessState() {
      const response = await request.post(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/get_access_state_v1',{headers,data:{}});
      expect(response.ok()).toBe(true);
      return (await response.json())[0];
    }
    const before = await accessState();
    expect(before.roles.sort()).toEqual(isEmployee?['employee','org_admin']:['org_admin']);
    expect(Boolean(before.employee_id)).toBe(isEmployee);
    const roster = await request.get(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/employees?select=id&organisation_id=eq.${before.organisation_id}`,{headers});
    expect(roster.ok()).toBe(true);
    expect(await roster.json()).toHaveLength(isEmployee?1:0);
    const entitlements = await request.get(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leave_entitlements?select=id&organisation_id=eq.${before.organisation_id}`,{headers});
    expect(entitlements.ok()).toBe(true);
    const entitlementRows = await entitlements.json();
    if (isEmployee) expect(entitlementRows.length).toBeGreaterThan(0);
    else expect(entitlementRows).toEqual([]);
    await page.getByRole('button',{name:'Complete initial setup',exact:true}).click();
    await expect.poll(async ()=>(await accessState()).organisation_onboarding_completed_at).toBeTruthy();
    await expect(page.locator('main .access-context')).toBeVisible();
    const accessibility = await new AxeBuilder({page}).analyze();
    expect(accessibility.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
  });
}

test('invitation: assigned roles are visible before acceptance and retained after welcome',async ({page})=>{
  test.skip(test.info().project.name!=='chromium-1440');
  const person = fixtures.invitee;
  const next = '/join?token='+encodeURIComponent(person.invitationToken);
  await page.goto('/login?next='+encodeURIComponent(next));
  await page.getByLabel('Email address',{exact:true}).fill(person.email);
  await page.getByLabel('Password',{exact:true}).fill(person.password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Join Acceptance organisation',exact:true})).toBeVisible();
  for (const role of ['employee','reporter','auditor']) {
    await expect(page.locator(`.role-access-summary [data-role="${role}"]`)).toBeVisible();
  }
  await page.getByRole('button',{name:'Accept invitation',exact:true}).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator('h1')).toBeVisible();
  for (const role of ['employee','reporter','auditor']) {
    await expect(page.locator(`.role-access-summary [data-role="${role}"]`)).toBeVisible();
  }
  await page.locator('.welcome-continue').click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole('heading',{name:'Audit Log',exact:true})).toBeVisible();
});
