// Прогрев звука игры «Повтори за диктором» ПОСЛЕ открытия микрофона и после каждого прерывания аудиосессии (iPhone, iOS 18, Safari).
// Что было: в тапе «Начать» сначала будился весь звук (слова диктора, мяу, синтезатор), и только потом открывался микрофон. getUserMedia и смена navigator.audioSession.type переводят аудиосессию
// в «запись + воспроизведение»: AudioContext звуков уходит в 'interrupted', а sounds.js на это выбрасывает кэш звуков, прогретый элемент приложения и (через onAudioInterrupted) элементы слов урока.
// Элементы, разбуженные ДО смены сессии, iOS помечает прерванными — их play() молча ничего не делает: «в начале не слышно речь кота/диктора» до следующего тапа.
// Что теперь: (1) порядок в тапе — тип сессии → микрофон → ждём, пока прерывание уляжется (settle) → будим звук (wordLaneStart.js); (2) прерывание в игре (наше собственное или чужое — звонок, наушники)
// запускает повторный прогрев: сразу, если жест ещё «живой» (navigator.userActivation.isActive, ~5 с) и контекст уже не прерван, иначе — на ближайшем касании экрана.
// Чистая логика: подписка, состояние контекста, время и таймеры передаются снаружи (тесты). Единственный экземпляр игры — gameAudioWarm внизу.
import { onAudioInterrupted, soundCtxState, unlockAudio } from './sounds.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

export const SETTLE_QUIET_MS = 250   // столько ждём после смены сессии/открытия микрофона, прежде чем решить «прерывания не будет»
export const SETTLE_MAX_MS = 900     // потолок ожидания: звук будим в любом случае (иначе игра стартовала бы молча из-за зависшего контекста)
export const SETTLE_POLL_MS = 50
export const SELF_WINDOW_MS = 1500   // сколько после нашего действия (тип сессии, открытие микрофона) прерывание считается своим

const defaultActive = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } } // нет API (старый iOS) — считаем, что жест ещё жив
const defaultSessionState = () => { try { return globalThis.navigator?.audioSession?.state ?? null } catch { return null } }

