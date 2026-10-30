// <audio>-слоты звука диктора и кота — ЗАПАСНОЙ путь. Основной путь коротких клипов — AudioBuffer через Web Audio (wordLaneBuffers.js, gameBufferPlay.js); сюда попадают: нет Web Audio или он выключен
// (gameAudioSettings: pithy_game_web_audio_v1), декодирование не вышло, файл длиннее 20 с, скорость голоса урока не 1× (элемент сохраняет тон, буфер — нет) и клипы из записи автора (prepareClips).
// По <audio> на каждый звук: ключ `s:<отрезок>` — клип записи автора, `w:<слово>` — озвучка куска / реплика из библиотеки. Слот создаётся и «будится» тишиной (play → pause) в тапе «Начать» (play вне жеста iPhone не даст),
// потом ему подставляется настоящий звук (blob). На iPhone пробуждение 30 элементов занимает секунды (4,5–19,7 с в журнале владельца) — поэтому в основном пути слотов нет вовсе.
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { watchPlay } from './wordLanePlayWatch.js'
import { sliceToWav } from './wordLaneWav.js'

let slots = null // { els: Map key → { a, woke, url }, urls: string[], silence, state }

const SILENCE_WAV = () => URL.createObjectURL(new Blob([sliceToWav(new Float32Array(640), 8000, 0, 0.08)], { type: 'audio/wav' }))

export function ensureSlots() {
  slots ??= { els: new Map(), urls: [], silence: SILENCE_WAV(), state: 'loading' }
  return slots
}
/** Текущий набор слотов (или null — слотов нет / игра закрыта) */
export const currentSlots = () => slots
export function setSlotsState(set, state) { if (slots === set) set.state = state }
export const slotsState = () => slots?.state ?? 'none'

export const WAKE_WAIT_MS = 300 // playSlot: play() тишины ещё не завершился — ждём его столько, прежде чем сменить src на звук (смена src при ожидающем play() обрывает его: AbortError)

/**
 * Разбудить элемент слота тишиной (play → pause) и записать исход. wokeAt — когда разбудили (performance.now); wokeErr — имя ошибки, если play() тишины ОТКЛОНЁН (NotAllowedError: жеста нет — слот НЕ разбужен);
 * wokeNote 'aborted' — play() прерван (AbortError: смена src/load()/pause() или прерывание аудиосессии iOS): это не отказ — элемент, у которого play() вызван в жесте, остаётся разблокированным, поэтому слот
 * считается разбуженным. Исход старого элемента (его заменил rewakeSlots) слот не касается: раньше его AbortError записывался в wokeErr нового, здорового элемента. wakePending — play() тишины ещё не завершился.
 */
function startWake(e, a, set, after = null) {
  e.wokeAt = 0; e.wokeErr = null; e.wokeNote = null; e.wakePending = true
  const settle = () => { if (e.a === a) e.wakePending = false }
  e.woke = a.play().then(
    () => { try { a.pause() } catch { /* уже на паузе */ } if (e.a === a) e.wokeAt = performance.now(); settle() },
    err => {
      if (e.a === a) {
        if (err?.name === 'AbortError') { e.wokeAt = performance.now(); e.wokeNote = 'aborted' } else e.wokeErr = err?.name ?? String(err ?? 'error')
      }
      settle()
    },
  ).then(() => { if (after && slots === set && e.a === a) after() })
}

/** Создать слот key и разбудить его (только в жесте). Повторный вызов с тем же ключом — тот же слот */
export function wake(key) {
  const set = ensureSlots()
  if (set.els.has(key)) return set.els.get(key)
  const a = new Audio(set.silence)
  a.preload = 'auto'
  a.setAttribute('playsinline', '')
  const e = { a, woke: null, url: null, wokeAt: 0, wokeErr: null, wokeNote: null, wakePending: false }
  startWake(e, a, set)
  set.els.set(key, e)
  return e
}

/**
 * Заново разбудить ВСЕ слоты (только в жесте): после прерывания аудиосессии (открытие микрофона, смена типа сессии, звонок, наушники) iOS помечает прежние <audio> прерванными, и их play() молчит, а диктор и
 * реплики кота играют по таймеру. Каждому слоту — свежий элемент с тишиной (play → pause), затем ему подставляется уже загруженный звук (blob/URL остаётся в слоте). Сети нет. Возвращает число слотов
 */
