import { createMouthSync } from './mouthSync.js'
import { chainLayout } from './audioChainPlan.js'
import { clampRate, claimAudio, ownsAudio, LOAD_TIMEOUT_MS, RETRY_DELAY_MS, GUARD_MARGIN_MS } from './audioLine.js'

// Проигрывание цепочки сегментов реплики-шаблона («Can I have» → слово → «, please?») без склейки файлов в один.
// План и раскладка по времени — audioChainPlan.js. Элементы: основной общий <audio> (sceneAudioUnlock.js, разблокирован
// жестом) и запасной второй (spare): пока играет часть n, на втором уже стоит src части n+1 с preload=auto и
// выставленным currentTime=lead, в нужный момент (конец части n + TAIL_PAD, считаем по currentTime) вызываем play() на
// втором и сразу ставим паузу первому — одновременно звучит не больше одного элемента, разрыв — только задержка play().
// На слабом устройстве (lowPower) или без второго элемента — один элемент: следующий src ставится на тот же <audio>
// (blob из sceneAudioCache — быстро). Второй элемент не получил разрешение на звук (iOS, NotAllowedError) — тоже
// переходим на один.
// Рот и «печать»: один createMouthSync на всю цепочку поверх прокси-аудио, чьё currentTime идёт в общей шкале
// (offset части + currentTime − lead), тайминги слов — общие (chainLayout.timings).
// Отказы: до начала звука (ошибка/таймаут/NotAllowed) — onFail, вызывающий уходит на синтез по ВСЕЙ строке; после
// начала звука ошибка части → эта часть пропускается, цепочка идёт дальше. cancel() снимает всё и освобождает элементы
// (запасной остаётся без src, чужой владелец основного не прерывается). Таймеры/rAF инъектируются.

