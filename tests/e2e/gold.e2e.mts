// Plays a whole game through the real UI (Challenge mode) following a perfect agent, to catch crashes at Grab/Climb/ending.
import { createRequire } from 'module';
import { simulateAgent } from '../../src/lib/engine/simulate';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const H0 = { 'Content-Type': 'application/json' };
const login = await fetch(`${BASE}/api/instructor/login`, { method: 'POST', headers: H0, body: JSON.stringify({ email: 'instructor@example.edu', password: 'wumpus' }) });
const cookie = login.headers.get('set-cookie')!.split(';')[0];
const H = { ...H0, cookie };
const sess = await (await fetch(`${BASE}/api/instructor/sessions`, { method: 'POST', headers: H, body: JSON.stringify({ mode: 'challenge', durationMinutes: 15 }) })).json();
await fetch(`${BASE}/api/instructor/sessions/${sess.code}`, { method: 'POST', headers: H, body: JSON.stringify({ action: 'start' }) });
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
const errors: string[] = []; page.on('pageerror', (e: any) => errors.push(e.message));
page.on('response', (r: any) => { if (r.url().includes('/api/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(`${BASE}/play/${sess.code}`);
await page.fill('input', 'Gold'); await page.click('button:has-text("Join the cave")');
await page.waitForSelector('[role=grid]');
const creds = await page.evaluate((c: string) => JSON.parse(localStorage.getItem('ww:' + c)!), sess.code);
const ov = await (await fetch(`${BASE}/api/instructor/sessions/${sess.code}/students/${creds.pid}`, { headers: H })).json();
const world = ov.world;
const actions = simulateAgent({ pits: world.pits, wumpus: world.wumpus, gold: world.gold, seed: 'x', teaching: { score: 0, notes: [], safeSolvable: true } }).actions;
console.log('actions', actions.length, actions.join(','));
const label: Record<string, string> = { turn_left: 'Left', turn_right: 'Right', forward: 'Forward', grab: 'Grab', shoot: 'Shoot', climb: 'Climb' };
for (const a of actions) {
  await page.locator(`section[aria-label=Actions] button:has-text("${label[a]}")`).click();
  await page.waitForTimeout(350);
  if (errors.length) { console.log('ERRORS after', a, errors); await page.screenshot({ path: '/tmp/ww-shots/gold-fail.png', fullPage: true }); break; }
  if (a === 'grab') await page.screenshot({ path: '/tmp/ww-shots/gold-after-grab.png', fullPage: true });
}
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/ww-shots/gold-end.png', fullPage: true });
console.log('body has report:', await page.locator('text=Your Agent Reasoning Report').count(), 'errors:', errors);
await browser.close();
