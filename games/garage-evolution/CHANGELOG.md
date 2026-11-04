# Changelog

## 1.5.1 (2026-10-20)

- The owner's pictures load in asset chapters (game_platform D84, the answer to 1.5.0's block request): before Play only the code and the first car (the Glide); the Shed's other cars and the first tier lead chapter 1, then a tier a chapter (tools/paint-cars/chapters.py writes painted/index.ts). In the one-file upload the later chapters are data blocks after the game's async script; `createAssets` decodes them in idle time after Play, the car on the stand first. A car whose pictures haven't arrived is drawn as its silhouette and repaints when they do, and so do the album's, the shop's and the cards' thumbnails; the cover waits for its car (the Fang). Before Play **2,507 → 281 KB gzipped**, ≈ **14.8 → 2.6 s** to a tappable Play on the slow phone (`gp build`); the budget override (2,600 KB) is gone — the first load is within CrazyGames' 400 KB.
- A returning player's first screen no longer freezes: 1.5.0's robots' pay (a crew short of a trade, a robot never lowering it) simulated cars for every subset of every garage's crew at boot — 11 s of one task on the slow phone for a save in the Prestige Salon (the reviewer: 11.6 s to the first screen). Now from the numbers (each layer's strokes over the robots' pace, the rest at a hand's pace; calibrated to the simulation, 0.4–1.4× of it from the Shed to Neptune): a returning player in the Prestige Salon sees the return card at 3.6 s on the slow phone (13.3 s), its car a silhouette until its chapter arrives.
- The goal in the HUD no longer opens the shop on a new player's first car (a tap pulses it): QA's random-touch bot spent half its minute in the shop.

## 1.5.0 (2026-10-20)

After the Basic Launch stop (desktop 8/15, mobile 6/15) and a game-design audit (AUDIT.md):
- The RESTORED card always goes on by itself (the ×2 offer and the shop lesson no longer stop the garage); longer when there is more to read; the ×2 offer every fifth car and on epic and rarer cars (it came on half the early cards).
- A reached goal is one tap: the goal in the HUD turns gold, «Open it now!», and opens the garage (or the prestige); the card has the same button. It sat at 100 % with nothing to press.
- The best upgrade in reach is a gold button in the play view (a tool level or a robot, its price): one tap, no shop. The shop button says «Shop» (it said «Garage»).
- Rush jobs: every fifth car from the fourth comes with a clock (its par time); restored in time it pays double — a horn as it rolls in, the clock on the car card, ticks in its last 5 s, the result on the card.
- The garage gate in the economy: no garage price while the last garage has cars to restore (the balance bot «bought» a garage that never opened after the prestige).
- The phone: the car fills the width in portrait (about 10 % bigger).
- The pause menu says what tomorrow brings (the next day's reward).
- The design round (design.md: a game designer agent who didn't make the game played 15 min as a new player on desktop and 16.7 min on a phone; the merged plan in AUDIT.md):
  - The card only for real events: a new model is no longer one (24 cards of 26 in a first session were «New model»). An ordinary car's pay pops over the garage and counts up (the base, then Perfect, then the rush ×2, a coin a little higher each beat); a new model's picture flies into the Album button with the count. The finale 2.6 s and the arrival 1.2 s: the next car is workable ≤ 3 s after RESTORED (6.6 s).
  - The garage fund: 25 % of every payout goes aside for the next garage (never spent on upgrades) and pays for it; the goal shows «Cars 3/5 · fund 62 %» and never goes backwards (80 % → 3 % on one upgrade).
  - Every robot earns from the first hire, in play and while away: a crew short of a trade is paid its share of the car (the rest waits at a hand's pace); a robot never lowers its garage's income. The HUD says «Robots +$X/min» from the first hire (a new player's robots earned $0 until the whole crew of a garage was hired).
  - 1–2 jobs a car from wheels, dents, parts and engine, by how it became a wreck (a crash: dents and a wheel; a barn find: the engine and parts); a wheel is nuts off → its own work (a flat: find, plug, pump; a bald tyre: pull the new one on; a bent rim: hammer, balance) → nuts on. The tyre bay ran on 21 cars of 22 and outlasted the scrub. One nut a tap stays (the owner, 2026-10-17).
  - A new player's 6th car is the rare car of the day (with the horn); its card shows tomorrow's: a silhouette, its rarity, «A new rare car in N hours».
  - Phone landscape (≤ 420 px tall): the bottom buttons in two columns down the right edge, the Upgrade button above them, the car fitted to the height (≈ 1.6×).
  - The first purchase is taught on the gold Upgrade button in play; the Shop's lesson from the 4th car. The bottom buttons arrive one at a time, each with a pop when it has something in it.
  - A purchase shows: a coin flies into the tool strip; a new tool tier is shown big with its name.
  - Coming back: one card (the days in a row, the robots' earnings with their ×2, today's rare car), one tap «Collect $X & play» lands in play with the rare car rolling in (it was three screens).
- Drawn arrows and stars instead of font symbols; achievement toasts wait for the next car (not over RESTORED or the card's heading); «Condition 100 %» only when nothing is left; P toggles the pause; the HUD's small text at 14 px on a desktop.

## 1.4.0 (2026-10-19)

- The owner: «Удали все машинки кроме тех которые я тебе отправил за все время», «Возьми из таблицы у платформы рекомендации и отработай их ещё». 119 new pictures (8 archives): 80 new cars after one picture per model (39 were the same model in another colour, or a model already in the game); every vehicle on the Earth is now one of the owner's pictures — 120 — and the 29 code-drawn cars and work vehicles are gone (a save that found one keeps its card, out of the count). The spacecraft stay drawn: the table's space garages take only spacecraft.
- Three new Earth garages, one per tier from 3 (the table's §2: «от маленькой автомастерской до премиального сервиса суперкаров и футуристических ремонтных центров»): the GT Atelier (Melbourne), the Prestige Salon (Shanghai), the Future Centre (Singapore) — each with a room style of its own; 23 garages in all. The Service Station now serves estates, MPVs and SUVs.
- The table's §8: spaceplanes and long ships with rear engines fly in through the door above the floor and settle, and fly out the same way; landers, capsules and rockets come down through the roof.
- The table's row 19, new text (2026-10-19), five points: (1) the mechanic robot does the wheels through to the end — beside the player too, waiting only while their finger is on the car; (2) a car never looks cut: a crashed car's bumper hangs loose off its mounts instead of leaving a grey block where it was, and the cut-outs on a black backdrop lose the dotted ring the pictures had (the Fjord's lettering painted out); (3) a garage opens only after enough cars are restored in the last one (5 / 8 / 10 / 12 / 15, the shop shows the count); (4) a wheel taken off leaves a clean dark arch, not the faint old rim and its outline; (5) the garages are kept through a reload — the platform's loader fits a save to its defaults and dropped every garage but the Shed (a test loads a save through it now).
- The reviewer's round: 0 [blocking]; fixed: the Viola's paint (it read its carbon), the dark greens recolour only to shades of their own hue, a tyre's bottom shaded on a light floor (it read as a whitewall), no «Need $0 more» while the next garage waits for cars.
- One utilitarian quality for every picture (the owner, 2026-10-17): bodies 560 px, wheels 160 px, WebP 60; a car's two wheels share one sprite (the table: «колёса … одинаковые»). The import tool reads a black backdrop (the tyres' bottom is the ground, not the soft shadow under the car), measures new pictures itself (tools/paint-cars/measure.py, an overlay per picture to check) and takes wheels read off by hand where the axle search drifts (`exact`).

## 1.3.6 (2026-10-17)

- The owner: «Качество всех машин должно быть одинаковым и утилитарным», «Бери в пример лучшие варианты». The Heavy Plant's pictures had wear painted in (rust streaks, drips, chips): a restored Rhino, Field King, Longhorn and Snowcat still looked rusty next to the clean passenger cars. The import tool lifts it off (`restore`, cleanup.json): rust and brown grime and the paint's own chips inside a panel take the clean paint around them, the shading kept; outlines, glass, metal and other paints untouched. The game's own dirt and rust layers lie on top as before. The camper's light grey grime stays (lifting it marred the vents).
- The reviewer's check: the Longhorn and the Snowcat clean, the Field King's hood blotchy and its seams rusty, specks on the Rhino — both took a second pass (`restorePasses`), the Field King a wider tolerance; outlines, rivets, glass, exhausts, wheels and treads untouched.

## 1.3.5 (2026-10-17)

- The owner's 8 pictures («Обнови их. Улучши качество до как сейчас у новых машин»): three passenger cars return (Redline Hatch — a 2020s German family hatch, Executive Missile — a 90s German executive saloon, Salaryman Turbo — a 2010s Japanese executive saloon) in the Shed and the Corner Garage; the Wanderer Camper painted, moved to the Muscle Shop (the Service Station stays drawn); the Heavy Plant painted: Longhorn Semi (3 axles), Rhino 8×8 (4 axles), Polar Snowcat (tracks, no wheels to change), Field King (a big rear wheel, a small front one). The plant's drawn crawler, crane and haul truck wait for their pictures (retired: the garage shows one look). The import tool takes a tracked machine (`"wheels": []`) and a hand-named paint colour (`"colour"`). 35 painted cars and 7 painted work machines; the album still counts 68.
- The reviewer's round on it: no hairline box round the bumpers of every painted car (the part's edge fades over the body's own paint); the tractor's and the 8×8's tyres keep their lugs; the Rhino recolours only to shades of its olive.

## 1.3.4 (2026-10-17)

- The owner's round: the flat tyre keeps the wheel's picture (sunk onto a flat patch, the sidewall bulging, a nail); wheels lit by the room's lamp with floor shadows; robots beside the player at 60 %, out of the tyre bay, clear of the finger and faded while the player works; new robot art (robot-art.ts); every tool tier drawn as its real tool (tool-art.ts); "Daily car" instead of "Gate"; the polish film light (a 62 % grey sheet looked like an unpainted car); a respray car shows its old faded paint, not primer; a new player's first car: only Pause in the bar, a tap beside the pause panel resumes.

## 1.3.3 (2026-10-17)

- The owner: «От этих обрезков избавься», «колеса все еще не центрированы», «из-за теней кажется что колеса не симметричны», «Спущенные шины сделай чуть интереснее и красивее». The wheel's canvas had room for 2r while the painted wheel is drawn 3 % past its tyre: its edge was cut square (the bay's close-up, a big screen) — now sized to it. A bent rim stays on its axle with a kink pressed into its lip (it had been drawn off-centre). The import tool evens each tyre: every radius of the rubber takes its median colour round the circle (the picture's light and the arch's shadow turned with the wheel). A flat tyre squashes into a bulge with folds, the rim sinks toward the floor, a nail in the tread, air hissing out.

## 1.3.2 (2026-10-17)

- The owner: «Колеса не центрированы», «Пиксельное месиво», «просто улучши разрешение всех текстур». Each painted wheel is centred on its axle (the import tool finds the axle on the picture: the circles of the tyre, the rim's lip and the hub read the same all round it), its radius the axle's height; the wheels are stored at 224 px of their own and the tyre bay draws its close-up at its size (it had magnified the car's small wheel); bodies at 720 px, quality 70, a light sharpen. Upload 1.3 MB gzipped (budget 1400 by the owner's decision).

## 1.3.1 (2026-10-17)

- Every passenger car is one of the owner's painted pictures: 32, seven new (Daily Glide, Dune Turbo, Fang V10, Wedge Twelve, Rosso V8, Anniversary Turbo, Centre Seat); the 23 drawn passenger cars are retired (a save that found one keeps it; they leave the album's count). Work vehicles and spacecraft stay drawn, in garages of their own.
- Cheaper early garages (Corner 200, Tuning 900, Rally 3K, Station 8K, Muscle 40K): garages at 6 / 13 / 24 / 28 / 45 min.
- The tyre bay: one nut a tap whatever the wrench (a better wrench had done three).
- Painted wheels: the arch's paint is cut from every tyre sprite in the import tool.

## 1.3.0 (2026-10-16)

- The garage network: 10 Earth garages in cities, each with its own vehicles, tools and robots; go back to any of them; their robots earn while you're elsewhere (computed, no scene), offline over the whole network; the total in the HUD.
- The map: the Earth (drag, pinch, zoom, tap a garage) and the Solar System with a smooth zoom between.
- Space: 9 garages (the Moon, Earth orbit, Mars, Venus, Mercury, Jupiter, Saturn, Uranus, Neptune), each dearer and paying more, its own world in the window; only spacecraft there.
- 17 new spacecraft; ships have no wheels: their engine nozzles are repaired instead (sparks and smoke before, a test burst and a glow after); they land through a roof hatch on their engines and take off through it.
- 25 cars redrawn as detailed painted pictures; each garage is one look (painted or drawn); the album has a page per garage.
- Achievements of four rarities, hidden ones too; music and sound sliders.
- Fixes: the pump no longer sticks above the green, the paint job comes last, robots do only their own trade.
- Old saves load into the network (each garage level's first garage, tools and robots where the player was).

## 1.2.0 (2026-10-14)

- A new player starts restoring at once: no start button, a hand shows the scrub.
- Phones: the whole car fits an upright screen, the view stays still; a finger's brush is wider; effects step down on slow phones.
- Come back daily: a reward for the days in a row (tomorrow's is bigger), the day's order (3 cars of one kind for a bonus), the pause screen shows what your robots earn while you're away.

## 1.1.0 (2026-10-14)

- Every car comes with a damage story (daily driver, barn find, flood car, after a crash, fire damage, sun-baked) that decides its jobs.
- New job: pull dents out with a suction cup.
- Respray from the Service Station on: pick the new colour, the rare one pays +15 %.
- The surface is cleaned one stage at a time: all the mud, then the rust, then the primer, then the scratches; a stalled stage points at the specks left.
- A tutorial hand shows every new action the first time it comes up, and the first purchase.
- A handier shop: tabs with what you can afford, ×1 / ×10 / MAX, income a minute on every card, the best buy marked.
- Fairer money: rare cars pay up to ×3, the daily rare car is from your garage level.
- Every screen fits without scrolling (the shop, the album and the stats have pages).
- Fixes: hints follow a language change, the colour picker, the tyre-bay hints on phones.

## 1.0.0 (2026-10-10)

- First release: restore cars layer by layer, the tyre bay, 50 legendary cars, robots, six garages, the album, the space hangar.
