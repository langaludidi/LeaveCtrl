import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'signed-in-acceptance.spec.mjs',timeout:60_000,workers:3,maxFailures:1,
  reporter:[['list'],['html',{outputFolder:'signed-in-report',open:'never'}]],
  use:{baseURL:'http://127.0.0.1:3000',trace:'off',screenshot:'only-on-failure'},
  projects:['chromium','webkit'].flatMap(browserName=>[390,768,1440].map(width=>({
    name:`${browserName}-${width}`,use:{browserName,viewport:{width,height:1000}},
  }))),
  webServer:{command:'npm run start -- --hostname 127.0.0.1',url:'http://127.0.0.1:3000/login',reuseExistingServer:false,timeout:60_000},
});
