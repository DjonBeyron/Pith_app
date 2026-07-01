export const LEVELS = [
  { level: 0, label: 'Новичок',  xpNeeded: 0    },
  { level: 1, label: 'Ученик',   xpNeeded: 100  },
  { level: 2, label: 'Практик',  xpNeeded: 250  },
  { level: 3, label: 'Знаток',   xpNeeded: 500  },
  { level: 4, label: 'Мастер',   xpNeeded: 1000 },
]

export function getCurrentLevel(xp) {
  let current = LEVELS[0]
  for (const lvl of LEVELS) {
    if (xp >= lvl.xpNeeded) current = lvl
  }
  return current
}

export function getNextLevel(xp) {
  for (const lvl of LEVELS) {
    if (xp < lvl.xpNeeded) return lvl
  }
  return null
}