export function rewakeSlots() {
  const set = slots
  if (!set) return 0
  let n = 0
  for (const e of set.els.values()) {
    const old = e.a
    try { old.pause(); old.removeAttribute('src'); old.load?.() } catch { /* уже свободен */ }
    const a = new Audio(set.silence)
    a.preload = 'auto'
    a.setAttribute('playsinline', '')
    e.a = a
    startWake(e, a, set, () => { if (e.url) { a.src = e.url; a.load() } })
    n += 1
  }
  if (n) pLog(`[word-lane] слоты звука разбужены заново: ${n}`)
  return n
}

/** Подставить звук слоту e: когда play() тишины ЗАВЕРШИЛСЯ (принят или отклонён) на ЭТОМ элементе; слот успели пересоздать (rewakeSlots) — ждём уже его пробуждения. own — blob-ссылку отпустим сами */
export function attach(set, e, url, own) {
  if (own) set.urls.push(url)
  e.url = url
  const apply = () => {
    const w = e.woke
    w.then(() => { if (slots !== set) return; if (e.woke !== w) { apply(); return } e.a.src = url; e.a.load() })
  }
  apply()
}

function fireSlot(e, onResult) {
  try {
    if (e.a.src !== e.url) e.a.src = e.url // звук ещё не подставлен (attach ждёт пробуждения) — подставляем сейчас
    e.a.muted = getLessonMuted()
    e.a.playbackRate = getVoiceRate()
    e.a.currentTime = 0
    const p = e.a.play()
    watchPlay(e.a, p, onResult)
    p?.catch?.(err => pLog(`[word-lane] звук не пошёл: ${err?.name ?? err}`))
    return true
  } catch { return false }
}

/**
 * Сыграть слот. false — слота нет/звук не готов (вызывающий идёт запасным путём; при «без звука» играет muted). onResult(res) — исход play() (wordLanePlayWatch.js), для журнала «[cat-voice]». onStart() — звук принят
 * (у элемента «стартовал» = play() вызван: настоящего старта не узнать — 'playing' может не прийти вовсе). play() тишины ещё не завершился — src не трогаем (смена src оборвала бы его: AbortError),
 * ждём его до WAKE_WAIT_MS, потом играем (true — «примет», исход придёт в onResult).
 */
export function playSlot(key, onResult = null, onStart = null) {
  const e = slots?.els.get(key)
  if (!e?.url) return false
  if (!e.wakePending) { const ok = fireSlot(e, onResult); if (ok) onStart?.(); return ok }
  let fired = false
  const go = () => { if (fired) return; fired = true; clearTimeout(t); if (slots?.els.get(key) !== e) return; if (fireSlot(e, onResult)) onStart?.(); else onResult?.({ play: 'rejected', error: 'слот не сыграл', ms: 0, rs: null }) }
  const t = setTimeout(go, WAKE_WAIT_MS)
  e.woke.then(go)
  return true
}

/** Состояние слота перед проигрыванием (диагностика тишины): { exists, hasUrl, prepared (разбужен тишиной и звук подставлен), rs (readyState), paused, wokeAt (performance.now, 0 — не разбужен), wokeErr (play() тишины отклонён), wokeNote ('aborted' — прерван, не отказ), wakePending } */
export function slotInfo(key) {
  const e = slots?.els.get(key)
  if (!e) return { exists: false, hasUrl: false, prepared: false, rs: null, paused: null, wokeAt: 0, wokeErr: null, wokeNote: null, wakePending: false }
  let rs = null, paused = null, srcOk = false
  try { rs = e.a.readyState ?? null; paused = !!e.a.paused; srcOk = !!e.url && (e.a.src === e.url || String(e.a.src).endsWith(String(e.url))) } catch { /* элемент недоступен */ }
  return { exists: true, hasUrl: !!e.url, prepared: !!e.url && e.wokeAt > 0 && srcOk, rs, paused, wokeAt: e.wokeAt, wokeErr: e.wokeErr, wokeNote: e.wokeNote, wakePending: !!e.wakePending }
}

/** Есть ли у слота подставленный звук */
export const slotHasUrl = key => !!slots?.els.get(key)?.url

/** Игра закрыта: элементы и blob-ссылки отпущены */
export function releaseSlots() {
  if (!slots) return
  for (const { a } of slots.els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } }
  for (const u of slots.urls) URL.revokeObjectURL(u)
  URL.revokeObjectURL(slots.silence)
  slots = null
}
