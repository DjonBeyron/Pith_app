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
import { settle, clearSettled, forgetSettled, settledOf } from './wordLaneSettled.js'

export const MEASURE_PARALLEL = 3 // сколько файлов измеряется (декодируется) одновременно
export const MEASURE_BREATH_MS = 0 // передышка основному потоку после каждого замера
export const FETCH_TIMEOUT_MS = 12000   // скачивание не завершилось за это время (iOS заморозил соединение при сворачивании — промис висит вечно): считаем сбоем, запись забывается, следующий вызов качает заново
export const MEASURE_TIMEOUT_MS = 10000 // декодирование не завершилось (decodeAudioData после фона может не вернуться): иначе занятое место в очереди замеров не освободилось бы никогда, и все следующие файлы стояли бы
export const STALE_PENDING_MS = 3000   // небольшой файл не скачивается дольше этого — запрос завис (сворачивание): при страховке старта его бросаем и качаем заново, а не ждём таймаута
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
export function dropWarmed(urls) { for (const u of urls) { bufferCache.delete(u); longFiles.delete(u); blobs.delete(u); pendingSince.delete(u) } forgetSettled(urls) }

/**
 * «Страховка второго запуска» (v3.3.113): реестру прогрева (wordLaneSettled.js) не верим. Для каждого файла списка: отметка 'fail' (докачка оборвана сворачиванием — ворота иначе открылись бы без данных) или отметка 'ok' без буфера
 * в памяти (Web Audio включён, файл не «длинный») сбрасывается — prefetchWords сразу после этого скачает и декодирует его заново, а ворота подождут настоящего результата. → { failed, noBuffer, stuck } (сколько файлов сброшено по какой причине; stuck — запрос завис дольше STALE_PENDING_MS и брошен)
 */
export function reviveWarm(items, { now = () => performance.now() } = {}) {
  const out = { failed: 0, noBuffer: 0, stuck: 0 }
  const urls = new Set((items ?? []).map(i => i?.url).filter(Boolean))
  for (const u of urls) {
    const st = settledOf(u)
    const since = pendingSince.get(u)
    if (since != null && st == null && now() - since > STALE_PENDING_MS) { blobs.delete(u); measuring.delete(u); pendingSince.delete(u); out.stuck += 1; continue } // зависший запрос брошен: prefetchWords начнёт новый
    if (st === 'fail') { forgetSettled([u]); out.failed += 1 }
    else if (st === 'ok' && webAudioOn() && !bufferCache.has(u) && !longFiles.has(u)) { forgetSettled([u]); out.noBuffer += 1 }
  }
  return out
}

/** Голос в файле по ссылке: { lead, ms } или null (файл ещё не измеряли / не вышло) */
export const speechOfUrl = url => speechCache.get(url) ?? null

export const decodeBytes = async bytes => {
  const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
  return Ctx ? new Ctx(1, 1, 44100).decodeAudioData(bytes) : null
}

const measuring = new Map() // адрес → промис замера (один замер на файл, даже если просят дважды)
let active = 0
const waiting = []         // очередь замеров, когда уже идут MEASURE_PARALLEL
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: нет ответа за ${ms} мс`)), ms) })]).finally(() => clearTimeout(t)) }
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
    const run = slot().then(() => within(measure(url, blob), MEASURE_TIMEOUT_MS, 'декодирование')).then(() => settle(url, 'ok'), e => { settle(url, 'fail'); throw e }).finally(() => { measuring.delete(url); return new Promise(r => setTimeout(r, MEASURE_BREATH_MS)).then(free) })
    measuring.set(url, run)
  }
  return measuring.get(url)
}

const blobs = new Map() // адрес → промис скачанного файла
const pendingSince = new Map() // адрес → когда началось скачивание, пока оно не завершилось (reviveWarm бросает зависшие)

/** Скачать файл один раз (blob). Не вышло — запись забывается (следующий вызов попробует заново), вызывающий получает отказ */
export function fetchBlob(url) {
  let p = blobs.get(url)
  if (!p) {
    p = within(fetch(url).then(res => { if (!res.ok) throw new Error(`http ${res.status}`); return res.blob() }), FETCH_TIMEOUT_MS, 'скачивание')
    blobs.set(url, p)
    pendingSince.set(url, performance.now())
    p.then(() => { if (blobs.get(url) === p) pendingSince.delete(url) }, () => { if (blobs.get(url) === p) pendingSince.delete(url) })
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
export function dropFetched() { blobs.clear(); pendingSince.clear() }
