import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const origin='http://localhost:3043',out='outputs/mobile-report-navigation';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
async function rows(n){await expect(page.locator('.report-table-scroll tbody tr')).toHaveCount(n);}
async function arrived(selector){await expect.poll(async()=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight-80&&r.bottom>90&&document.activeElement===el;}),{timeout:7000}).toBe(true);}
try{
 await page.goto(origin+'/admin?practice=filters');await page.getByLabel('Login ID',{exact:true}).fill('practice-admin');await page.getByLabel('Password',{exact:true}).fill('PracticeOnly@2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await rows(4);await expect(page.locator('.report-table-scroll thead')).toContainText('Student name');await expect(page.getByLabel('Rows',{exact:true})).toHaveValue('participants');
 for(const width of [320,360,390,430,768,1440]){
  await page.setViewportSize({width,height:844});await page.reload();await rows(4);
  await page.getByRole('button',{name:'Add Filter',exact:true}).click();if(width<768)await arrived('.report-filter:last-child');
  const filter=page.locator('.report-filter').last();await filter.getByLabel('Field',{exact:true}).selectOption({label:'Master name'});await filter.getByRole('checkbox',{name:'Kumar',exact:true}).check();await filter.getByRole('checkbox',{name:'Ravi',exact:true}).check();
  await page.getByRole('button',{name:'Apply',exact:true}).click();await rows(2);if(width<768)await arrived('.report-table-scroll');
  await page.getByRole('button',{name:'Choose Columns',exact:true}).click();if(width<768)await arrived('.report-columns');
  await page.locator('.report-columns').getByRole('checkbox',{name:'Dojo',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();await rows(2);if(width<768)await arrived('.report-table-scroll');assert.ok(!(await page.locator('.report-table-scroll th').allTextContents()).includes('Dojo'));
  await page.getByRole('button',{name:'Clear All',exact:true}).click();await rows(4);if(width<768)await arrived('.report-table-scroll');
  await page.getByLabel('Rows',{exact:true}).selectOption('registrations');await page.getByRole('button',{name:'Apply',exact:true}).click();await rows(4);await expect(page.getByLabel('Rows',{exact:true})).toHaveValue('registrations');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No document overflow at '+width);
  if(width<768){const sizes=await page.locator('.report-apply-bar button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().height));assert.ok(sizes.every(height=>height>=44));await page.screenshot({path:out+'/mobile-'+width+'.png',fullPage:true});}
 }
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await rows(4);await expect(page.getByLabel('Rows',{exact:true})).toHaveValue('participants');
 await page.getByRole('button',{name:'Add Filter',exact:true}).focus();await page.keyboard.press('Enter');await arrived('.report-filter:last-child');
 const filter=page.locator('.report-filter').last();await filter.getByLabel('Field',{exact:true}).selectOption({label:'City'});await filter.getByRole('checkbox',{name:'Vellore',exact:true}).check();await page.getByRole('button',{name:'Apply',exact:true}).click();await rows(1);await arrived('.report-table-scroll');
 await page.getByRole('button',{name:'Download Excel',exact:true}).click();await expect(page.locator('.report-job')).toContainText('XLSX ready:',{timeout:60000});await arrived('.report-job');
 assert.deepEqual(errors,[]);console.log('PASS mobile navigation: 320/360/390/430/768/1440px; new-filter/columns/results/reset/export scrolling, section focus, keyboard, reduced motion, touch targets, no horizontal page overflow, student default and optional registration mode.');
}finally{await browser.close();}
