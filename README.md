# Idle Garage Evolution

An idle car-restoration clicker: wrecked cars roll into your garage and you bring them back layer by layer — mud,
rust, primer, scratches, parts, the engine — while robots join you and the garage grows from a shed toward a space hangar.

A game for CrazyGames (13+) on [game_platform](https://github.com/QmaCyber/game_platform) (`kit: code`), created with `gp init`.

```sh
scripts/setup.sh                 # the platform next to this repository (or GP_PLATFORM=…), remembered; node_modules linked
scripts/gp.sh validate           # the rules: concept, listing, channel
scripts/gp.sh dev                # play it in the browser (test ads; ?seed=1; ?ads=fail plays Basic Launch)
scripts/gp.sh qa                 # the platform's QA (≈ 5 min; --quick while iterating); it also checks the twist
scripts/gp.sh uniqueness         # how unique the game is (0–100) and what to change — after every big change
scripts/gp.sh balance            # the progression curve from bot.ts balance() against the portal's targets
scripts/gp.sh review             # after the full QA: the quality brief for a second agent (games/garage-evolution/qa/review-brief.md);
                                 # it writes games/garage-evolution/quality.md — fix every [blocking] finding (review --check)
scripts/gp.sh submission         # everything the portal form asks for, checked: games/garage-evolution/submission/
                                 # (it runs build --target crazygames, covers and video itself)
scripts/gp.sh explain money     # platform commands without a game: explain, catalog, doctor, forecast --idea
                                 # several games in games/? name one: scripts/gp.sh qa <id> --quick
./node_modules/.bin/vitest run games/     # the game's own tests and balance bot
./node_modules/.bin/tsc -p tsconfig.json  # types
```

| File | What it is |
|---|---|
| `games/garage-evolution/game.yaml` | the game for the platform: channel, audience, concept, money, listing |
| `games/garage-evolution/main.ts` | screens, HUD, input (taps and swipes), the loop and the host (start here) |
| `games/garage-evolution/sim.ts` | the rules as pure logic: a car's layers on a grid, strokes, parts, the engine, robots |
| `games/garage-evolution/economy.ts` | money, tools, robots, garage levels, the album, statistics, the prestige, offline earnings, the daily car |
| `games/garage-evolution/data.ts` | every balance number |
| `games/garage-evolution/models.ts` | vehicle models, including 132 painted side-view cars, plus spaceships |
| `games/garage-evolution/car-art.ts`, `layers.ts` | a car drawn in lit paint; the dirt, rust, primer and scratches over it, erased where you work |
| `games/garage-evolution/scene.ts`, `garage-art.ts` | the garage rooms, robots, effects, the finale |
| `games/garage-evolution/icons.ts`, `ui.ts` | drawn icons and the DOM look |
| `games/garage-evolution/sound.ts` | tool sounds and the music per garage |
| `games/garage-evolution/cover.ts`, `video.mjs` | the cover's key art and the preview video's script |
| `games/garage-evolution/bot.ts`, `sim.test.ts` | the balance bot, the balance model and the game's tests |
| `docs/concept.md` | the portal search, the concept, the 1.0 spec and the money design |

## Правки 04.11.2026

В `games/garage-evolution/FIXES-2026-11-04.md` описаны 12 новых машин, 3 обновлённых исходных рисунка, исправление отделения колёс и ограничения проверки. Откройте `games/garage-evolution/preview.html` для автономного предпросмотра 15 машин. Архив содержит **исходный проект**, а не пересобранный executable билд.
