// The game's own checks: the rules (layers, strokes, the stages), the economy, and the balance pinned.

import { evaluateBalance, mergeShape } from '@gp/core';
import { solveModel } from '@gp/core/balance-model';
import { describe, expect, it } from 'vitest';
import { balanceModel, campaign, playCar, spaceRun } from './bot.ts';
import { CARS_TO_OPEN, CATS, FLOW, GARAGES, GRID, PRESTIGE, SITES, toolCap } from './data.ts';
import { affords, backgroundRate, buy, canPrestige, crewRate, nextGoal, offline, siteCars, dayOrder, networkRate, newSave, ORDER_NEED, orderCount, prestige, priceOf, refund, restore, sanitize, saveShape, openGate, siteRate, travel, visitDay } from './economy.ts';
import { MODELS } from './models.ts';
import { bodyMask, currentLayerIndex, newCar, powers, pullDent, releaseDent, robotsStep, newRobots, seeded, stroke, tick, topAt } from './sim.ts';

describe('vehicles', () => {
  it('every model has a body on the grid', () => {
    for (const m of MODELS) expect(bodyMask(m).cells, m.id).toBeGreaterThan(300);
  });
  it('model names are unique and never a near-brand', () => {
    const names = MODELS.map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).not.toMatch(/porsh|ferar|lambo|toyo|nisan|merced|bmw|audi|ford|chevro|dodge|jeep|volks|honda|mazda|tesla|bugat|maclar|mclar/);
  });
});

describe('rules', () => {
  it('every car comes with a damage profile that decides its jobs', () => {
    const p0 = powers({ wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 });
    const crash = newCar(seeded(8), { garage: 2, profile: 'crash', model: 'glide' });
    expect(crash.dents.length).toBeGreaterThanOrEqual(2);
    // One or two jobs besides the cleaning, never more (the designer, 1.5.0: the tyre bay on 21 cars of 22)
    for (let k = 1; k < 80; k++) {
      const c = newCar(seeded(k), { garage: 4 });
      expect([c.wheels, c.dents, c.parts, c.engine].filter((x) => x.length).length).toBeLessThanOrEqual(2);
    }
    const first = newCar(seeded(1), { garage: 1, first: true, model: 'glide' });
    expect(first.profile).toBe('daily');
    expect(first.dents.length + first.wheels.length + first.parts.length).toBe(0);
    // A dent let go early springs back part of the way; pulled far enough it pops
    const d = crash.dents[0];
    crash.stage = 'body';
    const res = pullDent(crash, 0, 4, p0)!;
    const left = d.left;
    releaseDent(crash, 0, res.removed);
    expect(d.left).toBeGreaterThan(left);
    expect(d.left).toBeLessThan(d.work);
    let fixed = false;
    for (let k = 0; k < 400 && !fixed; k++) fixed = !!pullDent(crash, 0, 1, p0)?.fixed;
    expect(fixed).toBe(true);
    // A fire at the Station: a full respray in a colour the player picks (the last one rare)
    const fire = newCar(seeded(4), { garage: 3, profile: 'fire', model: 'zenith' });
    expect(fire.respray).toBe(true);
    expect(fire.palette.length).toBe(3);
    expect(fire.layers.find((l) => l.kind === 'paint')!.total).toBeGreaterThan(0);
  });
  it('a stroke works the layer on top where it lands, and the next layer shows when it is gone', () => {
    const car = newCar(seeded(3), { garage: 1, first: true, model: 'glide' });
    tick(car, 5);
    expect(car.stage).toBe('surface');
    expect(car.layers[0].kind).toBe('mud');
    const p = powers({ wash: 60, grind: 60, paint: 60, polish: 60, wrench: 60 });
    let first: string | undefined;
    for (let k = 0; k < 4000 && car.stage === 'surface'; k++) {
      const i = car.mask.findIndex((m, j) => m > 0 && topAt(car, j) === currentLayerIndex(car));
      const top = car.layers[topAt(car, i)].kind;
      const res = stroke(car, (i % 96) + 0.5, Math.floor(i / 96) + 0.5, p);
      // The stroke works the layer on top where it lands
      if (res) expect(res.kind).toBe(top);
      if (res?.finished && !first) first = res.finished;
    }
    // One stage at a time: the first layer finished is the top one (the mud), then the next in order
    expect(first).toBe('mud');
    expect(car.layers.every((l) => l.left === 0)).toBe(true);
    expect(car.stage).toBe('finale');
  });
  it('the first car takes an average player 20–40 s', () => {
    const car = newCar(seeded(1), { garage: 1, first: true, model: 'glide' });
    const t = playCar(car, newSave(), seeded(2));
    expect(t).toBeGreaterThan(18);
    expect(t).toBeLessThan(40);
  });
  it('a full crew of robots finishes a car alone, each robot only at its own trade', () => {
    const s = newSave();
    for (const c of ['wash', 'grind', 'paint', 'polish', 'wrench'] as const) s.robots[c] = 1;
    const car = newCar(seeded(5), { garage: 3, profile: 'crash' });
    tick(car, 5);
    const rs = newRobots();
    let t = 0;
    while (car.stage !== 'finale' && t < 3600) {
      for (const r of robotsStep(car, rs, 0.25, s.robots, powers(s.tools))) {
        // A robot's stroke is always of its own trade
        if (r.res.kind === 'part' || r.res.kind === 'engine' || r.res.kind === 'dent') expect(r.cat).toBe('wrench');
        else expect(r.cat).toBe(r.res.cat);
      }
      t += 0.25;
    }
    expect(car.stage).toBe('finale');
  });
  it('a washer alone washes and stops: it never grinds rust', () => {
    const s = newSave();
    s.robots.wash = 1;
    let car = newCar(seeded(5), { garage: 1 });
    for (let k = 6; !car.layers.some((l) => l.kind === 'rust') && k < 60; k++) car = newCar(seeded(k), { garage: 1 });
    tick(car, 5);
    const rs = newRobots();
    for (let t = 0; t < 600; t += 0.25) robotsStep(car, rs, 0.25, s.robots, powers(s.tools));
    expect(car.layers.find((l) => l.kind === 'mud')?.left ?? 0).toBe(0);
    expect(car.layers.find((l) => l.kind === 'rust')!.left).toBeGreaterThan(0);
  });
});

