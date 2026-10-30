// Хронология старта звука игры «Повтори за диктором» (тап «Начать» → микрофон → settle → прогрев → готово): время каждого шага от тапа. Нужна диагностике «почему первая реплика Пита тихая»:
// реплика кота (wordLaneCatVoiceLog.js) пишет, сколько мс прошло с тапа и с settle, а отсрочка первой реплики (wordLaneLineGate.js) узнаёт, закончен ли прогрев. Каждая отметка уходит в журнал отладки
// событием 'start-mark' { name, sinceTap, ... } (приёмник gameAudioSink) — из них в экспорте строится временная шкала первых секунд. Чистый модуль: часы подставляются (тесты). Один экземпляр на страницу.
import { gameAudioNote } from './gameAudioSink.js'

export const TRACE_WINDOW_MS = 15000 // «начало игры»: столько секунд с тапа реплики кота разбираются подробно

export function createStartTrace({ now = () => performance.now(), note = gameAudioNote } = {}) {
  let tapAt = null
  let marks = {}
  let phase = 'idle' // idle — тапа не было; starting — прогрев идёт; ready — прогрев закончен (или время вышло)
  let needsTap = false

  const api = {
    /** Тап «Начать» (или «Игра заново» / «Ещё минутку»): отсчёт с нуля */
    begin() { tapAt = now(); marks = {}; phase = 'starting'; needsTap = false; note('start-mark', { name: 'tap', sinceTap: 0 }) },
    /** Шаг прогрева: 'mic' | 'settle' | 'wake' | 'ready' | 'tap-wait' | 'hint-tap'; data уходит в журнал как есть */
    mark(name, data = {}) {
      if (tapAt == null) return
      marks[name] = now()
      if (name === 'ready') phase = 'ready'
      note('start-mark', { name, sinceTap: Math.round(marks[name] - tapAt), ...data })
    },
    /** Жест истёк, ждём касания (подсказка «Тапни, чтобы начать»); false — касание случилось */
    setNeedsTap(v) { needsTap = !!v },
    needsTap: () => needsTap,
    /** Мс с тапа или null (тапа не было) */
    sinceTap: () => (tapAt == null ? null : Math.round(now() - tapAt)),
    /** Мс с шага name (например 'settle') или null */
    since: name => (marks[name] == null ? null : Math.round(now() - marks[name])),
    /** Идёт ли «начало игры»: тап был не больше TRACE_WINDOW_MS назад */
    inWindow: (ms = TRACE_WINDOW_MS) => tapAt != null && now() - tapAt <= ms,
    /** Прогрев закончен? Тапа не было (игра запущена иначе, в тестах) — считаем, что да */
    warmed: () => phase !== 'starting',
    phase: () => phase,
    reset() { tapAt = null; marks = {}; phase = 'idle'; needsTap = false },
  }
  return api
}

/** Общий экземпляр страницы */
export const gameStartTrace = createStartTrace()
