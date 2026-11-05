// Achievements (the owner, 2026-10-16: «различные достижения разной редкости в том числе и скрытые»): each a test on the
// save, checked after a restored car, a purchase, a prestige and on coming back. Hidden ones show as "???" until earned.
// Pure: no DOM. Texts: ach.<id>.name / ach.<id>.desc.

import { CATS, SITES } from './data.ts';
import { album, topTier, type Save } from './economy.ts';


export type AchRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const ACH_COLOR: Record<AchRarity, string> = { common: '#c9d2dc', rare: '#4aa8ff', epic: '#b26bff', legendary: '#ffb02e' };

export interface Achievement {
  id: string;
  rarity: AchRarity;
  hidden?: boolean;
  /** Its icon (icons.ts) */
  icon: string;
  test: (s: Save, now: Date) => boolean;
}

const share = (s: Save) => album(s).share;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first', rarity: 'common', icon: 'trophy', test: (s) => s.stats.restored >= 1 },
  { id: 'ten', rarity: 'common', icon: 'trophy', test: (s) => s.stats.restored >= 10 },
  { id: 'perfect1', rarity: 'common', icon: 'polish:1', test: (s) => s.stats.perfect >= 1 },
  { id: 'robot1', rarity: 'common', icon: 'washbot', test: (s) => CATS.some((c) => s.robots[c] > 0) },
  { id: 'workshop', rarity: 'common', icon: 'garage:2', test: (s) => topTier(s) >= 2 || s.prestige > 0 },
  { id: 'night', rarity: 'common', hidden: true, icon: 'clock', test: (s, now) => s.stats.restored > 0 && now.getHours() < 5 },
  { id: 'hundred', rarity: 'rare', icon: 'trophy', test: (s) => s.stats.restored >= 100 },
  { id: 'station', rarity: 'rare', icon: 'garage:3', test: (s) => topTier(s) >= 3 || s.prestige > 0 },
  { id: 'perfect25', rarity: 'rare', icon: 'polish:1', test: (s) => s.stats.perfect >= 25 },
  { id: 'rust', rarity: 'rare', icon: 'grind:1', test: (s) => s.stats.rust >= 100 },
  { id: 'crew', rarity: 'rare', icon: 'wrenchbot', test: (s) => CATS.every((c) => s.robots[c] > 0) },
  { id: 'album25', rarity: 'rare', icon: 'album', test: (s) => share(s) >= 0.25 },
  { id: 'million', rarity: 'rare', icon: 'coin', test: (s) => s.stats.earned >= 1e6 },
  { id: 'streak', rarity: 'rare', icon: 'gate', test: (s) => s.streak.n >= 7 },
  { id: 'away', rarity: 'rare', icon: 'washbot', test: (s) => s.stats.away >= 100 },
  { id: 'speed', rarity: 'rare', hidden: true, icon: 'clock', test: (s) => s.stats.fastest > 0 && s.stats.fastest <= 10 },
  { id: 'network5', rarity: 'rare', icon: 'map', test: (s) => Object.keys(s.sites).length >= 5 },
  { id: 'network', rarity: 'epic', icon: 'map', test: (s) => SITES.filter((x) => !x.space).every((x) => !!s.sites[x.id]) },
  { id: 'luxury', rarity: 'epic', icon: 'garage:4', test: (s) => topTier(s) >= 4 },
  { id: 'fivehundred', rarity: 'epic', icon: 'trophy', test: (s) => s.stats.restored >= 500 },
  { id: 'album50', rarity: 'epic', icon: 'album', test: (s) => share(s) >= 0.5 },
  { id: 'prestige', rarity: 'epic', icon: 'chain', test: (s) => s.prestige >= 1 },
  { id: 'rims', rarity: 'epic', icon: 'parts', test: (s) => s.stats.wheels >= 100 },
  { id: 'mythic', rarity: 'epic', hidden: true, icon: 'star', test: (s) => Object.values(s.album).some((r) => r.rar.includes('mythic')) },
  { id: 'hangar', rarity: 'legendary', icon: 'garage:6', test: (s) => topTier(s) >= 6 },
  { id: 'planets', rarity: 'legendary', icon: 'map', test: (s) => SITES.filter((x) => x.space && s.sites[x.id]).length >= 4 },
  { id: 'neptune', rarity: 'legendary', hidden: true, icon: 'map', test: (s) => !!s.sites.neptune },
  { id: 'billion', rarity: 'legendary', icon: 'coin', test: (s) => s.stats.earned >= 1e9 },
  { id: 'stars', rarity: 'legendary', icon: 'chain', test: (s) => s.stars >= 100 },
  { id: 'album100', rarity: 'legendary', icon: 'album', test: (s) => share(s) >= 0.999 },
  { id: 'unknown', rarity: 'legendary', hidden: true, icon: 'star', test: (s) => !!s.album.unknown },
];

/** Earn what the save now deserves: the ids newly earned (in the list's order) */
export function checkAchievements(s: Save, now = new Date()): string[] {
  const got = new Set(s.ach);
  const fresh = ACHIEVEMENTS.filter((a) => !got.has(a.id) && a.test(s, now)).map((a) => a.id);
  if (fresh.length) s.ach = [...s.ach, ...fresh];
  return fresh;
}
