// Скачивание и измерение озвучки (слова библиотеки, реплики Пита) БЕЗ <audio>-слотов. Отделено от wordLaneClips.js, чтобы качать можно было сразу в тапе «Начать» — параллельно с открытием микрофона и ожиданием
// аудиосессии (settle): сеть и декодирование звуковую сессию не трогают, а раньше они стартовали только после settle и друг за другом (тап → микрофон → settle → скачать → измерить).
//  • fetchBlob(url) — файл скачивается один раз: повторный вызов (prefetchWords в тапе, потом prepareWords) получает тот же промис;
//  • measureSpeech(url, blob) — где в файле звучит голос (wordLaneTrim); декодирует OfflineAudioContext и считает RMS кадров на ОСНОВНОМ потоке, поэтому замеры идут не больше MEASURE_PARALLEL разом и с передышкой
//    между файлами (setTimeout 0): иначе 30 файлов подряд занимали поток на секунды (первый кадр игры замирал, на телефоне — ещё дольше);
//  • AudioBuffer: замер всё равно декодирует файл целиком — результат (AudioBuffer) сохраняется тут же (bufferOfUrl) и потом играет через Web Audio (gameBufferPlay.js): «подготовлен» = «декодирован», <audio>-слот не нужен.
//    Файлы длиннее MAX_BUFFER_S (20 с) и случаи без Web Audio остаются на <audio>; dropBuffers() — игра закрыта (при паузе буферы держим: «Продолжить» не декодирует заново).
//  • prefetchWords(items) — при показе карточки игры, в начале урока и в тапе: скачать и измерить, ничего не создавая (слоты создаёт и будит prepareWords позже, в жесте); dropFetched() — игра закрыта, скачанное отпускаем (измерения живут до перезагрузки).
import { speechBounds } from './wordLaneTrim.js'
import { webAudioOn } from '../../../../shared/lib/gameAudioCtx.js'
import { settle, clearSettled, forgetSettled } from './wordLaneSettled.js'

export const MEASURE_PARALLEL = 3 // сколько файлов измеряется (декодируется) одновременно
export const MEASURE_BREATH_MS = 0 // передышка основному потоку после каждого замера
export const MAX_BUFFER_S = 20    // длиннее — звук остаётся на <audio> (буфер float32 слишком большой для короткого клипа)

/** Моно из AudioBuffer (несколько каналов усредняются) */
export function monoOf(audioBuffer) {
  const ch = audioBuffer.numberOfChannels
  const out = new Float32Array(audioBuffer.length)
  for (let c = 0; c < ch; c++) { const d = audioBuffer.getChannelData(c); for (let i = 0; i < out.length; i++) out[i] += d[i] / ch }
  return out
}

// Где в файле слова звучит голос (wordLaneTrim): { lead, ms } в мс — тишина до слова и длина самого слова без «хвоста». Живёт до перезагрузки: файл библиотеки не меняется
const speechCache = new Map()
const bufferCache = new Map() // адрес → AudioBuffer (декодирован при замере; Web Audio включён и файл не длиннее MAX_BUFFER_S)
const longFiles = new Set()   // адреса, которые не станут буфером: не повторяем декодирование ради них

/** Декодированный звук по ссылке или null (ещё не декодировали / не вышло / длинный файл / Web Audio выключен) */
export const bufferOfUrl = url => bufferCache.get(url) ?? null
/** Игра закрыта: буферы отпускаются (измерения голоса остаются до перезагрузки) */
export function dropBuffers() { bufferCache.clear(); longFiles.clear(); clearSettled() }

/** Карточка игры закрыта: отпускаются только её файлы (буферы, скачанное, отметки «обработан»); прогрев чужой карточки остаётся */
export function dropWarmed(urls) { for (const u of urls) { bufferCache.delete(u); longFiles.delete(u); blobs.delete(u) } forgetSettled(urls) }

/** Голос в файле по ссылке: { lead, ms } или null (файл ещё не измеряли / не вышло) */
export const speechOfUrl = url => speechCache.get(url) ?? null

export const decodeBytes = async bytes => {
  const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
  return Ctx ? new Ctx(1, 1, 44100).decodeAudioData(bytes) : null
}

const measuring = new Map() // адрес → промис замера (один замер на файл, даже если просят дважды)
let active = 0
const waiting = []         // очередь замеров, когда уже идут MEASURE_PARALLEL
const slot = () => (active < MEASURE_PARALLEL ? (active++, Promise.resolve()) : new Promise(r => waiting.push(r)))
const free = () => { const next = waiting.shift(); if (next) next(); else active-- }

async function measure(url, blob) {
  const audio = await decodeBytes(await blob.arrayBuffer())
  if (!audio) return
  if (webAudioOn()) { if (audio.duration <= MAX_BUFFER_S) bufferCache.set(url, audio); else longFiles.add(url) }
  if (speechCache.has(url)) return
  const b = speechBounds(monoOf(audio), audio.sampleRate)
  speechCache.set(url, { lead: Math.round(b.start * 1000), ms: Math.round((b.end - b.start) * 1000) })
}

/** Измерить файл (blob уже скачан): повторный вызов с тем же адресом не декодирует заново. Ошибка → отклонённый промис (звук играет по длине из библиотеки) */
export function measureSpeech(url, blob) {
  if (speechCache.has(url) && (bufferCache.has(url) || longFiles.has(url) || !webAudioOn())) { settle(url, 'ok'); return Promise.resolve() }
  if (!measuring.has(url)) {
    const run = slot().then(() => measure(url, blob)).then(() => settle(url, 'ok'), e => { settle(url, 'fail'); throw e }).finally(() => { measuring.delete(url); return new Promise(r => setTimeout(r, MEASURE_BREATH_MS)).then(free) })
    measuring.set(url, run)
  }
  return measuring.get(url)
}

const blobs = new Map() // адрес → промис скачанного файла

/** Скачать файл один раз (blob). Не вышло — запись забывается (следующий вызов попробует заново), вызывающий получает отказ */
export function fetchBlob(url) {
  let p = blobs.get(url)
  if (!p) {
    p = fetch(url).then(res => { if (!res.ok) throw new Error(`http ${res.status}`); return res.blob() })
    blobs.set(url, p)
    p.catch(() => { if (blobs.get(url) === p) blobs.delete(url); settle(url, 'fail') })
  }
  return p
}

/**
 * Заранее (при показе карточки игры / в начале урока, ещё ДО тапа «Начать») и в самом тапе: items — [{ key, url }]. Все файлы качаются сразу (сеть параллельна), замеры идут по очереди; { measure: false } — только
 * скачать (прогрев урока: декодирование на главном потоке не нужно, пока игру не открыли). → промис «всё скачано и измерено» (никогда не отклоняется)
 */
export function prefetchWords(items, { measure = true } = {}) {
  if (typeof fetch === 'undefined' || !items?.length) return Promise.resolve()
  return Promise.all(items.map(it => fetchBlob(it.url).then(blob => (measure ? measureSpeech(it.url, blob) : undefined)).catch(() => {}))).then(() => undefined)
}

/** Игра закрыта: скачанные файлы отпускаются (blob-ы слотов отпускает releaseClips) */
export function dropFetched() { blobs.clear() }
