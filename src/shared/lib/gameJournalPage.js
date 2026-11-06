// События страницы в журнал игры (gameJournal.js): «немое приложение после сворачивания» на iPhone — чтобы по журналу было видно, ЧТО произошло с вкладкой, звуком и микрофоном вокруг ухода в фон.
// Пишется строкой «[page] …»: visibilitychange (hidden / visible), pagehide / pageshow (persisted — страница из кэша «назад-вперёд»), freeze / resume (страница заморожена системой), blur / focus окна,
// navigator.audioSession — смена состояния (statechange: тип / состояние), дорожки игрового микрофона — mute / ended (gameMic.onGameMicLost). Каждая строка несёт снимок: игровой AudioContext,
// тип и состояние аудиосессии. Состояние AudioContext по statechange пишет сам gameAudioCtx.js («[game-audio] AudioContext игры → …» через pLog — тоже в журнал).
// Ставится один раз на сеанс страницы (installPageJournal — идемпотентно, снимать не нужно). Зависимости подставляются (тесты).
import { gameJournal } from './gameJournal.js'
import { gameCtxState } from './gameAudioCtx.js'
import { onGameMicLost, micTracksLine } from './gameMic.js'

const sessionOf = nav => { try { const s = nav?.audioSession; return s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API' } catch { return '—' } }

/** Снимок для строки: «ctx=running, audioSession=play-and-record/active, микрофон=live» */
export function pageSnapshot({ nav = globalThis.navigator, ctx = gameCtxState, mic = micTracksLine } = {}) {
  const safe = fn => { try { return fn() ?? 'нет' } catch { return '—' } }
  return `ctx=${safe(ctx)}, audioSession=${sessionOf(nav)}, микрофон=${safe(mic)}`
}

let installed = null

/** Подписаться на события страницы (один раз). → отписка (нужна только тестам) */
export function installPageJournal({ win = globalThis.window, doc = globalThis.document, nav = globalThis.navigator, journal = gameJournal, micLost = onGameMicLost, snap = () => pageSnapshot({ nav }) } = {}) {
  if (installed) return installed
  const offs = []
  const write = text => { try { journal.add(`[page] ${text}; ${snap()}`) } catch { /* журнал не мешает игре */ } }
  const on = (target, type, fn) => {
    if (!target?.addEventListener) return
    const opt = { capture: true }
    try { target.addEventListener(type, fn, opt); offs.push(() => target.removeEventListener(type, fn, opt)) } catch { /* без события */ }
  }
  on(doc, 'visibilitychange', () => write(`вкладка ${doc.visibilityState === 'hidden' ? 'СКРЫТА (свернули / заблокировали)' : 'снова видна'} (visibilityState=${doc.visibilityState})`))
  on(win, 'pagehide', e => write(`pagehide${e?.persisted ? ' (persisted: страница уходит в кэш «назад-вперёд»)' : ''}`))
  on(win, 'pageshow', e => write(`pageshow${e?.persisted ? ' (persisted: страница вернулась из кэша «назад-вперёд»)' : ''}`))
  on(doc, 'freeze', () => write('freeze: страница заморожена системой'))
  on(doc, 'resume', () => write('resume: страница разморожена'))
  on(win, 'blur', e => { if (e?.target === win) write('blur: окно потеряло фокус') }) // фокус кнопок ловится тем же перехватом — пишем только окно
  on(win, 'focus', e => { if (e?.target === win) write('focus: окно снова в фокусе') })
  const session = (() => { try { return nav?.audioSession ?? null } catch { return null } })()
  on(session, 'statechange', () => write('audioSession: смена состояния'))
  try { offs.push(micLost((kind, t) => write(`дорожка микрофона: ${kind === 'ended' ? 'ОБОРВАНА (ended)' : 'заглушена системой (mute)'}, readyState=${t?.readyState ?? '—'}`))) } catch { /* без подписки */ }
  write(`журнал страницы включён, visibilityState=${doc?.visibilityState ?? '—'}`)
  installed = () => { offs.forEach(off => { try { off() } catch { /* уже снято */ } }); installed = null }
  return installed
}
