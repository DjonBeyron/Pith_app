// Эксперимент 10: движок Vosk (vosk-browser, WASM) с ЗАКРЫТЫМ словарём — распознавание на устройстве, где движок выбирает
// только из заданных фраз. Грузится ТОЛЬКО по кнопке: динамический import уводит библиотеку (≈6 МБ) в отдельный чанк.
// Модель скачивает и хранит само приложение (voskDownload.js / voskStorage.js), сюда она приходит готовым Blob и
// передаётся библиотеке через blob-URL. Без React. Звук никуда не отправляется и не сохраняется.
import { deleteLibraryStore } from '../../../shared/lib/vosk/voskStorage.js'
import { autoStopDue } from './voskTiming.js'
import { createAudioSession } from '../../../shared/lib/speech/speechAudioSession.js'

const CHUNK = 4096 // кадров на один вызов ScriptProcessor
const LOAD_TIMEOUT_MS = 180000

const ms = t0 => Math.round(performance.now() - t0)

/** Приблизительная память страницы, МБ (только Chrome: performance.memory; воркер с моделью сюда НЕ входит) */
export function heapMb(perf = globalThis.performance) {
  const u = perf?.memory?.usedJSHeapSize
  return u > 0 ? Math.round(u / 1048576) : null
}

/** Библиотека (отдельный чанк). UMD-сборка отдаёт Model либо в самом модуле, либо в default, либо в globalThis.Vosk */
export async function importVosk() {
  const mod = await import('vosk-browser')
  const api = typeof mod.Model === 'function' ? mod : typeof mod.default?.Model === 'function' ? mod.default : globalThis.Vosk
  if (!api || typeof api.Model !== 'function') throw new Error('vosk-browser загрузился без класса Model')
  return api
}

/** Остановить модель: просим воркер освободить память и закрыться, и сразу гасим сам воркер (если завис на распаковке) */
export function killModel(model) {
  try { model.terminate() } catch { /* уже остановлен */ }
  try { model.worker?.terminate() } catch { /* уже остановлен */ }
}

// Модель сама НЕ сообщает о битом/отсутствующем архиве (createModel из библиотеки в этом случае висит вечно) — поэтому свой Model:
// ждём 'load' / 'error', есть таймаут и отмена
function openModel(api, url, ctl) {
  return new Promise((resolve, reject) => {
    const model = new api.Model(url)
    const fail = msg => { clearTimeout(timer); killModel(model); reject(new Error(msg)) }
    const timer = setTimeout(() => fail('Модель не загрузилась в память за 3 минуты: архив должен быть tar.gz с папкой модели внутри'), LOAD_TIMEOUT_MS)
    ctl.cancel = () => fail('Загрузка отменена')
    model.on('load', m => { if (m.result) { clearTimeout(timer); resolve(model) } else fail('Vosk не смог прочитать архив модели') })
    model.on('error', m => fail(m.error ? `Ошибка загрузки модели: ${m.error}` : 'Ошибка загрузки модели: архив не похож на модель Vosk (в нём нет файлов модели)'))
  })
}

/**
 * Модель (Blob архива) → в память движка. onStage('lib' | 'model'); ctl.cancel() отменяет.
 * Архив библиотеке отдаётся через blob-URL (она сама качает адрес воркером); URL освобождается сразу после загрузки.
 * Возвращает { model, libMs, modelMs, size, heap } — modelMs это ТОЛЬКО «в память» (распаковка + загрузка), без скачивания.
 */
export async function loadEngine(blob, onStage = () => {}, ctl = {}) {
  onStage('lib')
  let t = performance.now()
  const api = await importVosk()
  const libMs = ms(t)
  onStage('model')
  await deleteLibraryStore() // остатки прошлой распаковки (библиотека хранит её в IndexedDB по адресу; у blob-URL адрес каждый раз новый)
  const objUrl = URL.createObjectURL(blob)
  t = performance.now()
  try {
    const model = await openModel(api, objUrl, ctl)
    return { model, libMs, modelMs: ms(t), size: blob.size, heap: heapMb() }
  } catch (e) {
    setTimeout(() => { deleteLibraryStore() }, 600) // не загрузилась — недоразобранную копию в IndexedDB тоже убираем
    throw e
  } finally { URL.revokeObjectURL(objUrl) }
}

/** «Выгрузить движок»: остановить модель и воркер, стереть распакованную копию из IndexedDB */
export function unloadEngine(model) {
  if (model) killModel(model)
  setTimeout(() => { deleteLibraryStore() }, 600) // воркеру нужно закрыть базу
}

