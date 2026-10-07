import { pLog } from './debug.js'
import { traceSoundRequest, traceSoundStarted, traceSoundFailed } from './soundTrace.js'
import { onLessonOpenChange, isLessonOpen } from './lessonOpen.js'
import { resetPrimed } from './primedAudio.js'
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
// Элементы, которые playSound создал САМ (кэш был пуст) — то есть вне жеста.
// Такой элемент не «разрешённый»: при ближайшем жесте его заменяет свежий из
// preloadSounds (см. там)
const lateMade = new Set()

// Контекст нужен только для разблокировки звука жестом в начале урока
// (unlockAudio). После урока он оставался в running и держал аудиосессию
// системы активной — на паузу; следующий урок снова разбудит его жестом
onLessonOpenChange(open => {
  if (open) return
  disarmGesture()
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {})
})

// Прерывание аудиосессии iOS (отключились Bluetooth-наушники, звонок):
// контекст уходит в WebKit-состояние 'interrupted', а каждый СУЩЕСТВУЮЩИЙ
// <audio> помечается прерванным — его play() дальше молча ничего не делает,
// и «конец прерывания» при смене маршрута может не прийти вовсе. Жалоба с
// iPhone: после переподключения наушников звуки интерфейса пропали до
// перезагрузки страницы — элементы в htmlCache создаются один раз. Поэтому:
// кэш выбрасываем, прогретый элемент таблиц тоже, а на ближайшем касании в
// уроке резюмим контекст И пересоздаём элементы ПРЯМО В ЖЕСТЕ (onGesture →
// preloadSounds): так же, как при старте урока, — это проверенный путь.
// Элемент, созданный в playSound вне жеста, на iOS стартует с задержкой
// ~700 мс, а то и вовсе без разрешения
function onCtxStateChange() {
  pLog(`[sound] AudioContext state → ${ctx.state}`)
  if (ctx.state !== 'interrupted') return
  evictAll('прерывание аудиосессии')
  resetPrimed()
  if (isLessonOpen()) armGesture()
}

let gestureArmed = false
function onGesture() { disarmGesture(); preloadSounds(); unlockAudio() }
function armGesture() {
  if (gestureArmed || typeof document === 'undefined') return
  gestureArmed = true
  document.addEventListener('pointerdown', onGesture, true)
  document.addEventListener('touchend', onGesture, true)
}
function disarmGesture() {
  if (!gestureArmed) return
  gestureArmed = false
  document.removeEventListener('pointerdown', onGesture, true)
  document.removeEventListener('touchend', onGesture, true)
}

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
  // Созданное вне жеста (playSound при пустом кэше после прерывания) меняем
  // на свежее — мы сейчас, как правило, внутри жеста
  if (lateMade.size) { lateMade.forEach(n => delete htmlCache[n]); lateMade.clear() }
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    ctx.onstatechange = onCtxStateChange
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
  // Не только 'suspended': после прерывания iOS держит 'interrupted'
  if (ctx.state !== 'running') {
    ctx.resume()
      .then(() => pLog(`[sound] AudioContext running`))
      .catch(e => pLog(`[sound] resume FAILED: ${e.message}`))
  }
}

// Беззвучный режим колоды повторения («Не могу слушать»): пока включён, звуки интерфейса — сообщения чата, «верно»/
// «неверно», закрепление — молчат. Выставляет плеер (useLessonWordAudio.js), при выходе из урока сбрасывается
let muted = false
export function setSoundsMuted(value) { muted = !!value }

// Подписка «звук стартовал»: cb(name, durationSec) после успешного play()
// (durationSec = 0, пока метаданных ещё нет). Для свечения снизу чата
// (player/soundGlow.js): shared/lib фич не импортирует, поэтому публикацию
// уровня делает подписчик. Возвращает функцию отписки
const playedListeners = new Set()
export function onSoundPlayed(cb) {
  playedListeners.add(cb)
  return () => { playedListeners.delete(cb) }
}
function notifyPlayed(name, audio) {
  if (!playedListeners.size) return
  const d = audio.duration
  playedListeners.forEach(cb => cb(name, d > 0 && Number.isFinite(d) ? d : 0))
}

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
    lateMade.add(name)
  }
  // Вклинились посреди прогрева (warmSound): он больше не ставит на паузу, звук включаем сами
  if (warming.delete(name)) audio.muted = false
  const rec = traceSoundRequest(name, audio, { откуда: where, состояниеCtx: ctx?.state ?? null })
  // Only seek to start if not already there — avoids iOS re-decode stall on fresh objects
  if (audio.currentTime > 0) audio.currentTime = 0
  // Элемент из кэша НЕ выбрасываем ни по отказу play(), ни по «долго не
  // стартует» (раньше: NotAllowedError/AbortError/сторож 1,5 с, v3.2.1855).
  // Новый <audio>, созданный здесь, вне жеста, не лучше жестового из
  // preloadSounds: на медленной сети (play() ещё грузит файл) каждый звук
  // выбрасывал недогруженный элемент, и звуки так и не прогревались — «в
  // других уроках нет звуков». Выбрасывает кэш только прерывание сессии
  // (onCtxStateChange), пересоздаёт — следующий жест
  audio.play()
    .then(() => { traceSoundStarted(rec); notifyPlayed(name, audio); pLog(`[sound] ${name} OK${where ? ` (${where})` : ''}`) })
    .catch(e => { traceSoundFailed(rec, e.message); pLog(`[sound] ${name} FAILED: ${e.message}`) })
}

// Прогрев звука БЕЗ слышимого звука: беззвучный play() → pause() → в начало. Зачем: на iOS первый
// play() элемента, который давно доиграл (или ещё не играл), стартует с задержкой 100–700 мс, пока
// декодер заново не прогреется; у остальных повторов элемент «тёплый» — звук первого шарика XP в
// итогах урока «опаздывал» относительно прилёта, остальные шли в такт (XpTransfer.jsx зовёт это при
// показе итогов, за 0,7 с до первого прилёта). muted-автозапуск iOS разрешает без жеста. После прогрева
// элемент стоит на 0 → playSound не делает seek (currentTime > 0 — тот самый повторный декод).
// Не трогает элемент, который сейчас играет; если playSound успел вклиниться посреди прогрева —
// прогрев ничего не останавливает (playSound снимает метку и сам включает звук)
const warming = new Set()
export function warmSound(name) {
  const audio = htmlCache[name]
  if (!audio || !audio.paused || warming.has(name)) return
  warming.add(name)
  audio.muted = true
  const finish = () => {
    if (warming.delete(name)) { audio.pause(); audio.currentTime = 0 }
    audio.muted = false
  }
  pLog(`[sound] warm ${name}`)
  try { audio.play().then(finish, finish) } catch { finish() }
}

function evictAll(why) {
  const names = Object.keys(htmlCache)
  if (!names.length) return
  names.forEach(n => delete htmlCache[n])
  lateMade.clear()
  warming.clear()
  pLog(`[sound] кэш звуков сброшен (${why}): ${names.join(', ')}`)
}
