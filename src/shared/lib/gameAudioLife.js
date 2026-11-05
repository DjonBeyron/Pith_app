// Жизнь звука игры при уходе приложения в фон (iPhone, iOS 18, Safari): «второй запуск игры беззвучен — после сворачивания или блокировки телефона».
// Что происходит на iOS: при сворачивании/блокировке аудиосессия прерывается, AudioContext уходит в 'interrupted' (иногда насовсем: resume() потом висит), элементы <audio> теряют разблокировку,
// тип navigator.audioSession.type может сброситься. Пауза игры (useWordLanePause) ловит только visibilitychange: hidden / pagehide ПРИ ОТКРЫТОЙ ИГРЕ; если игра уже закончена и карточка ждёт тапа,
// или hidden не пришёл (блокировка экрана при открытой вкладке), контекст умирает незаметно — и повторный тап «Полная гонка» запускает игру на мёртвом звуке.
// Здесь: (1) в журнал идут строки «[audio] visibility hidden/visible», «pagehide/pageshow», «blur/focus» с состоянием контекста и типом аудиосессии; (2) после возврата из фона звук помечается «подозрительным»
// (needsRewake): следующий старт игры (startGameAudio) идёт полным путём — свежий AudioContext в жесте вместо старого, не доверяя его состоянию 'running'. Один набор слушателей на страницу, установка идемпотентна.
import { gameCtxState } from './gameAudioCtx.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

let installed = null
let hiddenAt = null    // когда страница ушла в фон (мс) — до возврата
let suspect = null     // причина «подозрительного» звука или null
let flagged = 0        // сколько раз помечали (диагностика, тесты)

const returnSubs = new Set() // подписчики «вернулись из фона» (прогрев карточки игры, wordLaneWarm.js)

const sessionType = nav => { try { return nav?.audioSession?.type ?? null } catch { return null } }

/** Пометить звук подозрительным: следующий старт игры сделает полную разблокировку (свежий контекст) */
export function markGameAudioSuspect(why) { suspect = why; flagged += 1 }
/** Подписка на возврат из фона (visible / pageshow / focus после ухода): cb(why). Карточка игры перепроверяет прогрев — докачка могла оборваться. → отписка */
export function onGameAudioReturn(cb) { returnSubs.add(cb); return () => returnSubs.delete(cb) }
/** Звук после фона подозрителен? → причина или null (не сбрасывает) */
export const needsRewake = () => suspect
/** Забрать пометку при старте игры → причина или null */
export function consumeRewake() { const w = suspect; suspect = null; return w }
export const lifeStatus = () => ({ installed: !!installed, hiddenAt, suspect, flagged })

/**
 * Подписаться на уход в фон и возврат (document: visibilitychange; window: pagehide / pageshow / blur / focus). Повторный вызов — no-op. deps — подмена в тестах.
 * Возвращает отписку (тесты); в приложении слушатели живут до закрытия страницы.
 */
export function installGameAudioLife({ doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, nav = globalThis.navigator, now = () => performance.now(), ctxState = gameCtxState } = {}) {
  if (installed || !doc || !win) return installed ?? (() => {})
  const line = (what, extra = '') => {
    const ctx = ctxState(), as = sessionType(nav)
    pLog(`[audio] ${what}: ctx=${ctx ?? 'нет'}, audioSession.type=${as ?? '—'}${extra}`)
    gameAudioNote('audio-life', { what, ctx, as, suspect })
  }
  const gone = what => { if (hiddenAt == null) hiddenAt = now(); line(what) }
  const back = what => {
    const was = hiddenAt != null
    const away = was ? Math.round((now() - hiddenAt) / 1000) : null
    hiddenAt = null
    const ctx = ctxState()
    if (was || ctx === 'interrupted' || ctx === 'suspended') markGameAudioSuspect(`${what}${away != null ? ` после ${away} с в фоне` : ''}`)
    line(what, away != null ? `, в фоне ${away} с` : '')
    if (was) for (const cb of [...returnSubs]) { try { cb(what) } catch { /* подписчик не должен ломать остальных */ } }
  }
  const onVis = () => { if (doc.visibilityState === 'hidden') gone('visibility hidden'); else back('visibility visible') }
  const onShow = ev => back(ev?.persisted ? 'pageshow (из кэша)' : 'pageshow')
  const onHide = () => gone('pagehide')
  const onBlur = () => gone('blur')   // блокировка экрана при открытой вкладке иногда даёт только blur, без hidden
  const onFocus = () => { if (hiddenAt != null) back('focus') }
  doc.addEventListener('visibilitychange', onVis)
  win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow)
  win.addEventListener('blur', onBlur); win.addEventListener('focus', onFocus)
  installed = () => {
    doc.removeEventListener('visibilitychange', onVis)
    win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow); win.removeEventListener('blur', onBlur); win.removeEventListener('focus', onFocus)
    installed = null; hiddenAt = null; suspect = null
  }
  return installed
}