export function playSegmentChain(plan, audio, {
  spare = null, srcOf = () => null, muted = false, rate = 1, applyMouth = () => {}, lowPower = false, v2 = null,
  onEnd, onFail, onMode, onGap, timers = globalThis, raf, caf, now = () => (globalThis.performance?.now?.() ?? Date.now()), isHidden,
} = {}) {
  const layout = chainLayout(plan?.parts ?? [])
  const { items } = layout
  if (!audio || !items.length) { onFail?.(audio ? 'no-segments' : 'no-element'); return () => {} }
  let els = spare && !lowPower ? [audio, spare] : [audio]
  const token = claimAudio(els)
  const k = clampRate(rate)
  let cur = -1
  let active = null
  let started = false
  let retried = false
  let done = false
  let handoverAt = null
  const tm = { load: null, sw: null, guard: null, retry: null }

  const proxy = {
    get currentTime() { return active && cur >= 0 ? Math.max(items[cur].offset, items[cur].offset + (active.currentTime - items[cur].lead)) : 0 },
    get paused() { return !active || active.paused },
    get seeking() { return !!active?.seeking },
    get readyState() { return active ? active.readyState : 0 },
  }
  const sync = createMouthSync(proxy, layout.timings, applyMouth, { raf, caf, timers, now, isHidden, pollMs: lowPower ? 35 : 0, v2 })

  const clearTimers = () => { for (const key of Object.keys(tm)) { timers.clearTimeout(tm[key]); tm[key] = null } }

  function prepare(n, el) {
    const it = items[n]
    if (!it) return
    try {
      el.muted = !!muted
      el.preservesPitch = true
      el.webkitPreservesPitch = true
      el.preload = 'auto'
      const want = srcOf(it.audioUrl) || it.audioUrl
      if (el.src !== want) el.src = want
      el.defaultPlaybackRate = k // после src: смена источника сбрасывает playbackRate в defaultPlaybackRate (audioLine.js)
      el.playbackRate = k
    } catch { /* ignore */ }
  }

  function startSeg(n) {
    clearTimers()
    cur = n
    const el = els[n % els.length]
    active = el
    prepare(n, el)
    try { el.currentTime = items[n].lead } catch { /* до метаданных может бросить — onMeta выставит */ }
    tm.load = timers.setTimeout(onLoadTimeout, LOAD_TIMEOUT_MS)
    if (els.length > 1 && items[n + 1]) prepare(n + 1, els[(n + 1) % els.length])
    let p
    try { p = el.play() } catch { fail('play-threw'); return }
    p?.catch?.(e => {
      if (done || el !== active || cur !== n) return
      if (e?.name === 'NotAllowedError' && els.length > 1 && el !== audio) { degrade(); return }
      if (e?.name === 'NotAllowedError') fail('not-allowed')
      else if (e?.name === 'NotSupportedError') fail('not-supported')
      else if (!retried) retry()
      else fail(`play-rejected-${e?.name ?? '?'}`)
    })
  }

  // Второй элемент без разрешения на звук: дальше играем одним основным
  function degrade() {
    const n = cur
    els = [audio]
    startSeg(n)
  }

  function onPlaying(el) {
    if (done || el !== active) return
    timers.clearTimeout(tm.load)
    if (handoverAt !== null) { onGap?.(Math.round(now() - handoverAt)); handoverAt = null }
    if (!started) { started = true; sync.start() }
    const n = cur
    const it = items[n]
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null
    timers.clearTimeout(tm.sw)
    if (it.end !== null && (dur === null || it.end < dur - 0.02)) scheduleSwitch(el, n)
    timers.clearTimeout(tm.guard)
    tm.guard = timers.setTimeout(() => advance(n), Math.round((it.span / k) * 1000) + GUARD_MARGIN_MS)
  }

  function scheduleSwitch(el, n) {
    const wait = Math.max(0, ((items[n].end - el.currentTime) / k) * 1000)
    tm.sw = timers.setTimeout(() => {
      if (done || cur !== n) return
      const left = items[n].end - el.currentTime
      if (left > 0.02 && !el.paused && !el.ended) scheduleSwitch(el, n)
      else advance(n)
    }, wait)
  }

  // Эстафета: следующая часть стартует на втором элементе, первый сразу на паузу
  function advance(n) {
    if (done || n !== cur) return
    if (n + 1 >= items.length) { finish(false); return }
    const prev = active
    handoverAt = now()
    startSeg(n + 1)
    if (prev && prev !== active) { try { prev.pause() } catch { /* ignore */ } }
  }

  const onEnded = el => { if (!done && el === active) advance(cur) }
  function onMeta(el) {
    if (done || el !== active) return
    const lead = items[cur].lead
    if (lead > 0 && el.currentTime < lead - 0.01) { try { el.currentTime = lead } catch { /* ignore */ } }
  }
  function onError(el) {
    if (done || el !== active) return
    const code = el.error?.code
    if (started) { advance(cur); return }
    if (!retried && (code == null || code === 2)) retry()
    else fail(`media-error-${code ?? '?'}`)
  }
  function onLoadTimeout() {
    if (done) return
    if (started) { advance(cur); return }
    if (!retried) retry()
    else fail('load-timeout')
  }
  function retry() {
    retried = true
    timers.clearTimeout(tm.load)
    tm.retry = timers.setTimeout(() => {
      if (done) return
      try { active?.load() } catch { /* ignore */ }
      startSeg(cur)
    }, RETRY_DELAY_MS)
  }
  // до начала звука — отказ (вызывающий уходит на синтез), после — часть пропускаем и идём дальше
  const fail = reason => { if (started) advance(cur); else finish(true, reason) }

  const handlers = new Map()
  function teardown() {
    done = true
    clearTimers()
    sync.stop()
    for (const [el, h] of handlers) for (const [ev, fn] of Object.entries(h)) el.removeEventListener(ev, fn)
    handlers.clear()
    for (const el of els) if (ownsAudio(el, token)) { try { el.pause() } catch { /* ignore */ } }
    const extra = spare && spare !== audio && ownsAudio(spare, token) ? spare : null
    if (extra) { try { extra.removeAttribute?.('src'); extra.load?.() } catch { /* ignore */ } }
  }
  function finish(failed, reason = 'unknown') {
    if (done) return
    teardown()
    if (failed) onFail?.(reason)
    else onEnd?.()
  }

  for (const el of els) {
    const h = { playing: () => onPlaying(el), ended: () => onEnded(el), error: () => onError(el), loadedmetadata: () => onMeta(el) }
    for (const [ev, fn] of Object.entries(h)) el.addEventListener(ev, fn)
    handlers.set(el, h)
  }
  onMode?.('audio')
  startSeg(0)
  const cancel = () => { if (!done) teardown() }
  cancel.layout = layout
  return cancel
}
