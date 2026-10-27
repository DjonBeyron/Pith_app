// Реплики кота-диктора («Пит») в играх «Повтори за диктором». Универсальные: одни и те же для всех нод этого типа, хранятся в настройках приложения (shared/api/catLinesApi.js), в редакторе ноды
// видны списком, там же их озвучивают (ElevenLabs) и смотрят анимацию рта (wordLaneVisemes.js). Нет озвучки — реплика показывается подписью без звука; нет настроек — действуют тексты по умолчанию отсюда.
// Реплика = { text, url (озвучка в R2 или null), duration (с), words (тайминги слов или null) }. Чистые функции — проверяются тестами.
export const CAT_LINES = [
  { id: 'split_words', text: 'Пробуй сказать слова раздельно', when: 'ученик не смог сказать фразу из нескольких кусков' },
  { id: 'try_again', text: 'Ничего, попробуем ещё раз', when: 'ученик не успел сказать слово' },
  { id: 'your_turn', text: 'Теперь твоя очередь', when: 'первый раз, когда ход переходит к ученику' },
  { id: 'round_build', text: 'Повторяй за мной', when: 'начало раунда «Повторяй»' },
  { id: 'round_order', text: 'Выбери дорожку, пока пилюли на экране', when: 'начало раунда «Выбери дорожку»' },
  { id: 'round_blind', text: 'Теперь вслепую, по памяти', when: 'начало раунда «Вслепую»' },
  { id: 'well_done', text: 'Отлично!', when: 'конец игры, когда показан перевод' },
]
export const LINE_IDS = CAT_LINES.map(l => l.id)
export const MAX_LINE_CHARS = 120
export const lineKey = id => `line:${id}`
export const LINE_PAUSE_MS = 600      // после реплики кота ещё столько микрофон «не слушает» (эхо динамика)
export const LINE_COOLDOWN_MS = 6000  // одну и ту же подсказку не чаще, чем раз в столько мс (иначе кот надоест)

/** Сырые настройки (jsonb из app_settings или null) → все реплики каталога: { [id]: { text, url, duration, words } }; чужие ключи отбрасываются, пустой текст → по умолчанию */
export function normalizeLines(raw) {
  const src = raw && typeof raw === 'object' ? raw.lines ?? raw : {}
  const out = {}
  for (const d of CAT_LINES) {
    const v = src?.[d.id] && typeof src[d.id] === 'object' ? src[d.id] : {}
    const text = typeof v.text === 'string' ? v.text.trim().slice(0, MAX_LINE_CHARS) : ''
    const duration = Number(v.duration)
    out[d.id] = {
      text: text || d.text,
      url: typeof v.url === 'string' && v.url ? v.url : null,
      duration: duration > 0 ? duration : null,
      words: Array.isArray(v.words) && v.words.length ? v.words : null,
    }
  }
  return out
}

/** Текст реплики изменили — озвучка к ней больше не относится (она говорила другое): озвучку и тайминги сбрасываем */
export function withText(line, text) {
  return text.trim() === line.text ? { ...line, text } : { ...line, text, url: null, duration: null, words: null }
}

/** Для сохранения: только то, что отличается от умолчаний или озвучено (маленький jsonb) */
export function linesToSave(lines) {
  const out = {}
  for (const d of CAT_LINES) {
    const l = lines[d.id]
    if (l && (l.text !== d.text || l.url)) out[d.id] = { text: l.text, url: l.url, duration: l.duration, words: l.words }
  }
  return { lines: out }
}

/** Что подготовить в тапе «Начать» (слоты звука): реплики с озвучкой — [{ key, url }] */
export const linesItems = lines => CAT_LINES.filter(d => lines?.[d.id]?.url).map(d => ({ key: lineKey(d.id), url: lines[d.id].url }))

/** Сколько мс говорит реплика с озвучкой (rate — скорость голоса урока), без озвучки — оценка по тексту (подпись на экране) */
export const lineMs = (line, rate = 1) => Math.round(((line?.duration > 0 ? line.duration * 1000 : (line?.text?.length ?? 0) * 65) / (rate > 0 ? rate : 1)))