describe('economy', () => {
  it('buy and undo round-trip exactly; tools stop at the garage cap', () => {
    const s = newSave();
    s.money = 1e9;
    const before = s.money;
    expect(buy(s, { kind: 'tool', cat: 'wash' })).toBe(true);
    expect(refund(s, { kind: 'tool', cat: 'wash' })).toBe(true);
    expect(s.money).toBe(before);
    for (let i = 0; i < 50; i++) buy(s, { kind: 'tool', cat: 'wash' });
    expect(s.tools.wash).toBe(toolCap(1));
    expect(priceOf(s, { kind: 'tool', cat: 'paint' })).toBeNull();
  });
  it('the network: garages open in order and keep their own tools and robots; the hangar needs the prestige', () => {
    const s = newSave();
    s.money = 1e15;
    const earth = SITES.filter((x) => !x.space).length;
    for (let i = 1; i < earth; i++) {
      // The gate first (no price while the last garage has cars to restore), then the price
      expect(priceOf(s, { kind: 'garage' })).toBeNull();
      s.sites[s.at].cars = 50;
      expect(priceOf(s, { kind: 'garage' })).toBe(SITES[i].price);
      expect(buy(s, { kind: 'garage' })).toBe(true);
      expect(s.at).toBe(SITES[i].id);
      expect(s.garage).toBe(SITES[i].tier);
    }
    // The space hangar waits for the prestige
    expect(priceOf(s, { kind: 'garage' })).toBeNull();
    // Each garage its own: a robot bought here stays here
    buy(s, { kind: 'robot', cat: 'wash' });
    expect(s.sites[s.at].robots.wash).toBe(1);
    travel(s, 'shed');
    expect(s.garage).toBe(1);
    expect(s.robots.wash).toBe(0);
    buy(s, { kind: 'tool', cat: 'wash' });
    expect(s.sites.shed.tools.wash).toBe(1);
    expect(s.sites.hyper.tools.wash).toBe(40); // its own: the kit it opened with
    // A save round-trip keeps the links: the live tools are the garage's
    const back = sanitize(JSON.parse(JSON.stringify(s)));
    expect(back.at).toBe('shed');
    back.tools.wash++;
    expect(back.sites.shed.tools.wash).toBe(2);
    // The prestige keeps the album, closes the network down to the Shed
    s.life = PRESTIGE.unit * 9;
    restore(s, newCar(seeded(2), { garage: 1 }), 20, false);
    expect(canPrestige(s)).toBe(true);
    expect(prestige(s)).toBeGreaterThanOrEqual(3);
    expect(Object.keys(s.sites)).toEqual(['shed']);
    expect(s.garage).toBe(1);
    expect(Object.keys(s.album).length).toBe(1);
  });
  it('a 1.3 save moves into the network: its levels open, its tools and robots stay where it was', () => {
    const old = { ...newSave(), garage: 3, tools: { wash: 12, grind: 8, paint: 0, polish: 5, wrench: 2 }, robots: { wash: 2, grind: 1, paint: 0, polish: 1, wrench: 1 } } as Partial<ReturnType<typeof newSave>>;
    delete old.sites;
    delete old.at;
    const s = sanitize(old as never);
    expect(Object.keys(s.sites).sort()).toEqual(['shed', 'station', 'tuning']);
    expect(s.at).toBe('station');
    expect(s.tools.wash).toBe(12);
    expect(s.robots.wrench).toBe(1);
  });
  it('the robots of a garage you are not in still earn (only a full crew)', () => {
    const s = newSave();
    expect(networkRate(s)).toBe(0);
    for (const c of ['wash', 'grind', 'paint', 'polish', 'wrench'] as const) s.sites.shed.robots[c] = 1;
    expect(siteRate(s, 'shed')).toBeGreaterThan(0);
    s.sites.corner = { tools: s.sites.shed.tools, robots: { wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 }, cars: 0, earned: 0 };
    travel(s, 'corner');
    expect(backgroundRate(s)).toBeCloseTo(siteRate(s, 'shed'));
  });
  it('coming back: days in a row and the day\'s order', () => {
    const s = newSave();
    expect(visitDay(s, '2026-10-14', '2026-10-13')).toBe(true);
    expect(s.streak.n).toBe(1);
    s.streak.claimed = true;
    expect(visitDay(s, '2026-10-14', '2026-10-13')).toBe(false);
    expect(visitDay(s, '2026-10-15', '2026-10-14')).toBe(true);
    expect(s.streak.n).toBe(2);
    expect(visitDay(s, '2026-10-18', '2026-10-17')).toBe(true);
    expect(s.streak.n).toBe(1);
    const o = dayOrder(s, '2026-10-14');
    const car = newCar(seeded(2), { garage: 1, profile: o.profile });
    for (let i = 1; i < ORDER_NEED; i++) expect(orderCount(s, car, '2026-10-14')).toBe('progress');
    expect(orderCount(s, car, '2026-10-14')).toBe('done');
    expect(orderCount(s, car, '2026-10-14')).toBe(null);
  });
  it('a broken save is made safe', () => {
    const s = sanitize({ money: 'x', garage: 99, tools: { wash: -3, nope: 4 }, album: { fake: {}, glide: { n: 2, rar: ['rare', 'bogus'] } } } as never);
    expect(s.money).toBe(0);
    expect(s.garage).toBe(GARAGES.length);
    expect(s.tools.wash).toBe(0);
    expect(Object.keys(s.album)).toEqual(['glide']);
    expect(s.album.glide.rar).toEqual(['rare']);
  });
});

