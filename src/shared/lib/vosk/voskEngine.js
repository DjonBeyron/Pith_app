// Эксперимент 10: движок Vosk (vosk-browser, WASM) с ЗАКРЫТЫМ словарём — распознавание на устройстве, где движок выбирает
// только из заданных фраз. Грузится ТОЛЬКО по кнопке: динамический import уводит библиотеку (≈6 МБ) в отдельный чанк.
// Модель скачивает и хранит само приложение (voskDownload.js / voskStorage.js), сюда она приходит готовым Blob и
// передаётся библиотеке через blob-URL. Без React. Звук никуда не отправляется и не сохраняется.
import { deleteLibraryStore } from './voskStorage.js'
import { autoStopDue, TAIL_SILENCE_MS, DRAIN_MAX_MS, VOICE_RMS } from './voskTiming.js'
import { feedSilence, feedSamples } from './voskTail.js'
import { createGate } from './voskGate.js'
import { createAudioSession } from '../speech/speechAudioSession.js'

const CHUNK = 4096 // кадров на один вызов ScriptProcessor (по умолчанию; модуль «Сказать фразу» просит 2048 — уровень голоса чаще)
const CHUNKS = [1024, 2048, 4096, 8192] // допустимые размеры opts.chunk
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

/** RMS 0..1 одного куска звука (AudioBuffer из onaudioprocess, первый канал). Нет данных → 0. Берём каждый второй кадр — дёшево, а для уровня голоса хватает */
export function bufferRms(buf) {
  let d
  try { d = buf?.getChannelData?.(0) } catch { d = null }
  const n = d?.length || 0
  if (!n) return 0
  let sum = 0
  for (let i = 0; i < n; i += 2) sum += d[i] * d[i]
  return Math.min(1, Math.sqrt(sum / Math.ceil(n / 2)))
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
 * cb: onPartial(text), onResult(text, stats), onError(msg); необязательные onReady({ micMs }) — микрофон открыт и звук пошёл в движок (аналог audiostart),
 * onLevel(rms 0..1) — громкость каждого куска звука (тот же поток, второго getUserMedia нет). onResult приходит на endpoint Vosk (пауза в речи), по авто-стопу либо после stop().
 * opts: autoStopMs (>0 — сами просим итог, когда текст partial не менялся столько мс), maxMs (потолок записи), session ('play-and-record' — на время записи
 * ставим тип аудиосессии iOS, потом 'auto'; без API молча пропускаем), chunk (кадров на кусок: 1024/2048/4096/8192, по умолчанию 4096).
 * Сбой настройки после открытия микрофона (AudioContext, распознаватель) не оставляет микрофон и сессию занятыми: всё освобождается, ошибка летит наружу.
 * stats: { firstPartialMs, resultMs (от старта записи), afterStopMs, chunks, loadPct, words (СЫРЫЕ слова Vosk: слово, conf, start, end), micMs (getUserMedia), readyMs (от нажатия до первого звука),
 * audioStartMs (когда пошёл звук, от старта записи), stopBy: endpoint | auto | manual | max, session, tailMs (сколько мс тишины досланы перед итогом), drainMs (сколько ждали последний кусок звука
 * после остановки), chunkMs (длина куска звука), maxGapMs / lateChunks (самый долгий промежуток между кусками и сколько кусков пришло с опозданием — провалы звука при занятой странице) } —
 * loadPct: доля реального времени, которую главный поток тратит на передачу звука воркеру (сам распознаватель работает в воркере — его нагрузку страница не видит).
 * Для «Сказать фразу» (медленная речь): gate (true — voskGate.js не отдаёт декодеру тишину дольше ≈0,4 с подряд, иначе его эндпойнтер сам обрывает запись на паузе 0,5–2 с), cleanPartial (как
 * считать текст для авто-стопа: без [unk] — «слово услышано» только настоящее), isComplete(текст) → true, когда в partial уже вся фраза: затвор открывается, а авто-стоп ждёт completeMs вместо autoStopMs
 * (stopBy 'full'). stats.gatedMs — сколько мс тишины не отдали движку.
 * Остановка: по тапу (manual) сначала дожидаемся ещё одного куска звука (до DRAIN_MAX_MS) — иначе последние до 128 мс речи, что сидят в буфере ScriptProcessor, пропали бы (авто-стоп и потолок
 * этого не требуют: перед ними была пауза без голоса); потом выключаем микрофон, досылаем TAIL_SILENCE_MS тишины (иначе Vosk не отдаёт слабое конечное слово) и только тогда просим итог.
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
  let ctx, rec
  try {
    try { ctx = new Ctx({ sampleRate: 16000 }) } catch { ctx = new Ctx() }
    try { Promise.resolve(ctx.resume?.()).catch(() => {}) } catch { /* контекст и так работает */ }
    rec = new model.KaldiRecognizer(ctx.sampleRate, grammar)
  } catch (e) { // модель могли выгрузить, AudioContext не создался: микрофон и аудиосессию отпускаем
    stream.getTracks().forEach(tr => tr.stop())
    try { Promise.resolve(ctx?.close?.()).catch(() => {}) } catch { /* нечего закрывать */ }
    release()
    throw e
  }
  try { rec.setWords(true) } catch { /* без пословных меток */ }
  const t0 = performance.now()
  const st = { firstPartialMs: null, chunks: 0, workMs: 0, audioMs: 0, stopAt: null, done: false, text: '', changeAt: null, stopBy: null, audioStartMs: null, readyMs: null,
    finalizing: false, drain: null, complete: false, prev: null, voiceAt: null, lastChunkAt: null, maxGapMs: 0, lateChunks: 0, chunkMs: null, tailMs: 0, drainMs: null }
  let timer = null
  const free = () => {
    st.done = true
    clearInterval(timer); clearTimeout(st.drain)
    stream.getTracks().forEach(tr => tr.stop())
    try { node.disconnect(); src.disconnect() } catch { /* уже отключены */ }
    try { Promise.resolve(ctx.close()).catch(() => {}) } catch { /* уже закрыт */ }
    try { rec.remove() } catch { /* уже удалён */ }
    release()
  }
  rec.on('partialresult', m => {
    if (st.done || !m.result.partial) return
    st.firstPartialMs ??= ms(t0)
    const text = opts.cleanPartial ? opts.cleanPartial(m.result.partial) : m.result.partial
    if (text !== st.text) { st.text = text; st.changeAt = performance.now(); st.complete = !!(text && opts.isComplete?.(text)) }
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
      tailMs: st.tailMs, drainMs: st.drainMs, chunkMs: st.chunkMs, maxGapMs: Math.round(st.maxGapMs), lateChunks: st.lateChunks, gatedMs: gate?.droppedMs ?? 0,
    })
    free()
  })
  rec.on('error', m => { if (!st.done) { cb.onError(m.error || 'ошибка Vosk'); free() } })
  const gate = opts.gate ? createGate() : null
  const node = ctx.createScriptProcessor(CHUNKS.includes(opts.chunk) ? opts.chunk : CHUNK, 1, 1)
  const src = ctx.createMediaStreamSource(stream)
  node.onaudioprocess = ev => {
    if (st.done || st.finalizing) return
    const t = performance.now()
    const dur = ev.inputBuffer.duration * 1000
    if (st.audioStartMs == null) { // первый кусок звука: когда началась запись (минус длина самого куска)
      st.audioStartMs = Math.max(0, ms(t0) - Math.round(dur)); st.readyMs = Math.max(0, ms(tap) - Math.round(dur)); st.chunkMs = Math.round(dur)
    }
    if (st.lastChunkAt != null) { // промежуток между кусками заметно больше длины куска — страница была занята, часть звука могла пропасть
      const gap = t - st.lastChunkAt
      st.maxGapMs = Math.max(st.maxGapMs, gap)
      if (gap > dur * 1.5) st.lateChunks++
    }
    st.lastChunkAt = t
    const rms = bufferRms(ev.inputBuffer)
    if (rms >= VOICE_RMS) st.voiceAt = t
    if (cb.onLevel) { try { cb.onLevel(rms) } catch { /* уровень не должен мешать распознаванию */ } }
    const g = gate ? gate.push(rms, dur, { open: st.complete }) : null
    if (g?.preroll && st.prev) feedSamples(rec, st.prev, ctx.sampleRate) // голос вернулся после долгой тишины: предыдущий кусок мог начинать слово тише порога
    st.prev = null
    if (!g || g.feed) { try { rec.acceptWaveform(ev.inputBuffer) } catch (e) { cb.onError(`acceptWaveform: ${e?.message || e}`) } }
    else { try { st.prev = new Float32Array(ev.inputBuffer.getChannelData(0)) } catch { /* без предзвука */ } }
    st.workMs += performance.now() - t
    st.audioMs += dur
    st.chunks++
    if (st.stopAt != null) finalize() // остановку просили раньше: этот кусок — последний, дальше хвост тишины и итог
  }
  src.connect(node)
  node.connect(ctx.destination) // без подключения к выходу ScriptProcessor в части браузеров не вызывается (на выход идёт тишина)
  try { cb.onReady?.({ micMs }) } catch { /* подписчик не должен ломать запись */ }
  const finalize = () => { // последний кусок звука доставлен (или вышло время ожидания): выключаем микрофон, досылаем тишину, просим итог
    if (st.done || st.finalizing) return
    st.finalizing = true
    clearTimeout(st.drain)
    st.drainMs = ms(st.stopAt)
    stream.getTracks().forEach(tr => tr.stop())
    st.tailMs = feedSilence(rec, ctx.sampleRate, TAIL_SILENCE_MS)
    try { rec.retrieveFinalResult() } catch { free(); cb.onResult('', {}) }
  }
  const stop = (why = 'manual') => { // «Стоп» (или авто-стоп): просим итог по накопленному звуку
    if (st.done || st.stopAt != null) return
    st.stopAt = performance.now(); st.stopBy = why
    clearInterval(timer)
    if (why === 'manual') st.drain = setTimeout(finalize, DRAIN_MAX_MS) // тап: речь могла оборваться на слове, в буфере остался её хвост — ждём кусок
    else finalize() // авто-стоп / потолок: перед этим уже была пауза без голоса, буфер пуст
  }
  if (opts.autoStopMs > 0 || opts.maxMs > 0) {
    timer = setInterval(() => {
      const why = autoStopDue({ now: performance.now(), startedAt: t0, lastChangeAt: st.changeAt, text: st.text, autoStopMs: opts.autoStopMs, maxMs: opts.maxMs, lastVoiceAt: st.voiceAt, complete: st.complete, completeMs: opts.completeMs })
      if (why) stop(why)
    }, 100)
  }
  return { stop: () => stop('manual'), cancel() { if (!st.done) free() } }
}
