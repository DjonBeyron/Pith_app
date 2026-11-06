// Старт «Гонки с Питом» после ответа на попап «Говорю / Тапаю» (CONCEPT_RACE.md, «Попап внутри игры»). «Говорю»: попап ждёт микрофон (и пока звук улягется после смены аудиосессии), игра открывается уже с готовым звуком;
// «Тапаю»: игра открывается сразу (часы стоят, пока готовится звук). Цель: первая реплика (race_start) — не позже RACE_ENTRY_LINE_MS (0,4 с) после входа в игру. Этот модуль меряет и пишет в журнал (один раз за запуск):
// «[race] старт: реплика через M мс после входа в игру, Пит через N мс; от ответа на попап до входа W мс» (M — от setPhase('game') до начала звука первой реплики, N — до выскакивания головы, W — ожидание
// микрофона и звука в попапе). Чистая логика: часы и журнал приходят аргументами.
import { pLog } from '../../shared/lib/debug.js'

export const RACE_HOLD_MAX_MS = 1500     // часы игры стоят, пока готовится звук, но не дольше — дальше игра идёт, а реплика Пита ждёт сама
export const RACE_LINE_WAIT_MS = 1500    // реплика Пита в начале гонки ждёт готовности слота не дольше (обычная игра — 3 с, wordLaneLineGate.LINE_WAIT_MS)
export const RACE_GATE_MS = 400          // ворота первой реплики (race_start, один файл) ждут не дольше (с тапа): не готов — игра идёт, Пит заговорит по готовности (голова уже наверху и не прячется, useCatLines)
export const RACE_START_LEAD_MS = 0      // race_start начинается сразу после старта часов игры (у остальных стадий — useRehearsalActs.LINE_AT_MS 250 мс «после плашки»); звук не ждёт выскакивания головы (noRise)
export const RACE_ENTRY_LINE_MS = 400    // цель: первая реплика Пита начинается не позже стольки мс после входа в игру (дольше — пометка в журнале)
export const PIT_PEEK_MS = RACE_HOLD_MAX_MS + 600 // сколько голова торчит, пока игра держит часы и ждёт первую реплику (дальше её держит сама речь)

export function createStartTrace({ now = () => performance.now(), log = pLog } = {}) {
  let askAt = null, t0 = null, pitAt = null, wait = null
  return {
    /** Тап по «Говорю» / «Тапаю»: отсчёт ожидания в попапе (микрофон, звук) */
    ask() { askAt = now(); t0 = null; pitAt = null; wait = null },
    /** Вход в игру (setPhase('game')): отсчёт до первой реплики */
    begin() { t0 = now(); pitAt = null; wait = askAt == null ? null : Math.round(t0 - askAt); askAt = null },
    /** Голова Пита выскочила (первый раз за запуск) */
    pit() { if (t0 != null && pitAt == null) pitAt = Math.round(now() - t0) },
    /** Первая реплика Пита началась (voiced: false — подпись без звука): строка в журнал, дальше — молчим до следующего запуска */
    line({ voiced = true } = {}) {
      if (t0 == null) return null
      const m = Math.round(now() - t0), n = pitAt ?? m
      t0 = null
      const w = wait == null ? '' : `; от ответа на попап до входа ${wait} мс`
      try { log(`[race] старт: реплика через ${m} мс после входа в игру, Пит через ${n} мс${w}${voiced ? '' : ' (без звука — только подпись)'}${m > RACE_ENTRY_LINE_MS ? ` — ДОЛЬШЕ ${RACE_ENTRY_LINE_MS} мс` : ''}`) } catch { /* журнал не мешает игре */ }
      return { pit: n, line: m, wait }
    },
    /** Запуск отменён (нет микрофона, выход): строку не пишем */
    cancel() { t0 = null; askAt = null },
    active: () => t0 != null,
    /** Ждём ли в попапе (ответ дан, игры ещё нет) */
    asking: () => askAt != null,
  }
}

export const raceStart = createStartTrace()
