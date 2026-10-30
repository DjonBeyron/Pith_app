// Звуки диктора и кота: единая точка входа для игры. Два пути под одним интерфейсом:
//  • ОСНОВНОЙ — AudioBuffer через Web Audio (wordLaneBuffers.js → gameBufferPlay.js): файл скачан и декодирован при прогреве (карточка игры → wordLaneFetch.js), «подготовлен» = «декодирован», старт мгновенный,
//    слотов <audio> и пробуждения тишиной нет (на iPhone оно занимало 4,5–19,7 с на 30 слотов и держало «озвучку не готова» до WORDS_WAIT_MS);
//  • ЗАПАСНОЙ — <audio>-слоты (wordLaneSlots.js): нет Web Audio / он выключен, декодирование не вышло, файл длиннее 20 с, скорость голоса урока не 1× (элемент сохраняет тон) и клипы записи автора (prepareClips:
//    файл декодируется, режется на клипы-WAV, каждый играет свой <audio>, «разбуженный» в тапе «Начать»).
// Раньше высказывания играли из ОДНОГО mp3 перемоткой (currentTime) — на iPhone это ненадёжно (readyState 0 до play, перемотка до загрузки игнорируется), поэтому клипы нарезаны.
import { getVoiceRate } from '../../lessonVolume.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { webAudioOn, closeGameCtx } from '../../../../shared/lib/gameAudioCtx.js'
import { stopGameBuffers } from '../../../../shared/lib/gameBufferPlay.js'
import { monoOf, speechOfUrl, decodeBytes, fetchBlob, measureSpeech, dropFetched, dropBuffers, bufferOfUrl } from './wordLaneFetch.js'
import { sliceToWav, spanKey } from './wordLaneWav.js'
import { wordBuffer, wordBufferMs as bufferMsOf, wordBufferInfo, playWordBuffer, registerWordBuffer, forgetWordBuffers, dropSoundBuffers } from './wordLaneBuffers.js'
import { ensureSlots, currentSlots, setSlotsState, slotsState, wake, attach, rewakeSlots, playSlot, slotInfo, slotHasUrl, releaseSlots } from './wordLaneSlots.js'

export { monoOf, speechOfUrl } // скачивание и измерение озвучки — wordLaneFetch.js (качать можно ещё в тапе, до создания слотов)
export { sliceToWav, spanKey, FADE_IN_S, FADE_OUT_S } from './wordLaneWav.js'
export { WAKE_WAIT_MS } from './wordLaneSlots.js'

/** Ключ слота слова из библиотеки */
export const wordSlotKey = key => `w:${key}`

let generation = 0 // растёт при каждом release: поздний ответ сети не создаёт слот в уже закрытой игре

/** Слово играет элементом, а не буфером: скорость голоса не 1× (у элемента тон сохраняется) и элемент готов */
const elementPreferred = k => getVoiceRate() !== 1 && slotHasUrl(k)

/** Повторный прогрев слотов <audio> после прерывания аудиосессии (в жесте). Буферам он не нужен — контекст открывает unlockGameCtx (wordLaneStart.js). Возвращает число слотов */
export const rewakeClips = rewakeSlots

/**
 * Запасной слот под ключ: файл не стал буфером (декодирование не вышло / длиннее 20 с). Создаётся ПОСЛЕ жеста — пробуждение может быть отклонено (звук тогда пойдёт после ближайшего прогрева), это лучше тишины.
 */
function fallbackSlot(key, blob, url) {
  const set = ensureSlots()
  const e = wake(key)
  attach(set, e, blob ? URL.createObjectURL(blob) : url, !!blob)
}

/**
 * Из тапа «Начать» (жест!): звуки кусков и реплик из библиотеки — items: [{ key (wordKey), url }]. Файл скачивается blob-ом (fetchBlob делит результат с прогревом на карточке), декодируется и измеряется (measureSpeech:
 * где в файле звучит голос + AudioBuffer). Слоты <audio> создаются и будятся сразу (play тишины — только в жесте) лишь когда они нужны: нет Web Audio или скорость голоса не 1×; для остальных они появляются
 * позже, только если декодирование не вышло. after — промис, которого дождаться перед скачиванием (фоновые файлы идут после нужных к старту). Возвращает промис «готово»: все буферы декодированы, а слоты,
 * у которых буфера нет, ещё и разбужены тишиной.
 */
