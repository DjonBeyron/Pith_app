// ОДИН AudioContext для коротких звуков игры «Повтори за диктором» (реплики Пита, куски диктора, мяу/ноты, плашка). Зачем: на iPhone <audio> с только что подставленным blob-src поднимает медиа-конвейер секундами
// (в журнале владельца: слот реплики готов, readyState=0, play() принят и висит — «PLAY() ПРИНЯТ, НО ЗВУК НЕ ЗАИГРАЛ», а пробуждение 30 слотов тишиной занимало 4,5–19,7 с). Здесь звук — AudioBuffer, декодированный
// заранее при прогреве (wordLaneFetch.js), и AudioBufferSourceNode.start() срабатывает в ближайшем кванте рендера, а не «когда-нибудь».
//  • Контекст создаётся лениво (getGameCtx) и «открывается» в жесте — unlockGameCtx(): resume() + тихий отсчёт в 1 кадр (классический разбуд iOS). Зовут: тап «Начать» (синхронная часть startGameAudio), повторный прогрев
//    после прерывания (rewakeGameAudio, в жесте или на ближайшем касании) и gameAudioWarm.settle (resume, пока контекст 'interrupted').
//  • iOS при смене типа аудиосессии (play-and-record) и открытии микрофона переводит контекст в 'interrupted'. Буферы при этом не страдают (они не привязаны к контексту) — нужен только resume() после прерывания.
//    «Мёртвый» после фона/блокировки (resume() висит) пересоздаётся в жесте — ensureGameCtxRunning / recreateGameCtx (старт игры, wordLaneStart.js); пометка «звук после фона» — gameAudioLife.js.
//    Закрытый ('closed') контекст пересоздаётся при следующем обращении. Подписчики прерываний (onGameCtxInterrupted) — gameAudioWarm: он запускает повторный прогрев.
//  • У Vosk (voskEngine) и у звуков интерфейса (sounds.js) СВОИ контексты — этот модуль их не касается. В play-and-record два-три контекста допустимы; gameAudioWarm смотрит на сумму (ctxState: любой 'interrupted').
//  • Аварийный выключатель: localStorage pithy_game_web_audio_v1 = 'off' (gameAudioSettings.js) — игра идёт прежними <audio>-слотами.
import { readWebAudioMode } from './gameAudioSettings.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

let ctx = null
const interruptSubs = new Set()

const ctorOf = () => { const g = globalThis; return g.AudioContext || g.webkitAudioContext || g.window?.AudioContext || g.window?.webkitAudioContext || null }

/** Играть короткие звуки игры через Web Audio? (есть AudioContext и выключатель не 'off') */
export const webAudioOn = () => !!ctorOf() && readWebAudioMode() === 'on'

/** Состояние игрового контекста ('running' | 'suspended' | 'interrupted' | 'closed') или null, если его ещё нет */
export const gameCtxState = () => ctx?.state ?? null

function onChange(c) {
  pLog(`[game-audio] AudioContext игры → ${c.state}`)
  gameAudioNote('game-ctx', { state: c.state })
  if (c.state !== 'interrupted') return
  for (const cb of interruptSubs) { try { cb() } catch { /* подписчик не должен ломать остальных */ } }
}

/** Игровой контекст (создаётся при первом обращении; закрытый заменяется новым). null — Web Audio нет или выключен */
export function getGameCtx() {
  if (ctx && ctx.state === 'closed') ctx = null
  if (ctx) return ctx
  if (!webAudioOn()) return null
  try {
    const C = ctorOf()
    const c = new C()
    c.onstatechange = () => { if (ctx === c) onChange(c) }
    ctx = c
    pLog(`[game-audio] AudioContext игры создан, state=${c.state}, rate=${c.sampleRate ?? '—'}`)
    gameAudioNote('game-ctx', { state: c.state, created: true, rate: c.sampleRate ?? null })
  } catch (e) { pLog(`[game-audio] AudioContext не создался: ${e?.message ?? e}`); ctx = null }
  return ctx
}

