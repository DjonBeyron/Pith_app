// Общий журнал игры на весь сеанс страницы (кольцевой, ~3000 строк): владелец проверяет только на iPhone, консоли там нет — журнал скачивается или копируется из шестерёнки игры (WordLaneHud.jsx).
// Сюда попадает КАЖДАЯ строка pLog (debug.js подключает журнал в одном месте — все «[audio]», «[pause]», «[warm]», «[race]», «[cat]», «[ru]», «[speech]», «[start]» идут через pLog), события звука из
// gameAudioSink (тип аудиосессии, глушение дорожки, прерывания) и события страницы (gameJournalPage.js: свернули / вернули, pagehide, freeze, blur, audioSession, дорожка микрофона).
// Журнал не чистится при закрытии игры: «немое после сворачивания» надо смотреть вместе с тем, что было ДО ухода в фон. Метка строки — мс от загрузки страницы (performance.now) и время дня.
// Чистая логика: часы подставляются (тесты). Один экземпляр на страницу — gameJournal внизу.
export const JOURNAL_MAX = 3000   // потолок строк; старое вытесняется пачкой
export const JOURNAL_EVICT = 300  // столько самых старых строк уходит разом (не shift() на каждую запись)
export const NOTE_MAX_CHARS = 300 // событие gameAudioSink в журнале обрезается до стольки символов

const pad = (n, k = 2) => String(n).padStart(k, '0')
/** Время дня «чч:мм:сс.ммм» */
export const dayTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`

const toText = a => { if (typeof a === 'string') return a; try { return JSON.stringify(a) } catch { return String(a) } }

export function createGameJournal({ max = JOURNAL_MAX, evict = JOURNAL_EVICT, now = () => globalThis.performance?.now?.() ?? Date.now(), clock = () => new Date() } = {}) {
  const lines = []
  let dropped = 0
  const api = {
    /** Строка журнала (любые аргументы, как у console.log) */
    add(...args) {
      try {
        const text = args.map(toText).join(' ')
        lines.push(`${(Math.round(now() * 10) / 10).toFixed(1).padStart(9)} ${dayTime(clock())} ${text}`)
        if (lines.length > max) { const cut = Math.min(lines.length, lines.length - max + evict); lines.splice(0, cut); dropped += cut }
      } catch { /* журнал не мешает игре */ }
    },
    /** Событие звука (gameAudioSink): «[note] вид {данные}», данные обрезаны */
    note(kind, data = {}) {
      let s = ''
      try { s = JSON.stringify(data) ?? '' } catch { s = String(data) }
      api.add(`[note] ${kind} ${s.length > NOTE_MAX_CHARS ? `${s.slice(0, NOTE_MAX_CHARS)}…` : s}`)
    },
    lines: () => lines.slice(),
    size: () => lines.length,
    dropped: () => dropped,
    /** Весь журнал текстом: заголовок (строки), пустая строка, записи; вытесненное — пометкой */
    text(header = []) {
      const head = [...header, `строк в журнале: ${lines.length}${dropped ? `, вытеснено старых: ${dropped}` : ''}`]
      return [...head, '', ...(lines.length ? lines : ['(журнал пуст)'])].join('\n')
    },
    clear() { lines.length = 0; dropped = 0 },
  }
  return api
}

/** Имя файла: pithy-journal-2026-11-06_14-03-27.txt (местное время) */
export function journalFileName(d = new Date()) {
  return `pithy-journal-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.txt`
}

/** Общий журнал страницы */
export const gameJournal = createGameJournal()
