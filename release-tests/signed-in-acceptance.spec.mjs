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
    await page.goto('/access/roles');
    await expect(page.getByRole('heading',{name:'My roles & access',exact:true})).toBeVisible();
    const assigned = page.locator(`.role-access-summary`).first().locator(`[data-role="${person.role}"]`);
    await expect(assigned.getByRole('heading',{name:entries[person.role][0],exact:true})).toBeVisible();
    await assigned.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(entries[person.role][1]+'(?:\\?|$)'));
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
