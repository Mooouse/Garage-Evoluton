// Idle Garage Evolution — screens, input and the host. The rules live in sim.ts and economy.ts (pure), the numbers in
// data.ts, the look in scene.ts / car-art.ts / layers.ts / garage-art.ts, the bot in bot.ts.
// The contract (the platform's docs/guides/code-games.md): data-gp="play" on the first screen's button (a new player's
// "Start scrubbing" sits on the dirty car itself: one tap and the first SLAP), host.gameplay around every car, one
// host.roundEnd per restored car, host.adBreak only on "Next car", rewarded ×2 offers with a "No thanks" as big,
// host.qa({ play, end, grant, demo, screens, cover }) for QA, every text through host.t.

import { dayKey, formatAmount, languagePicker, recordDaily, rewardedButton, type GameContext } from '@gp/core';
import { fitCanvas, watchContext } from '@gp/art/bake';
import { AutoQuality } from '@gp/art/perf';
import { bakeCar, drawRim, shipLegs, shipNozzle, wheelAt } from './car-art.ts';
import { carLoaded, carReady, pictures } from './painted-art.ts';
import { createMap, type MapPin, type MapView } from './map.ts';
import { coverArt } from './cover.ts';
import { CATS, FLOW, GARAGES, GRID, LAYER_CAT, PROFILES, type LayerKind, type Profile, PLAYER_STROKES, PRESTIGE, RARITIES, RARITY, ROBOTS, SITE, SITES, TIER_EVERY, TOOLS, starsFor, toolCap, toolPower, type Cat } from './data.ts';
import {
  affords, album, awayPerHour, earn, purse, backgroundRate, buy, canPrestige, networkRate, nextSite, siteCars, siteRate, topTier, travel, dayOrder, ORDER_NEED, orderCount, streakMinutes, visitDay, dailyCar, perfectWheels, lockOf, newSave, nextGoal, offersDouble, offline, payout, prestige, priceOf, refund, restore, sanitize, saveShape, openGate, isRush, starMult,
  type Buy, type Offline, type Save,
} from './economy.ts';
import { iconUrl, toolIcon } from './icons.ts';
import { MODEL, MODELS, bounds } from './models.ts';
import { createScene, type Coach } from './scene.ts';
import { estimate } from './bot.ts';
import { condition, currentLayerIndex, currentWheel, dentAt, isTaskStage, stageTasks, pullDent, releaseDent, newCar, newRobots, parSec, powers, robotsStep, stroke, tick, toolAt, topAt, wheelHand, wheelTime, type Car, type RobotState, type StrokeResult, type WheelEvent } from './sim.ts';
import { bayAction, bayTarget } from './bay-art.ts';
import { GREEN, RIMS } from './wheels.ts';
import { createSound } from './sound.ts';
import { bar, el, icon, installStyle } from './ui.ts';
import { ACHIEVEMENTS, ACH_COLOR, checkAchievements } from './achievements.ts';

type State = 'first' | 'title' | 'play' | 'paused' | 'results' | 'shop' | 'album' | 'stats' | 'prestige' | 'welcome' | 'levelup' | 'map';

