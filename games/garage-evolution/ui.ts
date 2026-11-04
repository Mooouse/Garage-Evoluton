// The DOM layer's look: one style for the HUD, the cards and every screen (dark glass panels, amber and cyan accents,
// drawn icons). Small builders the screens share.

import { EMOJI_FONT, FONT_FALLBACK } from '@gp/core';
import { iconUrl } from './icons.ts';

export function installStyle(minTouch: number): void {
  const style = document.createElement('style');
  style.textContent = `
  #ui { position: fixed; inset: 0; pointer-events: none; font: 600 15px ${FONT_FALLBACK}, ${EMOJI_FONT}; color: #eef3fb;
        --glass: rgba(16,20,32,0.84); --edge: rgba(255,255,255,0.14); --amber: #ffb02e; --cyan: #5ff6ff; --ok: #5fd06a; }
  #ui * { box-sizing: border-box; }
  #ui button { pointer-events: auto; font: 800 16px ${FONT_FALLBACK}, ${EMOJI_FONT}; min-height: ${minTouch}px; min-width: ${minTouch}px;
        border: 0; border-radius: 14px; cursor: pointer; padding: 0 16px; color: #1b1406;
        background: linear-gradient(#ffd27a, #ffa31a); box-shadow: 0 3px 0 #a8620a, 0 6px 14px rgba(0,0,0,0.35); }
  #ui button:active { transform: translateY(2px); box-shadow: 0 1px 0 #a8620a; }
  #ui button.alt { color: #eef3fb; background: linear-gradient(#3a4566, #232a40); box-shadow: 0 3px 0 #141826, 0 6px 14px rgba(0,0,0,0.35); }
  #ui button.ghost { color: #eef3fb; background: rgba(255,255,255,0.08); box-shadow: none; border: 1px solid var(--edge); }
  #ui button[aria-disabled=true] { filter: grayscale(0.85) brightness(0.7); }
  #ui .glass { background: var(--glass); border: 1px solid var(--edge); border-radius: 16px; backdrop-filter: blur(6px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08); }
  #ui img.ic { width: 28px; height: 28px; flex: none; }
  #ui .bar { height: 8px; border-radius: 99px; background: rgba(255,255,255,0.12); overflow: hidden; }
  #ui .bar > i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #ffb02e, #ffe08a); }
  #ui .bar.cyan > i { background: linear-gradient(90deg, #2fb6ff, #5ff6ff); }
  #ui .bar.ok > i { background: linear-gradient(90deg, #3fae4a, #8af08f); }
  /* HUD */
  #ui .hud-top { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-wrap: wrap; gap: 8px; padding: max(8px, env(safe-area-inset-top)) 10px 0; align-items: stretch; }
  #ui .pill { display: flex; align-items: center; gap: 8px; padding: 6px 12px; min-height: 48px; }
  #ui .pill b { font-size: 19px; font-variant-numeric: tabular-nums; }
  #ui .pill small { display: block; font-size: 13px; color: #aeb9cc; font-weight: 700; }
  #ui .money { order: 1; }
  #ui .goal { order: 2; flex: 1 1 160px; min-width: 150px; }
  #ui .goal .t { flex: 1; min-width: 0; }
  #ui .goal b { font-size: 15px; }
  #ui .goal { cursor: pointer; pointer-events: auto; }
  #ui .goal.ready { background: linear-gradient(180deg, rgba(255,196,64,0.95), rgba(232,150,20,0.95)); color: #1b1408; animation: goalpulse 1.1s ease-in-out infinite; }
  #ui .goal.ready small { color: #3a2a08; }
  #ui .goal.ready .bar { display: none; }
  @keyframes goalpulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,196,64,0.7); filter: brightness(1); } 50% { box-shadow: 0 0 0 9px rgba(255,196,64,0); filter: brightness(1.12); } }
  #ui .quick { position: absolute; right: 10px; display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 4px 12px 4px 6px; border-radius: 14px; border: 0; cursor: pointer; font: inherit; color: #1b1408; background: linear-gradient(180deg, #ffd25a, #f2a91f); box-shadow: 0 4px 0 #a86a08, 0 8px 18px rgba(0,0,0,0.35); z-index: 3; }
  #ui .quick .t { display: flex; flex-direction: column; text-align: left; line-height: 1.1; }
  #ui .quick small { font-size: 12px; font-weight: 800; opacity: 0.8; }
  #ui .quick b { font-size: 14px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .quick .price { display: flex; align-items: center; gap: 3px; font-weight: 900; font-size: 15px; padding-left: 4px; }
  #ui .quick .price img { width: 18px; height: 18px; }
  #ui .carcard .rush { position: relative; display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; padding: 2px 12px 2px 6px; min-width: 150px; border-radius: 999px; overflow: hidden; font-weight: 900; font-size: 14px; color: #fff; background: rgba(255,255,255,0.12); }
  #ui .carcard .rush .rf { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #f2a91f, #ffc440); transition: width 0.12s linear; z-index: 0; }
  #ui .carcard .rush .rl, #ui .carcard .rush .rc { position: relative; z-index: 1; }
  #ui .carcard .rush .rl { color: #1b1408; text-shadow: 0 1px 0 rgba(255,255,255,0.35); }
  #ui .carcard .rush.hurry .rf { background: linear-gradient(90deg, #d8321c, #ff5a3c); }
  #ui .carcard .rush.hurry .rl { color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,0.4); }
  #ui .carcard .rush.hurry { animation: goalpulse 0.5s ease-in-out infinite; }
  #ui .carcard .rush.late .rl { color: #c9d2e0; text-shadow: none; }
  #ui .badge.stamp, .fxlayer .badge.stamp { font-size: 16px; padding: 4px 14px; transform: rotate(-4deg); border: 2px solid #ffd25a; box-shadow: 0 0 0 3px rgba(255,210,90,0.25); }
  @media (max-width: 600px) { #ui .quick b { max-width: 110px; } }
  .fxlayer .paypop { position: absolute; left: 50%; top: 21%; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; padding: 8px 16px; border-radius: 16px; background: rgba(16,20,32,0.86); box-shadow: 0 6px 18px rgba(0,0,0,0.35); pointer-events: none; z-index: 4; }
  .fxlayer .flyer, .fxlayer .flyimg { position: absolute; z-index: 6; pointer-events: none; transform: translate(-50%, -50%); }
  .fxlayer .flyimg { width: 120px; height: auto; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); }
  .fxlayer .albumtoast { position: absolute; left: 50%; top: calc(21% + 62px); transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 6px 14px 6px 8px; border-radius: 16px; border: 2px solid #7fd6ff; background: rgba(16,20,32,0.9); box-shadow: 0 6px 18px rgba(0,0,0,0.35); pointer-events: none; z-index: 4; }
  .fxlayer .albumtoast.toolnew { top: 22%; border-color: #ffd25a; }
  .fxlayer .albumtoast.toolnew small { color: #ffd25a; }
  .fxlayer .albumtoast.toolnew img { width: 72px; }
  .fxlayer .albumtoast img { width: 104px; height: auto; }
  .fxlayer .albumtoast small { display: block; font-size: 13px; font-weight: 700; color: #7fd6ff; }
  .fxlayer .albumtoast b { font-size: 18px; color: #fff; white-space: nowrap; }
  .fxlayer .paypop b { font-size: 26px; color: #ffd25a; font-variant-numeric: tabular-nums; }
  /* A desktop is where the portal judges: the HUD's small text at 14 px there (QA E_QA_PLAY_TEXT) */
  #ui .carcard { order: 3; flex: 2 1 260px; padding: 6px 12px; display: flex; flex-direction: column; justify-content: center; gap: 3px; min-height: 48px; }
  #ui .carcard .n { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 16px; font-weight: 900; }
  #ui .carcard .s { font-size: 12px; color: #aeb9cc; }
  #ui .chip { font-size: 12px; font-weight: 900; padding: 1px 8px; border-radius: 99px; color: #10131c; }
  #ui .carcard .cond { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #d8e0ee; }
  #ui .carcard .cond .bar { flex: 1; min-width: 60px; }
  #ui .strip { position: absolute; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; padding: 6px 10px; }
  #ui .strip .st { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: rgba(255,255,255,0.06); position: relative; }
  #ui .strip .st img { width: 26px; height: 26px; }
  #ui .strip .st.done { background: rgba(95,208,106,0.25); }
  #ui .strip .st.done::after { content: ''; position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%; background: var(--ok); border: 2px solid #10131c; }
  #ui .strip .st.now { background: rgba(255,176,46,0.3); outline: 2px solid var(--amber); }
  #ui .hint { position: absolute; left: 50%; transform: translateX(-50%); padding: 10px 16px; font-size: 18px; font-weight: 900; color: #fff;
        background: rgba(20,24,38,0.9); border: 2px solid var(--amber); border-radius: 14px; white-space: normal; width: max-content; max-width: min(92vw, 560px); box-sizing: border-box; text-align: center; line-height: 1.2; }
  @media (max-width: 420px), (max-height: 420px) { #ui .hint { font-size: 15px; padding: 7px 12px; } }
  #ui .hint.wrap { white-space: normal; }
  #ui .bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 8px; padding: 0 8px max(8px, env(safe-area-inset-bottom)); }
  #ui .bottom button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 64px; padding: 4px 10px; font-size: 12px; position: relative; }
  #ui .bottom button img { width: 30px; height: 30px; }
  @media (max-width: 440px) {
    #ui .bottom { gap: 4px; padding-left: 4px; padding-right: 4px; }
    #ui .bottom button { flex: 1 1 0; min-width: 0; max-width: 64px; padding: 4px 2px; font-size: 11px; }
    /* Labels may take two lines (Daily car, Машина дня) rather than be cut */
    #ui .bottom button span { white-space: normal; text-align: center; line-height: 1.05; max-width: 100%; }
  }
  #ui .dot { position: absolute; top: 4px; right: 6px; width: 12px; height: 12px; border-radius: 50%; background: #ff4f6a; border: 2px solid #fff; }
  /* Screens */
  #ui .screen { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 10px; pointer-events: auto; }
  #ui .screen.dim { background: rgba(6,8,14,0.55); }
  #ui .panel { display: flex; flex-direction: column; gap: 10px; padding: 16px; max-width: min(96vw, 860px); max-height: calc(100vh - 20px); width: 100%; }
  #ui .panel.narrow { max-width: min(94vw, 460px); }
  #ui .panel h2 { margin: 0; font-size: 24px; font-weight: 900; display: flex; align-items: center; gap: 10px; }
  #ui .panel h2 img { width: 36px; height: 36px; }
  #ui .swatches { position: absolute; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 16px; background: rgba(20,24,38,0.85); border: 2px solid var(--edge); }
  #ui .swatches small { font-weight: 900; color: #fff; font-size: 14px; margin-right: 4px; white-space: nowrap; }
  @media (max-width: 420px) { #ui .swatches small { display: none; } }
  #ui .swatches .sw { min-width: 52px; width: 52px; height: 52px; border-radius: 50%; border: 3px solid #fff; padding: 0; position: relative; box-shadow: 0 3px 0 rgba(0,0,0,0.35); }
  #ui .swatches .sw .star { position: absolute; right: -6px; top: -8px; font-size: 18px; color: #ffd166; text-shadow: 0 1px 2px #000; }
  #ui .nudge { position: relative; animation: gpNudge 1.1s ease-in-out infinite; }
  #ui .quick.nudge { position: absolute; }
  #ui .nudge .nhand { position: absolute; right: -14px; bottom: -22px; width: 40px; height: 40px; pointer-events: none; animation: gpTap 1.1s ease-in-out infinite; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
  @keyframes gpNudge { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,209,102,0.0); } 50% { box-shadow: 0 0 0 6px rgba(255,209,102,0.55); } }
  @keyframes gpTap { 0%, 100% { transform: translate(4px, 6px); } 50% { transform: translate(0, 0) scale(0.92); } }
  #ui .teach { font-weight: 900; color: #ffd166; text-align: center; margin-bottom: 6px; }
  #ui .shopbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  #ui .tabs { display: flex; gap: 6px; flex: 1 1 auto; min-width: 0; }
  #ui .tabs .tab { position: relative; flex: 1 1 0; min-width: 0; display: flex; gap: 6px; align-items: center; justify-content: center; padding: 0 10px; border-radius: 14px; opacity: 0.75; }
  #ui .tabs .tab.on { opacity: 1; background: linear-gradient(#ffcf5c, #ffa21f); color: #2b1a00; box-shadow: 0 3px 0 #b86a00; }
  #ui .tabs .tab .tl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ui .badge-n { position: absolute; top: 3px; right: 4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--ok); color: #06210d; font-size: 12px; font-weight: 900; line-height: 20px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.4); }
  #ui .star-best { position: absolute; top: 1px; left: 5px; line-height: 16px; color: #7dff8a; font-size: 16px; text-shadow: 0 1px 2px #000; }
  #ui .seg { display: flex; gap: 0; border-radius: 14px; overflow: hidden; border: 2px solid var(--edge); }
  #ui .seg button { border-radius: 0; min-width: 56px; padding: 0 10px; opacity: 0.7; box-shadow: none; }
  #ui .seg button.on { opacity: 1; background: linear-gradient(#5fd0ff, #2a8fd8); color: #04223a; }
  #ui .card button .xn { font-size: 12px; font-weight: 900; opacity: 0.85; margin-right: 2px; }
  #ui .card .t small.need { color: #ff9c8a; }
  #ui .card .t small.gain { color: #7dff8a; }
  #ui .card.tomorrow img.car { width: 96px; height: auto; flex: none; }
  #ui .card.tomorrow .chip { margin-left: 4px; }
  #ui .card.best { border-color: #7dff8a; box-shadow: 0 0 0 2px rgba(125,255,138,0.35) inset; position: relative; }
  #ui .card .tag { align-self: flex-start; padding: 1px 8px; border-radius: 8px; background: #7dff8a; color: #06210d; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
  #ui .card .t b .lv { margin-left: 6px; padding: 0 6px; border-radius: 6px; background: rgba(255,255,255,0.12); font-size: 12px; font-weight: 800; white-space: nowrap; }
  #ui .panel.shop { max-width: min(96vw, 1040px); }
  #ui .panel.shop .cards { grid-template-columns: repeat(auto-fill, minmax(min(310px, 100%), 1fr)); }
  #ui .panel.shop .card .t b { font-size: 14px; }
  #ui .panel.shop .card button { min-width: 80px; }
  @media (max-width: 520px) { #ui .tabs .tab { flex-direction: column; gap: 0; padding: 2px 4px; } #ui .tabs .tab .tl { font-size: 12px; max-width: 100%; } #ui .shopbar .seg { flex: 1 1 100%; } #ui .shopbar .seg button { flex: 1; } }
  #ui .streak { justify-content: center; gap: 6px; }
  #ui .streak span { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; background: rgba(255,255,255,0.08); border: 2px solid var(--edge); color: #aeb9cc; }
  #ui .streak span.on { background: linear-gradient(#ffcf5c, #ffa21f); color: #2b1a00; border-color: #ffd166; }
  #ui small.order, #ui .orderline.order { color: #9fd8ff; }
  #ui .orderline { font-weight: 800; font-size: 14px; }
  #ui .orderline.gain { color: #7dff8a; }
  #ui .fit { overflow: hidden; flex: 1 1 auto; min-height: 0; padding: 2px; }
  #ui .pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  #ui .pager .pbtn { min-width: 56px; padding: 0 12px; }
  #ui .pager .plabel { flex: 1; text-align: center; font-weight: 900; color: var(--amber); font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; }
  #ui .row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; align-items: center; }
  #ui .row.end { justify-content: space-between; }
  #ui .sec { font-size: 13px; font-weight: 900; color: var(--amber); letter-spacing: 0.06em; text-transform: uppercase; margin: 8px 2px 6px; }
  #ui .cards { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); }
  #ui .cards > * { min-width: 0; }
  #ui .card { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 14px; background: rgba(255,255,255,0.06); border: 1px solid var(--edge); }
  #ui .card .ic { width: 52px; height: 52px; }
  #ui .card .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  #ui .card .t b { font-size: 15px; overflow-wrap: normal; word-break: normal; hyphens: manual; }
  #ui .card .t small { overflow-wrap: break-word; }
  #ui .card .t small { font-size: 12px; color: #aeb9cc; font-weight: 700; }
  #ui .card button { flex: 0 1 auto; max-width: 46%; white-space: normal; line-height: 1.1; min-width: 92px; padding: 0 10px; font-size: 15px; display: flex; gap: 4px; align-items: center; justify-content: center; }
  #ui .card button img { width: 18px; height: 18px; }
  #ui .card.locked { opacity: 0.7; }
  #ui .big { font-size: 34px; font-weight: 900; color: #ffe08a; text-shadow: 0 2px 0 #6a3a00; font-variant-numeric: tabular-nums; }
  #ui .badge, .fxlayer .badge { font-size: 13px; font-weight: 900; padding: 4px 10px; border-radius: 99px; background: rgba(95,208,106,0.2); color: #b8ffbe; }
  #ui .badge.gold, .fxlayer .badge.gold { background: rgba(255,176,46,0.22); color: #ffe08a; }
  #ui .muted { color: #aeb9cc; font-size: 13px; }
  #ui .center { text-align: center; }
  #ui .logo { font-size: clamp(30px, 7vw, 56px); font-weight: 900; line-height: 1; text-align: center; color: #fff3cf;
        text-shadow: 0 3px 0 #b5650a, 0 6px 0 #5a2f05, 0 10px 24px rgba(0,0,0,0.5); letter-spacing: 0.01em; }
  #ui .logo small { display: block; font-size: 0.42em; color: var(--cyan); text-shadow: 0 2px 0 #0b3a4a; letter-spacing: 0.25em; margin-top: 6px; }
  #ui .album { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  #ui .acard { position: relative; border-radius: 14px; padding: 6px; background: linear-gradient(#2a3250, #161b2c); border: 2px solid var(--edge); display: flex; flex-direction: column; gap: 3px; min-height: 120px; }
  #ui .acard canvas, #ui .acard img.car { width: 100%; height: 64px; object-fit: contain; }
  #ui .acard b { font-size: 13px; }
  #ui .acard small { font-size: 12px; color: #aeb9cc; font-weight: 700; }
  #ui .acard .dots { display: flex; gap: 3px; }
  #ui .acard .dots i { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.15); }
  #ui .acard.unknown { filter: saturate(0.2); }
  #ui .rims { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); margin-bottom: 8px; }
  #ui .rim { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border-radius: 12px; background: rgba(255,255,255,0.06); }
  #ui .rim img { width: 48px; height: 48px; }
  #ui .rim small { font-size: 12px; color: #d8e0ee; text-align: center; }
  #ui .rim.off img { filter: brightness(0) opacity(0.5); }
  #ui .tiles { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  #ui .tile { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 14px; background: rgba(255,255,255,0.06); border: 1px solid var(--edge); }
  #ui .tile img { width: 34px; height: 34px; }
  #ui .tile b { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
  #ui .tile small { font-size: 12px; color: #aeb9cc; font-weight: 700; }
  #ui .bars { display: flex; flex-direction: column; gap: 6px; }
  #ui .bars .r { display: grid; grid-template-columns: minmax(110px, 1fr) 2fr auto; gap: 8px; align-items: center; font-size: 13px; }
  #ui .ring { position: absolute; inset: -3px; border-radius: 16px; border: 3px solid rgba(255,255,255,0.6); clip-path: inset(0 100% 0 0); }
  #ui .first { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 10px; transform: translate(-50%, -50%); }
  #ui .first button { min-height: 64px; font-size: 22px; padding: 0 26px; border-radius: 99px; }
  #ui .corner { position: absolute; right: 10px; bottom: max(10px, env(safe-area-inset-bottom)); }
  #ui .corner.hudlang { bottom: auto; top: 120px; }
  #ui input[type=range] { pointer-events: auto; width: 100%; height: ${minTouch}px; accent-color: #ffb02e; }
  #ui .vols { flex-wrap: nowrap; align-items: flex-end; }
  #ui .panel.mappanel { max-width: min(96vw, 1100px); height: calc(100vh - 20px); }
  #ui .mapbox { position: relative; flex: 1 1 auto; min-height: 140px; border-radius: 14px; overflow: hidden; border: 2px solid rgba(255,255,255,0.12); }
  #ui .mapbox canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; pointer-events: auto; }
  #ui .mapzoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 6px; }
  #ui .mapzoom button { font-size: 22px; padding: 0; }
  #ui .mapinfo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  #ui .mapinfo .t { flex: 1 1 180px; min-width: 0; }
  #ui .maptabs { justify-content: flex-start; flex: 0 0 auto; }
  .fxlayer { position: fixed; inset: 0; pointer-events: none; z-index: 5; font: 600 15px ${FONT_FALLBACK}, ${EMOJI_FONT}; color: #eef3fb; }
  .achlayer { position: fixed; left: 50%; top: calc(max(12px, env(safe-area-inset-top)) + 84px); transform: translateX(-50%); z-index: 50; pointer-events: none; width: min(92vw, 360px); }
  .achtoast { display: flex; gap: 10px; align-items: center; padding: 8px 14px; border-radius: 14px; border: 3px solid #c9d2dc; background: rgba(16,20,32,0.94); color: #fff;
    font: 800 15px ${FONT_FALLBACK}; box-shadow: 0 8px 24px rgba(0,0,0,0.45); animation: achin 0.35s ease-out; transition: opacity 0.4s, transform 0.4s; }
  .achtoast small { display: block; font-size: 12px; font-weight: 700; color: #ffd27a; }
  @media (max-width: 700px) { .achlayer { top: calc(max(12px, env(safe-area-inset-top)) + 196px); } }
  .achtoast.out { opacity: 0; transform: translateY(-12px); }
  @keyframes achin { from { opacity: 0; transform: translateY(-16px) scale(0.96); } to { opacity: 1; transform: none; } }
  #ui .tile.ach.locked { opacity: 0.55; filter: grayscale(0.8); }
  #ui .tile.ach { border-left: 4px solid var(--rc, #c9d2dc); }
  #ui .acard.mystery .q { height: 56px; display: grid; place-items: center; font: 900 40px ${FONT_FALLBACK}; color: #ffd27a; text-shadow: 0 2px 0 #3a1606; }
  #ui .vol { display: flex; flex-direction: column; flex: 1 1 0; min-width: 0; font: 700 13px ${FONT_FALLBACK}; color: #dfe6f0; }
  #ui .vol .vh { display: flex; justify-content: space-between; gap: 6px; padding: 0 2px; }
  #ui .vol .pct { color: #ffd27a; font-variant-numeric: tabular-nums; }
  @media (min-width: 700px) { #ui .carcard { order: 2; } #ui .goal { order: 3; } }
  @media (max-height: 520px) {
    #ui .panel { padding: 10px; gap: 6px; }
    #ui .panel h2 { font-size: 20px; }
    #ui .pill { padding: 4px 10px; }
    #ui .big { font-size: 26px; }
    #ui .bottom button { min-width: 56px; padding: 2px 8px; }
    #ui .bottom button span { display: none; }
    #ui .carcard .s, #ui .carcard .story { display: none; }
  }
  @media (max-height: 480px) {
    #ui .logo { font-size: 30px; }
    #ui .logo small { display: none; }
    #ui .card { padding: 5px 8px; }
    #ui .card .ic { width: 40px; height: 40px; }
    #ui .card .t small + small + small { display: none; }
  }
  @media (max-height: 420px) {
    #ui .panel { gap: 5px; padding: 8px 12px; }
    #ui .sum, #ui .sumbar { display: none; }
    #ui .acard { min-height: 0; padding: 4px 6px; }
    #ui .acard img.car { height: 46px; }
    #ui .acard small { display: none; }
    #ui .panel > button:last-child { align-self: center; width: auto; padding: 0 36px; }
    /* The map on a short screen: the tabs move up into the title row (the robots' total is in the HUD), the map
       keeps the room */
    #ui .panel.mappanel { position: relative; }
    #ui .mappanel > .row.end .pill { display: none; }
    #ui .mappanel .maptabs { position: absolute; top: 8px; right: 12px; }
    #ui .mappanel .maptabs button { min-height: 48px; padding: 0 14px; }
    #ui .mappanel > .row.end { min-height: 48px; }
    #ui .mapbox { min-height: 80px; }
  }
  /* A phone on its side: the bottom bar goes down the right edge in two columns, the car gets the height (it was a
     100 px strip a thumb covers: the designer, 1.5.0) — main.ts layout() reads the same query */
  @media (max-height: 420px) and (orientation: landscape) {
    #ui .bottom { left: auto; top: auto; right: 0; bottom: 0; display: grid; grid-template-columns: repeat(2, 54px); gap: 6px; padding: 0 max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) 0; justify-content: end; }
    #ui .bottom button { min-width: 54px; min-height: 48px; padding: 2px; }
    #ui .quick { right: max(8px, env(safe-area-inset-right)); width: 114px; justify-content: space-between; padding: 4px 8px 4px 4px; }
    #ui .quick .t { display: none; }
  }
  /* A desktop's HUD text at 14 px (QA E_QA_PLAY_TEXT): last, so the rules above don't win */
  @media (min-width: 900px) and (min-height: 560px) { #ui .carcard .s, #ui .carcard .n .chip, #ui .carcard .n .muted, #ui .carcard .cond, #ui .pill small, #ui .bottom button, #ui .bottom button span, #ui .quick small { font-size: 14px; } }
  @media (max-width: 420px) {
    #ui .bottom button { min-width: 56px; padding: 2px 6px; font-size: 12px; }
    #ui .carcard { flex-basis: 100%; }
    #ui .cards { grid-template-columns: minmax(0, 1fr); }
    #ui .album { grid-template-columns: repeat(2, 1fr); }
  }
  `;
  document.head.append(style);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function icon(id: string, size = 28, cls = 'ic'): HTMLImageElement {
  const i = el('img', cls);
  i.src = iconUrl(id, size);
  i.alt = '';
  i.width = size;
  i.height = size;
  return i;
}

export function bar(share: number, cls = ''): HTMLDivElement {
  const b = el('div', `bar ${cls}`);
  const i = el('i');
  i.style.width = `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;
  b.append(i);
  return b;
}
