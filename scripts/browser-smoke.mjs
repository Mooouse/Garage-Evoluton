import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = process.cwd();
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep) && path !== resolve(root, 'index.html')) { res.writeHead(403); res.end(); return; }
  try {
    const file = await readFile(path);
    const ct = path.endsWith('.js') ? 'application/javascript' : path.endsWith('.webp') ? 'image/webp' : 'text/html';
    res.writeHead(200, { 'content-type': ct, 'cache-control': 'no-store' });
    res.end(file);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let failures = 0;
for (const viewport of [{width:1280,height:720},{width:390,height:844}]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const missing = [];
  page.on('pageerror', e => errors.push('UNCAUGHT ' + e.stack));
  page.on('console', m => { if(m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  page.on('response', r => { if(r.status() >= 400) missing.push(r.status() + ' ' + r.url()); });
  await page.goto('http://127.0.0.1:' + port + '/', {waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(4500);
  const report = await page.evaluate(() => {
    const ui = document.getElementById('ui');
    const canvas = document.getElementById('game');
    const ctx = canvas?.getContext('2d');
    const pixel = ctx?.getImageData(0,0,canvas.width,canvas.height).data;
    let nontrivial=0, transparent=0;
    if(pixel) for(let i=0;i<pixel.length;i+=64*4){if(pixel[i+3]===0)transparent++;if(Math.max(pixel[i],pixel[i+1],pixel[i+2])-Math.min(pixel[i],pixel[i+1],pixel[i+2])>15)nontrivial++;}
    return {title:document.title,canvas:{width:canvas?.width,height:canvas?.height,nontrivial,transparent},
      ui:!!ui,uiHTML:(ui?.innerHTML ?? '').slice(0,700), buttons:[...document.querySelectorAll('#ui button')].slice(0,30).map(b=>({text:b.textContent?.trim().slice(0,48),gp:b.dataset.gp,visible:b.getBoundingClientRect().width>0}))};
  });
  console.log('VIEWPORT '+JSON.stringify(viewport)+' '+JSON.stringify(report));
  console.log('NETWORK ERRORS '+JSON.stringify(missing.slice(0,25)));
  if(!report.ui || !report.canvas.width || !report.buttons.some(b=>b.visible) || errors.length || missing.length)failures++;
  const targets = ['[data-gp=shop]','[data-gp=title-map]','[data-gp=quick-buy]','[data-gp=page-next]','[data-gp=resume]'];
  for(const selector of targets) console.log('CONTROL '+selector+': '+await page.locator(selector).count());
  console.log('BROWSER ERRORS '+JSON.stringify(errors.slice(0,20)));
  await page.screenshot({path:'/tmp/garage-'+viewport.width+'.png',fullPage:true});
  await context.close();
}
await browser.close();
server.close();
if(failures) process.exitCode=1;