export default async function start({ host, canvas, ui }: GameContext): Promise<void> {
  const save: Save = sanitize(host.load(saveShape()) as Save);
  const tr = host.t.bind(host);
  const $ = (n: number, round: 'down' | 'up' = 'down') => `$${formatAmount(Math.max(0, n), round)}`;
  const g = canvas.getContext('2d')!;
  watchContext(canvas);
  installStyle(host.minTouchPx);
  const scene = createScene(g);
  const sound = createSound(host, { music: save.music, sfx: save.sfx });
  if (import.meta.env.DEV) {
    // Dev only: ?garage=<n> opens a garage level with its tools (a look at every room)
    const gq = Number(new URLSearchParams(location.search).get('garage'));
    if (gq >= 1 && gq <= 6) {
      // The network up to that level, the player in its first garage with its tools and a crew
      save.prestige = gq >= 6 ? 1 : 0;
      save.stats.restored = Math.max(1, save.stats.restored);
      for (const x of SITES.filter((q) => q.tier <= gq)) {
        const tools = { wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 };
        const robots = { wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 };
        for (const c of CATS) tools[c] = Math.min(toolCap(x.tier), (x.tier - 1) * TIER_EVERY + 5);
        for (const c of CATS) robots[c] = ROBOTS[c].opens <= x.tier && !new URLSearchParams(location.search).has('norobots') ? Math.min(2, GARAGES[x.tier - 1].slots) : 0;
        save.sites[x.id] ??= { tools, robots, cars: 0, earned: 0 };
      }
      travel(save, SITES.find((q) => q.tier === gq)!.id);
      // ?site=<id>: that garage of the level (its room, its cars)
      const sq = new URLSearchParams(location.search).get('site');
      if (sq && save.sites[sq]) travel(save, sq);
    }
  }
  const seenBefore = save.stats.restored > 0 || save.lifeCars > 0 || save.prestige > 0;
  const qaHooks = import.meta.env.DEV;
  let w = 0;
  let h = 0;
  let state: State = 'title';
  let car: Car | null = null;
  let rs: RobotState = newRobots();
  let carTime = 0;
  /** The repair's own time: from the first action on the car to 100 % (not the drive in and out) — the record, Perfect */
  let repairTime = 0;
  let par = 0;
  let finaleBeat = 0;
  let doubled = false;
  let dailyQueued = false;
  let demo = false;
  let demoAcc = 0;
  let demoLast = -1;
  let demoPump = false;
  let hintKey = '';
  let hintUntil = 0;
  let twistDone = false;
  let lastPayout: { total: number; base: number; perfect: boolean; newModel: boolean; newVariant: boolean; newRarity: boolean; newRims?: string[] } = { total: 0, base: 0, perfect: false, newModel: false, newVariant: false, newRarity: false };
  let pendingOffline: Offline | null = seenBefore ? offline(save, Date.now()) : null;
  // Days in a row: a returning player's first visit of the day has a reward waiting (collected on the card)
  const yesterday = () => dayKey(new Date(Date.now() - 86400000));
  // A new player's first day counts too (recorded with the first save), with nothing to collect: tomorrow is Day 2
  const visited = visitDay(save, dayKey(), yesterday());
  if (!seenBefore) save.streak.claimed = true;
  let pendingStreak = seenBefore && visited;
  /** The day's order runs from a returning player's session on (a new player has the lessons first) */
  const ordersOn = seenBefore;
  /** The income a minute now (the reward's measure): never below a small floor, so a new garage's reward still counts */
  const perMin = () => Math.max(20, estimate(save).perMin);
  let undo: { b: Buy; n: number } | null = null;
  let autoNext = 0;
  let levelUpFrom = 0;
  const nudged = new Set<string>();
  /** Perfect is decided once, when the finale starts (the drive-out shows what the card pays) */
  let perfectNow: boolean | null = null;
  /** The RESTORED card is on its way to the next car (a second tap under the ad does nothing) */
  let leaving = false;
  /** Where the shop was opened from (Back returns there, also after purchases) */
  let shopFrom: State = 'title';
  let autoLeft = 0;
  let ringAnim: Animation | null = null;
  /** The day the daily car was brought in (credited to that day) */
  let dailyDay = '';
  /** A new player's 6th car is the rare car of the day: it comes with the gate's drama */
  const FIRST_DAILY_AT = 5;
  let firstDaily = false;

  // --- The car on the floor

  const found = () => new Set(Object.keys(save.album));
  function makeCar(): Car {
    const r = () => host.rng.random();
    if (!save.stats.restored && !save.lifeCars && save.prestige === 0) return newCar(r, { garage: 1, first: true, model: 'glide', serial: () => 1 });
    // A new player meets the rare car of the day in the first session, on its own (in two 15-minute sessions it never
    // came: the designer, 1.5.0) — its card then shows tomorrow's
    if (!seenBefore && save.lifeCars === FIRST_DAILY_AT && save.prestige === 0 && !dailyCar(save, dayKey()).done) {
      dailyQueued = true;
      firstDaily = true;
    }
    if (dailyQueued) {
      const d = dailyCar(save, dayKey());
      dailyDay = d.key;
      return newCar(r, { garage: save.garage, model: d.model, rarity: d.rarity, variant: d.variant, daily: true, serial: (id) => (save.album[id]?.n ?? 0) + 1, prestige: save.prestige });
    }
    // Dev only: ?profile=<id> brings every car with that damage (a look at each job)
    const devProfile = import.meta.env.DEV ? (new URLSearchParams(location.search).get('profile') as Profile | null) ?? undefined : undefined;
    // Dev only: ?model=<id> brings that vehicle every time
    const devModel = import.meta.env.DEV ? new URLSearchParams(location.search).get('model') ?? undefined : undefined;
    const c = newCar(r, { ...siteCars(save.at), found: found(), serial: (id) => (save.album[id]?.n ?? 0) + 1, prestige: save.prestige, profile: devProfile && PROFILES.includes(devProfile) ? devProfile : undefined, model: devModel && MODEL.has(devModel) ? devModel : undefined });
    // Dev only: ?clean brings it with the surface already done (a look at the later jobs)
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('clean'))
      for (const l of c.layers) {
        l.amt.fill(0);
        l.left = 0;
      }
    return c;
  }
  function startCar(c: Car, roll = true): void {
    car = c;
    rs = newRobots();
    carTime = 0;
    repairTime = 0;
    lastSurfaceWork = 0;
    finaleBeat = 0;
    doubled = false;
    perfectNow = null;
    leaving = false;
    // Hints are timed on the car's clock: a new car starts clean
    hintKey = '';
    hintLock = 0;
    pendingHint = null;
    hintUntil = 0;
    hintEl.style.display = 'none';
    // A car of the day's order: say so as it rolls in
    if (ordersOn && save.order.day === dayKey() && !save.order.done && c.profile === save.order.profile) hint('order.car', 3);
    if (roll && c.daily) {
      hint('results.daily', 3.5);
      sound.order();
      if (firstDaily) host.happytime();
      firstDaily = false;
    }
    par = parSec(c, powers(save.tools), PLAYER_STROKES) * 1.15 + 2;
    // A rush job: its clock is the par time a careful player beats; the robots help
    if (roll && !c.rush && isRush(save, c)) {
      c.rush = { sec: Math.max(12, Math.round(par)) };
      hint('rush.start', 3.5);
      sound.order();
    }
    if (roll) scene.setCar(c);
    else scene.showCar(c);
    // Its pictures in a later chapter, still on their way: a silhouette now, painted the moment they are decoded
    if (c.model.painted && !carLoaded(c.model.id))
      void carReady(c.model.id).then(() => {
        if (car !== c) return;
        scene.recolor();
        wake();
      });
    // A spacecraft comes down on its engines
    if (roll && flies(c)) sound.ignite(FLOW.arriveSec, 0.22);
    // Each car its own size: the strip under it
    if (strip.isConnected) placeStrip();
  }
  function flies(c: Car): boolean {
    return c.model.cls === 'space' && !c.model.shape.wheels.length;
  }

  // --- Strokes: the player's, the robots', the demo bot's

  const tierOf = (cat: Cat) => Math.floor((save.tools[cat] ?? 0) / TIER_EVERY);
  function afterStroke(res: StrokeResult, by: 'hand' | Parameters<typeof scene.stroke>[1]): void {
    if (!car) return;
    scene.stroke(res, by, tierOf(res.cat));
    sound.stroke(res.kind, res.cat, tierOf(res.cat), by === 'hand');
    if (res.removed > 0 && res.kind in LAYER_LESSON) lastSurfaceWork = carTime;
    // The coach: a layer is learned after a dozen strokes of the player's own, a bolt or an engine spot after one
    if (by === 'hand' && lesson) {
      if (res.kind in LAYER_LESSON && LAYER_LESSON[res.kind as LayerKind] === lesson.id && ++lesson.count >= 12) learn(lesson.id);
      else if (res.fixed && (res.kind === 'part' || res.kind === 'engine' || res.kind === 'thruster') && lesson.id === (res.kind === 'part' ? 'parts' : res.kind === 'thruster' ? 'thrusters' : 'engine')) learn(lesson.id);
    }
    if (res.fixed) sound.clunk();
    // A repaired nozzle's test burst
    if (res.fixed && res.kind === 'thruster') sound.ignite(0.9, 0.2);
    // The twist: rust shows under the mud where the player scrubbed, and the tool changes to the grinder by itself
    const washed = car.layers.find((l) => l.kind === 'mud' || l.kind === 'dust' || l.kind === 'soot');
    const cell = Math.floor(res.gy) * GRID.w + Math.floor(res.gx);
    if (res.kind === 'rust' && !twistDone && carTime > FLOW.arriveSec + 1.5 && washed?.kind === 'mud' && (washed.left <= 0 || (washed.init[cell] > 0 && washed.amt[cell] <= 0))) {
      car.revealed = true;
      twistDone = true;
      hint('hint.twist', 4.2);
      host.twist('layer-reveal');
    }
    // A fast player clears the mud and the rust before that moment: the line still comes once, when either is done
    if (res.finished && !twistDone && washed?.kind === 'mud' && (res.finished === 'rust' || res.finished === 'mud') && car.layers.some((l) => l.kind === 'rust')) {
      car.revealed = true;
      twistDone = true;
      hint('hint.twist', 4.2);
      host.twist('layer-reveal');
    }
    if (res.finished) {
      sound.layerDone();
      const next = car.layers.find((l) => l.left > 0);
      if (next && !car.revealed) {
        car.revealed = true;
        hint(layerHint(next.kind), 3);
      } else if (next) hint(layerHint(next.kind), 2.6);
      else hint('', 0);
      if (!next) scene.shine();
    }
    if (res.stage) {
      scene.stageChanged(res.stage);
      if (res.stage === 'wheels') {
        hint(`wheel.${currentWheel(car)?.step ?? 'nutsOff'}`, 0);
      } else if (res.stage === 'body') hint('hint.dents', 0);
      else if (isTaskStage(res.stage)) hint(`hint.${res.stage}`, 0);
    }
  }

  /** A finger is wider than a mouse pointer: on touch the brush is half again as wide (the same strength) */
  let touchInput = false;
  function handPowers(): ReturnType<typeof powers> {
    const p = powers(save.tools);
    if (!touchInput) return p;
    for (const c of CATS) p[c] = { ...p[c], radius: p[c].radius * 1.5 };
    return p;
  }
  function handStroke(x: number, y: number): void {
    if (!car || state !== 'play' || host.paused) return;
    if (car.stage !== 'surface' && !isTaskStage(car.stage)) return;
    const [gx, gy] = scene.screenToGrid(x, y);
    const res = stroke(car, gx, gy, handPowers(), 'hand');
    if (res) {
      afterStroke(res, 'hand');
      if (hintKey === 'hint.scrub') hint('', 0);
      scene.setGhost(false);
    }
  }

  // --- The tyre bay: taps on nuts, water on the tyre, the pump held, the balance tapped

  let pumping = false;
  const wrenchTier = () => Math.floor(save.tools.wrench / TIER_EVERY);
  function onWheel(ev: WheelEvent, by: 'hand' | 'robot'): void {
    if (!car) return;
    const job = ev.job;
    if (job.popped) {
      sound.pop();
      scene.fx.flash('#ffffff', 0.25);
      if (by === 'hand') {
        hint('wheel.pop', 2.5);
      }
    }
    if (by === 'hand' || ev.ok)
      switch (ev.what) {
        case 'nut':
          sound.nut(job.step === 'nutsOn' || ev.stepDone === 'nutsOn');
          break;
        case 'wrongNut':
          sound.no();
          break;
        case 'bubbles':
          sound.bubbles();
          break;
        case 'plug':
          sound.plug();
          break;
        case 'pull':
          sound.pull();
          break;
        case 'dent':
          sound.dent();
          break;
        case 'hit':
          sound.ding();
          break;
        case 'miss':
          sound.no();
          break;
      }
    if (ev.stepDone && job.step !== 'done') {
      hint(`wheel.${job.step}`, 0);
    }
    if (ev.wheelDone) {
      sound.clunk();
      const bay = scene.bay();
      if (!job.mistakes && !job.robot && bay) {
        scene.fx.text(bay.x, bay.y - bay.r * 0.2, tr('wheel.perfect'), { color: '#9cff9c', size: 26 });
        scene.fx.emit('confetti', bay.x, bay.y, { n: 30 });
      }
      scene.wheelDone(job.wheel);
      const next = currentWheel(car);
      if (next) {
        hint(`wheel.${next.step}`, 0);
      }
    }
    if (ev.stage) {
      scene.stageChanged(ev.stage);
      if (isTaskStage(ev.stage)) hint(`hint.${ev.stage}`, 0);
    }
  }
  /** A touch in the bay (down, or a drag while spraying) */
  function bayTouch(x: number, y: number, kind: 'down' | 'move'): void {
    if (!car || state !== 'play' || host.paused || car.stage !== 'wheels') return;
    const job = currentWheel(car);
    const bay = scene.bay();
    if (!job || !bay) return;
    if (job.step === 'pump') {
      if (kind === 'down') pumping = true;
      return;
    }
    if (kind === 'move' && job.step !== 'find') return;
    const a = bayAction(bay, job, x, y);
    if (!a) return;
    const ev = wheelHand(car, a, wrenchTier());
    if (ev) {
      onWheel(ev, 'hand');
      if (a.kind === 'spray') sound.spray();
      scene.spray(x, y, a.kind === 'spray');
    }
  }

  // --- Input: a tap is a stroke, a drag scrubs (a stroke every half brush of movement), holding keeps working

  let down = false;
  let px = 0;
  let py = 0;
  let travelled = 0;
  let holdAcc = 0;
  const brushPx = () => {
    const box = scene.carBox();
    return box ? (toolPower(save.tools.wash).radius / 96) * box.w : 20;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (state === 'first') {
      // The first tap anywhere on the car starts the game and lands the first SLAP
      if (scene.onCar(e.clientX, e.clientY)) play(e.clientX, e.clientY);
      return;
    }
    if (state !== 'play') return;
    down = true;
    px = e.clientX;
    py = e.clientY;
    travelled = 0;
    holdAcc = 0;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic pointer */
    }
    touchInput = e.pointerType !== 'mouse';
    updatePointerTool(px, py, true);
    if (car?.stage === 'wheels') bayTouch(px, py, 'down');
    else if (car?.stage === 'body') dentDown(px, py);
    else handStroke(px, py);
  });
  canvas.addEventListener('pointermove', (e) => {
    const x = e.clientX;
    const y = e.clientY;
    if (state === 'play' && (down || e.pointerType === 'mouse')) updatePointerTool(x, y, down);
    if (!down || state !== 'play') return;
    if (car?.stage === 'body') {
      dentMove(x, y);
      return;
    }
    if (car?.stage === 'wheels') {
      if (Math.hypot(x - px, y - py) > 10) {
        bayTouch(x, y, 'move');
        px = x;
        py = y;
      }
      return;
    }
    const d = Math.hypot(x - px, y - py);
    travelled += d;
    // Strokes along the path, half a brush apart (at most 4 per event: a fast flick doesn't flood)
    const step = Math.max(6, brushPx() * 0.55);
    let n = 0;
    while (travelled >= step && n < 4) {
      travelled -= step;
      const k = 1 - travelled / Math.max(1, d);
      handStroke(px + (x - px) * k, py + (y - py) * k);
      n++;
    }
    if (n >= 4) travelled = 0;
    px = x;
    py = y;
  });
  const up = () => {
    down = false;
    pumping = false;
    dentUp();
    scene.pointer({ on: false });
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') scene.pointer({ cat: null });
  });
  // --- The coach: the first time an action comes up, a hand shows it where to do it and its words stay until the player
  // has done it (save.lessons). The first cars teach the scrub, the rust, the polish, every step of the tyre bay, the
  // dents, the bolts, the engine, the colour, the first purchase

  let lesson: { id: string; key: string; step?: string; count: number } | null = null;
  /** When the surface last got worked (the hand or a robot): a stalled stage brings the hand back */
  let lastSurfaceWork = 0;
  const learned = (id: string) => save.lessons.includes(id);
  const LAYER_LESSON: Record<LayerKind, string> = { mud: 'scrub', dust: 'scrub', soot: 'scrub', rust: 'rust', paint: 'primer', polish: 'polish' };
  function learn(id: string): void {
    if (!learned(id)) {
      save.lessons.push(id);
      persist();
    }
    if (lesson?.id === id) {
      if (hintKey === lesson.key) hint('', 0);
      lesson = null;
      scene.setCoach(null);
    }
  }
  /** A button the coach points at: it glows and a hand taps on it */
  function nudge(b: HTMLElement | null | undefined): void {
    if (!b) return;
    b.classList.add('nudge');
    const hand = icon('hand', 40, 'nhand');
    hand.alt = '';
    b.append(hand);
  }
  /** The first purchase: something affordable after the first car */
  const buyLesson = () => !learned('buy') && save.stats.restored >= 1 && (CATS.some((c) => (priceOf(save, { kind: 'tool', cat: c }) ?? Infinity) <= save.money));

  /** What to teach now, and the hand for it (null: nothing new) */
  function lessonNow(): { id: string; key: string; step?: string; coach: Coach } | null {
    if (!car || state !== 'play' || demo || host.paused) return null;
    const L = scene.carL;
    if (car.stage === 'surface') {
      // The stage's layer (one at a time), if it wasn't taught yet; the hand swipes over a patch of it
      const cur = currentLayerIndex(car);
      if (cur < 0) return null;
      const l = car.layers[cur];
      let id = LAYER_LESSON[l.kind];
      // Taught already: the hand comes back only when the stage stalls (3 s without progress: specks left somewhere)
      if (learned(id)) {
        if (carTime - lastSurfaceWork < 3) return null;
        id = 'leftover';
      }
      let i = -1;
      for (let j = 0; j < car.mask.length && i < 0; j += id === 'leftover' ? 1 : 7) if (topAt(car, j) === cur) i = j;
      if (i < 0) return null;
      const [x, y] = scene.gridToScreen((i % GRID.w) + 0.5, Math.floor(i / GRID.w) + 0.5);
      return { id, key: layerHint(l.kind), coach: { kind: 'swipe', x0: x - L * 0.12, y0: y, x1: x + L * 0.12, y1: y } };
    }
    if (car.stage === 'body' && !learned('dents')) {
      const d = car.dents.find((q) => q.left > 0);
      if (!d) return null;
      const [x, y] = scene.gridToScreen(d.gx, d.gy);
      return { id: 'dents', key: 'hint.dents', coach: { kind: 'pull', x0: x, y0: y, x1: x + L * 0.05, y1: y - L * 0.3 } };
    }
    if (car.stage === 'wheels') {
      const job = currentWheel(car);
      const bay = scene.bay();
      if (!job || !bay || job.step === 'done' || learned(`wheel.${job.step}`)) return null;
      const [x, y] = bayTarget(bay, job);
      const coach: Coach =
        job.step === 'find' ? { kind: 'swipe', x0: x - bay.r * 0.35, y0: y, x1: x + bay.r * 0.35, y1: y } : job.step === 'pump' ? { kind: 'hold', x, y } : { kind: 'tap', x, y };
      return { id: `wheel.${job.step}`, key: `wheel.${job.step}`, step: job.step, coach };
    }
    if (isTaskStage(car.stage) && !learned(car.stage)) {
      const tk = stageTasks(car).find((q) => q.left > 0);
      if (!tk) return null;
      const [x, y] = scene.gridToScreen(tk.gx, tk.gy);
      return { id: car.stage, key: `hint.${car.stage}`, coach: { kind: 'tap', x, y } };
    }
    return null;
  }
  function refreshLesson(): void {
    // A tyre-bay step is learned when it is over
    if (lesson?.step && car && currentWheel(car)?.step !== lesson.step) learn(lesson.id);
    const now = lessonNow();
    if (!now) {
      if (lesson) {
        if (hintKey === lesson.key) hint('', 0);
        lesson = null;
      }
      scene.setCoach(null);
      return;
    }
    if (!lesson || lesson.id !== now.id) lesson = { id: now.id, key: now.key, step: now.step, count: 0 };
    scene.setCoach(now.coach);
    if (hintKey !== now.key) hint(now.key, 0);
  }

  // --- Dents: grab one with the suction cup and pull it out in one go (let go early: it springs back a little)

  let dentGrab: { i: number; max: number; pulled: number } | null = null;
  function dentDown(x: number, y: number): void {
    if (!car || car.stage !== 'body' || host.paused) return;
    const [gx, gy] = scene.screenToGrid(x, y);
    const i = dentAt(car, gx, gy, 5);
    if (i < 0) return;
    dentGrab = { i, max: 0, pulled: 0 };
    scene.setGrab({ i, x, y });
    sound.tap();
  }
  function dentMove(x: number, y: number): void {
    if (!car || !dentGrab) return;
    const g = dentGrab;
    const d = car.dents[g.i];
    const [gx, gy] = scene.screenToGrid(x, y);
    const dist = Math.hypot(gx - d.gx, (gy - d.gy) * car.aspect);
    if (dist > g.max) {
      const res = pullDent(car, g.i, dist - g.max, powers(save.tools));
      g.max = dist;
      if (res) {
        g.pulled += res.removed;
        afterStroke(res, 'hand');
        if (res.fixed) {
          const [sx, sy] = scene.gridToScreen(d.gx, d.gy);
          scene.fx.emit('magic', sx, sy, { n: 16, color: ['#ffffff', '#ffd166'] });
          scene.fx.ring(sx, sy, { r0: 6, r1: 46, life: 0.35, color: '#ffd166', width: 3 });
          sound.ding();
          learn('dents');
          dentGrab = null;
          scene.setGrab(null);
          return;
        }
      }
    }
    scene.setGrab({ i: g.i, x, y });
  }
  function dentUp(): void {
    if (car && dentGrab) releaseDent(car, dentGrab.i, dentGrab.pulled);
    dentGrab = null;
    scene.setGrab(null);
  }

  // --- The respray: three colours to pick from (the last one rare: it pays more), while the primer is untouched

  const swatches = el('div', 'swatches');
  let pickedFor: Car | null = null;
  function refreshSwatches(): void {
    const paint = car?.layers.find((l) => l.kind === 'paint');
    const show = !!car && car.respray && pickedFor !== car && !!paint && paint.left >= paint.total * 0.98 && car.stage === 'surface' && car.painting && state === 'play';
    if (!show) {
      if (swatches.isConnected) swatches.remove();
      return;
    }
    if (swatches.isConnected && swatches.dataset.car === String(car!.seed)) return;
    swatches.dataset.car = String(car!.seed);
    swatches.replaceChildren(el('small', '', tr('respray.pick')));
    car!.palette.forEach((c, i) => {
      const b = button('', () => pickColor(c, i === car!.palette.length - 1), { alt: true, cls: 'alt sw' });
      b.style.background = c;
      b.dataset.gp = `color-${i}`;
      b.setAttribute('aria-label', i === car!.palette.length - 1 ? tr('respray.rare') : tr('respray.pick'));
      if (i === car!.palette.length - 1) b.append(icon('star', 18, 'star'));
      swatches.append(b);
    });
    if (!learned('color')) nudge(swatches.querySelector<HTMLElement>('.sw'));
    ui.append(swatches);
    placeStrip();
  }
  function pickColor(c: string, rare: boolean): void {
    if (!car) return;
    car.color = c;
    if (rare) car.value = Math.round(car.value * (1 + FLOW.rareColorBonus));
    pickedFor = car;
    learn('color');
    if (hintKey === 'respray.pick') hint('', 0);
    scene.recolor();
    sound.buy();
    if (rare) hint('respray.rare', 2.5);
    refreshSwatches();
  }

  function updatePointerTool(x: number, y: number, on: boolean): void {
    if (!car) return;
    const [gx, gy] = scene.screenToGrid(x, y);
    const at = toolAt(car, gx, gy, 4);
    const cat = car.stage === 'wheels' ? 'wrench' : at?.cat ?? (car.stage === 'surface' ? LAYER_CAT[car.layers.find((l) => l.left > 0)?.kind ?? 'mud'] : 'wrench');
    scene.pointer({ x, y, on, cat, level: save.tools[cat] ?? 0 });
  }

  // --- Hints: one at a time, short, in the DOM over the car

  // --- Achievements: checked on every save, a banner for each new one (one at a time)
  const achQueue: string[] = [];
  let achShowing = false;
  const achLayer = el('div', 'achlayer');
  // The pay, the album's new model, the coins that fly: above the HUD, kept when the HUD is rebuilt for the next car
  const fxLayer = el('div', 'fxlayer');
  (ui.parentElement ?? document.body).append(fxLayer);
  (ui.parentElement ?? document.body).append(achLayer);
  function showNextAch(): void {
    // Not over the finale's big RESTORED nor over the card's heading: the toast waits for the next car (it lay over
    // «RESTAURÉE» in French: QA E_QA_HUD_OVERLAP; over the first card's heading: the reviewer)
    if (state === 'results' || (state === 'play' && car && (car.stage === 'finale' || car.stage === 'done'))) {
      achShowing = true;
      setTimeout(() => {
        achShowing = false;
        showNextAch();
      }, 700);
      return;
    }
    const id = achQueue.shift();
    if (!id) {
      achShowing = false;
      return;
    }
    achShowing = true;
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    const t = el('div', 'achtoast');
    t.style.borderColor = ACH_COLOR[a.rarity];
    const d = el('div');
    d.append(el('small', '', `${tr('ach.unlocked')} · ${tr(`rarity.${a.rarity}`)}`), el('b', '', tr(`ach.${id}.name`)));
    t.append(icon(a.icon, 36, ''), d);
    achLayer.append(t);
    sound.unlock();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => {
        t.remove();
        showNextAch();
      }, 400);
    }, 2800);
  }
  /** Save, after earning what the save now deserves */
  function persist(): void {
    for (const id of checkAchievements(save)) achQueue.push(id);
    host.save(save);
    if (!achShowing && achQueue.length) showNextAch();
  }
  const hintEl = el('div', 'hint');
  let hintLock = 0;
  /** The hint for a layer that shows (mud's is the scrub hint) */
  const layerHint = (kind: string) => (kind === 'mud' ? 'hint.scrub' : `hint.${kind}`);
  let pendingHint: [string, number] | null = null;
  /** A hint for what to do now; a newer one replaces it (the step it named is over). sec 0: until replaced */
  function hint(key: string, sec: number): void {
    // The twist's words are never cut short (2 s + 50 ms a character): what comes meanwhile is shown once they are read
    if (hintKey === 'hint.twist' && carTime < hintLock && key !== hintKey) {
      pendingHint = [key, sec];
      return;
    }
    pendingHint = null;
    hintLock = key === 'hint.twist' ? carTime + 2 + tr(key).length * 0.05 + 0.3 : 0;
    hintKey = key;
    hintUntil = sec > 0 ? carTime + sec : 0;
    hintEl.textContent = key ? tr(key) : '';
    hintEl.style.display = key ? '' : 'none';
    placeHint();
  }
  function placeHint(): void {
    const box = scene.carBox();
    const top = hudTop.getBoundingClientRect().bottom;
    const bay = scene.bay();
    // Portrait: under the tyre bay when it is open (between it and the car), else over the car. Landscape with the bay
    // open: left of the bay, over the car (never over the bay or the strip). Always measured and kept on screen
    const side = !!bay && w >= h;
    hintEl.style.maxWidth = side ? `${Math.max(200, bay!.x - bay!.r - 24)}px` : '';
    const over = () => `${Math.max(top + 8, (box ? box.y : h * 0.3) - hintEl.offsetHeight - 10)}px`;
    hintEl.style.top = bay && !side ? `${Math.max(top + 8, bay.y + bay.r + 6)}px` : over();
    const half = hintEl.offsetWidth / 2;
    const cx = side ? (bay!.x - bay!.r) / 2 : w / 2;
    hintEl.style.left = `${Math.max(half + 12, Math.min(w - half - 12, cx))}px`;
  }

  // --- The network (1.4): the garage the player is in, the cars waiting in the others, the others' robots earning

  /** The room of the garage the player is in (its level, its style) */
  function roomNow(): void {
    scene.setLevel(save.garage, SITE.get(save.at)?.look ?? 0, SITE.get(save.at)?.space);
  }
  /** A car left on the lift of another garage (this session): it waits there */
  const parked = new Map<string, Car>();
  /** The other garages' robots, $ a second each (refreshed on a purchase, a move, a prestige) */
  let bgRates: [string, number][] = [];
  function refreshNetwork(): void {
    bgRates = Object.keys(save.sites).filter((id) => id !== save.at).map((id): [string, number] => [id, siteRate(save, id)]).filter(([, r]) => r > 0);
  }
  /** Paid by the second: what the other garages' robots earned (also while a menu is open) */
  let bgAt = performance.now();
  let bgSaveAcc = 0;
  function earnBackground(): void {
    const now = performance.now();
    const dt = Math.min(5, (now - bgAt) / 1000);
    bgAt = now;
    if (host.paused || !bgRates.length) return;
    for (const [id, r] of bgRates) {
      const m = r * dt;
      earn(save, m);
      save.stats.earned += m;
      const st = save.sites[id];
      if (st) st.earned += m;
    }
    bgSaveAcc += dt;
    if (bgSaveAcc > 20) {
      bgSaveAcc = 0;
      persist();
    }
  }
  setInterval(() => {
    earnBackground();
    if (state === 'play') {
      moneyText.textContent = $(save.money);
      if (shopDot) refreshHud();
    }
  }, 1000);
  /** Move to another opened garage: the car here waits on its lift, the one waiting there (if any) comes back */
  function goTo(id: string): void {
    if (id === save.at || !save.sites[id]) return;
    if (car && car.stage !== 'done' && car.stage !== 'finale') parked.set(save.at, car);
    car = null;
    travel(save, id);
    persist();
    refreshNetwork();
    roomNow();
    scene.setRobots(save.robots);
    const back = parked.get(id);
    parked.delete(id);
    state = 'title';
    if (back) startCar(back, false);
    play();
  }

  // --- The HUD

  const hudTop = el('div', 'hud-top');
  const moneyPill = el('div', 'pill glass money');
  const moneyText = el('b');
  const rateText = el('small');
  {
    const t = el('div');
    t.append(moneyText, rateText);
    moneyPill.append(icon('coin', 30), t);
  }
  const carCard = el('div', 'glass carcard');
  const carName = el('div', 'n');
  const carSub = el('div', 's');
  const condText = el('span');
  const condBar = bar(0, 'ok');
  const storyText = el('div', 's story');
  // A rush job's clock (the audit, 2026-10-20: something to race now and then)
  const rushText = el('div', 'rush');
  const rushLabel = el('span', 'rl');
  const rushFill = el('i', 'rf');
  rushText.append(icon('clock', 20, 'rc'), rushLabel, rushFill);
  let rushTick = -1;
  {
    const c = el('div', 'cond');
    c.append(condText, condBar);
    carCard.append(carName, carSub, c, rushText, storyText);
  }
  const goalPill = el('div', 'pill glass goal');
  const goalIcon = icon('garage:2', 30);
  const goalLabel = el('small');
  const goalText = el('b');
  const goalBar = bar(0);
  {
    const t = el('div', 't');
    t.append(goalLabel, goalText, goalBar);
    goalPill.append(goalIcon, t);
  }
  hudTop.append(moneyPill, carCard, goalPill);
  // The goal is a button: reached, it opens it at once; before, the shop's expansion page shows what it takes
  goalPill.setAttribute('role', 'button');
  goalPill.dataset.gp = 'goal';
  goalPill.addEventListener('click', () => {
    if (state !== 'play') return;
    sound.tap();
    if (goalReady()) takeGoal();
    // The shop's expansion page from the second car on: on the first car a tap stays in play (the shop isn't there yet;
    // QA's random-touch bot spent half its minute in it)
    else if (nextGoal(save).kind === 'garage' && save.stats.restored > 0) showShop('expand');
    else goalPill.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 200 });
  });
  // The best upgrade in reach, one tap without the shop (a new player never found the shop: the audit, 2026-10-20)
  const quick = el('button', 'quick');
  quick.type = 'button';
  quick.dataset.gp = 'quick-buy';
  let quickBuy: Buy | null = null;
  let quickAt = 0;
  quick.addEventListener('click', () => {
    if (!quickBuy || state !== 'play') return;
    const b = quickBuy;
    const tierBefore = b.kind === 'tool' ? Math.floor(save.tools[b.cat] / TIER_EVERY) : 0;
    if (!buy(save, b)) return sound.no();
    if (!learned('buy')) save.lessons.push('buy');
    persist();
    sound.buy();
    if (b.kind === 'robot') scene.setRobots(save.robots);
    // The purchase shows: a coin into the strip (the hand's tools), a new tool tier drawn big for a moment
    flyTo(icon('coin', 26, ''), quick, strip.querySelector<HTMLElement>('.st.now') ?? strip, 500);
    if (b.kind === 'tool' && Math.floor(save.tools[b.cat] / TIER_EVERY) > tierBefore) {
      sound.unlock();
      toolReveal(b.cat);
    }
    refreshNetwork();
    quickAt = 0;
    quick.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220 });
    refreshHud(true);
  });
  /** The purchase that adds the most income a dollar, of those affordable now */
  function bestBuy(): Buy | null {
    let best: Buy | null = null;
    let v = 0;
    // Saving for the next garage once it is half paid and its cars are done: an upgrade then would send the goal back
    // (60 % → 21 % on one robot: the reviewer, 1.5.0)
    // The fund saves for it anyway; the money is kept only once the two together pay for it
    const gb: Buy = { kind: 'garage' };
    const gp = priceOf(save, gb);
    const keep = gp !== null && purse(save, gb) >= gp ? gp - save.fund : 0;
    for (const cat of CATS)
      for (const b of [{ kind: 'tool', cat }, { kind: 'robot', cat }] as Buy[]) {
        const p = priceOf(save, b);
        if (p === null || p > save.money || (keep && save.money - p < keep)) continue;
        const gn = gainOf(b, 1) / Math.max(1, p);
        if (gn > v || (!best && gn >= 0)) {
          best = b;
          v = gn;
        }
      }
    return best;
  }
  function refreshQuick(): void {
    const now = performance.now();
    if (now - quickAt < 600) return;
    quickAt = now;
    const b = save.stats.restored > 0 || save.prestige > 0 ? bestBuy() : null;
    quickBuy = b;
    quick.style.display = b ? '' : 'none';
    if (!b || b.kind === 'garage') return;
    const lv = b.kind === 'tool' ? save.tools[b.cat] : save.robots[b.cat];
    const id = b.kind === 'tool' ? toolIcon(b.cat, lv + 1) : ROBOTS[b.cat].id;
    const name = b.kind === 'tool' ? tr(`tool.${TOOLS[b.cat].tiers[Math.min(TOOLS[b.cat].tiers.length - 1, Math.floor((lv + 1) / TIER_EVERY))]}`) : tr(`robot.${ROBOTS[b.cat].id}`);
    const key = `${b.kind}${b.cat}${lv}`;
    if (quick.dataset.key === key) return;
    quick.dataset.key = key;
    const t = el('div', 't');
    t.append(el('small', '', tr(b.kind === 'tool' ? 'quick.tool' : 'quick.robot')), el('b', '', name));
    const price = el('span', 'price');
    price.append(icon('coin', 18, ''), document.createTextNode($(priceOf(save, b) ?? 0, 'up')));
    quick.replaceChildren(icon(id, 36), t, price);
    // The first purchase is taught here, in play, not in the shop's panel (the designer, 1.5.0)
    quick.classList.remove('nudge');
    if (!learned('buy')) nudge(quick);
  }
  /** What the goal offers now: a garage to open, the prestige to take, or nothing yet */
  function goalReady(): 'garage' | 'prestige' | null {
    const g = nextGoal(save);
    if (g.kind === 'garage') {
      return affords(save, { kind: 'garage' }) ? 'garage' : null;
    }
    return g.kind === 'prestige' && canPrestige(save) ? 'prestige' : null;
  }
  function takeGoal(): void {
    const r = goalReady();
    if (r === 'garage') buyNow({ kind: 'garage' });
    else if (r === 'prestige') showPrestige();
  }
  const strip = el('div', 'strip glass');
  const bottom = el('div', 'bottom');
  let shopDot: HTMLElement | null = null;

  function bottomButton(iconId: string, label: string, onClick: () => void, gp?: string): HTMLButtonElement {
    const b = el('button', 'alt');
    b.type = 'button';
    if (gp) b.dataset.gp = gp;
    const s = el('span', '', label);
    b.append(icon(iconId, 30), s);
    b.addEventListener('click', () => {
      sound.tap();
      onClick();
    });
    return b;
  }

  /** The bottom buttons shown so far: one arriving later pops in */
  const hudSeen = new Set<string>();
  function buildHud(): void {
    bottom.replaceChildren();
    // A new player's first car: only the pause. The rest come one at a time, each when it has something in it (seven
    // targets arrived at once on the second car: the designer, 1.5.0)
    const old = save.prestige > 0 || seenBefore;
    const n = save.stats.restored;
    const list: HTMLButtonElement[] = [];
    if (n > 0 || old) {
      const shop = bottomButton('garage:' + Math.min(6, save.garage + 1), tr('btn.garage'), () => showShop(), 'shop');
      shopDot = el('i', 'dot');
      shop.append(shopDot);
      list.push(shop);
    }
    if (n >= 2 || old) list.push(bottomButton('album', tr('btn.album'), () => showAlbum(), 'album'));
    if (Object.keys(save.sites).length > 1 || old) list.push(bottomButton('map', tr('btn.map'), () => showMap(), 'map'));
    if (n >= 4 || old) list.push(bottomButton('stats', tr('btn.stats'), () => showStats(), 'stats'));
    const d = dailyCar(save, dayKey());
    if (!d.done && (old || n > FIRST_DAILY_AT)) list.push(bottomButton('gate', tr('btn.gate'), () => showDaily(), 'daily'));
    list.push(bottomButton('pause', tr('btn.menu'), () => pauseGame(), 'menu'));
    const first = !hudSeen.size;
    for (const b of list) {
      const id = b.dataset.gp ?? '';
      if (!first && !hudSeen.has(id)) b.animate([{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
      hudSeen.add(id);
    }
    bottom.append(...list);
  }

  let hudAcc = 0;
  function refreshHud(force = false): void {
    if (!car) return;
    moneyText.textContent = $(save.money);
    // The whole network's robots, a minute (the owner's table: «общий счётчик пассивного дохода»)
    const net = networkRate(save) * 60;
    rateText.textContent = net > 0 ? tr('hud.network', { money: $(net) }) : '';
    const goal = nextGoal(save);
    goalIcon.src = iconUrl(goal.kind === 'garage' ? `garage:${SITE.get(goal.id)?.tier ?? save.garage + 1}` : goal.kind === 'prestige' ? 'chain' : 'album', 30);
    goalLabel.textContent = tr('goalLabel');
    const gname = goal.kind === 'garage' ? tr(`site.${goal.id}.name`) : goal.kind === 'prestige' ? tr('prestige.title') : tr('album.title');
    const ready = goalReady();
    goalPill.classList.toggle('ready', !!ready);
    // A garage's two halves: its cars done, and its fund (it only grows: the money can be spent, the fund can't)
    goalLabel.textContent = ready ? gname : goal.cars && goal.fund !== undefined ? tr('goalParts', { a: goal.cars.have, b: goal.cars.need, pct: Math.floor(goal.fund * 100) }) : tr('goalLabel');
    goalText.textContent = ready ? tr(ready === 'garage' ? 'goalOpen' : 'goalPrestige') : goal.cars ? gname : tr('goal', { name: gname, pct: Math.floor(goal.share * 100) });
    (goalBar.firstChild as HTMLElement).style.width = `${Math.floor(goal.share * 100)}%`;
    refreshQuick();
    if (car.rush) {
      const left = Math.max(0, car.rush.sec - repairTime);
      rushText.style.display = '';
      rushText.classList.toggle('late', left <= 0);
      rushText.classList.toggle('hurry', left > 0 && left <= 5);
      rushLabel.textContent = left > 0 ? tr('rush.clock', { s: Math.ceil(left) }) : tr('rush.late');
      // The clock drains (it read as a full progress bar: the reviewer, 1.5.0)
      rushFill.style.width = `${Math.round((left / car.rush.sec) * 100)}%`;
      const sNow = Math.ceil(left);
      if (left > 0 && sNow <= 5 && sNow !== rushTick && state === 'play') {
        rushTick = sNow;
        sound.tick();
      }
    } else rushText.style.display = 'none';
    const affordable = CATS.some((c) => {
      const p = priceOf(save, { kind: 'tool', cat: c });
      return p !== null && p <= save.money;
    }) || affords(save, { kind: 'garage' });
    if (shopDot) shopDot.style.display = affordable ? '' : 'none';
    if (!force) {
      const c = condition(car);
      condText.textContent = tr('condition', { n: c });
      (condBar.firstChild as HTMLElement).style.width = `${c}%`;
      refreshStrip();
      return;
    }
    carName.replaceChildren(document.createTextNode(tr(`model.${car.model.id}.name`)));
    const chip = el('span', 'chip', tr(`rarity.${car.rarity}`));
    chip.style.background = RARITY[car.rarity].color;
    carName.append(chip, el('span', 'muted', tr('serial', { n: String(car.serial).padStart(3, '0') })));
    carSub.textContent = [tr(`model.${car.model.id}.kind`), car.variant === 'standard' ? '' : tr(`variant.${car.variant}`), tr(car.model.cls === 'space' ? `profile.space.${car.profile}` : `profile.${car.profile}`)].filter(Boolean).join(' · ');
    storyText.textContent = car.story ? tr(`story.${car.story}`) : '';
    storyText.style.display = car.story ? '' : 'none';
    const c = condition(car);
    condText.textContent = tr('condition', { n: c });
    (condBar.firstChild as HTMLElement).style.width = `${c}%`;
    refreshStrip(true);
  }

  let stripKey = '';
  function refreshStrip(force = false): void {
    if (!car) return;
    // In the order they are done: the cleaning, the bodywork, the wheels, the parts, the engine, the paint last
    const steps: { id: string; done: boolean }[] = car.layers.filter((l) => l.kind !== 'paint').map((l) => ({ id: l.kind, done: l.left <= 0 }));
    if (car.dents.length) steps.push({ id: 'dents', done: car.dents.every((d) => d.left <= 0) });
    if (car.wheels.length) steps.push({ id: 'wheels', done: car.wheels.every((j) => j.step === 'done') });
    if (car.thrusters.length) steps.push({ id: 'thrusters', done: car.thrusters.every((p) => p.left <= 0) });
    if (car.parts.length) steps.push({ id: 'parts', done: car.parts.every((p) => p.left <= 0) });
    if (car.engine.length) steps.push({ id: 'engine', done: car.engine.every((p) => p.left <= 0) });
    for (const l of car.layers) if (l.kind === 'paint') steps.push({ id: 'paint', done: l.left <= 0 });
    steps.push({ id: 'lights', done: car.stage === 'finale' || car.stage === 'done' });
    const nowIdx = steps.findIndex((s) => !s.done);
    const key = steps.map((s) => `${s.id}${s.done ? 1 : 0}`).join() + nowIdx;
    if (key === stripKey && !force) return;
    stripKey = key;
    const iconOf: Record<string, string> = { mud: 'mud', dust: 'dust', soot: 'soot', rust: 'rust', paint: 'primer', polish: 'scratch', wheels: 'parts', thrusters: 'nozzle', dents: 'dent', parts: 'wrench:1', engine: 'engine', lights: 'lights' };
    strip.replaceChildren(
      ...steps.map((s, i) => {
        const d = el('div', `st${s.done ? ' done' : i === nowIdx ? ' now' : ''}`);
        d.title = tr(`stage.${s.id}`);
        d.append(icon(iconOf[s.id], 26, ''));
        return d;
      }),
    );
  }

  /** A phone on its side: the bottom bar is down the right edge (ui.ts, the same query) */
  const sideBar = () => matchMedia('(max-height: 420px) and (orientation: landscape)').matches;
  function placeStrip(): void {
    // Where the car stands, not where it is now (a ship comes down from above the screen)
    const box = scene.restBox();
    const b = sideBar() ? h : bottom.getBoundingClientRect().top;
    const ground = box ? box.y + box.h : h * 0.7;
    strip.style.top = `${Math.min(b - 52, ground + 14)}px`;
    // The upgrade button: beside the strip, or above the bottom bar where a phone's strip leaves no room
    quick.style.top = `${sideBar() ? bottom.getBoundingClientRect().top - 58 : w < 600 ? b - 62 : Math.min(b - 52, ground + 14)}px`;
    if (swatches.isConnected) swatches.style.top = `${Math.max(8, (box ? box.y : h * 0.3) - 64)}px`;
  }

  function showHud(): void {
    ui.replaceChildren(hudTop, strip, hintEl, bottom, quick);
    quickAt = 0;
    quick.dataset.key = '';
    // A new player lands in play: the language picker stays in reach until the first car is done
    if (!save.stats.restored && !save.lifeCars) {
      const lang = languagePicker({ host, className: 'alt', compact: true, onChange: () => showHud() });
      if (lang) {
        const corner = el('div', 'corner hudlang');
        corner.append(lang);
        ui.append(corner);
      }
    }
    buildHud();
    refreshHud(true);
    // A hint on screen follows a language change (it was written in the old language)
    hintEl.textContent = hintKey ? tr(hintKey) : '';
    hintEl.style.display = hintKey ? '' : 'none';
    layout();
  }

  /** Measure the HUD and give the scene the room between it and the bottom bar */
  function layout(): void {
    const top = hudTop.isConnected ? hudTop.getBoundingClientRect().bottom : 70;
    const bot = bottom.isConnected && !sideBar() ? h - bottom.getBoundingClientRect().top : sideBar() ? 0 : 76;
    scene.resize(w, h, { top: Math.max(60, top + 6), bottom: Math.max(60, bot + 40) });
    if (strip.isConnected) placeStrip();
    if (hintEl.isConnected) placeHint();
    const hl = ui.querySelector<HTMLElement>('.hudlang');
    if (hl) hl.style.top = `${hudTop.getBoundingClientRect().bottom + 8}px`;
  }

  // --- Screens

  function screen(children: HTMLElement[], cls = 'panel glass', dim = true): HTMLElement {
    refit = null;
    mapNow?.destroy();
    mapNow = null;
    scene.setCoach(null);
    const s = el('div', `screen${dim ? ' dim' : ''}`);
    const p = el('div', cls);
    p.append(...children);
    s.append(p);
    ui.replaceChildren(s);
    return p;
  }
  function button(text: string, onClick: () => void, opts: { alt?: boolean; gp?: string; cls?: string } = {}): HTMLButtonElement {
    const b = el('button', opts.cls ?? (opts.alt ? 'alt' : ''), text);
    b.type = 'button';
    if (opts.gp) b.dataset.gp = opts.gp;
    b.addEventListener('click', () => {
      sound.tap();
      onClick();
    });
    return b;
  }
  const h2 = (text: string, iconId?: string) => {
    const e = el('h2');
    if (iconId) e.append(icon(iconId, 36, ''));
    e.append(document.createTextNode(text));
    return e;
  };

  // --- One screen, nothing to scroll (the owner's rule, 2026-10-10): what doesn't fit goes on pages ◀ 1/2 ▶

  interface Group {
    label: string;
    items: HTMLElement[];
    /** The grid's class for this group (default: the pager's) */
    cls?: string;
  }
  /** Re-measure the pager on screen when the window changes */
  let refit: (() => void) | null = null;
  /**
   * Groups of cards on pages that fit the panel: each group (a shop tab, an album tier) is cut into as many pages as
   * its cards need, measured in the space the panel leaves; ◀ ▶ walk through every page of every group
   */
  function pager(groups: Group[], cls: string, at: { g: number; k: number } = { g: 0, k: 0 }) {
    const box = el('div', 'fit');
    const grid = el('div', cls);
    box.append(grid);
    const nav = el('div', 'pager');
    const label = el('span', 'plabel');
    let pages: { g: number; k: number; n: number; els: HTMLElement[] }[] = [];
    let cur = 0;
    const fits = () => box.scrollHeight <= box.clientHeight + 1;
    const show = () => {
      const pg = pages[cur];
      if (!pg) return;
      grid.className = groups[pg.g].cls ?? cls;
      grid.replaceChildren(...pg.els);
      label.textContent = pg.n > 1 ? `${groups[pg.g].label} · ${pg.k + 1}/${pg.n}` : groups[pg.g].label;
      at.g = pg.g;
      at.k = pg.k;
      nav.style.display = pages.length > 1 ? '' : 'none';
    };
    const fit = () => {
      if (!box.isConnected) return;
      // Measured with the arrows in place (they show when there is more than one page)
      nav.style.display = '';
      const want = { ...at };
      pages = [];
      groups.forEach((gr, gi) => {
        grid.className = gr.cls ?? cls;
        const chunks: HTMLElement[][] = [];
        for (let i = 0; i < gr.items.length || (i === 0 && !gr.items.length); ) {
          let n = gr.items.length - i;
          grid.replaceChildren(...gr.items.slice(i, i + n));
          while (n > 1 && !fits()) grid.replaceChildren(...gr.items.slice(i, i + --n));
          chunks.push(gr.items.slice(i, i + Math.max(1, n)));
          i += Math.max(1, n);
          if (!gr.items.length) break;
        }
        chunks.forEach((els, k) => pages.push({ g: gi, k, n: chunks.length, els }));
      });
      cur = Math.max(0, pages.findIndex((p) => p.g === want.g && p.k === Math.min(want.k, p.n - 1)));
      show();
    };
    const step = (d: number) => {
      cur = (cur + d + pages.length) % pages.length;
      show();
    };
    const prev = button('', () => step(-1), { alt: true, cls: 'alt pbtn', gp: 'page-prev' });
    const nextB = button('', () => step(1), { alt: true, cls: 'alt pbtn', gp: 'page-next' });
    prev.append(icon('prev', 26, ''));
    nextB.append(icon('next', 26, ''));
    prev.setAttribute('aria-label', '<');
    nextB.setAttribute('aria-label', '>');
    nav.append(prev, label, nextB);
    return { box, nav, fit, at };
  }
  /** Mount a screen that has a pager, and measure it */
  function screenPaged(children: HTMLElement[], pg: { fit: () => void }, cls?: string): HTMLElement {
    const p = screen(children, cls);
    refit = pg.fit;
    pg.fit();
    return p;
  }

  /** A new player: the garage with the muddy car, one big button on it — a tap starts and scrubs */
  function showFirst(): void {
    state = 'first';
    host.gameplay(false);
    if (!car) startCar(makeCar(), false);
    scene.setGhost(true);
    const box = scene.carBox();
    const wrap = el('div', 'first');
    const b = button(tr('start'), () => play(), { gp: 'play' });
    wrap.append(b);
    wrap.style.left = `${box ? box.x + box.w / 2 : w / 2}px`;
    wrap.style.top = `${box ? box.y + box.h * 0.5 : h / 2}px`;
    const lang = languagePicker({ host, className: 'alt', compact: true, onChange: () => showFirst() });
    const corner = el('div', 'corner');
    if (lang) corner.append(lang);
    ui.replaceChildren(wrap, corner);
    wake();
  }

  /** A returning player: the logo, Continue, the rare car of the day, the album, statistics */
  function showTitle(): void {
    state = 'title';
    undo = null;
    host.gameplay(false);
    sound.hold(false);
    if (!car) startCar(makeCar(), false);
    // The day's return card takes the robots' earnings too (one card, one tap: the designer, 1.5.0)
    if (pendingStreak) return showStreak();
    if (pendingOffline) return showWelcome();
    const logo = el('div', 'logo');
    logo.append(document.createTextNode('Idle Garage Evolution'));
    logo.append(el('small', '', tr('tagline').toLocaleUpperCase(host.lang)));
    const d = dailyCar(save, dayKey());
    const daily = el('div', 'card');
    const dm = MODEL.get(d.model)!;
    const dt = el('div', 't');
    dt.append(el('small', '', tr('daily.title')), el('b', '', `${tr(`model.${dm.id}.name`)}`));
    const chip = el('span', 'chip', tr(`rarity.${d.rarity}`));
    chip.style.background = RARITY[d.rarity].color;
    chip.style.alignSelf = 'flex-start';
    dt.append(chip);
    daily.append(icon('gate', 52), dt);

    if (d.done) dt.append(el('small', '', tr('daily.done')));
    else daily.append(button(dailyQueued ? tr('daily.queued') : tr('daily.bring'), () => {
      dailyQueued = true;
      showTitle();
    }));
    const lang = languagePicker({ host, className: 'alt', compact: true, onChange: () => showTitle() });
    const row = el('div', 'row');
    row.append(
      button(tr('btn.garage'), () => showShop(), { alt: true, gp: 'shop' }),
      button(tr('btn.map'), () => showMap(), { alt: true, gp: 'title-map' }),
      button(tr('btn.album'), () => showAlbum(), { alt: true }),
      button(tr('btn.stats'), () => showStats(), { alt: true }),
    );
    const sounds = volumeSliders();
    if (lang) sounds.append(lang);
    // The day's order, on its own line (a returning player's session)
    const o = dayOrder(save, dayKey());
    const orderLine = el('div', `center ${o.done ? 'gain' : 'order'} orderline`, o.done ? tr('order.done') : tr('order.line', { a: o.n, b: ORDER_NEED, profile: tr(`profile.${o.profile}`) }));
    const p = screen([logo, button(tr('continue'), () => play(), { gp: 'play' }), daily, ...(ordersOn ? [orderLine] : []), row, sounds], 'panel glass narrow');
    p.style.alignItems = 'stretch';
    p.querySelector<HTMLElement>('[data-gp=play]')!.style.minHeight = '60px';
    wake();
  }

  /** Music and sound volume, 0–100 % each (a slider: the owner, 2026-10-16) */
  function volumeSliders(): HTMLElement {
    const row = el('div', 'row vols');
    for (const which of ['music', 'sfx'] as const) {
      const lab = el('label', 'vol');
      const name = tr(which === 'music' ? 'gp.music' : 'gp.sound');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.value = String(Math.round((which === 'music' ? save.music : save.sfx) * 100));
      input.setAttribute('aria-label', name);
      input.dataset.gp = `vol-${which}`;
      const pct = el('span', 'pct', `${input.value}%`);
      input.addEventListener('input', () => {
        const v = Number(input.value) / 100;
        if (which === 'music') save.music = v;
        else save.sfx = v;
        pct.textContent = `${input.value}%`;
        sound.setVolumes(save.music, save.sfx);
      });
      input.addEventListener('change', () => {
        persist();
        if (which === 'sfx') sound.ding();
      });
      const head = el('span', 'vh');
      head.append(el('span', '', name), pct);
      lab.append(head, input);
      row.append(lab);
    }
    return row;
  }

  /** Offline earnings: the robots worked while the player was away */
  function showWelcome(): void {
    const off = pendingOffline;
    if (!off) return showTitle();
    state = 'welcome';
    const collect = (k: number) => {
      // Once: a tap on Collect while the ×2 ad plays must not pay again when the ad ends
      if (pendingOffline !== off) return;
      collectOffline(off, k);
      persist();
      sound.fanfare();
      showTitle();
    };
    const offer = rewardedButton({ host, placement: 'offline', label: `▶ ${tr('welcome.double', { money: $(off.money * 2) })}`, onReward: () => collect(2) });
    const buttons = el('div', 'row');
    if (offer) buttons.append(offer);
    const take = button(tr('welcome.collect', { money: $(off.money) }), () => collect(1), { alt: !!offer });
    buttons.append(take);
    if (offer) take.style.minWidth = `${Math.max(offer.offsetWidth, 160)}px`;
    screen([h2(tr('welcome.title'), 'washbot'), el('div', 'center', tr('welcome.body', { n: off.cars })), el('div', 'big center', `+${$(off.money)}`), buttons], 'panel glass narrow');
    if (offer) requestAnimationFrame(() => (take.style.minWidth = `${offer.getBoundingClientRect().width}px`));
    wake();
  }

  /** The robots' earnings while away, k times (the ×2 ad), into the money and each garage's counters */
  function collectOffline(off: Offline, k: number): void {
    earn(save, off.money * k);
    save.stats.earned += off.money * k;
    save.stats.away += off.cars;
    for (const [id, v] of Object.entries(off.bySite ?? {})) {
      const st = save.sites[id];
      if (!st) continue;
      st.cars += v.cars;
      st.earned += v.money * k;
    }
    pendingOffline = null;
    save.seen = Date.now();
  }

  /**
   * The day's return card: the days in a row and today's money, what the robots earned meanwhile, and today's rare car —
   * one tap collects it all and lands in play with the rare car rolling in (it was three screens and two taps: the
   * designer, 1.5.0). Tomorrow's (bigger) reward is said too; never a loss
   */
  function showStreak(): void {
    state = 'welcome';
    const n = Math.max(1, save.streak.n);
    const today = Math.round(perMin() * streakMinutes(n));
    const tomorrow = Math.round(perMin() * streakMinutes(n + 1));
    const off = pendingOffline;
    const d = dailyCar(save, dayKey());
    const days = el('div', 'row streak');
    for (let i = 1; i <= 7; i++) days.append(el('span', `day${i <= Math.min(7, n) ? ' on' : ''}`, String(i)));
    const total = today + (off?.money ?? 0);
    const collect = (k: number) => {
      if (!pendingStreak) return;
      pendingStreak = false;
      save.streak.claimed = true;
      earn(save, today);
      save.stats.earned += today;
      if (off && pendingOffline === off) collectOffline(off, k);
      persist();
      sound.fanfare();
      // Straight into the garage, the rare car of the day first
      if (!d.done && !dailyQueued) {
        dailyQueued = true;
        car = null;
      }
      play();
    };
    const take = button(d.done ? tr('streak.claim', { money: $(total) }) : tr('streak.claimBring', { money: $(total) }), () => collect(1), { gp: 'streak-claim' });
    const rows: HTMLElement[] = [h2(n > 1 ? tr('streak.title', { n }) : tr('welcome.title'), 'star'), days, el('div', 'big center', `+${$(total)}`)];
    if (off) rows.push(el('div', 'center', `${tr('welcome.body', { n: off.cars })}: +${$(off.money)}`));
    if (!d.done) {
      const box = el('div', 'card tomorrow');
      const img = el('img', 'car');
      liveThumb(img, d.model);
      img.alt = '';
      const t = el('div', 't');
      const chip = el('span', 'chip', tr(`rarity.${d.rarity}`));
      chip.style.background = RARITY[d.rarity].color;
      const top = el('small');
      top.append(document.createTextNode(`${tr('daily.title')} `), chip);
      t.append(top, el('b', '', tr(`model.${d.model}.name`)));
      box.append(img, t);
      rows.push(box);
    }
    rows.push(el('div', 'center muted', tr('streak.tomorrow', { money: $(tomorrow) })));
    const offer = off ? rewardedButton({ host, placement: 'offline', label: `▶ ${tr('welcome.double', { money: $(off.money * 2) })}`, onReward: () => collect(2) }) : null;
    if (offer) {
      const buttons = el('div', 'row');
      buttons.append(offer, take);
      rows.push(buttons);
    } else rows.push(take);
    screen(rows, 'panel glass narrow');
    wake();
  }

  function showDaily(): void {
    const d = dailyCar(save, dayKey());
    if (d.done) return;
    dailyQueued = true;
    hint('daily.queued', 2.5);
  }

  // --- Play

  let prefetched = false;
  function play(x?: number, y?: number): void {
    const from = state;
    // After Play: the garage's own cars first, then every chapter in order, decoded in idle time
    // — once the first screen is painted (a later chapter decoding before it would hold it back: QA's chapter check)
    if (!prefetched) {
      prefetched = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            for (const id of SITE.get(save.at)?.pool ?? []) void carReady(id);
            for (const ch of pictures.chapters) pictures.prefetch(ch);
          }, 300),
        ),
      );
    }
    if (from === 'paused') return resume();
    if (state === 'play') return;
    state = 'play';
    scene.setGhost(false);
    if (!car || car.stage === 'done') startCar(makeCar());
    else if (from === 'first') {
      // The first visit: the car is already on the floor — start working right away
      tick(car, FLOW.arriveSec);
    }
    host.gameplay(true);
    sound.level(save.garage);
    sound.hold(false);
    roomNow();
    scene.setRobots(save.robots);
    showHud();
    if (from === 'first') {
      hint('hint.scrub', 6);
      scene.setGhost(true);
      if (x !== undefined && y !== undefined) handStroke(x, y);
    }
    wake();
  }

  function pauseGame(): void {
    if (state !== 'play') return;
    state = 'paused';
    host.gameplay(false);
    sound.hold(true);
    scene.clearFx();
    const lang = languagePicker({ host, className: 'alt', compact: true, onChange: () => {
      state = 'play';
      pauseGame();
    } });
    const row = volumeSliders();
    if (lang) row.append(lang);
    const away = awayPerHour(save);
    const awayLine = el('div', 'center muted', away ? tr('away.robots', { money: $(away) }) : tr('away.none'));
    // A reason for tomorrow, said before the player leaves (D1 2 %: the audit, 2026-10-20)
    const tomorrowLine = el('div', 'center gain', tr('pause.tomorrow', { n: Math.max(1, save.streak.n) + 1, money: $(Math.round(perMin() * streakMinutes(Math.max(1, save.streak.n) + 1))) }));
    // A new player's first car: no way out to the menu yet (only back to the car)
    const toMenu = save.stats.restored > 0 || save.prestige > 0 ? [button(tr('gp.menu'), () => showTitle(), { alt: true })] : [];
    const panel = screen([h2(tr('gp.paused'), 'pause'), button(tr('gp.resume'), resume, { gp: 'resume' }), row, awayLine, tomorrowLine, ...toMenu], 'panel glass narrow');
    // A tap beside the panel resumes (the usual way out of a pause)
    panel.parentElement?.addEventListener('click', (e) => {
      if (e.target === panel.parentElement && state === 'paused') resume();
    });
    wake();
  }

  function resume(): void {
    if (!car) return play();
    state = 'play';
    host.gameplay(true);
    sound.hold(false);
    showHud();
    wake();
  }

  // --- The car is restored: the card

  let orderNow: 'progress' | 'done' | null = null;
  let orderPaid = 0;
  /** `card`: always the RESTORED card (QA's end of a run checks its buttons; an ordinary car otherwise pops its pay) */
  function results(card = false): void {
    if (!car) return;
    state = 'results';
    host.gameplay(false);
    scene.clearFx();
    const c = car;
    const perfect = perfectNow ?? (repairTime <= par * FLOW.perfect && c.byHand > c.byRobots);
    if (c.rush) c.rush.won = repairTime <= c.rush.sec;
    const p = restore(save, c, Math.round(repairTime * 10) / 10, perfect, false);
    lastPayout = p;
    // The day's order: this car counts if it is of the day's profile; the third pays the reward
    orderNow = ordersOn ? orderCount(save, c, dayKey()) : null;
    if (orderNow === 'done') {
      orderPaid = Math.round(perMin() * 4);
      save.money += orderPaid;
      save.life += orderPaid;
      save.stats.earned += orderPaid;
    }
    if (c.daily) recordDaily(save.daily, dailyDay || dayKey());
    if (c.daily) dailyQueued = false;
    save.stats.minutes = Math.round((save.stats.minutes + repairTime / 60) * 10) / 10;
    save.seen = Date.now();
    persist();
    host.roundEnd({ score: p.total, newBest: p.newModel });
    // Heard at once with the pay (the feel check: the round's end answered on one channel)
    sound.coin(0);
    if (p.newModel || c.daily || RARITIES.indexOf(c.rarity) >= 3) host.happytime();
    const offer = offersDouble(save, c);
    // An ordinary car leaves with its pay popping over the garage and the next one rolls in: the card is for the events
    // (a new model, a rare one, a rush job, the ×2 offer, a goal just reached, the day's order). A card after every car
    // was three breaks a minute (the audit, 2026-10-20)
    const ready = goalReady();
    // A new model is no longer a card: every early car is one, so it was a card after 24 of 26 cars (the designer,
    // 1.5.0) — it flies into the album instead
    const event = offer || (p.newRarity && RARITIES.indexOf(c.rarity) >= 2) || !!c.rush || !!orderNow || c.daily || (!!ready && ready !== lastReady);
    lastReady = ready;
    if (!event && !card && save.lifeCars > 1) return quietResults(p);
    showResults(offer);
  }

  let lastReady: ReturnType<typeof goalReady> = null;
  /** The pay of an ordinary car over the garage, then the next car */
  function quietResults(p: { total: number; base: number; perfect: boolean; newModel: boolean }): void {
    const c = car;
    const pop = el('div', 'paypop');
    pop.dataset.gp = 'results-quiet';
    const sum = el('b', '', tr('results.payout', { money: $(p.base) }));
    pop.append(sum);
    showHud();
    fxLayer.append(pop);
    pop.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 200, fill: 'forwards' });
    // The pay counts up beat by beat: the base, then each bonus with a rising coin tick (the designer: the moment earned
    // was not played)
    countUp(sum, p, pop);
    // A part of it into the next garage's fund: a coin flies to the goal
    const goalNow = nextGoal(save);
    if (goalNow.kind === 'garage') setTimeout(() => flyTo(icon('coin', 26, ''), pop, goalPill), 350);
    // A new model: its picture flies into the album, with the count
    if (p.newModel && c) albumToast(c.model.id);
    setTimeout(() => pop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished.then(() => pop.remove()), 1800);
    autoNext = 1;
    autoLeft = 0.15;
    wake();
  }

  /** The pay on the pop counts up: the base, then +30 % Perfect, then ×2 Rush, each a coin tick a little higher */
  function countUp(sum: HTMLElement, p: { total: number; base: number; perfect: boolean }, pop: HTMLElement): void {
    const beats: { to: number; badge?: HTMLElement }[] = [];
    const c = car;
    let v = p.base / ((p.perfect ? 1 + FLOW.perfectBonus : 1) * (c?.rush?.won ? FLOW.rushPay : 1));
    beats.push({ to: v });
    if (p.perfect) beats.push({ to: (v *= 1 + FLOW.perfectBonus), badge: el('span', 'badge gold', tr('results.perfect')) });
    if (c?.rush?.won) beats.push({ to: (v *= FLOW.rushPay), badge: el('span', 'badge gold stamp', tr('rush.won')) });
    beats[beats.length - 1].to = p.total;
    sum.textContent = tr('results.payout', { money: $(beats[0].to) });
    beats.forEach((b, i) => {
      setTimeout(() => {
        if (!pop.isConnected) return;
        sum.textContent = tr('results.payout', { money: $(b.to) });
        if (b.badge) pop.append(b.badge);
        if (i) sound.coin(i);
        sum.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 160 });
      }, i * 260);
    });
  }

  /** A thing flies from one element to another (a coin into the goal, a car into the album), then is gone */
  function flyTo(thing: HTMLElement, from: HTMLElement, to: HTMLElement | null, ms = 650): Promise<void> {
    if (!to || !to.isConnected || !from.isConnected) return Promise.resolve();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const host0 = fxLayer.getBoundingClientRect();
    thing.classList.add('flyer');
    thing.style.left = `${a.left + a.width / 2 - host0.left}px`;
    thing.style.top = `${a.top + a.height / 2 - host0.top}px`;
    fxLayer.append(thing);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    return thing
      .animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.1)`, opacity: 1, offset: 0.5 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.45)`, opacity: 0.6 },
        ],
        { duration: ms, easing: 'ease-in', fill: 'forwards' },
      )
      .finished.then(() => {
        thing.remove();
        to.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 180 });
      })
      .catch(() => thing.remove());
  }

  /** A new tool tier: the tool drawn big with its name, then it goes to work */
  function toolReveal(cat: Cat): void {
    const lv = save.tools[cat];
    const t = el('div', 'albumtoast toolnew');
    const d = el('div');
    d.append(el('small', '', tr('quick.newTool')), el('b', '', tr(`tool.${TOOLS[cat].tiers[Math.min(TOOLS[cat].tiers.length - 1, Math.floor(lv / TIER_EVERY))]}`)));
    t.append(icon(toolIcon(cat, lv), 72, ''), d);
    fxLayer.append(t);
    t.animate([{ opacity: 0, transform: 'translate(-50%, 0) scale(0.4)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1.1)', offset: 0.6 }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => t.remove()), 1800);
  }

  /** A new model for the album: its picture and the count, then it flies into the Album button */
  function albumToast(id: string): void {
    const a = album(save);
    const t = el('div', 'albumtoast');
    t.dataset.gp = 'album-new';
    const img = el('img');
    liveThumb(img, id);
    img.alt = '';
    const d = el('div');
    d.append(el('small', '', tr('results.newModel')), el('b', '', tr('albumCount', { a: a.models, b: a.of })));
    t.append(img, d);
    fxLayer.append(t);
    t.animate([{ opacity: 0, transform: 'translate(-50%, 12px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 220, fill: 'forwards' });
    setTimeout(() => {
      if (!t.isConnected) return;
      const pic = el('img', 'flyimg');
      pic.src = img.src;
      pic.alt = '';
      flyTo(pic, img, bottom.querySelector<HTMLElement>('[data-gp=album]'), 700);
      t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(() => t.remove());
    }, 1700);
  }

  function showResults(offer: boolean): void {
    if (!car) return;
    const c = car;
    const p = lastPayout;
    const title = h2(tr('results.title'), 'trophy');
    const name = el('div', 'row');
    const chip = el('span', 'chip', tr(`rarity.${c.rarity}`));
    chip.style.background = RARITY[c.rarity].color;
    name.append(el('b', '', tr(`model.${c.model.id}.name`)), chip, el('span', 'muted', `${tr(`variant.${c.variant}`)} · ${tr('serial', { n: String(c.serial).padStart(3, '0') })}`));
    const money = el('div', 'big center', tr('results.payout', { money: $(p.total) }));
    const badges = el('div', 'row');
    if (c.rush) {
      const b = el('span', `badge${c.rush.won ? ' gold stamp' : ''}`, tr(c.rush.won ? 'rush.won' : 'rush.lost'));
      badges.append(b);
      if (c.rush.won) b.animate([{ transform: 'rotate(-4deg) scale(2)', opacity: 0 }, { transform: 'rotate(-4deg) scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    }
    if (p.perfect) badges.append(el('span', 'badge gold', tr('results.perfect')));
    if (p.newModel) badges.append(el('span', 'badge', tr('results.newModel')));
    else if (p.newVariant && c.variant !== 'standard') badges.append(el('span', 'badge', tr('results.newVariant', { name: tr(`variant.${c.variant}`) })));
    if (p.newRarity && RARITIES.indexOf(c.rarity) >= 2) badges.append(el('span', 'badge gold', tr('results.newRarity', { name: tr(`rarity.${c.rarity}`) })));
    if (c.daily) badges.append(el('span', 'badge gold', tr('results.daily')));
    // The car of the day: tomorrow's waits, covered (a reason to come back, shown where it is earned)
    const tomorrowBox = c.daily ? tomorrowCar() : null;
    const pw = perfectWheels(c);
    if (pw) badges.append(el('span', 'badge gold', tr('results.perfectWheels', { n: pw })));
    for (const rim of p.newRims ?? []) badges.append(el('span', 'badge', tr('results.newRim', { name: tr(`rim.${rim}`) })));
    if (orderNow === 'progress') badges.append(el('span', 'badge', tr('order.progress', { a: save.order.n, b: ORDER_NEED })));
    if (orderNow === 'done') badges.append(el('span', 'badge gold', tr('order.paid', { money: $(orderPaid) })));
    // The unfinished goal, with its share
    const goal = nextGoal(save);
    const gname = goal.kind === 'garage' ? tr(`site.${goal.id}.name`) : goal.kind === 'prestige' ? tr('prestige.title') : tr('album.title');
    const goalBox = el('div', 'card');
    const gt = el('div', 't');
    // The same two halves as the HUD's goal (cars, fund), or the reached goal's name beside its button
    const reached = goalReady();
    const parts = goal.cars && goal.fund !== undefined && !reached;
    gt.append(
      el('small', '', parts ? tr('goalParts', { a: goal.cars!.have, b: goal.cars!.need, pct: Math.floor(goal.fund! * 100) }) : tr('goalLabel')),
      el('b', 'gp-goal-l', parts || reached ? gname : tr('goal', { name: gname, pct: Math.floor(goal.share * 100) })),
      bar(reached ? 1 : goal.share),
    );
    goalBox.append(icon(goal.kind === 'garage' ? `garage:${SITE.get(goal.id)?.tier ?? save.garage + 1}` : goal.kind === 'prestige' ? 'chain' : 'album', 52), gt);
    goalBox.dataset.gp = 'results-goal';
    goalBox.dataset.gpProgress = String(Math.round(goal.share * 1000) / 1000);
    // Reached: one tap opens it (a goal at 100 % with nothing to press was an empty goal: the audit, 2026-10-20)
    const ready = goalReady();
    if (ready) goalBox.append(button(tr(ready === 'garage' ? 'goalOpen' : 'goalPrestige'), () => takeGoal(), { gp: 'goalOpen' }));
    const buttons = el('div', 'row');
    const next = button(tr('results.next'), () => nextCar(), { gp: 'again' });
    const rewarded = offer && !doubled
      ? rewardedButton({
          host,
          placement: 'double',
          label: `▶ ${tr('results.double')}`,
          onReward() {
            doubled = true;
            earn(save, p.total);
            save.stats.earned += p.total;
            lastPayout = { ...p, total: p.total * 2 };
            persist();
            sound.fanfare();
            // Only redraw the card if it is still the one on screen
            if (state === 'results' && car === c) showResults(false);
          },
        })
      : null;
    if (rewarded) {
      // "No thanks" as big as the offer: it is the Next car button
      buttons.append(rewarded, next);
      requestAnimationFrame(() => {
        const wd = Math.max(rewarded.getBoundingClientRect().width, next.getBoundingClientRect().width);
        rewarded.style.minWidth = next.style.minWidth = `${Math.ceil(wd)}px`;
      });
      next.textContent = tr('gp.noThanks');
    } else buttons.append(next);
    const shop = button(tr('btn.garage'), () => showShop(), { alt: true, gp: 'shop' });
    buttons.append(shop);
    // The shop's own lesson from the 4th car: the first purchase is the upgrade button's (in play)
    const teachBuy = buyLesson() && save.stats.restored >= 4;
    if (teachBuy) {
      nudge(shop);
      shop.setAttribute('aria-label', tr('hint.buy'));
    }
    const panel = screen([title, name, money, badges, ...(tomorrowBox ? [tomorrowBox] : []), goalBox, buttons], 'panel glass narrow');
    panel.dataset.gp = 'results';
    // The card always goes on by itself (an idle garage keeps working): the ×2 offer and the lesson sit beside it, they no
    // longer stop the garage (each one ended a session: the audit, 2026-10-20). Longer with more to read; a tap on Next is
    // the break for an ad
    const sec = Math.min(FLOW.cardSec + 2.4, FLOW.cardSec + 0.6 * badges.childElementCount + (rewarded ? 1.5 : 0));
    autoNext = 1;
    autoLeft = sec;
    next.dataset.gpAuto = String(sec);
    next.classList.add('gp-primary');
    const ring = el('div', 'ring');
    next.style.position = 'relative';
    next.append(ring);
    ringAnim = ring.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: sec * 1000, fill: 'forwards' });
    wake();
  }

  /** Tomorrow's rare car: its silhouette, its rarity, the hours until it comes */
  function tomorrowCar(): HTMLElement {
    const now = new Date();
    const d = dailyCar(save, dayKey(new Date(now.getTime() + 86400000)));
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const hours = Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 3600000));
    const box = el('div', 'card tomorrow');
    box.dataset.gp = 'daily-tomorrow';
    const img = el('img', 'car');
    liveThumb(img, d.model, true);
    img.alt = '';
    const t = el('div', 't');
    const chip = el('span', 'chip', tr(`rarity.${d.rarity}`));
    chip.style.background = RARITY[d.rarity].color;
    const top = el('small');
    top.append(document.createTextNode(`${tr('daily.tomorrow')} `), chip);
    t.append(top, el('b', '', tr('daily.inHours', { n: hours })));
    box.append(img, t);
    return box;
  }

  async function nextCar(byTap = true): Promise<void> {
    if (state !== 'results' || leaving || host.adPending) return;
    leaving = true;
    autoNext = 0;
    // The natural break: a midgame ad may come here (the channel paces it), only on the player's tap
    if (byTap) await host.adBreak();
    if (state !== 'results') return;
    state = 'title';
    car = null;
    play();
  }

  // --- The finale's beats, on the car's own clock

  function finaleBeats(): void {
    if (!car || car.stage !== 'finale') return;
    const st = car.st;
    if (finaleBeat === 0 && st >= 0) {
      finaleBeat = 1;
      hint('', 0);
      perfectNow = repairTime <= par * FLOW.perfect && car.byHand > car.byRobots;
      sound.lights();
    }
    if (finaleBeat === 1 && st >= 0.4) {
      finaleBeat = 2;
      if (flies(car)) sound.ignite(2.2, 0.3);
      else {
        sound.horn();
        sound.engine();
        scene.exhaust();
      }
    }
    if (finaleBeat === 2 && st >= 1.25) {
      finaleBeat = 3;
      perfectNow ??= repairTime <= par * FLOW.perfect && car.byHand > car.byRobots;
      const perfect = perfectNow;
      scene.restored(tr('results.title').toLocaleUpperCase(host.lang), `+${$(payout(save, car, perfect))}`);
      if (!flies(car)) sound.driveOut();
      sound.fanfare();
      scene.coins();
    }
  }

  // --- The loop

  function update(dt: number): void {
    if (host.paused) return;
    scene.update(dt);
    if (state !== 'play' || !car) return;
    carTime += dt;
    const before = car.stage;
    const changed = tick(car, dt);
    if (before !== 'arrive' && before !== 'finale' && before !== 'done' && (car.byHand + car.byRobots > 0 || before !== 'surface')) repairTime += dt;
    if (changed === 'done') return results();
    if (changed) scene.stageChanged(changed);
    if (before === 'arrive' && car.stage !== 'arrive') {
      refreshHud(true);
      const top = car.layers[0];
      // One nudge at a time toward what the money can do now: a tool, a robot, the next garage
      const can = (b: Buy) => affords(save, b);
      if (can({ kind: 'garage' }) && !nudged.has('garage')) {
        nudged.add('garage');
        hint('hint.garage', 4);
      } else if (save.robots.wash === 0 && can({ kind: 'robot', cat: 'wash' }) && !nudged.has('robot')) {
        nudged.add('robot');
        hint('hint.robot', 4);
      } else if (save.stats.restored >= 1 && save.stats.restored <= 3 && CATS.some((c) => can({ kind: 'tool', cat: c })) && !nudged.has('buy')) {
        nudged.add('buy');
        hint('hint.buy', 4);
      } else if (top && !hintKey && save.stats.restored < 3) hint(layerHint(top.kind), 3);
    }
    // Robots
    const p = powers(save.tools);
    // Beside the player: slower, clear of their finger (the tyre bay waits while the finger is down)
    const spot = down ? scene.screenToGrid(px, py) : null;
    for (const r of robotsStep(car, rs, dt, save.robots, p, 1, { avoid: spot && spot[0] >= 0 ? [spot[0], spot[1], 12] : undefined })) {
      if (r.wheel) {
        scene.stroke(r.res, r, 0);
        onWheel(r.wheel, 'robot');
      } else afterStroke(r.res, r);
    }
    if (car.stage === 'wheels') {
      const held = pumping && down;
      const ev = wheelTime(car, dt, held || demoPump, wrenchTier());
      if (held || demoPump) sound.pump(currentWheel(car)?.pressure ?? 0);
      if (ev) onWheel(ev, 'hand');
    }
    // Holding still on the car keeps working (a slow stroke)
    if (down && (car.stage === 'surface' || isTaskStage(car.stage))) {
      holdAcc += dt;
      if (holdAcc >= 0.11) {
        holdAcc = 0;
        handStroke(px, py);
      }
    }
    if (demo) demoStep(dt);
    finaleBeats();
    if (pendingHint && carTime >= hintLock) hint(...pendingHint);
    else if (hintUntil && carTime > hintUntil && carTime >= hintLock) hint('', 0);
    hudAcc += dt;
    if (hudAcc > 0.12) {
      hudAcc = 0;
      refreshHud();
      refreshSwatches();
      refreshLesson();
    }
  }

  /** The demo bot (gp video, the twist check): scrubs like a player swiping */
  let demoPull = 0;
  function demoStep(dt: number): void {
    if (!car) return;
    demoAcc += dt;
    // About fourteen strokes a second: a player swiping over the dirt
    while (demoAcc >= 0.07) {
      demoAcc -= 0.07;
      if (car.stage === 'surface') {
        let target = -1;
        for (let k = 0; k < 30 && target < 0; k++) {
          const i = demoLast >= 0 && k < 15 ? demoLast + Math.round((host.rng.random() - 0.5) * 10) + 96 * Math.round((host.rng.random() - 0.5) * 4) : Math.floor(host.rng.random() * car.mask.length);
          if (i >= 0 && i < car.mask.length && car.mask[i] && topAt(car, i) === currentLayerIndex(car)) target = i;
        }
        if (target < 0) for (let i = 0; i < car.mask.length && target < 0; i++) if (car.mask[i] && topAt(car, i) === currentLayerIndex(car)) target = i;
        if (target >= 0) {
          demoLast = target;
          const [x, y] = scene.gridToScreen((target % 96) + 0.5, Math.floor(target / 96) + 0.5);
          updatePointerTool(x, y, true);
          handStroke(x, y);
        }
      } else if (car.stage === 'wheels') {
        const job = currentWheel(car);
        const bay = scene.bay();
        if (!job || !bay) continue;
        demoPump = job.step === 'pump' && job.pressure < (GREEN[0] + GREEN[1]) / 2;
        if (job.step === 'pump') continue;
        if (job.step === 'balance' && Math.abs(((job.heavy + Math.PI) % (Math.PI * 2)) - Math.PI) > 0.2) continue;
        const [x, y] = bayTarget(bay, job);
        updatePointerTool(x, y, true);
        const a = bayAction(bay, job, x, y);
        if (a) {
          const ev = wheelHand(car, a, wrenchTier());
          if (ev) {
            onWheel(ev, 'hand');
            scene.spray(x, y, a.kind === 'spray');
          }
        }
        // A person needs a beat between bay actions
        demoAcc -= 0.12;
      } else if (car.stage === 'body') {
        // Grab the dent and pull straight up and out, a little further every beat
        const i = car.dents.findIndex((d) => d.left > 0);
        if (i < 0) continue;
        const d = car.dents[i];
        const [x0, y0] = scene.gridToScreen(d.gx, d.gy);
        if (!dentGrab || dentGrab.i !== i) {
          dentUp();
          dentDown(x0, y0);
          demoPull = 0;
        } else {
          demoPull += scene.carL * 0.02;
          dentMove(x0 + demoPull * 0.3, y0 - demoPull);
          if (demoPull > scene.carL * 0.35) dentUp();
        }
      } else if (isTaskStage(car.stage)) {
        const t = stageTasks(car).find((q) => q.left > 0);
        if (t) {
          const [x, y] = scene.gridToScreen(t.gx, t.gy);
          updatePointerTool(x, y, true);
          handStroke(x, y);
        }
      }
    }
  }

  function draw(): void {
    g.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    scene.draw();
  }

  function resize(): void {
    ({ w, h } = fitCanvas(canvas));
    layout();
  }

  // --- The shop: tools, robots, the garage; the prestige

  // --- The shop: tabs (tools, robots, the garage) with what is affordable counted on each, ×1 / ×10 / MAX, every card
  // with what it adds to the income a minute, the best value marked (the owner, 2026-10-13: «магазин сделай удобнее»)

  /** Levels a tap buys: 1, 10, or as many as the money allows (0) */
  let shopAmount: 1 | 10 | 0 = 1;
  let shopTab = 'tools';
  /** A purchase of n levels (or the whole batch): the price of the next n with this save, n fitting the money for MAX */
  function batchOf(b: Buy): { n: number; price: number; can: boolean } | null {
    const one = priceOf(save, b);
    if (one === null) return null;
    if (b.kind === 'garage') return { n: 1, price: one, can: one <= purse(save, b) && (openGate(save)?.have ?? 1) >= (openGate(save)?.need ?? 0) };
    const sim = structuredClone(save);
    const want = shopAmount === 0 ? Infinity : shopAmount;
    if (shopAmount !== 0) sim.money = Infinity;
    let n = 0;
    let price = 0;
    while (n < want) {
      const p = priceOf(sim, b);
      if (p === null || p > sim.money || !buy(sim, b)) break;
      price += p;
      n++;
    }
    if (!n) return { n: 1, price: one, can: false };
    return { n, price, can: price <= save.money };
  }
  /** What a purchase of n adds to the income a minute */
  function gainOf(b: Buy, n: number): number {
    const before = estimate(save).perMin;
    const sim = structuredClone(save);
    sim.money = Infinity;
    for (let i = 0; i < n; i++) if (!buy(sim, b)) break;
    return Math.max(0, estimate(sim).perMin - before);
  }

  function buyNow(b: Buy): void {
    const bt = batchOf(b);
    if (!bt || !bt.can) {
      sound.no();
      return;
    }
    const garageBefore = save.garage;
    const siteBefore = save.at;
    const tierBefore = b.kind === 'tool' ? Math.floor(save.tools[b.cat] / TIER_EVERY) : 0;
    let n = 0;
    while (n < bt.n && buy(save, b)) n++;
    if (!n) return sound.no();
    if (!learned('buy')) save.lessons.push('buy');
    persist();
    sound.buy();
    undo = b.kind === 'garage' ? null : { b, n };
    if (b.kind === 'garage') {
      // A new garage of the network: the car on the lift waits in the old one, the player moves in
      levelUpFrom = garageBefore;
      if (car && car.stage !== 'done' && car.stage !== 'finale') parked.set(siteBefore, car);
      car = null;
      sound.unlock();
      roomNow();
      scene.setRobots(save.robots);
      refreshNetwork();
      return showLevelUp();
    }
    refreshNetwork();
    if (b.kind === 'tool' && Math.floor(save.tools[b.cat] / TIER_EVERY) > tierBefore) sound.unlock();
    if (b.kind === 'robot') scene.setRobots(save.robots);
    showShop(shopTab, true);
  }

  /** Where the shop's pager was (a purchase redraws the shop on the same page) */
  let shopAt: { tab: string; at: { g: number; k: number } } = { tab: '', at: { g: 0, k: 0 } };
  function showShop(tabArg?: string, keep = false): void {
    // Opened from the game: the tools first; inside the shop, the tab it was on
    const tab = tabArg ?? (state === 'shop' ? shopTab : 'tools');
    if (state !== 'shop') shopFrom = state;
    shopTab = tab;
    const from = shopFrom;
    if (state === 'play') host.gameplay(false);
    state = 'shop';
    scene.clearFx();
    const balance = el('div', 'pill glass');
    balance.dataset.gp = 'shop-balance';
    balance.append(icon('coin', 28), el('b', '', `$${host.i18n.number(Math.floor(save.money))}`));
    const head = el('div', 'row end');
    head.append(h2(tr('shop.title'), `garage:${save.garage}`), balance);
    /** A buy button: ×n and the price; greyed with what is missing when the money isn't there */
    const buyButton = (b: Buy, gp: string, card: HTMLElement, t: HTMLElement): void => {
      const bt = batchOf(b);
      if (!bt) return;
      const bb = button('', () => buyNow(b));
      if (bt.n > 1) bb.append(el('span', 'xn', `×${bt.n}`));
      bb.append(icon('coin', 18, ''), document.createTextNode($(bt.price, 'up')));
      bb.dataset.gpBuy = gp;
      bb.setAttribute('aria-disabled', String(!bt.can));
      if (!bt.can && bt.price > save.money) t.append(el('small', 'need', tr('shop.need', { money: $(bt.price - save.money, 'up') })));
      card.append(bb);
    };
    const gainLine = (b: Buy, t: HTMLElement): number => {
      const bt = batchOf(b);
      if (!bt) return 0;
      const g = gainOf(b, bt.n);
      if (g >= 1) t.append(el('small', 'gain', tr('shop.gain', { money: $(g, 'up') })));
      else if (g > 0) t.append(el('small', 'gain', tr('shop.gain', { money: '<$1' })));
      return bt.can ? g / Math.max(1, bt.price) : 0;
    };
    // The best value per dollar on each tab (the tools', the robots')
    const bests: Record<string, { card: HTMLElement; v: number } | undefined> = {};
    let group = 'tools';
    const rate = (card: HTMLElement, v: number) => {
      const b0 = bests[group];
      if (v > 0 && (!b0 || v > b0.v)) bests[group] = { card, v };
    };
    // Tools
    const tools: HTMLElement[] = [];
    for (const cat of CATS) {
      const lv = save.tools[cat];
      const line = TOOLS[cat];
      const b: Buy = { kind: 'tool', cat };
      const locked = line.opens > save.garage;
      const card = el('div', `card${locked ? ' locked' : ''}`);
      const tierName = tr(`tool.${line.tiers[Math.min(line.tiers.length - 1, Math.floor(lv / TIER_EVERY))]}`);
      const t = el('div', 't');
      const name = el('b', '', tierName);
      name.append(el('span', 'lv', `${tr('shop.level', { n: lv })}/${toolCap(save.garage)}`));
      t.append(name, el('small', '', tr(`toolLine.${cat}`)));
      if (locked) t.append(el('small', '', tr('shop.locked', { name: tr(`garage.${GARAGES[line.opens - 1].id}.name`) })));
      else if (lv >= toolCap(save.garage)) t.append(el('small', '', tr('shop.capped')));
      else {
        const n = batchOf(b)?.n ?? 1;
        const a = toolPower(lv).strength / toolPower(0).strength;
        const b2 = toolPower(lv + n).strength / toolPower(0).strength;
        t.append(el('small', '', tr('shop.strength', { a: a.toFixed(1), b: b2.toFixed(1) })));
        const nextTier = Math.floor(lv / TIER_EVERY) + 1;
        const reaches = !!line.tiers[nextTier] && lv + n >= nextTier * TIER_EVERY;
        if (reaches) t.append(el('small', 'gain', tr('shop.newTool', { name: tr(`tool.${line.tiers[nextTier]}`) })));
        const v = gainLine(b, t);
        // Inside a tier a level adds little: say what it builds toward (the next tool) rather than leave the card blank
        if (!v && !reaches && line.tiers[nextTier] && !t.querySelector('.gain')) t.append(el('small', '', tr('shop.newTool', { name: tr(`tool.${line.tiers[nextTier]}`) })));
        rate(card, v);
      }
      t.append(bar((lv % TIER_EVERY) / TIER_EVERY, 'cyan'));
      card.append(icon(toolIcon(cat, lv), 52), t);
      buyButton(b, `tool-${cat}`, card, t);
      tools.push(card);
    }
    // Robots
    group = 'robots';
    const robots: HTMLElement[] = [];
    for (const cat of CATS) {
      const r = ROBOTS[cat];
      const n = save.robots[cat];
      const slots = GARAGES[save.garage - 1].slots;
      const b: Buy = { kind: 'robot', cat };
      const card = el('div', `card${r.opens > save.garage ? ' locked' : ''}`);
      const t = el('div', 't');
      t.append(el('b', '', tr(`robot.${r.id}`)), el('small', '', tr(`toolLine.${cat}`)));
      if (r.opens > save.garage) t.append(el('small', '', tr('shop.locked', { name: tr(`garage.${GARAGES[r.opens - 1].id}.name`) })));
      else {
        t.append(el('small', '', n >= slots ? tr('shop.robotFull', { n, max: slots }) : tr('shop.robotCount', { n, max: slots })));
        if (n < slots) rate(card, gainLine(b, t));
      }
      card.append(icon(r.id, 52), t);
      buyButton(b, `robot-${cat}`, card, t);
      robots.push(card);
    }
    // The next garage and the chain
    const expand: HTMLElement[] = [];
    const next = nextSite(save);
    const gcard = el('div', 'card');
    const gt = el('div', 't');
    if (next) {
      gt.append(el('b', '', tr('shop.buildNext', { name: tr(`site.${next.id}.name`) })), el('small', '', `${tr(`site.${next.id}.city`)} · ${tr(`garage.${GARAGES[next.tier - 1].id}.desc`)}`));
      const lock = lockOf(save, { kind: 'garage' });
      const gate = openGate(save);
      if (lock === 'prestige') gt.append(el('small', '', tr('shop.buildPrestige')));
      else if (gate && gate.have < gate.need) {
        // The cars it takes first, in the last opened garage
        gt.append(el('small', 'need', tr('shop.buildCars', { garage: tr(`site.${gate.at}.name`), a: gate.have, b: gate.need })), bar(gate.have / gate.need));
      } else gt.append(bar(Math.min(1, save.money / next.price)));
      gcard.append(icon(`garage:${next.tier}`, 52), gt);
      buyButton({ kind: 'garage' }, 'garage', gcard, gt);
    } else {
      gt.append(el('b', '', tr('shop.allBuilt')));
      gcard.append(icon('garage:6', 52), gt);
    }
    expand.push(gcard);
    if (topTier(save) >= PRESTIGE.needsLevel || save.prestige > 0) {
      const pc = el('div', 'card');
      const pt = el('div', 't');
      pt.append(el('b', '', tr('prestige.title')), el('small', '', tr('prestige.have', { n: save.stars, x: starMult(save).toFixed(1) })));
      pc.append(icon('chain', 52), pt, button(tr('prestige.go'), () => showPrestige(), { alt: true }));
      expand.push(pc);
    }
    // The best value of the tools and robots: marked
    for (const bst of Object.values(bests)) {
      if (!bst) continue;
      bst.card.classList.add('best');
      bst.card.querySelector('.t')?.prepend(el('span', 'tag', tr('shop.best')));
    }
    const top = Object.values(bests).reduce<{ card: HTMLElement; v: number } | undefined>((a, b) => (b && (!a || b.v > a.v) ? b : a), undefined);
    // Tabs: what each holds, and how many things on it the money buys now
    const can = (list: HTMLElement[]) => list.filter((c) => c.querySelector('[data-gp-buy][aria-disabled=false]')).length;
    const TABS: { id: string; label: string; ic: string; items: HTMLElement[] }[] = [
      { id: 'tools', label: tr('shop.tools'), ic: toolIcon('wash', save.tools.wash), items: tools },
      { id: 'robots', label: tr('shop.robots'), ic: 'washbot', items: robots },
      { id: 'expand', label: tr('shop.expand'), ic: `garage:${Math.min(6, save.garage + 1)}`, items: expand },
    ];
    const tabRow = el('div', 'tabs');
    for (const tb of TABS) {
      const bt = button('', () => showShop(tb.id), { alt: true, cls: `alt tab${tb.id === tab ? ' on' : ''}`, gp: `tab-${tb.id}` });
      bt.append(icon(tb.ic, 26, ''), el('span', 'tl', tb.label));
      const n = can(tb.items);
      if (n) bt.append(el('span', 'badge-n', String(n)));
      // The tab with the best buy carries a star
      if (top && tb.items.includes(top.card)) bt.append(icon('star', 16, 'star-best'));
      tabRow.append(bt);
    }
    const cur = TABS.find((x) => x.id === tab) ?? TABS[0];
    const pg = pager([{ label: cur.label, items: cur.items }], 'cards', keep && shopAt.tab === tab ? shopAt.at : { g: 0, k: 0 });
    shopAt = { tab, at: pg.at };
    // ×1 / ×10 / MAX
    const amount = el('div', 'seg');
    if (tab !== 'expand') {
      for (const [v, label] of [[1, '×1'], [10, '×10'], [0, tr('shop.max')]] as const) {
        const bt = button(label, () => {
          shopAmount = v;
          showShop(tab, true);
        }, { alt: true, cls: `alt${shopAmount === v ? ' on' : ''}`, gp: `amount-${v || 'max'}` });
        amount.append(bt);
      }
    }
    const foot = el('div', 'row');
    if (undo) {
      const last = undo;
      foot.append(button(tr('gp.shop.undo'), () => {
        let back = 0;
        for (let i = 0; i < last.n && refund(save, last.b); i++) back++;
        if (back) {
          persist();
          if (last.b.kind === 'robot') scene.setRobots(save.robots);
        }
        undo = null;
        showShop(tab, true);
      }, { alt: true, gp: 'shop-undo' }));
    }
    foot.append(button(tr('gp.back'), () => {
      undo = null;
      back(from);
    }, { gp: 'shop-back' }));
    const bar2 = el('div', 'row shopbar');
    bar2.append(tabRow, amount);
    const p = screenPaged([head, bar2, pg.nav, pg.box, foot], pg);
    p.dataset.gp = 'shop-screen';
    p.classList.add('shop');
    if (buyLesson()) nudge(p.querySelector<HTMLElement>('[data-gp-buy][aria-disabled=false]'));
    wake();
  }

  /** Back from a menu: to the game if one was on, else to the title */
  // --- The map of the network (the owner's table §5): the Earth and space, every garage, a move to an opened one

  let mapNow: ReturnType<typeof createMap> | null = null;
  let mapView: MapView = 'earth';
  function showMap(pick?: string): void {
    const from = state === 'map' ? 'title' : state;
    if (state === 'play') host.gameplay(false);
    state = 'map';
    scene.clearFx();
    const next = nextSite(save);
    const pins = (): MapPin[] =>
      SITES.map((site) => ({
        site,
        state: save.sites[site.id] ? 'open' : next?.id === site.id ? 'next' : 'locked',
        here: site.id === save.at,
        robots: save.sites[site.id] ? CATS.reduce((a, c) => a + save.sites[site.id].robots[c], 0) : 0,
        label: tr(`site.${site.id}.city`),
      }));
    const total = el('div', 'pill glass');
    total.append(icon('chain', 26), el('b', '', tr('map.total', { money: $(networkRate(save) * 60) })));
    const head = el('div', 'row end');
    head.append(h2(tr('map.title'), 'map'), total);
    const tabs = el('div', 'row maptabs');
    const tab = (v: MapView) => {
      const b = button(tr(`map.${v}`), () => mapNow?.setView(v), { alt: v !== mapView, gp: `map-${v}` });
      return b;
    };
    tabs.append(tab('earth'), tab('space'));
    const box = el('div', 'mapbox');
    const cv = document.createElement('canvas');
    cv.dataset.gp = 'map';
    const zoom = el('div', 'mapzoom');
    zoom.append(button('+', () => mapNow?.zoomBy(1.4), { alt: true }), button('−', () => mapNow?.zoomBy(1 / 1.4), { alt: true }));
    box.append(cv, zoom);
    const info = el('div', 'card mapinfo');
    const fill = (id: string) => {
      const site = SITE.get(id)!;
      const st = save.sites[id];
      const t = el('div', 't');
      t.append(el('b', '', tr(`site.${id}.name`)), el('small', '', `${tr(`site.${id}.city`)} · ${tr(`garage.${GARAGES[site.tier - 1].id}.name`)}`));
      const acts = el('div', 'row');
      if (st) {
        const robots = CATS.reduce((a, c) => a + st.robots[c], 0);
        const lv = Math.round(CATS.reduce((a, c) => a + st.tools[c], 0) / CATS.length);
        t.append(el('small', '', tr('map.stats', { robots, level: lv, money: $(siteRate(save, id) * 60), cars: st.cars })));
        if (id === save.at) acts.append(button(tr('map.here'), () => back(from), { gp: 'map-here' }));
        else acts.append(button(tr('map.go'), () => goTo(id), { gp: 'map-go' }));
      } else if (next?.id === id) {
        const lock = lockOf(save, { kind: 'garage' });
        if (lock === 'prestige') t.append(el('small', '', tr('shop.buildPrestige')));
        else {
          t.append(bar(Math.min(1, purse(save, { kind: 'garage' }) / site.price)));
          const b = button('', () => buyNow({ kind: 'garage' }), { gp: 'map-open' });
          b.append(icon('coin', 18, ''), document.createTextNode($(site.price, 'up')));
          b.setAttribute('aria-disabled', String(purse(save, { kind: 'garage' }) < site.price));
          acts.append(b);
        }
      } else t.append(el('small', '', tr('map.locked', { name: next ? tr(`site.${next.id}.name`) : '' })));
      info.replaceChildren(icon(`garage:${site.tier}`, 48), t, acts);
    };
    screen([head, tabs, box, info, button(tr('gp.back'), () => back(from))], 'panel glass mappanel');
    mapNow = createMap(cv, {
      pins,
      onPick: fill,
      onView: (v) => {
        mapView = v;
        tabs.replaceChildren(tab('earth'), tab('space'));
      },
      t: tr,
    });
    const first = pick ?? save.at;
    mapNow.focus(first);
    fill(first);
    refit = () => mapNow?.resize();
    wake();
  }

  function back(from: State): void {
    if (from === 'play' || from === 'paused') return resume();
    if (from === 'results') return showResultsAgain();
    if (seenBefore || save.stats.restored > 0) return showTitle();
    // A new player back from a screen opened from another (the shop's map …): back to the car, never the start screen
    return car && car.stage !== 'done' ? resume() : showFirst();
  }
  function showResultsAgain(): void {
    state = 'results';
    showResults(!!car && offersDouble(save, car) && !doubled);
  }

  function showLevelUp(): void {
    state = 'levelup';
    const id = GARAGES[save.garage - 1].id;
    const site = SITE.get(save.at)!;
    // What comes here stays a surprise (the owner, 2026-10-16): mystery cards and how many there are to find
    const list = el('div', 'album');
    const coming = site.pool;
    // Their silhouettes, as the album shows them (grey «?» boxes looked unfinished: the reviewer, 1.5.0)
    for (const mid of coming.slice(0, 4)) {
      const c = el('div', 'acard unknown');
      const img = el('img', 'car');
      liveThumb(img, mid, true);
      img.alt = '';
      c.append(img, el('b', '', tr('album.unknown')));
      list.append(c);
    }
    void id;
    const p = screen([h2(tr('level.title'), `garage:${save.garage}`), el('div', 'big center', tr(`site.${site.id}.name`)), el('div', 'center muted', tr(`site.${site.id}.city`)), el('div', 'sec', tr('level.surprise', { n: coming.length })), list, button(tr('gp.continue'), () => {
      void levelUpFrom;
      if (car && car.stage !== 'done') resume();
      else play();
    }, { gp: 'continue-level' })], 'panel glass');
    void p;
    wake();
  }

  function showPrestige(): void {
    const from = state === 'prestige' ? 'title' : state;
    state = 'prestige';
    const gain = starsFor(save.life);
    const kids: HTMLElement[] = [h2(tr('prestige.title'), 'chain'), el('div', 'center', tr('prestige.body')), el('div', 'center muted', tr('prestige.have', { n: save.stars, x: starMult(save).toFixed(1) }))];
    if (canPrestige(save)) {
      kids.push(el('div', 'big center', tr('prestige.gain', { n: gain, x: (1 + PRESTIGE.perStar * (save.stars + gain)).toFixed(1) })));
      const sure = el('div', 'row');
      let armed = false;
      const go = button(tr('prestige.go'), () => {
        if (!armed) {
          armed = true;
          go.textContent = tr('prestige.yes');
          sure.append(el('div', 'muted', tr('prestige.sure')));
          return;
        }
        // A car in progress: one roundEnd for it (paid if it was already driving out)
        if (car && car.stage !== 'done' && (car.stage as string) !== 'arrive') {
          if (car.stage === 'finale') restore(save, car, repairTime, false);
          host.roundEnd({ score: 0, newBest: false });
        }
        undo = null;
        prestige(save);
        persist();
        sound.unlock();
        car = null;
        parked.clear();
        refreshNetwork();
        roomNow();
        scene.setRobots(save.robots);
        showTitle();
      });
      sure.append(go);
      kids.push(sure);
    } else {
      const need = PRESTIGE.unit - save.life;
      kids.push(el('div', 'center', tr('prestige.notYet', { money: $(Math.max(0, need), 'up') })));
    }
    kids.push(button(tr('gp.back'), () => back(from === 'shop' ? 'title' : from), { alt: true }));
    screen(kids, 'panel glass narrow');
    wake();
  }

  // --- The album: a card per model, the car itself on it

  const thumbs = new Map<string, string>();
  function thumb(id: string): string {
    let u = thumbs.get(id);
    if (!u) {
      const m = MODEL.get(id)!;
      const c = document.createElement('canvas');
      const W = 280;
      const H = 120;
      c.width = W;
      c.height = H;
      const cg = c.getContext('2d')!;
      // A small bake of the car, drawn to fit
      u = renderThumb(m.id, cg, W, H);
      // A picture still on its way (a later chapter) is not kept: liveThumb draws it again when it arrives
      if (carLoaded(id)) thumbs.set(id, u);
    }
    return u;
  }
  /** An <img> of a car's thumbnail (or its silhouette) that redraws itself when the car's pictures arrive */
  function liveThumb(img: HTMLImageElement, id: string, silhouette = false): void {
    img.src = silhouette ? silhouetteThumb(id) : thumb(id);
    if (!carLoaded(id))
      void carReady(id).then(() => {
        if (img.isConnected) img.src = silhouette ? silhouetteThumb(id) : thumb(id);
      });
  }

  function albumCard(id: string, known: boolean): HTMLElement {
    const m = MODEL.get(id)!;
    const rec = save.album[id];
    const card = el('div', `acard${known ? '' : ' unknown'}`);
    const img = el('img', 'car');
    liveThumb(img, id, !known);
    img.alt = '';
    card.append(img, el('b', '', known ? tr(`model.${id}.name`) : tr('album.unknown')));
    if (known && rec) {
      card.append(el('small', '', tr('album.done', { n: rec.n })));
      const dots = el('div', 'dots');
      for (const r of ['rare', 'epic', 'legendary', 'mythic'] as const) {
        const i = el('i');
        if (rec.rar.includes(r)) i.style.background = RARITY[r].color;
        dots.append(i);
      }
      card.append(dots, el('small', '', `${tr('album.versions')} ${rec.vars.length}/7`));
    } else if (known) card.append(el('small', '', tr(`model.${id}.kind`)));
    else card.append(el('small', '', tr('album.arrives', { name: tr(`garage.${GARAGES[m.level - 1].id}.name`) })));
    return card;
  }

  function showAlbum(): void {
    const from = state;
    if (state === 'play') host.gameplay(false);
    state = 'album';
    scene.clearFx();
    const a = album(save);
    const sum = el('div', 'row sum');
    sum.append(el('span', 'badge gold', tr('album.models', { a: a.models, b: a.of })), el('span', 'badge', tr('album.rims', { a: save.rims.length, b: RIMS.length })), el('span', 'badge', tr('album.variants', { a: a.variants, b: a.varOf })), el('span', 'badge', tr('album.rare', { a: a.rarities, b: a.rarOf })));
    // The rim row: every rim style, the ones found in colour
    const rims: HTMLElement[] = [];
    for (const r of RIMS) {
      const box = el('div', `rim${save.rims.includes(r.id) ? '' : ' off'}`);
      const img = el('img');
      img.src = rimUrl(r.id);
      img.alt = '';
      box.append(img, el('small', '', save.rims.includes(r.id) ? tr(`rim.${r.id}`) : tr('album.unknown')));
      rims.push(box);
    }
    // A tab per garage of the network (its own vehicles), then the rims
    const groups: Group[] = SITES.map((x) => ({ label: tr(`site.${x.id}.name`), items: x.pool.map((id) => albumCard(id, !!save.album[id])) }));
    groups.push({ label: tr('album.rimsTab'), items: rims, cls: 'rims' });
    const pg = pager(groups, 'album', { g: Math.max(0, SITES.findIndex((x) => x.id === save.at)), k: 0 });
    const share = bar(a.share);
    share.classList.add('sumbar');
    screenPaged([h2(tr('album.title'), 'album'), sum, share, pg.nav, pg.box, button(tr('gp.back'), () => back(from))], pg);
    wake();
  }

  // --- Statistics: drawn tiles and bars

  function showStats(): void {
    const from = state;
    if (state === 'play') host.gameplay(false);
    state = 'stats';
    scene.clearFx();
    const s = save.stats;
    const tile = (iconId: string, label: string, value: string) => {
      const t = el('div', 'tile');
      const d = el('div');
      d.append(el('b', '', value), el('small', '', label));
      t.append(icon(iconId, 34, ''), d);
      return t;
    };
    const a = album(save);
    const tiles: HTMLElement[] = [

      tile('trophy', tr('stats.restored'), String(s.restored)),
      tile('washbot', tr('stats.away'), String(s.away)),
      tile('coin', tr('stats.earned'), $(s.earned)),
      tile('album', tr('stats.collection'), tr('stats.pct', { n: Math.round(a.share * 100) })),
      tile('star', tr('stats.priciest'), s.priciest ? `${tr(`model.${s.priciest.id}.name`)} ${$(s.priciest.value)}` : '—'),
      tile('mud', tr('stats.dirtiest'), tr('stats.pct', { n: s.dirtiest })),
      tile('rust', tr('stats.worst'), s.restored ? tr('stats.pct', { n: s.worst }) : '—'),
      tile('clock', tr('stats.fastest'), s.fastest ? tr('stats.sec', { n: s.fastest }) : '—'),
      tile('clock', tr('stats.longest'), s.longest ? tr('stats.sec', { n: s.longest }) : '—'),
      tile('wash:2', tr('stats.area'), tr('stats.m2', { n: Math.round(s.area) })),
      tile('grind:1', tr('stats.rust'), tr('stats.kg', { n: Math.round(s.rust * 10) / 10 })),
      tile('parts', tr('stats.parts'), String(s.parts)),
      tile('engine', tr('stats.engines'), String(s.engines)),
      tile('parts', tr('stats.wheels'), String(s.wheels)),
      tile('polish:1', tr('stats.perfect'), String(s.perfect)),
      tile('clock', tr('stats.time'), tr('stats.min', { n: Math.round(s.minutes) })),
      tile('chain', tr('stats.stars'), String(save.stars)),
      tile('gate', tr('stats.first'), s.first ? tr(`model.${s.first.id}.name`) : '—'),
    ];
    const bars = (rows: [string, number][]) => {
      const max = Math.max(1, ...rows.map((r) => r[1]));
      return rows.map(([label, v]) => {
        const r = el('div', 'r');
        r.append(el('span', '', label), bar(v / max, 'cyan'), el('b', '', String(v)));
        return r;
      });
    };
    const pg = pager(
      [
        { label: tr('stats.records'), items: tiles },
        { label: tr('stats.byClass'), items: bars((['car', 'sport', 'truck', 'special', 'moto', 'heavy', 'space'] as const).map((c) => [tr(`cls.${c}`), s.byCls[c]])), cls: 'bars' },
        { label: tr('stats.byGarage'), items: bars(GARAGES.map((gg, i) => [tr(`garage.${gg.id}.name`), s.byGarage[i]])), cls: 'bars' },
        { label: tr('stats.ach', { a: save.ach.length, b: ACHIEVEMENTS.length }), items: achTiles() },
      ],
      'tiles',
    );
    screenPaged([h2(tr('stats.title'), 'stats'), pg.nav, pg.box, button(tr('gp.back'), () => back(from))], pg);
    wake();
  }

  /** The achievements as tiles: earned ones bright, the rest dim; a hidden one shows nothing until earned */
  function achTiles(): HTMLElement[] {
    return ACHIEVEMENTS.map((a) => {
      const got = save.ach.includes(a.id);
      const t = el('div', `tile ach${got ? '' : ' locked'}`);
      t.style.setProperty('--rc', ACH_COLOR[a.rarity]);
      const d = el('div');
      const secret = a.hidden && !got;
      d.append(el('b', '', secret ? '???' : tr(`ach.${a.id}.name`)), el('small', '', secret ? tr('ach.hidden') : tr(`ach.${a.id}.desc`)));
      t.append(icon(secret ? 'star' : a.icon, 34, ''), d);
      return t;
    });
  }

  // --- The host

  window.addEventListener('resize', () => {
    resize();
    if (state === 'first') showFirst();
    refit?.();
    wake();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
      if (state === 'paused') resume();
      else pauseGame();
    }
  });
  host.onPause((reason) => {
    ringAnim?.pause();
    if (reason !== 'ad') pauseGame();
    down = false;
  });
  host.onResume(() => {
    ringAnim?.play();
    wake();
  });
  host.onLanguage(() => {
    if (state === 'play') showHud();
  });

  if (import.meta.env.DEV) {
    // Dev only: where the work left on the car is on screen (a stalled stage's specks)
    (window as unknown as { __left: () => unknown }).__left = () => {
      if (!car) return null;
      const cur = currentLayerIndex(car);
      const pts: [number, number][] = [];
      for (let i = 0; i < car.mask.length; i++) if (cur >= 0 && topAt(car, i) === cur) pts.push(scene.gridToScreen((i % GRID.w) + 0.5, Math.floor(i / GRID.w) + 0.5).map(Math.round) as [number, number]);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      return { down, stage: car.stage, layer: cur >= 0 ? car.layers[cur].kind : null, left: cur >= 0 ? +(car.layers[cur].left / car.layers[cur].total).toFixed(3) : 0, n: pts.length, x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)], box: scene.carBox() };
    };
  }
  // The owner's painted cars come in chapters (painted-art.ts): a new player's first car is painted before the first frame —
  // before the QA hooks: a tester sees the game ready (game_ready) as soon as they are there
  // (its 4 pictures, in chapter 0); everything else is asked for when it is drawn, and decoded after Play
  // (at most 0.6 s: while the page's later chapters are still being parsed the idle time it decodes in is scarce)
  if (!seenBefore) await Promise.race([carReady('glide'), new Promise((r) => setTimeout(r, 600))]);
  const qaDriver: Parameters<typeof host.qa>[0] = {
    play: () => {
      if (state === 'results') return void nextCar(false);
      play();
    },
    end: () => {
      if (!car || state !== 'play') {
        if (state !== 'play') play();
      }
      if (!car) return;
      // Finish the car the quick way: every layer, part and node done
      for (const l of car.layers) {
        l.amt.fill(0);
        l.left = 0;
        l.dirty = true;
      }
      for (const t of [...car.parts, ...car.engine, ...car.thrusters]) t.left = 0;
      for (const j of car.wheels) j.step = 'done';
      car.stage = 'done';
      results(true);
    },
    grant: (n) => {
      save.money += n;
      persist();
    },
    demo: () => {
      demo = true;
    },
    idleAnimation: true,
    screens: {
      streak: () => {
        save.streak = { day: dayKey(), n: 4, claimed: false };
        pendingStreak = true;
        pendingOffline = null;
        showStreak();
      },
      first: () => {
        car = null;
        showFirst();
      },
      title: () => {
        pendingStreak = false;
        showTitle();
      },
      hud: () => {
        play();
      },
      shop: () => {
        save.money = Math.max(save.money, 50000);
        showShop();
      },
      'shop-late': () => {
        save.garage = 5;
        save.money = 4e9;
        for (const c of CATS) {
          save.tools[c] = 44;
          save.robots[c] = 3;
        }
        save.life = 6e7;
        showShop('expand');
      },
      album: () => {
        for (const m of MODELS.filter((q) => !q.retired).slice(0, 18)) save.album[m.id] = { n: 3, best: 90, worst: 20, top: 5000, rar: ['common', 'rare', 'epic'], vars: ['standard', 'racing'], fastest: 12 };
        showAlbum();
      },
      stats: () => {
        save.stats.restored = 18472;
        save.stats.earned = 4827194821;
        save.stats.priciest = { id: 'horseshoe', value: 18400000 };
        showStats();
      },
      paused: () => {
        play();
        pauseGame();
      },
      results: () => {
        play();
        if (car) car.rarity = 'legendary';
        lastPayout = { total: 1234567, base: 1234567, perfect: true, newModel: true, newVariant: true, newRarity: true };
        state = 'results';
        host.gameplay(false);
        showResults(true);
      },
      welcome: () => {
        pendingOffline = { sec: 7200, cars: 128, money: 9876543 };
        showWelcome();
      },
      map: () => {
        play();
        showMap();
      },
      levelup: () => {
        save.garage = 4;
        showLevelUp();
      },
      prestige: () => {
        save.garage = 5;
        save.life = 8e7;
        showPrestige();
      },
    },
  };
  host.qa(qaDriver);
  // The cover's car (the Fang, chapter 2) is decoded before gp covers sees the hook: a later picture isn't there at boot
  if (qaHooks) void carReady('fang').then(() => host.qa({ ...qaDriver, cover: coverArt() }));

  let raf = 0;
  // A slow phone: the frame's work is measured and the effects step down (fewer particles, no floor reflection, a
  // lighter shine) — the cars, the dirt and the work stay as they are
  const quality = new AutoQuality({ budget: 11, onChange: (_, i) => scene.setQuality(i) });
  let last = 0;
  const running = () => (state === 'play' || state === 'title' || state === 'first') && !host.paused;
  const frame = (ts: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    const t0 = performance.now();
    update(dt);
    draw();
    quality.frame(performance.now() - t0);
    if (state === 'results' && autoNext && !host.paused && !host.adPending) autoLeft -= dt;
    if (state === 'results' && autoNext && autoLeft <= 0 && !host.paused && !host.adPending) {
      autoNext = 0;
      void nextCar(false);
    }
    if ((running() || (state === 'results' && autoNext && !host.paused)) && !raf) raf = requestAnimationFrame(frame);
  };
  function wake(): void {
    if (!running() && !(state === 'results' && autoNext && !host.paused)) draw();
    else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  resize();
  roomNow();
  scene.setRobots(save.robots);
  refreshNetwork();
  /** Every picture decoded (the dev gallery only: asking for a later chapter at boot would hold the first screen back) */
  const allPictures = () => Promise.all(pictures.chapters.map((ch) => pictures.ready(ch))).catch(() => undefined);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('cover')) {
    startCar(makeCar(), false);
    draw();
    // Only once the cover hook is there (it waits for its car's chapter): a frame flagged earlier made gp covers shoot
    // the plain frame
    void carReady('fang').then(() => {
      draw();
      document.body.dataset.cover = 'ready';
    });
  } else if (import.meta.env.DEV && new URLSearchParams(location.search).has('gallery')) {
    // Dev only: every vehicle side by side, to compare with the real model it's drawn after
    void allPictures().then(() => {
    const wrap = el('div', '');
    wrap.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#d8dde4;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;z-index:99;font:12px system-ui';
    // ?gallery=colors: every painted car in each of its colours (the respray's recolouring)
    const colours = new URLSearchParams(location.search).get('gallery') === 'colors';
    for (const m of colours ? MODELS.filter((q) => q.painted).flatMap((q) => q.colors.slice(0, 5).map((col) => ({ ...q, colors: [col, ...q.colors] }))) : new URLSearchParams(location.search).get('gallery') === 'space' ? MODELS.filter((q) => q.cls === 'space') : new URLSearchParams(location.search).get('gallery') === 'game' ? MODELS.filter((q) => !q.retired) : MODELS) {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 150;
      const img = new Image();
      img.src = renderThumb(m.id, c.getContext('2d')!, 300, 150, m.colors[0]);
      const cell = el('div', '');
      cell.append(img, document.createTextNode(`${m.id} — ${m.kind}`));
      wrap.append(cell);
    }
    document.body.append(wrap);
    document.body.dataset.cover = 'ready';
    });
  } else if (seenBefore || !host.firstVisit) showTitle();
  else {
    // A new player lands in play: no title, no Play gate (CrazyGames: «land new users in gameplay immediately»); the
    // coach's hand shows the scrub on the car
    showFirst();
    play();
  }
}

