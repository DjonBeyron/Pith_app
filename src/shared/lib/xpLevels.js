export const LEVELS = [
  { level: 0,  label: 'Новичок',  xpNeeded: 0    },
  { level: 1,  label: 'Ученик',   xpNeeded: 100  },
  { level: 2,  label: 'Практик',  xpNeeded: 250  },
  { level: 3,  label: 'Знаток',   xpNeeded: 500  },
  { level: 4,  label: 'Мастер',   xpNeeded: 1000 },
  { level: 5,  label: 'Профи',    xpNeeded: 1600 },
  { level: 6,  label: 'Эксперт',  xpNeeded: 2400 },
  { level: 7,  label: 'Виртуоз',  xpNeeded: 3400 },
  { level: 8,  label: 'Гуру',     xpNeeded: 4600 },
  { level: 9,  label: 'Сенсей',   xpNeeded: 6000 },
  // Порог 10-го уровня продублирован в claim_level_achievement (supabase_schema.sql)
  { level: 10, label: 'Легенда',  xpNeeded: 8000 },
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
