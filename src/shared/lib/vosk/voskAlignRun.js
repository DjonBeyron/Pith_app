// Разметка рта для СВОЕГО файла озвучки (voskAlign.js): часть с движком — декодирование файла, модель Vosk нужного языка и распознавание ГОТОВОГО буфера (не микрофона).
// Путь микрофона (voskEngine.startListening, слушатели игры) не тронут: здесь отдельный распознаватель на той же модели — тем же приёмом, что прогрев (voskWarmRec.js: KaldiRecognizer → feedSamples → итог).
//  • decodeAudio — свой OfflineAudioContext админки (игровой контекст звука не трогаем): файл декодируется сразу в 16 кГц (частота моделей), каналы сводятся в моно.
//    Браузер не даёт 16 кГц — декодируем на 44,1 кГц: распознаватель принимает любую частоту (как у микрофона — частота контекста).
//  • recognizeBuffer — звук уходит воркеру кусками, следом тишина (иначе Vosk не отдаёт слабое последнее слово) и запрос итога. Воркер отвечает на КАЖДЫЙ кусок одним сообщением (partialresult либо result
//    на паузе речи), на запрос итога — ещё одним result: слова собираются из всех result (времена — от начала записи), конец — первое result после того, как пришли ответы на все куски.
//    Запас: тишина от воркера дольше idleMs после запроса итога — берём, что собрано; общий потолок timeoutMs — ошибка (вызывающий достроит по громкости).
//  • alignModel — модель языка: уже в памяти → берём; иначе из кэша телефона, нет в кэше — скачать штатным загрузчиком (voskDownload.getModel: проверка архива, сохранение в кэш) и прогреть штатным
//    прогревом (voskRuntimes.acquireModel / runtimeOf: тот же счётчик владельцев, что у игры). Режим «Только системное» прогрев не греет — тогда модель грузится в память на одну разметку и выгружается.
import { feedSamples, feedSilence } from './voskTail.js'
import { runtimeOf, acquireModel } from './voskRuntimes.js'
import { modelUrlOf } from './voskConfigRu.js'
import { getModel } from './voskDownload.js'
import { loadEngine, unloadEngine } from './voskEngine.js'
import { errorText } from './voskErrors.js'
import { readSayEngine } from '../speech/sayEngineMode.js'

export const ALIGN_RATE = 16000
export const TAIL_MS = 700
export const RECOGNIZE_TIMEOUT_MS = 20000
export const MODEL_TIMEOUT_MS = 90000

/** Файл (ArrayBuffer) → { samples (Float32Array, моно), rate, duration (с) }. Не звук / нет Web Audio — ошибка с понятным текстом */
export async function decodeAudio(arrayBuffer, { Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext } = {}) {
  if (!Offline) throw new Error('в этом браузере нет Web Audio — файл не разобрать')
  let buf = null, err = null
  for (const rate of [ALIGN_RATE, 44100]) {
    try {
      const ctx = new Offline(1, 1, rate)
      buf = await new Promise((ok, no) => { const p = ctx.decodeAudioData(arrayBuffer.slice(0), ok, no); if (p?.then) p.then(ok, no) })
      break
    } catch (e) { err = e }
  }
  if (!buf?.length) throw new Error(`файл не декодируется как звук${err?.message ? ` (${err.message})` : ''}`)
  const n = buf.length, ch = buf.numberOfChannels, samples = new Float32Array(n)
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) samples[i] += d[i] / ch }
  return { samples, rate: buf.sampleRate, duration: n / buf.sampleRate }
}

/**
 * Распознать готовый звук по словарю grammar (JSON). → { words: [{ word, start, end, conf }] (сырые слова Vosk, времена в секундах от начала записи), ms, events, by: 'final' | 'idle' }.
 * Бросает: распознаватель не создаётся, ошибка воркера, не уложился в timeoutMs.
 */
