// «Окно речи» Пита и диктора в игре «Повтори за диктором»: пока кто-то из них говорит, игра может приглушить микрофон, а iOS-аудиосессию — переключить в режим воспроизведения (режимы для проверки на iPhone).
// begin()/end() считают вложенность (диктор и реплика Пита могут пересечься): первое begin() открывает окно, последнее end() закрывает. holdFor(ms) — окно на заданное время (реплики Пита, подсказки диктора).
//  • Настройка pithy_game_mic_hold_v1 = 'enabled-false': на время окна track.enabled = false у дорожек игрового потока (динамик не попадает в микрофон, iOS не «ныряет» громкостью под захват); в конце — обратно
//    в прежнее значение. В gameMic.js есть опасение, что на iOS enabled=false мог остановить захват, поэтому режим только для проверки: после возврата через CHECK_MS смотрим track.muted / readyState,
//    пишем в отладку (mic-hold), и если дорожка не ожила — зовём onDead (игра переоткрывает поток тем же путём, что при «оглохшем» микрофоне).
//  • Окно речи заодно переключает фазу аудиосессии (gameMicSession, режим 'phases'): speak на время речи, listen — после.
// Пока дорожка выключена, игровой уровень микрофона — ровная тишина: слушатель не должен считать её «оглохшим» микрофоном — для этого active() (wordLaneListen: isHeld).
import { peekGameMic } from './gameMic.js'
import { gameAudioSession } from './gameMicSession.js'
import { readMicHoldMode } from './gameAudioSettings.js'
import { gameAudioNote } from './gameAudioSink.js'

export const HOLD_CHECK_MS = 150 // проверка дорожки после возврата enabled = true

const tracksOf = s => { try { return s?.getAudioTracks ? s.getAudioTracks() : (s?.getTracks?.() ?? []) } catch { return [] } }
const snap = t => ({ enabled: t.enabled, muted: !!t.muted, readyState: t.readyState })

export function createMicHold({ getStream = peekGameMic, session = gameAudioSession, store = globalThis.localStorage, note = gameAudioNote, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let depth = 0
  let held = [] // [{ t, was }] — дорожки, которые мы выключили
  let checkTimer = 0
  let onDead = null
  const timers = new Set()

  function start() {
    clearTimer(checkTimer); checkTimer = 0
    session.phase('speak')
    const mode = readMicHoldMode(store)
    if (mode !== 'enabled-false') return
    const tracks = tracksOf(getStream())
    if (!tracks.length) { note('mic-hold', { on: true, mode, why: 'no-stream', tracks: 0, depth }); return }
    held = tracks.map(t => ({ t, was: t.enabled }))
    held.forEach(({ t }) => { try { t.enabled = false } catch { /* дорожка уже выгружена */ } })
    note('mic-hold', { on: true, mode, ...snap(tracks[0]), tracks: tracks.length, depth })
  }

  function check(list) {
    checkTimer = 0
    const stream = getStream()
    const alive = tracksOf(stream)
    const mine = list.filter(({ t }) => alive.includes(t)) // поток закрыт или заменён — проверять нечего
    if (!mine.length) return
    const bad = mine.filter(({ t }) => t.readyState !== 'live' || t.muted)
    note('mic-hold', { on: false, check: true, mode: readMicHoldMode(store), ...snap(mine[0].t), tracks: mine.length, dead: bad.length > 0, depth })
    if (bad.length) { try { onDead?.(bad.map(({ t }) => `${t.readyState}${t.muted ? '/muted' : ''}`).join(',')) } catch { /* игра сама решит */ } }
  }

  function stop() {
    session.phase('listen')
    if (!held.length) return
    const list = held
    held = []
    list.forEach(({ t, was }) => { try { t.enabled = was } catch { /* дорожка уже выгружена */ } })
    note('mic-hold', { on: false, mode: readMicHoldMode(store), ...snap(list[0].t), tracks: list.length, depth })
    checkTimer = setTimer(() => check(list), HOLD_CHECK_MS)
  }

  const api = {
    get depth() { return depth },
    /** Дорожка сейчас выключена нами (слушатель не считает тишину поломкой) */
    active: () => held.length > 0,
    /** Игра регистрирует, что делать с «умершей» после возврата дорожкой (переоткрыть поток) */
    setDeadHandler(fn) { onDead = typeof fn === 'function' ? fn : null },
    begin() { depth += 1; if (depth === 1) start() },
    end() {
      if (depth === 0) return // лишний end (сброс уже был) — безопасно
      depth -= 1
      if (depth === 0) stop()
    },
    /** Окно речи на ms миллисекунд; возвращает cancel (закрыть раньше срока, один раз) */
    holdFor(ms) {
      api.begin()
      let open = true
      let id = 0
      const close = () => { if (!open) return; open = false; clearTimer(id); timers.delete(id); api.end() }
      id = setTimer(close, Math.max(0, ms))
      if (open) timers.add(id) // setTimer мог сработать сразу (тесты) — тогда окно уже закрыто
      return close
    },
    /** Конец игры: закрыть все окна, вернуть enabled, снять таймеры (поток закрывается следом) */
    reset() {
      timers.forEach(clearTimer); timers.clear()
      clearTimer(checkTimer); checkTimer = 0
      if (depth > 0) { depth = 0; stop(); clearTimer(checkTimer); checkTimer = 0 }
    },
  }
  return api
}

/** Общий экземпляр игры */
export const gameMicHold = createMicHold()
