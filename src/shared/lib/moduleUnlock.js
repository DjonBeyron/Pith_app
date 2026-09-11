// «Разблокировано без диагностики» — по модулю.
//
// Обычно уроки модуля стоят под замком, пока не пройден Старт (диагностика):
// она ищет слабые места и расставляет приоритеты. Кто не хочет её проходить,
// может снять замок со всех уроков модуля разом — осознанно и с предупреждением
// (см. LessonLockedHint.jsx).
//
// По модулю, а не на всё приложение: диагностика у каждого модуля своя и ищет
// слабые места именно его темы, так что отказ в одном не должен решать за
// человека в следующем.
//
// Живёт в localStorage рядом с самим прогрессом уроков (completedLessons.js):
// сервер про «пройдено» не знает, и держать замок в базе, пока прогресс
// локальный, значило бы развести их по разным местам.

const KEY = 'pithy_module_unlocked_v1'

function read() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')) }
  catch { return new Set() }
}

function write(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])) }
  catch { /* приватный режим — замок вернётся после перезагрузки */ }
}

export function isModuleUnlocked(moduleId) {
  return moduleId != null && read().has(moduleId)
}

export function unlockModule(moduleId) {
  if (moduleId == null) return
  const set = read()
  set.add(moduleId)
  write(set)
}

// Полный сброс модуля («как новый пользователь») снимает и это решение —
// иначе после сброса уроки остались бы открытыми, а прогресс обнулился
export function relockModule(moduleId) {
  if (moduleId == null) return
  const set = read()
  set.delete(moduleId)
  write(set)
}
