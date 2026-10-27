// «Семена памяти» (B6): чистые правила предложения «Сохрани слово» после верного ответа в игре ленты.
// Без React и сети — проверяется тестами. Первый раз слов «память» и «вкладка» в тексте нет (решение №7).
export const SEED_PER_DAY = 3
export const SEED_KEY = 'pithy_seed_offers_v1' // { date, n } — сколько предложений уже показано сегодня

// Тексты плашки
export function seedText() {
  return { title: 'Чтобы не забыть слово, сохрани его', save: 'Сохранить', decline: 'Не сейчас' }
}

// Предлагать только при верном ответе, если у слова есть колода, его ещё нет в памяти и дневной лимит не выбран.
// offeredToday — сколько предложений уже показано сегодня
export function shouldOfferSeed({ ok, hasDeck, inMemory, offeredToday = 0 }) {
  return Boolean(ok) && Boolean(hasDeck) && !inMemory && offeredToday < SEED_PER_DAY
}

// Состояние дня по образцу sceneTaskLimits.dayState: чужая дата обнуляет счётчик
export function seedDayState(raw, today) {
  const s = raw && typeof raw === 'object' ? raw : {}
  return { date: today, n: s.date === today && Number.isInteger(s.n) && s.n > 0 ? s.n : 0 }
}

const readDay = today => {
  try { return seedDayState(JSON.parse(localStorage.getItem(SEED_KEY) ?? 'null'), today) } catch { return seedDayState(null, today) }
}

export const seedOffersToday = today => readDay(today).n

// Отметить показ предложения (приватный режим — счётчик просто не сохранится)
export function markSeedOffered(today) {
  const s = readDay(today)
  try { localStorage.setItem(SEED_KEY, JSON.stringify({ date: today, n: s.n + 1 })) } catch { /* приватный режим */ }
}
