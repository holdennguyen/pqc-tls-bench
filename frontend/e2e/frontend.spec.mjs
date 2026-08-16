/** gate_frontend's readout: full user journey against BOTH edges, in-network.
 * Asserts (a) zero pageerror/console.error, (b) sensor JSON lines per scope
 * api/route/auth (the frontend control-loop contract), (c) login -> dashboard ->
 * records -> create -> search -> edit -> cache-hit reload -> delete, (d) TLS
 * badge non-empty; exact X25519 asserted only on the classic edge (chromium
 * itself may negotiate ML-KEM on the hybrid edge — that fallback is by design).
 * Runs inside mcr.microsoft.com/playwright (browsers) with the playwright lib
 * from frontend/node_modules (version-matched to the image). */
import { chromium } from 'playwright';

const EDGES = [
  { host: 'nginx-hybrid', exactGroup: null },
  { host: 'nginx-classic', exactGroup: 'X25519' },
];
const failures = [];
const note = (m) => { failures.push(m); console.error(`SPEC FAIL: ${m}`); };

for (const edge of EDGES) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const sensors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error') errors.push(`console.error: ${t}`);
    if (t.startsWith('{')) {
      try {
        const j = JSON.parse(t);
        if (j.scope && j.fn && 'ok' in j) sensors.push(j);
      } catch { /* not a sensor line */ }
    }
  });

  const tag = `${edge.host}`;
  const stamp = `Kiểm thử cổng ${Date.now()}`;
  try {
    // login (fake session; route guard must have redirected us here)
    await page.goto(`https://${edge.host}/app/records`); // deep link -> guard -> /login
    await page.waitForSelector('[data-testid=login-form]');
    await page.fill('#u', 'gate');
    await page.fill('#p', 'x');
    await page.click('button[type=submit]');

    // dashboard + badge (tls-info is async — wait for the placeholder to resolve)
    await page.waitForSelector('[data-testid=stat-records]');
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-testid=tls-badge]')?.textContent?.trim();
      return !!b && b !== '…';
    }).catch(() => {});
    const badge = (await page.textContent('[data-testid=tls-badge]'))?.trim() ?? '';
    if (!badge || badge === '…') note(`${tag}: TLS badge empty ("${badge}")`);
    if (edge.exactGroup && badge !== edge.exactGroup) note(`${tag}: badge "${badge}" != ${edge.exactGroup}`);

    // records list renders seeded data
    await page.click('nav a[href="/app/records"]');
    await page.waitForSelector('[data-testid=records-table] tbody tr');

    // create (the button on the records page, not the sidebar link)
    await page.click('.panel a[href="/app/records/new"]');
    await page.waitForSelector('[data-testid=record-form]');
    await page.fill('#f-name', stamp);
    await page.fill('#f-dob', '1988-03-09');
    await page.fill('#f-diag', 'Khám định kỳ');
    await page.fill('#f-notes', 'tạo bởi gate_frontend');
    await page.click('[data-testid=btn-save]');
    await page.waitForSelector('[data-testid=record-detail]');
    const name = (await page.textContent('[data-testid=d-name]'))?.trim();
    if (name !== stamp) note(`${tag}: created name "${name}" != "${stamp}"`);

    // cache-hit reload: second read of the same id must show cache: hit
    await page.click('[data-testid=btn-reload]');
    await page.waitForFunction(
      () => document.querySelector('[data-testid=meta-chips]')?.textContent?.includes('cache: hit'),
    ).catch(() => note(`${tag}: reload did not show cache: hit`));

    // search finds exactly the created record
    await page.click('nav a[href="/app/records"]');
    await page.fill('[data-testid=search-input]', stamp);
    await page.click('[data-testid=btn-search]');
    await page.waitForFunction(
      (s) => {
        const rows = document.querySelectorAll('[data-testid=records-table] tbody tr');
        return rows.length === 1 && rows[0].textContent.includes(s);
      },
      stamp,
    ).catch(() => note(`${tag}: search did not isolate the created record`));

    // edit
    await page.click('[data-testid=records-table] tbody tr');
    await page.waitForSelector('[data-testid=btn-edit]');
    await page.click('[data-testid=btn-edit]');
    await page.waitForSelector('[data-testid=record-form]');
    await page.fill('#f-diag', 'Đã cập nhật bởi gate');
    await page.click('[data-testid=btn-save]');
    await page.waitForSelector('[data-testid=record-detail]');
    const diag = (await page.textContent('[data-testid=d-diagnosis]'))?.trim();
    if (diag !== 'Đã cập nhật bởi gate') note(`${tag}: edit not reflected ("${diag}")`);

    // delete (confirm dialog) -> back on list
    page.once('dialog', (d) => d.accept());
    await page.click('[data-testid=btn-delete]');
    await page.waitForSelector('[data-testid=search-input]');

    // function map: nodes from the live sensor graph, incl. the browser-side half
    await page.click('nav a[href="/app/map"]');
    await page.waitForSelector('[data-testid=fn-graph]');
    await page.waitForSelector('[data-node="c:list_records"]'); // client fn observed earlier
    const nNodes = await page.locator('[data-testid=fn-graph] g.fn-node').count();
    const nEdges = await page.locator('[data-testid=fn-graph] path.edge').count();
    if (nNodes < 10) note(`${tag}: fn-graph too small (${nNodes} nodes)`);
    if (nEdges < 1) note(`${tag}: fn-graph has no edges`);
    const nHops = await page.locator('[data-testid=fn-graph] g.hop-label').count();
    if (nHops !== 3) note(`${tag}: hop labels missing (${nHops}/3) — thesis H1–H4 mapping`);

    // logout closes the auth loop (sensor scope auth: login + logout)
    await page.click('header button.btn');
    await page.waitForSelector('[data-testid=login-form]');
  } catch (e) {
    note(`${tag}: journey aborted — ${e.message}`);
  }

  for (const scope of ['api', 'route', 'auth']) {
    if (!sensors.some((s) => s.scope === scope)) note(`${tag}: no sensor line for scope "${scope}"`);
  }
  if (sensors.some((s) => !s.fn || s.fn === 'anonymous')) {
    note(`${tag}: sensor line lost its fn name (minifier stripped Function.name?)`);
  }
  const failedInv = sensors.flatMap((s) => s.invariant_results.filter((i) => !i.pass).map((i) => `${s.fn}/${i.name}`));
  if (failedInv.length) note(`${tag}: failed invariants: ${[...new Set(failedInv)].join(', ')}`);
  if (errors.length) note(`${tag}: browser errors:\n  ${errors.join('\n  ')}`);

  await browser.close();
  console.log(`SPEC ${tag}: ${sensors.length} sensor lines observed`);
}

if (failures.length) process.exit(1);
console.log('SPEC OK');