describe('the paint comes last', () => {
  it('a respray waits for the cleaning, the dents, the wheels and the parts, then it is the only job left', () => {
    let car = newCar(seeded(1), { garage: 4, profile: 'fire', model: 'zenith' });
    for (let k = 2; !car.respray && k < 50; k++) car = newCar(seeded(k), { garage: 4, profile: 'fire', model: 'zenith' });
    expect(car.respray).toBe(true);
    // The tyre bay is played by hand (its own test): none here
    car.wheels.length = 0;
    tick(car, 99);
    expect(car.stage).toBe('surface');
    // The cleaning never offers the paint layer
    expect(car.layers[currentLayerIndex(car)].kind).not.toBe('paint');
    const p = powers({ wash: 60, grind: 60, paint: 60, polish: 60, wrench: 60 });
    const seen: string[] = [];
    for (let n = 0; n < 200000 && car.stage !== 'finale'; n++) {
      if (seen[seen.length - 1] !== car.stage) seen.push(car.stage);
      if (car.stage === 'surface' && !car.painting) expect(car.layers.find((l) => l.kind === 'paint')!.left).toBeGreaterThan(0);
      if (car.stage === 'body') {
        for (const d of car.dents) d.left = 0;
      }
      const task = (car.stage === 'parts' ? car.parts : car.stage === 'engine' ? car.engine : []).find((q) => q.left > 0);
      if (task) stroke(car, task.gx, task.gy, p, 'hand');
      else {
        const cur = currentLayerIndex(car);
        const i = cur >= 0 ? car.mask.findIndex((m, j) => m === 1 && topAt(car, j) === cur) : 0;
        stroke(car, (i % GRID.w) + 0.5, Math.floor(i / GRID.w) + 0.5, p, 'hand');
      }
      tick(car, 0.016);
    }
    expect(car.stage).toBe('finale');
    expect(car.painting).toBe(true);
    // The surface comes twice: the cleaning first, the paint at the very end
    expect(seen[0]).toBe('surface');
    expect(seen[seen.length - 1]).toBe('surface');
    expect(seen.length).toBeGreaterThan(2);
  });
});