export function recognizeBuffer(model, samples, rate, grammar, { timeoutMs = RECOGNIZE_TIMEOUT_MS, chunkMs = 250, tailMs = TAIL_MS, idleMs = 3000, setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now() } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = now()
    const rec = grammar ? new model.KaldiRecognizer(rate, grammar) : new model.KaldiRecognizer(rate)
    try { rec.setWords(true) } catch { /* без пословных меток итог пустой — вызывающий достроит */ }
    const words = []
    let events = 0, fed = 0, asked = false, done = false, idle = 0
    const finish = (by, err) => {
      if (done) return
      done = true
      clearTimer(idle); clearTimer(cap)
      try { rec.remove() } catch { /* уже удалён */ }
      if (err) reject(err); else resolve({ words, ms: Math.round(now() - t0), events, by })
    }
    const cap = setTimer(() => finish('timeout', new Error(`Vosk не успел за ${Math.round(timeoutMs / 1000)} с`)), timeoutMs)
    const onEvent = (m, isResult) => {
      if (done) return
      events++
      if (isResult) for (const w of m?.result?.result ?? []) words.push(w)
      if (!asked) return
      if (isResult && events > fed) return finish('final')
      clearTimer(idle); idle = setTimer(() => finish('idle'), idleMs)
    }
    rec.on('result', m => onEvent(m, true))
    rec.on('partialresult', m => onEvent(m, false))
    rec.on('error', m => finish('error', new Error(m?.error || 'ошибка Vosk')))
    const step = Math.max(1, Math.round((rate * chunkMs) / 1000))
    for (let i = 0; i < samples.length; i += step) if (feedSamples(rec, samples.subarray(i, Math.min(samples.length, i + step)), rate)) fed++
    if (feedSilence(rec, rate, tailMs)) fed++
    try { rec.retrieveFinalResult() } catch (e) { return finish('error', e) }
    asked = true
    idle = setTimer(() => finish('idle'), Math.max(idleMs, timeoutMs / 2)) // первый ответ может идти долго: воркер разбирает всю запись
  })
}

const timeout = (p, ms, text) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error(text)), ms); p.then(v => { clearTimeout(t); ok(v) }, e => { clearTimeout(t); no(e) }) })

/**
 * Модель языка lang ('ru' | 'en') для разметки. → { model, release() }. onStep(текст) — ход («загружаю модель…»). Бросает ошибку с причиной для человека (нет сети, архив не тот, не успела).
 * release() обязателен: отпускает модель (прогрев выгрузит её сам через 30 с, как после игры).
 */
export async function alignModel(lang, { onStep = () => {}, timeoutMs = MODEL_TIMEOUT_MS, rt = runtimeOf(lang), acquire = () => acquireModel('align', lang), url = modelUrlOf(lang), fetchModel = getModel, mode = readSayEngine, load = loadEngine, unload = unloadEngine } = {}) {
  const name = lang === 'ru' ? 'русскую' : 'английскую'
  if (rt.getModel()) { const release = acquire(); return { model: rt.getModel(), release } }
  const work = (async () => {
    onStep(`загружаю ${name} модель Vosk…`)
    let got
    try { got = await fetchModel(url, { allowNetwork: true, onProgress: p => { if (p?.total > 0) onStep(`загружаю ${name} модель Vosk… ${Math.floor((p.loaded / p.total) * 100)} %`) } }) } catch (e) { throw new Error(`модель Vosk не скачалась: ${errorText(e)}`) }
    onStep(`готовлю ${name} модель Vosk…`)
    if (mode() === 'system') { const r = await load(got.blob); return { model: r.model, release: () => unload(r.model) } }
    const release = acquire()
    rt.warmNow('tap')
    const s = await rt.whenSettled(timeoutMs)
    if (s.ok && rt.getModel()) return { model: rt.getModel(), release }
    release()
    throw new Error(`модель Vosk не загрузилась в память: ${s.text ?? 'без подробностей'}`)
  })()
  return timeout(work, timeoutMs, `модель Vosk не успела загрузиться за ${Math.round(timeoutMs / 1000)} с`).catch(e => { work.then(r => r.release(), () => {}); throw e }) // опоздавшую модель отпускаем
}
