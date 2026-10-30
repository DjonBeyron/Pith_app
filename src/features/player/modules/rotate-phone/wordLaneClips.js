// Звуки диктора на отдельных <audio> (слоты). Раньше высказывания играли из ОДНОГО mp3 перемоткой (currentTime) — на iPhone это ненадёжно: Safari не подгружает аудио заранее (readyState остаётся 0,
// пока не нажали play), перемотка до загрузки игнорируется, а у удалённой ссылки ещё нужна поддержка Range. В тесте файл к моменту первого слова оставался незагруженным — диктор молчал.
// Теперь файл один раз декодируется (decodeAudioData) в память, режется на клипы по высказываниям и каждый клип становится маленьким WAV — как ноты-награды, которые на iPhone играют хорошо:
// по одному <audio> на высказывание, «разбуженному» в тапе «Начать» (play внутри жеста), потом ему подставляется клип. Играет элемент с нулевой отметки — перематывать нечего.
import { getLessonMuted, getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { watchPlay } from './wordLanePlayWatch.js'
import { monoOf, speechOfUrl, decodeBytes, fetchBlob, measureSpeech, dropFetched } from './wordLaneFetch.js'

export { monoOf, speechOfUrl } // скачивание и измерение озвучки — wordLaneFetch.js (качать можно ещё в тапе, до создания слотов)

export const FADE_IN_S = 0.004
export const FADE_OUT_S = 0.012

/** Ключ отрезка файла: у одного отрезка (высказывания) один элемент на все повторы */
export const spanKey = span => `${span.start.toFixed(3)}-${span.end.toFixed(3)}`

/** WAV (моно, 16 бит) из куска samples [start, end) секунд при частоте rate; края сглажены (без щелчков) */
export function sliceToWav(samples, rate, start, end) {
  const a = Math.max(0, Math.floor(start * rate))
  const b = Math.min(samples.length, Math.ceil(end * rate))
  const n = Math.max(0, b - a)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  const fin = Math.floor(FADE_IN_S * rate)
  const fout = Math.floor(FADE_OUT_S * rate)
  for (let i = 0; i < n; i++) {
    let g = 1
    if (i < fin) g = i / fin
    else if (i >= n - fout) g = (n - 1 - i) / fout
    const x = Math.max(-1, Math.min(1, samples[a + i] * g))
    v.setInt16(44 + i * 2, Math.round(x * 32767), true)
  }
  return new Uint8Array(buf)
}

// Слоты звука: по <audio> на каждый звук диктора. Ключ слота: `s:<отрезок>` — клип, вырезанный из записи автора (фраза целиком в финале), `w:<слово>` — озвучка куска из библиотеки озвучки слов
// (отдельный файл на кусок — основной источник диктора). Все слоты создаются и «будятся» тишиной в тапе «Начать» (play внутри жеста — иначе iPhone не даст играть по таймеру), настоящий
// звук подставляется следом.
let slots = null // { els: Map key → { a, woke, url }, urls: string[], silence, state }

const SILENCE_WAV = () => URL.createObjectURL(new Blob([sliceToWav(new Float32Array(640), 8000, 0, 0.08)], { type: 'audio/wav' }))

function ensureSlots() {
  slots ??= { els: new Map(), urls: [], silence: SILENCE_WAV(), state: 'loading' }
  return slots
}

export const WAKE_WAIT_MS = 300 // playSlot: play() тишины ещё не завершился — ждём его столько, прежде чем сменить src на звук (смена src при ожидающем play() обрывает его: AbortError)

/**
 * Разбудить элемент слота тишиной (play → pause) и записать исход. wokeAt — когда разбудили (performance.now); wokeErr — имя ошибки, если play() тишины ОТКЛОНЁН (NotAllowedError: жеста нет — слот НЕ разбужен);
 * wokeNote 'aborted' — play() прерван (AbortError: смена src/load()/pause() или прерывание аудиосессии iOS): это не отказ — элемент, у которого play() вызван в жесте, остаётся разблокированным, поэтому слот
 * считается разбуженным. Исход старого элемента (его заменил rewakeClips) слот не касается: раньше его AbortError записывался в wokeErr нового, здорового элемента. wakePending — play() тишины ещё не завершился.
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
function wake(key) {
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
export function rewakeClips() {
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
  pLog(`[word-lane] слоты звука разбужены заново: ${n}`)
  return n
}

function attach(set, e, url, own) {
  if (own) set.urls.push(url)
  e.url = url
  const apply = () => { // src меняем только когда play() тишины ЗАВЕРШИЛСЯ (принят или отклонён) на ЭТОМ элементе; слот успели пересоздать (rewakeClips) — ждём уже его пробуждения
    const w = e.woke
    w.then(() => { if (slots !== set) return; if (e.woke !== w) { apply(); return } e.a.src = url; e.a.load() })
  }
  apply()
}

/** Ключ слота слова из библиотеки */
export const wordSlotKey = key => `w:${key}`

/**
 * Из тапа «Начать» (жест!): слоты для озвучки кусков из библиотеки — items: [{ key (wordKey), url }]. Все слоты создаются и будятся сразу (play тишины — только в жесте), а файлы подгружаются blob-ом
 * (как слова урока: play() без сети; CORS не пустил — прямая ссылка) через wordLaneFetch: если prefetchWords уже начал качать в тапе, берётся его результат. after — промис, которого дождаться перед скачиванием
 * (фоновые файлы идут после нужных к старту: реплики Пита, которые зазвучат не сразу, не мешают первому кадру игры). Возвращает промис «готово».
 */
export function prepareWords(items, { after = null } = {}) {
  if (typeof Audio === 'undefined' || !items?.length) return Promise.resolve(false)
  let set
  try { set = ensureSlots(); items.forEach(it => wake(wordSlotKey(it.key))) } catch { releaseClips(); return Promise.resolve(false) }
  return Promise.all(items.map(async it => {
    const e = set.els.get(wordSlotKey(it.key))
    try {
      if (after) await after.catch(() => {})
      const blob = await fetchBlob(it.url)
      attach(set, e, URL.createObjectURL(blob), true)
      await measureSpeech(it.url, blob).catch(() => {}) // где в файле звучит голос — не вышло, играем по длине из библиотеки
    } catch { attach(set, e, it.url, false) } // прямая ссылка: браузер докачает при play()
  })).then(() => Promise.all([...set.els.values()].map(e => e.woke)).then(() => true), () => false) // «готово» — когда и скачано, и слоты разбужены тишиной (а не только скачано): игра ждёт именно это
}

/**
 * Из тапа «Начать» (жест!): слоты под каждый отрезок записи автора (фраза целиком), а в фоне файл декодируется и нарезается. spans — [{ start, end }] в секундах файла.
 * Возвращает промис «готово» (true — нарезано; false — не вышло: диктор играет запасным путём). Без поддержки — тихо false.
 */
export function prepareClips(src, spans) {
  if (!src || !spans?.length || typeof Audio === 'undefined') return Promise.resolve(false)
  const uniq = [...new Map(spans.map(s => [spanKey(s), s])).values()]
  let set
  try { set = ensureSlots(); uniq.forEach(s => wake(`s:${spanKey(s)}`)) } catch { releaseClips(); return Promise.resolve(false) }
  return decodeAndSlice(src, uniq, set).then(ok => { if (slots === set) set.state = ok ? 'ready' : 'failed'; return ok })
}

async function decodeAndSlice(src, uniq, set) {
  try {
    const audio = await decodeBytes(await (await fetch(src)).arrayBuffer())
    if (!audio || slots !== set) return false
    const mono = monoOf(audio)
    for (const s of uniq) attach(set, set.els.get(`s:${spanKey(s)}`), URL.createObjectURL(new Blob([sliceToWav(mono, audio.sampleRate, s.start, s.end)], { type: 'audio/wav' })), true)
    pLog(`[word-lane] клипы записи нарезаны: ${uniq.length} шт., файл ${audio.duration.toFixed(1)} с`)
    return true
  } catch (err) {
    pLog(`[word-lane] клипы записи не нарезались (${err?.name ?? err}) — играем перемоткой файла`)
    return false
  }
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
 * Сыграть слот. false — слота нет/звук не готов (вызывающий идёт запасным путём; при «без звука» играет muted). onResult(res) — исход play() (wordLanePlayWatch.js), для журнала «[cat-voice]».
 * play() тишины ещё не завершился — src не трогаем (смена src оборвала бы его: AbortError), ждём его до WAKE_WAIT_MS, потом играем (true — «примет», исход придёт в onResult).
 */
function playSlot(key, onResult = null) {
  const e = slots?.els.get(key)
  if (!e?.url) return false
  if (!e.wakePending) return fireSlot(e, onResult)
  let fired = false
  const go = () => { if (fired) return; fired = true; clearTimeout(t); if (slots?.els.get(key) === e && !fireSlot(e, onResult)) onResult?.({ play: 'rejected', error: 'слот не сыграл', ms: 0, rs: null }) }
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

/** Клип записи автора по отрезку */
export const playClip = span => playSlot(`s:${spanKey(span)}`)
/** Озвучка куска из библиотеки по ключу слова (wordKey) */
export const playWordSlot = (key, onResult = null) => playSlot(wordSlotKey(key), onResult)
/** Состояние слота озвучки куска по ключу слова */
export const wordSlotInfo = key => slotInfo(wordSlotKey(key))
/** Есть ли готовая озвучка куска (слот с подгруженным звуком) */
export const hasWordSlot = key => !!slots?.els.get(wordSlotKey(key))?.url

export const clipsState = () => slots?.state ?? 'none'

/** Игра закрыта */
export function releaseClips() {
  dropFetched() // и то, что скачано заранее в тапе (prefetchWords), даже если слоты так и не создали (микрофон не дали)
  if (!slots) return
  for (const { a } of slots.els.values()) { try { a.pause(); a.removeAttribute('src') } catch { /* уже свободен */ } }
  for (const u of slots.urls) URL.revokeObjectURL(u)
  URL.revokeObjectURL(slots.silence)
  slots = null
}
