# CLAUDE.md

Garage Evolution: a game on game_platform (`kit: code`), in its own repository. The platform lives next to this repository
(`../game_platform`, set up by `scripts/setup.sh`) and brings the rules, the portal SDK, ads, saves, QA and packaging.

- Follow the platform's `AGENTS.md` (the loop: concept → validate → QA → quality review → submission → report) and `docs/guides/code-games.md`.
- Don't copy tools from other game repositories: `gp build --target crazygames`, `gp covers`, `gp video` and `gp submission`
  do it, newer and checked. Don't change the platform to make this game work: missing things are block requests in REPORT.md.
- Before a commit: `./node_modules/.bin/tsc -p tsconfig.json` and `./node_modules/.bin/vitest run games/`; after gameplay
  changes also `scripts/gp.sh qa`.
- The progression is this game's own: pick the shape for the genre (the platform's `docs/guides/upgrades.md`), name it
  in `concept.progression`, keep `balance()` in bot.ts true to it and `scripts/gp.sh balance` green.
- The look: draw with the platform's `@gp/art` (art.ts shows the approach: one palette, one light, volume, idle motion,
  feedback on every action, a background with depth) — the platform's `docs/guides/art.md`. `gp qa` reports a flat play frame.
- Ten languages: every text a player reads through `host.t('key')` from `games/garage-evolution/strings/en.yaml` (never a string
  in the code); after adding texts `scripts/gp.sh translate --write`, translate the empty ones yourself (keep `{params}`,
  the plural forms, the glossary's names; within ~30% of English), then `scripts/gp.sh translate --check` — the
  platform's `docs/guides/i18n.md`. The title's language picker stays.
- After every big change: `scripts/gp.sh uniqueness`. A low score means change the game (the core action, goal or rule),
  not the text; keep `concept.twist` true to the game and fire `host.twist()` where it happens.
- A story only if the game needs one: `scripts/gp.sh story` prints the depth this kind of game takes (none is often
  fine), forms a starting `story.ts` with `--write`, and lists what to correct; `scripts/gp.sh validate` then checks it.
- At the end: `scripts/gp.sh review` after the full QA, and give `games/garage-evolution/qa/review-brief.md` to a second agent (one
  who didn't make the game): it writes `games/garage-evolution/quality.md`; fix every `[blocking]` finding and have it check again.
  Then `scripts/gp.sh submission` and send the owner the files in `games/garage-evolution/submission/` with REPORT.md.

## Work on your own (the owner, 2026-10-03)

- **Don't ask — do.** Don't wait for the owner's "yes", during the task or for the ping to the platform session: decide
  and carry on. Ask only what the task can't be done without, and ping the platform with the question.
- **Stay inside this repository.** `node_modules` here is a link into the platform checkout: never `rm`, `cp` or `mv`
  through it (that reaches outside the repository and stops the session for a permission prompt). `scripts/setup.sh`
  relinks it. To bring an old repository's scripts up to date, copy `scripts/setup.sh` and `scripts/gp.sh` from the
  platform's `templates/game-repo/scripts/` and run `scripts/setup.sh`.