export function prepareWords(items, { after = null } = {}) {
  if (!items?.length) return Promise.resolve(false)
  const buffers = webAudioOn()
  const elements = typeof Audio !== 'undefined' && (!buffers || getVoiceRate() !== 1)
  if (!buffers && !elements) return Promise.resolve(false)
  const gen = generation
  let set = null
  if (elements) { try { set = ensureSlots(); items.forEach(it => wake(wordSlotKey(it.key))) } catch { releaseClips(); return Promise.resolve(false) } }
  items.forEach(it => registerWordBuffer(wordSlotKey(it.key), it.url))
  return Promise.all(items.map(async it => {
    const key = wordSlotKey(it.key)
    const e = set?.els.get(key)
    try {
      if (after) await after.catch(() => {})
      if (!e && bufferOfUrl(it.url)) return // уже декодирован (прогрев на карточке / пауза): ни сети, ни слота
      const blob = await fetchBlob(it.url)
      if (e) attach(set, e, URL.createObjectURL(blob), true)
      await measureSpeech(it.url, blob).catch(() => {}) // где в файле звучит голос (+ буфер при Web Audio); не вышло — играем по длине из библиотеки
      if (buffers && !e && !bufferOfUrl(it.url) && gen === generation) fallbackSlot(key, blob)
    } catch {
      if (e) attach(set, e, it.url, false) // прямая ссылка: браузер докачает при play()
      else if (buffers && gen === generation) fallbackSlot(key, null, it.url)
    }
  })).then(() => Promise.all([...(currentSlots()?.els.entries() ?? [])].filter(([k]) => !wordBuffer(k)).map(([, e]) => e.woke)).then(() => true), () => false) // «готово» — буферы декодированы, а слоты без буфера разбужены тишиной
}

/**
 * Из тапа «Начать» (жест!): слоты под каждый отрезок записи автора (фраза целиком), а в фоне файл декодируется и нарезается. spans — [{ start, end }] в секундах файла.
 * Возвращает промис «готово» (true — нарезано; false — не вышло: диктор играет запасным путём). Без поддержки — тихо false. Запись автора остаётся на <audio> (файл может быть длинным).
 */
export function prepareClips(src, spans) {
  if (!src || !spans?.length || typeof Audio === 'undefined') return Promise.resolve(false)
  const uniq = [...new Map(spans.map(s => [spanKey(s), s])).values()]
  let set
  try { set = ensureSlots(); uniq.forEach(s => wake(`s:${spanKey(s)}`)) } catch { releaseClips(); return Promise.resolve(false) }
  return decodeAndSlice(src, uniq, set).then(ok => { setSlotsState(set, ok ? 'ready' : 'failed'); return ok })
}

async function decodeAndSlice(src, uniq, set) {
  try {
    const audio = await decodeBytes(await (await fetch(src)).arrayBuffer())
    if (!audio || currentSlots() !== set) return false
    const mono = monoOf(audio)
    for (const s of uniq) attach(set, set.els.get(`s:${spanKey(s)}`), URL.createObjectURL(new Blob([sliceToWav(mono, audio.sampleRate, s.start, s.end)], { type: 'audio/wav' })), true)
    pLog(`[word-lane] клипы записи нарезаны: ${uniq.length} шт., файл ${audio.duration.toFixed(1)} с`)
    return true
  } catch (err) {
    pLog(`[word-lane] клипы записи не нарезались (${err?.name ?? err}) — играем перемоткой файла`)
    return false
  }
}

/** Клип записи автора по отрезку (слот <audio>) */
export const playClip = span => playSlot(`s:${spanKey(span)}`)

/**
 * Озвучка куска / реплики из библиотеки по ключу слова (wordKey). Буфер — через Web Audio (если скорость голоса 1× или элемента нет), иначе <audio>-слот. false — нечем играть (вызывающий идёт запасным путём).
 * onResult(res) — один раз: { play, ms, ... } ('started' у буфера, 'ok' / 'rejected' / 'no-playing' / 'pending' у <audio>); onStart() — звук стартовал (у буфера — по факту; у <audio> — когда play() вызван).
 */
export function playWordSlot(key, onResult = null, onStart = null) {
  const k = wordSlotKey(key)
  if (!elementPreferred(k) && playWordBuffer(k, onResult, onStart)) return true
  return playSlot(k, onResult, onStart)
}

/** Состояние слота озвучки куска по ключу слова. У буфера: prepared (декодирован), buffer: true, ms, ctx — состояние игрового контекста */
export function wordSlotInfo(key) {
  const k = wordSlotKey(key)
  const b = elementPreferred(k) ? null : wordBufferInfo(k)
  const info = slotInfo(k)
  return b ? { ...info, exists: true, hasUrl: true, prepared: true, wokeAt: 0, wokeErr: null, wokeNote: null, wakePending: false, ...b } : info
}
/** Есть ли готовая озвучка куска (буфер или слот с подгруженным звуком) */
export const hasWordSlot = key => !!wordBuffer(wordSlotKey(key)) || slotHasUrl(wordSlotKey(key))
/** Длительность озвучки куска по буферу, мс при скорости rate (0 — буфера нет) */
export const wordBufferMs = (key, rate = 1) => bufferMsOf(wordSlotKey(key), rate)

export const clipsState = slotsState

/** Игра закрыта (или поставлена на паузу: keepBuffers — декодированные звуки остаются, «Продолжить» не декодирует заново). Всё идущее обрывается, слоты и скачанное отпускаются */
export function releaseClips({ keepBuffers = false } = {}) {
  generation += 1
  stopGameBuffers()
  dropFetched() // и то, что скачано заранее в тапе (prefetchWords), даже если слоты так и не создали (микрофон не дали)
  releaseSlots()
  if (keepBuffers) return
  dropBuffers(); forgetWordBuffers(); dropSoundBuffers()
  closeGameCtx()
}