/**
 * Открыть контекст в жесте (зовут СИНХРОННО из обработчика касания): создать, resume(), тихий отсчёт в 1 кадр. → промис итогового состояния ('running' | 'suspended' | 'interrupted' …) или null (нет Web Audio).
 * Вне жеста resume() на iOS может не пройти — состояние уйдёт в журнал, звук тогда пойдёт после ближайшего касания (gameAudioWarm).
 */
export function unlockGameCtx() {
  const c = getGameCtx()
  if (!c) return Promise.resolve(null)
  try {
    const s = c.createBufferSource()
    s.buffer = c.createBuffer(1, 1, c.sampleRate || 44100)
    s.connect(c.destination)
    s.start(0)
  } catch { /* разбуд отсчётом — приятное дополнение, не условие */ }
  if (c.state === 'running') return Promise.resolve('running')
  let p
  try { p = c.resume() } catch { return Promise.resolve(c.state) }
  return Promise.resolve(p).then(() => c.state, () => c.state)
}

/** Подписка на прерывание игрового контекста (iOS: звонок, наушники, смена типа сессии). → отписка */
export function onGameCtxInterrupted(cb) { interruptSubs.add(cb); return () => interruptSubs.delete(cb) }

/** Игра закрыта: контекст закрывается (аудиопоток системы освобождается); следующая игра создаст новый */
export function closeGameCtx() {
  const c = ctx
  ctx = null
  if (!c) return
  try { c.onstatechange = null; c.close?.()?.catch?.(() => {}) } catch { /* уже закрыт */ }
}

/**
 * Пересоздать игровой контекст в жесте: старый закрывается (iOS после блокировки/фона иногда оставляет его «мёртвым»: 'interrupted'/'suspended', resume() не завершается никогда), создаётся новый.
 * Декодированные AudioBuffer не привязаны к контексту (играют в любом, при другой частоте — с пересэмплированием), GainNode и источники создаются на каждый звук заново (gameBufferPlay) — перепривязывать нечего.
 * → новый контекст или null (Web Audio нет). Причина уходит в журнал: «[audio] ctx пересоздан: …»
 */
export function recreateGameCtx(why) {
  const old = ctx
  const was = old?.state ?? 'нет'
  ctx = null
  if (old) { try { old.onstatechange = null; old.close?.()?.catch?.(() => {}) } catch { /* уже закрыт */ } }
  pLog(`[audio] ctx пересоздан: ${why} (был ${was})`)
  gameAudioNote('game-ctx', { recreated: true, why, was })
  return getGameCtx()
}

/**
 * Убедиться, что игровой контекст ЗАПУЩЕН (после settle, пока жест жив): resume(); не стал 'running' за waitMs (300 мс) — «мёртвый» (iOS после фона), пересоздаём в том же жесте и пробуем ещё раз.
 * → { state, recreated, ms } (state null — Web Audio нет). Пересоздание не чаще одного раза за вызов; повторный провал — состояние в журнал, звук пойдёт после касания (gameAudioWarm).
 */
export async function ensureGameCtxRunning({ why = 'старт игры', waitMs = 300, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const t0 = now()
  const tryRun = async () => {
    let timer
    const state = await Promise.race([unlockGameCtx(), new Promise(res => { timer = setTimer(() => res('timeout'), waitMs) })])
    clearTimer(timer)
    return state === 'timeout' ? gameCtxState() : state
  }
  let state = await tryRun()
  if (state == null || state === 'running') { pLog(`[audio] состояние ctx=${state ?? 'нет Web Audio'} (${why})`); return { state, recreated: false, ms: Math.round(now() - t0) } }
  recreateGameCtx(`resume не завершился за ${waitMs} мс, ${why}`)
  state = await tryRun()
  pLog(`[audio] состояние ctx=${state ?? 'нет'} после пересоздания (${why})`)
  return { state, recreated: true, ms: Math.round(now() - t0) }
}