// --- Album thumbnails (drawn once per model)

function renderThumb(id: string, g: CanvasRenderingContext2D, W: number, H: number, colour?: string): string {
  const m = MODEL.get(id)!;
  const bb = bounds(m.shape);
  const box = (bb.y1 + 0.06) / 1.12;
  const L = Math.min(W / 1.2, (H - 8) / Math.max(0.3, box * 1.15));
  const art = bakeCar(m, colour ?? m.colors[0], 'standard', L, 1);
  const x = (W - art.w) / 2;
  const y = H - art.h - 4;
  if (m.shape.legs) shipLegs(g, art, m.shape.legs, x, y);
  g.drawImage(art.body, x, y, art.w, art.h);
  m.shape.thrusters?.forEach((z, i) => shipNozzle(g, art, z, x, y, { broken: false, flame: 0, color: m.flame, t: 0, i }));
  m.shape.wheels.forEach((_, i) => {
    const [wx, wy] = wheelAt(art, i);
    const c = art.wheel(i);
    g.drawImage(c, x + wx - c.width / 2, y + wy - c.height / 2);
  });
  for (const p of Object.values(art.parts)) if (p) g.drawImage(p.canvas, x + p.x, y + p.y, p.w, p.h);
  return g.canvas.toDataURL();
}
const rimUrls = new Map<string, string>();
function rimUrl(id: string): string {
  let u = rimUrls.get(id);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.translate(48, 48);
    g.fillStyle = '#1b1d23';
    g.beginPath();
    g.arc(0, 0, 46, 0, Math.PI * 2);
    g.fill();
    drawRim(g, 32, id);
    u = c.toDataURL();
    rimUrls.set(id, u);
  }
  return u;
}
const silhouettes = new Map<string, string>();
function silhouetteThumb(id: string): string {
  let u = silhouettes.get(id);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = 280;
    c.height = 120;
    const g = c.getContext('2d')!;
    renderThumb(id, g, 280, 120);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0b0e18';
    g.fillRect(0, 0, 280, 120);
    u = c.toDataURL();
    if (carLoaded(id)) silhouettes.set(id, u);
  }
  return u;
}