describe('the tyre bay', () => {
  it('let go of the pump above the green: the valve brings it down and the step finishes (it used to stick)', async () => {
    const { GREEN, newWheelJob, wheelTick } = await import('./wheels.ts');
    const job = newWheelJob(seeded(1), 0, 'flat', 5, false);
    job.step = 'pump';
    job.pressure = GREEN[1] + 0.06;
    let t = 0;
    while (job.step === 'pump' && t < 5) {
      wheelTick(job, 0.02, false);
      t += 0.02;
    }
    expect(job.step).toBe('nutsOn');
    expect(job.mistakes).toBe(0);
  });
  it('the mechanic robot does the wheels through to the end beside the player, and waits while their finger is down', () => {
    let car = newCar(seeded(2), { garage: 3, profile: 'crash', model: 'zenith' });
    for (let k = 3; !car.wheels.length && k < 60; k++) car = newCar(seeded(k), { garage: 3, profile: 'crash', model: 'zenith' });
    expect(car.wheels.length).toBeGreaterThan(0);
    car.stage = 'wheels';
    const rs = newRobots();
    const counts = { wash: 0, grind: 0, paint: 0, polish: 0, wrench: 2 };
    const p = powers({ wash: 1, grind: 1, paint: 1, polish: 1, wrench: 1 });
    for (let i = 0; i < 200; i++) robotsStep(car, rs, 0.1, counts, p, 1, { avoid: [10, 10, 12] });
    expect(car.wheels.some((j) => j.step !== 'done')).toBe(true);
    for (let i = 0; i < 6000 && car.stage === 'wheels'; i++) robotsStep(car, rs, 0.1, counts, p, 1, {});
    expect(car.wheels.every((j) => j.step === 'done')).toBe(true);
    expect(car.stage).not.toBe('wheels');
  });
});

describe('one look per garage', () => {
  it('every vehicle belongs to exactly one garage, and a garage is all painted or all drawn — also the older cars it gets', () => {
    const seen = new Map<string, string>();
    for (const x of SITES)
      for (const id of x.pool) {
        expect(seen.get(id), `${id} in ${x.id} and ${seen.get(id)}`).toBeUndefined();
        seen.set(id, x.id);
      }
    for (const m of MODELS) expect(seen.has(m.id), m.id).toBe(!m.retired);
    // Every vehicle on the Earth is one of the owner's pictures (2026-10-19); only the spacecraft are drawn
    for (const id of seen.keys()) {
      const m = MODELS.find((q) => q.id === id)!;
      expect(m.painted || m.cls === 'space', id).toBe(true);
    }
    for (const x of SITES) {
      const painted = MODELS.find((m) => m.id === x.pool[0])!.painted ?? false;
      for (const id of x.pool) expect(!!MODELS.find((m) => m.id === id)!.painted, `${x.id}: ${id}`).toBe(!!painted);
      for (let i = 0; i < 60; i++) expect(!!newCar(seeded(i), { ...siteCars(x.id) }).model.painted, `${x.id} car ${i}`).toBe(!!painted);
    }
  }, 60000);
});

