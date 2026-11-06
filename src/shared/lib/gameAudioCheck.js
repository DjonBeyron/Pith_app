// Проверка «звук игры действительно вернулся» после жёсткого перезапуска (gameAudioRestart.js, тап «Продолжить»). Чистые функции: контекст, время и таймеры подставляются снаружи (тесты).
//  • waitCtxRunning(getCtx) — ждём, пока контекст станет 'running': слушаем statechange и каждые RETRY_MS повторяем resume() (на iPhone первый resume после прерывания часто «съедается»,
//    а пока страница пишет микрофон, WebKit пускает resume и без жеста). → { state, tries, ms }.
//  • probeCtx(ctx) — тихий пробный звук (буфер нулей PROBE_SEC): источник стартует и доигрывает (onended), а currentTime контекста растёт — значит рендер звука идёт по-настоящему.
//    'running' без движения времени (iOS после фона: состояние «работает», вывода нет) ловится именно здесь. → { ok, ms, why?, advanced }.
// Услышит ли человек звук (маршрут вывода iOS), JS узнать не может — это видно только в журнале владельца по строкам «[audio] …».
export const WAIT_MS = 1500   // сколько ждём 'running'
export const RETRY_MS = 200   // как часто повторяем resume()
export const PROBE_MS = 1500  // за сколько пробный звук должен доиграть («Звук не вернулся, нажми ещё раз», если нет)
export const PROBE_SEC = 0.05 // длина пробного звука (тишина)

const stateOf = c => c?.state ?? null

/** Ждать 'running' у текущего контекста (getCtx() — после пересоздания он мог смениться). Нет контекста (нет Web Audio) — сразу { state: null } */
export function waitCtxRunning(getCtx, { maxMs = WAIT_MS, retryMs = RETRY_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const t0 = now()
  let tries = 0
  const c0 = getCtx()
  if (!c0) return Promise.resolve({ state: null, tries, ms: 0 })
  if (stateOf(c0) === 'running') return Promise.resolve({ state: 'running', tries, ms: 0 })
  return new Promise(resolve => {
    let timer = 0, done = false, watched = null
    const onState = () => { if (stateOf(getCtx()) === 'running') finish() }
    const watch = c => {
      if (watched === c) return
      try { watched?.removeEventListener?.('statechange', onState) } catch { /* старый контекст закрыт */ }
      watched = c
      try { c?.addEventListener?.('statechange', onState) } catch { /* без события — хватит опроса */ }
    }
    const finish = () => {
      if (done) return
      done = true
      clearTimer(timer)
      try { watched?.removeEventListener?.('statechange', onState) } catch { /* уже закрыт */ }
      resolve({ state: stateOf(getCtx()), tries, ms: Math.round(now() - t0) })
    }
    const tick = () => {
      if (done) return
      const c = getCtx()
      watch(c)
      if (!c || stateOf(c) === 'running' || now() - t0 >= maxMs) { finish(); return }
      tries += 1
      try { Promise.resolve(c.resume?.()).then(onState, () => {}) } catch { /* следующая попытка */ }
      timer = setTimer(tick, retryMs)
    }
    tick()
  })
}

/** Пробный тихий звук: доиграл и время контекста сдвинулось — рендер идёт. Нет контекста — { ok: true, why: 'нет Web Audio' } (играют <audio>, проверять нечего) */
export function probeCtx(ctx, { maxMs = PROBE_MS, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!ctx) return Promise.resolve({ ok: true, ms: 0, why: 'нет Web Audio', advanced: false })
  if (stateOf(ctx) !== 'running') return Promise.resolve({ ok: false, ms: 0, why: `контекст ${stateOf(ctx) ?? 'нет'}`, advanced: false })
  const t0 = now()
  const ct0 = Number(ctx.currentTime) || 0
  return new Promise(resolve => {
    let timer = 0, done = false
    const finish = (ok, why) => {
      if (done) return
      done = true
      clearTimer(timer)
      const advanced = (Number(ctx.currentTime) || 0) > ct0
      resolve({ ok: ok && advanced, ms: Math.round(now() - t0), why: ok && !advanced ? 'время контекста стоит' : why, advanced })
    }
    try {
      const rate = ctx.sampleRate || 44100
      const s = ctx.createBufferSource()
      s.buffer = ctx.createBuffer(1, Math.max(1, Math.round(rate * PROBE_SEC)), rate)
      s.connect(ctx.destination)
      s.onended = () => { try { s.disconnect() } catch { /* уже отключён */ } finish(true) }
      s.start(ctx.currentTime || 0)
    } catch (e) { finish(false, `источник не создался: ${e?.message ?? e}`); return }
    timer = setTimer(() => finish(false, `пробный звук не доиграл за ${maxMs} мс (контекст ${stateOf(ctx)})`), maxMs)
  })
}