/**
 * Один сеанс слушания. Вызывать прямо в тапе (getUserMedia нужен жест). Возвращает { stop, cancel }.
 * cb: onPartial(text), onResult(text, stats), onError(msg). onResult приходит на endpoint Vosk (пауза в речи), по авто-стопу либо после stop().
 * opts: autoStopMs (>0 — сами просим итог, когда текст partial не менялся столько мс), maxMs (потолок записи), session ('play-and-record' — на время записи
 * ставим тип аудиосессии iOS, потом 'auto'; без API молча пропускаем).
 * stats: { firstPartialMs, resultMs (от старта записи), afterStopMs, chunks, loadPct, words, micMs (getUserMedia), readyMs (от нажатия до первого звука),
 * audioStartMs (когда пошёл звук, от старта записи), stopBy: endpoint | auto | manual | max, session } — loadPct: доля реального времени,
 * которую главный поток тратит на передачу звука воркеру (сам распознаватель работает в воркере — его нагрузку страница не видит).
 */
export async function startListening(model, grammar, cb, opts = {}) {
  const tap = performance.now()
  const ses = opts.session ? createAudioSession() : null
  const held = ses && ses.set(opts.session)
  const release = () => { if (held) ses.set('auto') }
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  } catch (e) { release(); throw e }
  const micMs = ms(tap)
  const Ctx = window.AudioContext || window.webkitAudioContext
  let ctx
  try { ctx = new Ctx({ sampleRate: 16000 }) } catch { ctx = new Ctx() }
  const rec = new model.KaldiRecognizer(ctx.sampleRate, grammar)
  try { rec.setWords(true) } catch { /* без пословных меток */ }
  const t0 = performance.now()
  const st = { firstPartialMs: null, chunks: 0, workMs: 0, audioMs: 0, stopAt: null, done: false, text: '', changeAt: null, stopBy: null, audioStartMs: null, readyMs: null }
  let timer = null
  const free = () => {
    st.done = true
    clearInterval(timer)
    stream.getTracks().forEach(tr => tr.stop())
    try { node.disconnect(); src.disconnect() } catch { /* уже отключены */ }
    try { ctx.close() } catch { /* уже закрыт */ }
    try { rec.remove() } catch { /* уже удалён */ }
    release()
  }
  rec.on('partialresult', m => {
    if (st.done || !m.result.partial) return
    st.firstPartialMs ??= ms(t0)
    if (m.result.partial !== st.text) { st.text = m.result.partial; st.changeAt = performance.now() }
    cb.onPartial(m.result.partial)
  })
  rec.on('result', m => {
    if (st.done) return
    const text = (m.result.text || '').trim()
    if (!text && st.stopAt == null) return // пустой результат на паузе — ждём речь дальше
    cb.onResult(text, {
      firstPartialMs: st.firstPartialMs, resultMs: ms(t0), afterStopMs: st.stopAt == null ? null : ms(st.stopAt), chunks: st.chunks,
      words: m.result.result || [], micMs, readyMs: st.readyMs, audioStartMs: st.audioStartMs, stopBy: st.stopBy ?? 'endpoint', session: held ? opts.session : null,
      loadPct: st.audioMs ? Math.round((st.workMs / st.audioMs) * 1000) / 10 : null,
    })
    free()
  })
  rec.on('error', m => { if (!st.done) { cb.onError(m.error || 'ошибка Vosk'); free() } })
  const node = ctx.createScriptProcessor(CHUNK, 1, 1)
  const src = ctx.createMediaStreamSource(stream)
  node.onaudioprocess = ev => {
    if (st.done || st.stopAt != null) return
    const t = performance.now()
    if (st.audioStartMs == null) { // первый кусок звука: когда началась запись (минус длина самого куска)
      const dur = Math.round(ev.inputBuffer.duration * 1000)
      st.audioStartMs = Math.max(0, ms(t0) - dur); st.readyMs = Math.max(0, ms(tap) - dur)
    }
    try { rec.acceptWaveform(ev.inputBuffer) } catch (e) { cb.onError(`acceptWaveform: ${e?.message || e}`) }
    st.workMs += performance.now() - t
    st.audioMs += ev.inputBuffer.duration * 1000
    st.chunks++
  }
  src.connect(node)
  node.connect(ctx.destination) // без подключения к выходу ScriptProcessor в части браузеров не вызывается (на выход идёт тишина)
  const stop = (why = 'manual') => { // «Стоп» (или авто-стоп): просим итог по накопленному звуку
    if (st.done || st.stopAt != null) return
    st.stopAt = performance.now(); st.stopBy = why
    clearInterval(timer)
    stream.getTracks().forEach(tr => tr.stop())
    try { rec.retrieveFinalResult() } catch { free(); cb.onResult('', {}) }
  }
  if (opts.autoStopMs > 0 || opts.maxMs > 0) {
    timer = setInterval(() => {
      const why = autoStopDue({ now: performance.now(), startedAt: t0, lastChangeAt: st.changeAt, text: st.text, autoStopMs: opts.autoStopMs, maxMs: opts.maxMs })
      if (why) stop(why)
    }, 100)
  }
  return { stop: () => stop('manual'), cancel() { if (!st.done) free() } }
}