describe('spacecraft', () => {
  it('no ship has car wheels (the rover aside); every ship but the Unknown Object has nozzles, each inside its bounds', () => {
    for (const m of MODELS.filter((x) => x.cls === 'space' && x.id !== 'selene')) {
      expect(m.shape.wheels.length, m.id).toBe(0);
      if (m.id !== 'unknown') expect(m.shape.thrusters?.length, m.id).toBeGreaterThan(0);
    }
  });
  it('a ship brings broken nozzles instead of wheels: worked with the wrench before the parts, by hand or by the mechanic robot', () => {
    for (const id of ['orbiter', 'tallship', 'moth']) {
      const car = newCar(seeded(3), { garage: 6, model: id, profile: 'crash' });
      expect(car.wheels.length).toBe(0);
      expect(car.thrusters.length).toBeGreaterThan(0);
      for (const l of car.layers) {
        l.amt.fill(0);
        l.left = 0;
      }
      tick(car, 99);
      // Past the surface (no paint job on this car, or after it)
      const p = powers({ wash: 10, grind: 10, polish: 10, paint: 10, wrench: 10 });
      if (car.stage === 'surface') stroke(car, 1, 1, p);
      expect(car.stage).toBe('thrusters');
      const robots = newRobots();
      for (let i = 0; i < 4000 && car.stage === 'thrusters'; i++) robotsStep(car, robots, 0.1, { wash: 0, grind: 0, polish: 0, paint: 0, wrench: 2 }, p);
      expect(car.thrusters.every((t) => t.left <= 0)).toBe(true);
      expect(['parts', 'engine', 'surface', 'finale']).toContain(car.stage);
    }
    // By hand: a stroke on the nozzle's spot
    const car = newCar(seeded(5), { garage: 6, model: 'kestrel', profile: 'fire' });
    for (const l of car.layers) {
      l.amt.fill(0);
      l.left = 0;
    }
    tick(car, 99);
    const p = powers({ wash: 50, grind: 50, polish: 50, paint: 50, wrench: 50 });
    if (car.stage === 'surface') stroke(car, 1, 1, p);
    const t = car.thrusters[0];
    let res = null;
    for (let i = 0; i < 400 && t.left > 0; i++) res = stroke(car, t.gx + 1, t.gy, p, 'hand') ?? res;
    expect(t.left).toBe(0);
    expect(res?.kind).toBe('thruster');
  });
  it('the space garages open in order after the hangar, each dearer and paying more; only ships come there', () => {
    const space = SITES.filter((x) => x.space);
    expect(space.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < space.length; i++) {
      expect(space[i].price).toBeGreaterThan(space[i - 1].price);
      expect(space[i].mult ?? 1).toBeGreaterThan(space[i - 1].mult ?? 1);
    }
    for (const x of space) for (const id of x.pool) expect(MODELS.find((m) => m.id === id)?.cls, `${x.id}: ${id}`).toBe('space');
    const s = newSave();
    s.prestige = 1;
    s.money = 1e18;
    for (let k = 0; k < SITES.length; k++) {
      s.sites[s.at].cars = 50;
      buy(s, { kind: 'garage' });
    }
    expect(Object.keys(s.sites).length).toBe(SITES.length);
    expect(s.at).toBe(space[space.length - 1].id);
    for (let i = 0; i < 20; i++) expect(newCar(seeded(i), { ...siteCars(s.at) }).model.cls).toBe('space');
  });
});

describe('achievements', () => {
  it('earned once, from the save; hidden ones too; a broken save keeps only strings', async () => {
    const { checkAchievements, ACHIEVEMENTS } = await import('./achievements.ts');
    const s = newSave();
    expect(checkAchievements(s, new Date(2026, 9, 16, 12))).toEqual([]);
    s.stats.restored = 1;
    s.stats.fastest = 8;
    expect(checkAchievements(s, new Date(2026, 9, 16, 12))).toEqual(['first', 'speed']);
    expect(checkAchievements(s, new Date(2026, 9, 16, 2))).toEqual(['night']);
    expect(checkAchievements(s, new Date(2026, 9, 16, 2))).toEqual([]);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(sanitize({ ...s, ach: ['first', 3, 'first'] } as never).ach).toEqual(['first']);
  });
});

describe('balance', () => {
  it('the campaign: the Workshop in minutes, the prestige and the hangar within the meta', () => {
    const c = campaign(1, 'cheap');
    expect(c.firstCarSec).toBeLessThan(40);
    expect(c.firstBuySec!).toBeLessThan(60);
    expect(c.prestigeMin!).toBeGreaterThan(35);
    expect(c.prestigeMin!).toBeLessThan(120);
    // The network takes days (the owner's table: «не смог открыть и посмотреть все за 1 день»): the space hangar after
    // hours of play and several prestiges
    expect(c.curve.finishMin!).toBeGreaterThan(240);
    // 13 Earth garages since 1.4.0 (three a tier from the third): the hangar within 12 hours of play
    expect(c.curve.finishMin!).toBeLessThan(720);
    expect(c.prestiges.length).toBeGreaterThanOrEqual(3);
  }, 120000);
  it("space after the hangar: every planet's garage opens, none more than 45 minutes after the one before", () => {
    const r = spaceRun(1, 400);
    expect(r.opened.map(([id]) => id)).toEqual(SITES.filter((x) => x.space && x.id !== 'hangar').map((x) => x.id));
    let prev = 0;
    for (const [, m] of r.opened) {
      expect(m - prev).toBeLessThan(45);
      prev = m;
    }
  }, 300000);
  it('the model has no failing check', () => {
    const r = solveModel(balanceModel());
    expect(r.cheap.stuck).toBeNull();
  }, 60000);
  it("the balance report meets the channel's targets", async () => {
    const { balance } = await import('./bot.ts');
    const v = evaluateBalance(balance(), 'crazygames');
    expect(v.rows.filter((r) => r.status === 'fail').map((r) => `${r.name}: ${r.detail}`)).toEqual([]);
  }, 120000);
});