export function createAudioWarm({
  subscribe = onAudioInterrupted, ctxState = soundCtxState, sessionState = defaultSessionState, resume = unlockAudio, active = defaultActive,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, doc = typeof document !== 'undefined' ? document : null, note = gameAudioNote, log = pLog,
} = {}) {
  let watching = false
  let off = null
  let interrupts = 0
  let lastAt = 0
  let selfUntil = 0
  let settling = false
  let armed = null
  let laterTimer = 0
  const rewarmers = new Set()

  const pending = () => ctxState() === 'interrupted' || sessionState() === 'interrupted' || (lastAt > 0 && now() - lastAt < SETTLE_QUIET_MS)

  function disarm() {
    if (!armed || !doc) { armed = null; return }
    doc.removeEventListener('pointerdown', armed, true); doc.removeEventListener('touchend', armed, true)
    armed = null
  }
  function arm(why) {
    if (armed || !doc) return
    armed = () => { disarm(); try { resume() } catch { /* контекст сам разберётся */ } api.rewarm(`касание (${why})`) }
    doc.addEventListener('pointerdown', armed, true); doc.addEventListener('touchend', armed, true)
    note('audio-warm', { step: 'armed', why })
  }

  function onInterrupt() {
    interrupts += 1; lastAt = now()
    const self = api.selfWindow()
    note('audio-interrupt', { n: interrupts, self, ctx: ctxState(), session: sessionState(), activation: active(), settling })
    log(`[audio-warm] прерывание аудиосессии №${interrupts}${self ? ' (вызвано нашим открытием микрофона / сменой типа сессии)' : ''}${settling ? ' — ждём, пока уляжется' : ''}`)
    if (settling) return // стартовый прогрев ещё впереди: settle() дождётся тишины и разбудит всё сам
    clearTimer(laterTimer) // сразу после события контекст ещё 'interrupted': даём прерыванию кончиться, потом решаем — прогреть сейчас или на касании
    laterTimer = setTimer(() => { laterTimer = 0; api.rewarmOnGesture('прерывание в игре') }, SETTLE_QUIET_MS + SETTLE_POLL_MS)
  }

  const api = {
    /** Старт игры (тап «Начать», до смены типа сессии): следим за прерываниями, ближайшие SELF_WINDOW_MS считаем своими */
    begin() {
      if (watching) return
      watching = true; interrupts = 0; lastAt = 0
      selfUntil = now() + SELF_WINDOW_MS
      off = subscribe(onInterrupt)
      note('audio-warm', { step: 'begin', ctx: ctxState(), session: sessionState(), activation: active() })
    },
    /** Мы только что сменили тип сессии / открыли или закрыли микрофон: прерывание в ближайшие SELF_WINDOW_MS — наше (для журнала плеера слов) */
    markSelf() { if (watching) selfUntil = now() + SELF_WINDOW_MS },
    /** Прерывание сейчас вызвано нами? (проигрыватель слов пишет это в журнал) */
    selfWindow: () => watching && now() < selfUntil,
    /** Подписать прогрев на повтор после прерывания; fn(why). → отписка */
    onRewarm(fn) { rewarmers.add(fn); return () => rewarmers.delete(fn) },
    /** Дождаться, пока аудиосессия уляжется после смены типа/открытия микрофона: SETTLE_QUIET_MS без прерываний и контекст не 'interrupted'; не дольше SETTLE_MAX_MS */
    settle({ quietMs = SETTLE_QUIET_MS, maxMs = SETTLE_MAX_MS } = {}) {
      const t0 = now()
      settling = true
      return new Promise(resolve => {
        const finish = () => {
          settling = false
          const r = { interrupts, waitedMs: Math.round(now() - t0), ctx: ctxState(), session: sessionState(), timedOut: pending(), activation: active() }
          note('audio-warm', { step: 'settled', ...r })
          log(`[audio-warm] аудиосессия улеглась через ${r.waitedMs} мс: прерываний ${r.interrupts}, контекст ${r.ctx ?? '—'}${r.timedOut ? ' (не дождались)' : ''}, жест ${r.activation ? 'жив' : 'истёк'}`)
          resolve(r)
        }
        const tick = () => {
          const el = now() - t0
          if (el >= maxMs || (el >= quietMs && !pending())) { finish(); return }
          if (ctxState() === 'interrupted') { try { resume() } catch { /* ждём дальше */ } } // подталкиваем: resume() в прерванном контексте сработает, как только прерывание кончится
          setTimer(tick, SETTLE_POLL_MS)
        }
        setTimer(tick, quietMs)
      })
    },
    /** Прогреть всё, что зарегистрировано (onRewarm), прямо сейчас */
    rewarm(why = 'вручную') {
      disarm()
      note('audio-warm', { step: 'rewarm', why, n: rewarmers.size, activation: active(), ctx: ctxState() })
      log(`[audio-warm] повторный прогрев звука игры (${why})`)
      for (const fn of rewarmers) { try { fn(why) } catch (e) { log(`[audio-warm] прогрев не удался: ${e?.message ?? e}`) } }
    },
    /** Прогреть сейчас, если жест ещё жив и контекст не прерван; иначе — на ближайшем касании экрана */
    rewarmOnGesture(why) {
      if (active() && !pending()) { api.rewarm(why); return }
      arm(why)
    },
    /** Конец игры: отписка, снять ожидание касания, забыть подписчиков */
    end() {
      if (!watching && !rewarmers.size && !armed) return
      watching = false; settling = false
      try { off?.() } catch { /* уже отписались */ }
      off = null
      clearTimer(laterTimer); laterTimer = 0
      disarm()
      rewarmers.clear()
    },
    status: () => ({ watching, interrupts, settling, armed: !!armed, rewarmers: rewarmers.size }),
  }
  return api
}

/** Общий экземпляр игры */
export const gameAudioWarm = createAudioWarm()
