import { cachedWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { pLog } from '../../../shared/lib/debug.js'
import { publishLevel, unpublishLevel, speechEnvelope } from '../audioLevel.js'
import { getLessonMuted, applyVoiceRate, subscribeLessonVolume } from '../lessonVolume.js'

// Проигрыватель слов в уроке (PROJECT.md, «Озвучка слов»). Один на плеер,
// без React: модули зовут playWord(key) прямо из обработчика тапа.
//
// НЕ Web Audio: на iOS AudioContext играет в категории soloAmbient — в
// динамик разговорный/тихо (см. sounds.js, там же выяснено), поэтому слова,
// как и звуки интерфейса, идут через HTMLAudioElement. Каждому слову — свой
// <audio> с blob-URL, прогретый заранее (load()): тап в жесте → play()
// мгновенно, без стрима с сервера.
//
// Последний тап побеждает: новое слово останавливает предыдущее (pause +
// currentTime=0). Плавного спада громкости нет — iOS игнорирует volume у
// медиа-элемента, а слова короткие, обрыв не слышен.
//
// Предзагрузка — ПОСЛЕДОВАТЕЛЬНО (одно слово за раз): слова мелкие, а
// очередь файлов урока (usePlayerPreload) важнее — с ней не конкурируем;
// старт дорожки — из useLessonWordAudio после прогрева первых нод.

const players = new Map()   // key → HTMLAudioElement
const blobUrls = new Map()  // key → blob: URL (revoke при release)
let blobCount = 0, urlCount = 0 // для лога прогрева: blob (свой) или прямой URL (CORS)
let current = null
let muted = false           // «Не могу слушать» (повторение): слова не звучат при тапах по таблицам, вариантам и т.п.
let gen = 0                 // смена урока обесценивает идущую предзагрузку
export const WAIT_MS = 250  // звук не пошёл дольше — зовём onWait (кнопка ▶ показывает крутилку загрузки)

let currentEnded = null // «слово доиграло/прервано» для hooks.onEnded текущего слова

// Кнопки шапки урока (lessonVolume.js): «без звука» — слово играет, но muted
// (хуки onEnded/onDone идут как обычно, в отличие от «Не могу слушать» выше);
// скорость голоса — playbackRate. Звучащее слово подхватывает смену сразу
subscribeLessonVolume(() => {
  if (!current) return
  try { current.muted = getLessonMuted() } catch { /* выгружен */ }
  applyVoiceRate(current)
})

const GLOW_ID = 'word-audio' // ключ источника в audioLevel.js (слово играет одно, ключ один)

function stopCurrent() {
  if (!current) return
  try { current.pause(); current.currentTime = 0 } catch { /* элемент мог быть выгружен */ }
  unpublishLevel(GLOW_ID)
  current = null
  const ended = currentEnded
  currentEnded = null
  ended?.()
}

async function prepare(key, url, myGen) {
  let src = url
  try {
    // Как файлы урока: blob в памяти → play() без сети. CORS на localhost
    // может не пустить — тогда прямой URL, браузер докачает при play()
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      if (myGen !== gen) return
      src = URL.createObjectURL(blob)
      blobUrls.set(key, src)
      blobCount += 1
    } else urlCount += 1
  } catch { urlCount += 1 /* прямой URL ниже */ }
  if (myGen !== gen) return
  const a = new Audio(src)
  a.preload = 'auto'
  a.onerror = () => pLog(`[word-audio] ошибка загрузки «${key}» (${src.startsWith('blob:') ? 'blob' : 'url'}): ${a.error?.message ?? a.error?.code}`)
  a.load()
  players.set(key, a)
}

// keys — ключи слов урока; берутся только те, что есть в базе (cachedWordAudio)
export async function preloadWordAudio(keys) {
  const myGen = gen
  const lib = cachedWordAudio()
  if (!lib) return
  let n = 0
  for (const key of keys) {
    if (myGen !== gen) return
    const row = lib.get(key)
    if (!row?.url || players.has(key)) continue
    await prepare(key, row.url, myGen)
    n += 1
  }
  if (n) pLog(`[word-audio] прогрето слов: ${n} (blob: ${blobCount}, url: ${urlCount})`)
}

// true — слово есть и запущено. Нет в базе/не прогрето — тишина (не ждём:
// слово с опозданием «прилипло» бы к следующему тапу).
// hooks (необязательно): onWait — звук не пошёл за WAIT_MS (грузится с сервера),
// onDone — звук пошёл, не удался или его прервали другим словом (после onWait
// всегда приходит onDone); onEnded — слово ДОИГРАЛО (или не удалось/прервано):
// для звуков, которые не должны накладываться на слово («верно» в «напечатай слово»)
export function playWord(key, hooks = null) {
  if (!key) return false
  stopCurrent()
  if (muted) return false // беззвучный режим: слово не играем (звук включается обратно кнопкой на карточке)
  let a = players.get(key)
  if (!a) {
    const row = cachedWordAudio()?.get(key)
    if (!row?.url) { pLog(`[word-audio] тап «${key}» — в базе нет`); return false }
    pLog(`[word-audio] тап «${key}» — не прогрето, с сервера`)
    // Не прогрето (дорожка ещё не дошла) — играем с сервера и запоминаем
    a = new Audio(row.url)
    players.set(key, a)
  }
  current = a
  // Свечение-эквалайзер (audioLevel.js): у mp3 слова волны нет — синтезированная огибающая, пока играет
  publishLevel(GLOW_ID, { playing: true, getLevel: () => speechEnvelope(a.currentTime, a.duration) })
  a.muted = getLessonMuted()
  applyVoiceRate(a)
  let finished = false
  let endedFired = false
  const ended = () => { if (endedFired) return; endedFired = true; unpublishLevel(GLOW_ID); if (currentEnded === ended) currentEnded = null; hooks?.onEnded?.() }
  currentEnded = ended
  const done = () => { if (finished) return; finished = true; clearTimeout(waitTimer); hooks?.onDone?.() }
  const waitTimer = hooks?.onWait ? setTimeout(() => { if (!finished) hooks.onWait() }, WAIT_MS) : 0
  a.onplaying = () => { done(); pLog(`[word-audio] играет «${key}» (${a.src.startsWith('blob:') ? 'blob' : 'url'}, ${a.duration.toFixed(2)}с)`) }
  a.onended = ended
  a.play().then(done).catch(e => { done(); ended(); pLog(`[word-audio] play «${key}» не удался: ${e.message}`) })
  return true
}

// Заглушить звучащее слово (новый выбор без озвучки не должен оставлять
// прежнее слово звучать поверх)
export function stopWord() { stopCurrent() }

// Беззвучный режим повторения: включили — звучащее слово смолкает, новые не запускаются
export function setWordAudioMuted(value) {
  muted = !!value
  if (muted) stopCurrent()
}

export function releaseWordAudio() {
  gen += 1
  stopCurrent()
  for (const a of players.values()) { try { a.src = '' } catch { /* noop */ } }
  for (const u of blobUrls.values()) URL.revokeObjectURL(u)
  players.clear()
  blobUrls.clear()
  blobCount = 0; urlCount = 0
  muted = false
}