describe('the save', () => {
  it('keeps every opened garage through the platform\'s loader (the table, 2026-10-19: «прогресс гаражей не сохраняется»)', () => {
    const s = newSave();
    s.money = 1e7;
    for (let i = 0; i < 3; i++) {
      s.sites[s.at].cars = 50;
      expect(buy(s, { kind: 'garage' })).toBe(true);
    }
    s.sites.tuning.robots.wash = 1;
    const stored = JSON.parse(JSON.stringify(s));
    const back = sanitize(mergeShape(saveShape(), stored));
    expect(Object.keys(back.sites).sort()).toEqual(['corner', 'rally', 'shed', 'tuning']);
    expect(back.at).toBe(s.at);
    expect(back.sites.tuning.robots.wash).toBe(1);
    // A 1.3 save (one garage level, no network) still opens the garages of the levels it reached
    const old = { ...stored, sites: undefined, at: undefined, garage: 2 };
    delete old.sites;
    delete old.at;
    const up = sanitize(mergeShape(saveShape(), old));
    expect(Object.keys(up.sites).sort()).toEqual(['shed', 'tuning']);
  });
});

describe('the next garage', () => {
  it('opens only after enough cars are restored in the last one (the table, 2026-10-19)', () => {
    const s = newSave();
    s.money = 1e9;
    expect(buy(s, { kind: 'garage' })).toBe(false);
    expect(openGate(s)).toEqual({ have: 0, need: CARS_TO_OPEN[1], at: 'shed' });
    s.sites.shed.cars = CARS_TO_OPEN[1];
    expect(buy(s, { kind: 'garage' })).toBe(true);
    expect(s.at).toBe('corner');
    // The count starts again in the garage just opened
    expect(openGate(s)!.have).toBe(0);
  });
});

describe('the garage fund (the designer, 1.5.0: the goal fell 80 % → 3 % on one upgrade)', () => {
  it('a share of every payout goes aside, the goal only grows, and the garage is paid from it', () => {
    const s = newSave();
    let last = 0;
    for (let k = 0; k < 12; k++) {
      restore(s, newCar(seeded(40 + k), { ...siteCars('shed') }), 20, false);
      // Every affordable upgrade bought at once: the goal still never goes back
      for (const c of CATS) while (buy(s, { kind: 'tool', cat: c }));
      const g = nextGoal(s);
      expect(g.share).toBeGreaterThanOrEqual(last);
      last = g.share;
    }
    expect(s.fund).toBeGreaterThan(0);
    expect(s.fund).toBeLessThanOrEqual(SITES[1].price);
    s.money = Math.max(0, SITES[1].price - s.fund);
    expect(affords(s, { kind: 'garage' })).toBe(true);
    expect(buy(s, { kind: 'garage' })).toBe(true);
    expect(s.fund).toBe(0);
    expect(s.money).toBeCloseTo(0, 6);
    expect(FLOW.fundShare).toBeGreaterThan(0);
  });
});

describe('robots earn from the first hire (the designer, 1.5.0)', () => {
  it('one wash bot earns, also while away; another robot never lowers it', () => {
    const s = newSave();
    s.robots.wash = 1;
    expect(siteRate(s, 'shed')).toBeGreaterThan(0);
    s.seen = Date.now() - 3 * 3600e3;
    expect(offline(s, Date.now())?.money ?? 0).toBeGreaterThan(0);
    const before = crewRate('shed', s.tools, s.robots, 0).perSec;
    for (const c of CATS) {
      const more = { ...s.robots, [c]: s.robots[c] + 1 };
      expect(crewRate('shed', s.tools, more, 0).perSec).toBeGreaterThanOrEqual(before);
    }
  });
});
