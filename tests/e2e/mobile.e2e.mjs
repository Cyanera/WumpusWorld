// End-to-end smoke test: `npm run build && npm start` (port 3000) then `npm run test:e2e`.
// Verifies: join flow on a phone viewport, no horizontal scroll, illustrated map renders, guided checkpoint blocks
// actions, the hidden world is never present in any network response while playing, instructor dashboard loads.
import { createRequire } from 'module';
import assert from 'assert';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.env.SHOTS || '/tmp/ww-shots';
import fs from 'fs'; fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/instructor/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.INSTRUCTOR_EMAIL || 'instructor@example.edu', password: process.env.INSTRUCTOR_PASSWORD || 'wumpus' }) });
assert.equal(login.status, 200, 'instructor login');
const cookie = login.headers.get('set-cookie').split(';')[0];
const H = { 'Content-Type': 'application/json', cookie };
const sess = await (await fetch(`${BASE}/api/instructor/sessions`, { method: 'POST', headers: H, body: JSON.stringify({ title: 'E2E', mode: 'guided', durationMinutes: 15 }) })).json();
await fetch(`${BASE}/api/instructor/sessions/${sess.code}`, { method: 'POST', headers: H, body: JSON.stringify({ action: 'start' }) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const bodies = [];
page.on('response', async (r) => { if (r.url().includes('/api/play/') && !r.url().includes('replay')) { try { bodies.push(await r.text()); } catch {} } });
await page.goto(`${BASE}/play/${sess.code}`);
await page.fill('input', 'Sara');
await page.click('button:has-text("Join the cave")');
await page.waitForSelector('[role=grid]', { timeout: 15000 });
await page.waitForSelector('text=What does the agent perceive?');
await page.screenshot({ path: `${OUT}/student-1.png`, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert(overflow <= 1, `horizontal scroll on phone: ${overflow}px`);
const btn = await page.locator('button:has-text("Forward")').boundingBox();
assert(btn.height >= 44, 'touch target >= 44px');

// play a few moves, answering checkpoints
for (let i = 0; i < 6; i++) {
  const cp = page.locator('button:has-text("Check My Inference")');
  if (await cp.count()) {
    // blocked actions while checkpoint pending
    assert(await page.locator('button:has-text("Forward")').isDisabled(), 'actions disabled while checkpoint pending');
    if (await page.locator('[role=radio]').count()) await page.locator('[role=radio]').first().click();
    await cp.first().click();
    await page.waitForTimeout(500);
    continue;
  }
  await page.click('button:has-text("Forward")'); await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/student-2.png`, fullPage: true });
await page.click('text=Behind the Agent');
await page.screenshot({ path: `${OUT}/student-3-logic.png`, fullPage: true });
const all = bodies.join('\n');
if (!all.includes('"outcome":"dead"') && !all.includes('"over":true')) { assert(!all.includes('"pits"'), 'hidden pits leaked'); assert(!all.includes('"gold":{'), 'hidden gold leaked'); }
assert((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'no horizontal scroll after play');

// instructor dashboard
const dctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await dctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE }]);
const d = await dctx.newPage();
await d.goto(`${BASE}/instructor/s/${sess.code}`);
await d.waitForSelector('text=عدد الطالبات المشاركات');
await d.waitForSelector('text=Sara');
await d.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
await d.click('text=التحليلات والمفاهيم الخاطئة'); await d.waitForTimeout(800);
await d.screenshot({ path: `${OUT}/analytics.png`, fullPage: true });
await d.goto(`${BASE}/instructor/s/${sess.code}/demo`); await d.waitForSelector('[role=grid]', { timeout: 15000 }); await d.waitForTimeout(500);
await d.screenshot({ path: `${OUT}/demo.png`, fullPage: true });
await browser.close();
console.log('E2E OK — screenshots in', OUT);
