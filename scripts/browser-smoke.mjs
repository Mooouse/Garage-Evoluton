import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = process.cwd();
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root + sep) && path !== resolve(root, 'index.html')) { res.writeHead(403); res.end(); return; }
  try {
    let file = await readFile(path);
    // Expose the game's built-in QA driver ONLY in this local test response.
    // The production game.js in the repository and Pages remains unchanged.
    if (path.endsWith('/game.js')) {
      const source = file.toString('utf8');
      const marker = 'e.qa({play:';
      if (!source.includes(marker)) throw Error('QA registration changed; update smoke harness');
      file = Buffer.from(source.replace(marker, 'e.qa(globalThis.__garageSmokeQA={play:'));
    }
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
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const message = m.text();
    // CrazyGames/HTML5 SDK rate-limits rapid test-only gameplay transitions.
    // This diagnostic is not a game error; keep reporting every other error.
    if (message.includes('HTML5 SDK') && message.includes('call throttled') && /gameplay(Start|Stop)/.test(message)) return;
    errors.push('CONSOLE ' + message);
  });
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
      ui:!!ui, buttons:[...document.querySelectorAll('#ui button')].slice(0,30).map(b=>({text:b.textContent?.trim().slice(0,48),gp:b.dataset.gp,visible:b.getBoundingClientRect().width>0}))};
  });
  console.log('VIEWPORT '+JSON.stringify(viewport)+' '+JSON.stringify(report));
  console.log('NETWORK ERRORS '+JSON.stringify(missing.slice(0,25)));

  // The eight original drawings must be present as native-HD textures and
  // each car must have its own separately decoded wheel sprites.
  try {
    const textures = await page.evaluate(async () => {
      const initial = ['longnose','scissor','storm','zephyrus','viola','tempest','trackwing','carboncrown'];
      const matched = ['gamin','gremlin','hornet','longroof','lumen','midship','monarch','raven','ringleader','swedebrick','tangerine','vandal','voltage','highwing','bubble','sledge','skyscraper','dusk','feather','pounce','mulberry','boxer','aero','bellaotto','swiftarrow','senator','sovereign','thunderfour','serpent','emerald','turini','prowler','viaggio','kabuki','diamond','hanok','zeppelin','papaya','amethyst'];
      const ids = [...initial, ...matched];
      let loaded = 0;
      for (const id of ids) {
        for (const file of [id, id + '-w0', id + '-w1']) {
          const response = await fetch('/games/garage-evolution/painted/' + file + '.webp');
          if (!response.ok) throw Error(file + ': HTTP ' + response.status);
          const bitmap = await createImageBitmap(await response.blob());
          const minimum = file === id ? (initial.includes(id) ? 1500 : 900) : 145;
          if (bitmap.width < minimum || bitmap.height < 100)
            throw Error(file + ': unexpected low resolution ' + bitmap.width + 'x' + bitmap.height);
          bitmap.close();
          loaded++;
        }
      }
      return loaded;
    });
    console.log('HD ORIGINAL SPRITES '+textures+'/141 decoded at source resolution');
  } catch (error) {
    failures++;
    console.error('HD SPRITE VALIDATION FAILED', String(error));
  }

  if(!report.ui || !report.canvas.width || !report.buttons.some(b=>b.visible) || errors.length || missing.length)failures++;
  const targets = ['[data-gp=shop]','[data-gp=title-map]','[data-gp=quick-buy]','[data-gp=page-next]','[data-gp=resume]'];
  for(const selector of targets) console.log('CONTROL '+selector+': '+await page.locator(selector).count());
  // Real mouse/touch-driven navigation, not just presence of click handlers.
  try {
    const menu = page.locator('[data-gp="menu"]');
    await menu.click({timeout:5000});
    await page.locator('[data-gp="resume"]').waitFor({state:'visible',timeout:5000});
    console.log('CONTROL CLICK menu -> pause: OK');
    await page.locator('[data-gp="resume"]').click({timeout:5000});
    await menu.waitFor({state:'visible',timeout:5000});
    console.log('CONTROL CLICK resume -> play: OK');
    await page.waitForTimeout(500);
  } catch (e) {
    failures++;
    console.error('CONTROL NAVIGATION FAILED', String(e).slice(0,1500));
  }
  try {
    // Exercise the real click handlers and every major screen with the game's own QA fixtures.
    const qa = await page.evaluate(() => !!globalThis.__garageSmokeQA?.screens);
    if (!qa) throw Error('QA driver unavailable in local browser');
    await page.evaluate(() => globalThis.__garageSmokeQA.screens.title());
    await page.locator('[data-gp="shop"]').first().click({timeout:5000});
    await page.locator('[data-gp="shop-screen"]').waitFor({state:'visible',timeout:5000});
    await page.locator('[data-gp="shop-back"]').click({timeout:5000});
    console.log('CONTROL CLICK title -> shop -> back: OK');
    await page.evaluate(() => globalThis.__garageSmokeQA.screens.title());
    await page.locator('[data-gp="title-map"]').click({timeout:5000});
    await page.locator('[data-gp="map"]').waitFor({state:'visible',timeout:5000});
    await page.locator('[data-gp="map-space"]').click({timeout:5000});
    await page.locator('[data-gp="map-earth"]').click({timeout:5000});
    console.log('CONTROL CLICK map tabs: OK');
    for (const view of ['album', 'stats']) {
      await page.evaluate(name => globalThis.__garageSmokeQA.screens[name](),view);
      await page.locator('[data-gp="page-next"]').first().click({timeout:5000});
      await page.locator('[data-gp="page-prev"]').first().click({timeout:5000});
      console.log('CONTROL CLICK '+view+' paging: OK');
    }
    await page.evaluate(() => globalThis.__garageSmokeQA.screens.results());
    await page.locator('[data-gp="results"]').waitFor({state:'visible',timeout:5000});
    console.log('CONTROL QA results: OK');
  } catch (e) {
    failures++;
    console.error('SCREEN FLOW FAILED', String(e).slice(0,1500));
  }
  if (errors.length || missing.length) failures++;
  console.log('BROWSER ERRORS '+JSON.stringify(errors.slice(0,20)));
  await page.screenshot({path:'/tmp/garage-'+viewport.width+'.png',fullPage:true});
  await context.close();
}
await browser.close();
server.close();
if(failures) process.exitCode=1;
