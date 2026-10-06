import { pLog } from './debug.js'
import { traceSoundRequest, traceSoundStarted, traceSoundFailed } from './soundTrace.js'
import { onLessonOpenChange } from './lessonOpen.js'
import { APP_VERSION } from './version.js'

// Адрес звука с версией приложения: файлы кэшируются на сутки (vercel.json),
// и после замены звука телефон играл старый из кэша — новая версия = новый
// адрес, перечитывается ровно один раз после деплоя
export const soundUrl = name => `/sounds/${name}.mp3?v=${APP_VERSION}`

// Hybrid approach for iOS (CriOS) compatibility:
// - AudioContext.resume() in gesture handler properly unlocks the page for all audio.
// - HTMLAudioElement for actual playback — uses iOS 'playback' audio category (speaker output).
//   Web Audio API uses 'soloAmbient' category on iOS, which outputs to earpiece / plays silently.
// - After ctx.resume() in gesture, HTMLAudioElement.play() from setTimeout is instant.

let ctx = null
const htmlCache = {}

// Контекст нужен только для разблокировки звука жестом в начале урока
// (unlockAudio). После урока он оставался в running и держал аудиосессию
// системы активной — на паузу; следующий урок снова разбудит его жестом
onLessonOpenChange(open => {
  if (!open && ctx && ctx.state === 'running') ctx.suspend().catch(() => {})
})

// message-in — новое сообщение в чате; answer-correct/wrong — ответ в
// упражнении (выбор слова, собери фразу, таблица, составь предложение,
// напечатай слово, выбери фото); pin-message — закреп; typing-1/2 — «учитель
// печатает» (второй тише, при затянувшемся ожидании файлов); xp-gain —
// начисление XP в уроке и каждый прилёт шарика в XP-бар итогов; level-up —
// новый уровень везде, где он случается (итоги урока/повторения, награда
// серии); lesson-locked — окно «Как открыть уроки» по тапу на закрытый урок
const ALL_SOUNDS = ['message-in', 'answer-correct', 'answer-wrong', 'pin-message', 'typing-1', 'typing-2', 'xp-gain', 'level-up', 'lesson-locked']

// Прогрев файлов при старте приложения: обычный fetch кладёт mp3 в HTTP-кэш
// (iOS без жеста не грузит медиа-элементы, а fetch — грузит); к первому
// жесту preloadSounds() создаёт Audio уже из кэша, без похода в сеть.
// Зовётся из App.jsx с задержкой, чтобы не толкаться с первым видео ленты
export function warmSoundFiles() {
  if (typeof fetch !== 'function') return
  for (const name of ALL_SOUNDS) fetch(soundUrl(name), { cache: 'force-cache' }).catch(() => {})
}

// Call during lesson warmup (no gesture needed).
// Creates AudioContext (suspended) + HTMLAudioElements preloaded into memory.
export function preloadSounds() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    pLog(`[sound] AudioContext created state=${ctx.state}`)
  }
  ALL_SOUNDS.forEach(name => {
    if (htmlCache[name]) return
    const a = new Audio(soundUrl(name))
    a.preload = 'auto'
    a.load()
    htmlCache[name] = a
    pLog(`[sound] preload ${name}`)
  })
}

// Call synchronously in gesture handler — resumes AudioContext.
// iOS gesture unlock is page-wide: after this, HTMLAudioElement.play() from
// setTimeout fires instantly without the ~700ms first-play delay.
export function unlockAudio() {
  if (!ctx) return
  pLog(`[sound] unlockAudio — ctx.state=${ctx.state}`)
  if (ctx.state === 'suspended') {
    ctx.resume()
      .then(() => pLog(`[sound] AudioContext running`))
      .catch(e => pLog(`[sound] resume FAILED: ${e.message}`))
  }
}

// Беззвучный режим колоды повторения («Не могу слушать»): пока включён, звуки интерфейса — сообщения чата, «верно»/
// «неверно», закрепление — молчат. Выставляет плеер (useLessonWordAudio.js), при выходе из урока сбрасывается
let muted = false
export function setSoundsMuted(value) { muted = !!value }

// where — кто просит звук ('word-choice', 'феед', 'таблица'…). В отчёт
// дебага уходит вместе с итогом: по одному «OK» нельзя было понять, почему
// ученик звука не услышал — промис play() резолвится в момент СТАРТА, а
// дальше элемент мог встать на паузу или оборваться (см. soundTrace.js).
export function playSound(name, where = null) {
  if (muted) return
  let audio = htmlCache[name]
  if (!audio) {
    audio = new Audio(soundUrl(name))
    htmlCache[name] = audio
  }
  const rec = traceSoundRequest(name, audio, { откуда: where, состояниеCtx: ctx?.state ?? null })
  // Only seek to start if not already there — avoids iOS re-decode stall on fresh objects
  if (audio.currentTime > 0) audio.currentTime = 0
  audio.play()
    .then(() => { traceSoundStarted(rec); pLog(`[sound] ${name} OK${where ? ` (${where})` : ''}`) })
    .catch(e => { traceSoundFailed(rec, e.message); pLog(`[sound] ${name} FAILED: ${e.message}`) })
}
