// Эксперимент 10: движок Vosk (vosk-browser, WASM) с ЗАКРЫТЫМ словарём — распознавание на устройстве, где движок выбирает
// только из заданных фраз. Грузится ТОЛЬКО по кнопке: динамический import уводит библиотеку (≈6 МБ) в отдельный чанк,
// модель (≈40 МБ) качается воркером библиотеки по URL. Без React. Звук никуда не отправляется и не сохраняется.

export const VOSK_MODEL_URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'
export const VOSK_URL_KEY = 'pithy_admin_voice_vosk_url_v1'
const CHUNK = 4096 // кадров на один вызов ScriptProcessor
const LOAD_TIMEOUT_MS = 180000

export function readModelUrl(store = globalThis.localStorage) {
  try { return store.getItem(VOSK_URL_KEY) || VOSK_MODEL_URL } catch { return VOSK_MODEL_URL }
}
export function writeModelUrl(url, store = globalThis.localStorage) {
  try { store.setItem(VOSK_URL_KEY, url) } catch { /* приватный режим */ }
}

const ms = t0 => Math.round(performance.now() - t0)

/** Библиотека (отдельный чанк). UMD-сборка отдаёт Model либо в самом модуле, либо в default, либо в globalThis.Vosk */
export async function importVosk() {
  const mod = await import('vosk-browser')
  const api = typeof mod.Model === 'function' ? mod : typeof mod.default?.Model === 'function' ? mod.default : globalThis.Vosk
  if (!api || typeof api.Model !== 'function') throw new Error('vosk-browser загрузился без класса Model')
  return api
}

/** Проверка адреса модели до загрузки (HEAD): { ok, status, size, type }; сеть/CORS не дали проверить — null (тогда пробуем грузить) */
export async function probeModel(url, fetchFn = globalThis.fetch) {
  try {
    const r = await fetchFn(url, { method: 'HEAD' })
    const n = Number(r.headers.get('content-length'))
    return { ok: r.ok !== false, status: r.status ?? null, size: n > 0 ? n : null, type: r.headers.get('content-type') || '' }
  } catch { return null }
}

/** Понятная причина, если по адресу явно не архив модели; иначе null */
export function modelProblem(p) {
  if (!p) return null
  if (!p.ok) return `По адресу модели ответ ${p.status || 'ошибка'} — проверьте адрес`
  if (/text\/html/i.test(p.type)) return 'По адресу не архив, а веб-страница — проверьте адрес модели'
  return null
}

// Модель сама НЕ сообщает о битом/отсутствующем архиве (createModel из библиотеки в этом случае висит вечно) — поэтому свой Model:
// ждём 'load' / 'error', есть таймаут и отмена
function openModel(api, url, ctl) {
  return new Promise((resolve, reject) => {
    const model = new api.Model(url)
    const fail = msg => { clearTimeout(timer); try { model.terminate() } catch { /* уже остановлен */ } reject(new Error(msg)) }
    const timer = setTimeout(() => fail('Модель не загрузилась за 3 минуты: проверьте адрес и сеть, архив должен быть tar.gz'), LOAD_TIMEOUT_MS)
    ctl.cancel = () => fail('Загрузка отменена')
    model.on('load', m => { if (m.result) { clearTimeout(timer); resolve(model) } else fail('Vosk не смог прочитать архив модели') })
    model.on('error', m => fail(m.error ? `Ошибка загрузки модели: ${m.error}` : 'Ошибка загрузки модели: архив не похож на модель Vosk (в нём нет файлов модели)'))
  })
}

/** Загрузка: библиотека, затем модель. onStage('lib' | 'model'); ctl.cancel() отменяет. Возвращает { model, libMs, modelMs, size } */
export async function loadEngine(url, onStage = () => {}, ctl = {}) {
  onStage('lib')
  let t = performance.now()
  const api = await importVosk()
  const libMs = ms(t)
  onStage('model')
  const probe = await probeModel(url)
  const problem = modelProblem(probe)
  if (problem) throw new Error(problem)
  t = performance.now()
  const model = await openModel(api, url, ctl)
  return { model, libMs, modelMs: ms(t), size: probe?.size ?? null }
}

/**
 * Один сеанс слушания. Вызывать прямо в тапе (getUserMedia нужен жест). Возвращает { stop, cancel }.
 * cb: onPartial(text), onResult(text, stats), onError(msg). onResult приходит на endpoint Vosk (пауза в речи) либо после stop().
 * stats: { firstPartialMs, resultMs, afterStopMs, chunks, loadPct } — loadPct: доля реального времени, которую главный поток
 * тратит на передачу звука воркеру (сам распознаватель работает в воркере — его нагрузку страница не видит).
 */
export async function startListening(model, grammar, cb) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
  const Ctx = window.AudioContext || window.webkitAudioContext
  let ctx
  try { ctx = new Ctx({ sampleRate: 16000 }) } catch { ctx = new Ctx() }
  const rec = new model.KaldiRecognizer(ctx.sampleRate, grammar)
  const t0 = performance.now()
  const st = { firstPartialMs: null, chunks: 0, workMs: 0, audioMs: 0, stopAt: null, done: false }
  const free = () => {
    st.done = true
    stream.getTracks().forEach(tr => tr.stop())
    try { node.disconnect(); src.disconnect() } catch { /* уже отключены */ }
    try { ctx.close() } catch { /* уже закрыт */ }
    try { rec.remove() } catch { /* уже удалён */ }
  }
  rec.on('partialresult', m => {
    if (st.done || !m.result.partial) return
    st.firstPartialMs ??= ms(t0)
    cb.onPartial(m.result.partial)
  })
  rec.on('result', m => {
    if (st.done) return
    const text = (m.result.text || '').trim()
    if (!text && st.stopAt == null) return // пустой результат на паузе — ждём речь дальше
    cb.onResult(text, {
      firstPartialMs: st.firstPartialMs, resultMs: ms(t0), afterStopMs: st.stopAt == null ? null : ms(st.stopAt), chunks: st.chunks,
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
    try { rec.acceptWaveform(ev.inputBuffer) } catch (e) { cb.onError(`acceptWaveform: ${e?.message || e}`) }
    st.workMs += performance.now() - t
    st.audioMs += ev.inputBuffer.duration * 1000
    st.chunks++
  }
  src.connect(node)
  node.connect(ctx.destination) // без подключения к выходу ScriptProcessor в части браузеров не вызывается (на выход идёт тишина)
  return {
    stop() { // «Стоп»: просим итог по накопленному звуку
      if (st.done || st.stopAt != null) return
      st.stopAt = performance.now()
      stream.getTracks().forEach(tr => tr.stop())
      try { rec.retrieveFinalResult() } catch { free(); cb.onResult('', {}) }
    },
    cancel() { if (!st.done) free() },
  }
}
