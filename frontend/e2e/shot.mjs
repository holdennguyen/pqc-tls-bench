// UI screenshots (design review / thesis figures) -> e2e/shots/, gitignored.
// Run: docker run --rm --network pqc-tls-bench_default -v "$PWD/frontend:/repo/frontend" \
//   -w /repo/frontend <PW_IMAGE from gates/gate_frontend.sh> node e2e/shot.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })).newPage();
await page.goto('https://nginx-hybrid/app/');
await page.waitForSelector('[data-testid=login-form]');
await page.screenshot({ path: 'e2e/shots/login.png' });
await page.fill('#u', 'bacsi.an');
await page.click('button[type=submit]');
await page.waitForSelector('[data-testid=stat-records]');
await page.waitForTimeout(600);
await page.screenshot({ path: 'e2e/shots/dashboard.png' });
await page.click('nav a[href="/app/records"]');
await page.waitForSelector('[data-testid=records-table] tbody tr');
await page.screenshot({ path: 'e2e/shots/records.png' });
await page.click('[data-testid=records-table] tbody tr');
await page.waitForSelector('[data-testid=record-detail]');
await page.click('[data-testid=btn-reload]');
await page.waitForTimeout(400);
await page.screenshot({ path: 'e2e/shots/detail.png' });
await browser.close();
console.log('shots done');
