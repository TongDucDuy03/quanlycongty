import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';

// Serve the release under a repository subpath, as GitHub project Pages does.
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith('/workshop-demo/')) { res.writeHead(404).end(); return; }
  const file = resolve(root, pathname.slice('/workshop-demo/'.length) || 'index.html');
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch();
const failures = [];
await mkdir('docs/previews', { recursive: true });
try {
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.url().startsWith(`http://127.0.0.1:${port}`) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${port}/workshop-demo/#orders`);
    await page.getByRole('heading', { name: 'Đơn hàng.', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Đơn hàng.', exact: true }).waitFor();
    await page.goto(`http://127.0.0.1:${port}/workshop-demo/#overview`);
    await page.getByRole('heading', { name: 'Tổng quan xưởng.' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Chuyển chế độ tối' }).click();
      await page.goto(`http://127.0.0.1:${port}/workshop-demo/#overview`);
      await page.getByRole('heading', { name: 'Tổng quan xưởng.' }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) failures.push(`${device}/${theme}: horizontal document overflow`);
      await page.screenshot({ path: `docs/previews/${device}-${theme}.png`, fullPage: true });
      await page.goto(`http://127.0.0.1:${port}/workshop-demo/#payroll`);
      await page.getByRole('tab', { name: 'Bảng lương', exact: true }).click();
      await page.screenshot({ path: `docs/previews/payroll-${device}-${theme}.png`, fullPage: true });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${device}/${theme}: payroll overflow`);
      await page.goto(`http://127.0.0.1:${port}/workshop-demo/#settings`);
      await page.getByRole('heading', { name: 'Kết nối Google Sheets', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Kết nối Google Sheets', exact: true }).waitFor();
      await page.screenshot({ path: `docs/previews/sheets-${device}-${theme}.png`, fullPage: true, animations: 'disabled' });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${device}/${theme}: sheets settings overflow`);
    }
    await page.close();
  }
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('PASS: production assets and lazy payroll module under /workshop-demo/, deep-link reload, desktop/mobile light/dark, no page errors or document overflow.');
} finally { await browser.close(); server.close(); }
