// Модель Vosk «в памяти» для модуля «Сказать фразу»: прогрев (машина состояний voskWarmStages.js), счётчик «кто держит модель», освобождение после ухода, пауза после сбоя.
// Модель (≈40 МБ архив) уже лежит в Cache Storage — её туда тихо докачала фоновая загрузка (voskBackground.js). Держат модель ДВА вида владельцев (acquire(why)): урок с модулем
// (why 'lesson': прогрев сразу при входе в урок, sayLessonWarm.js) и открытая панель модуля (why 'panel'). Есть хоть один → если модель в кэше, фоном (UI не ждёт) проходим этапы
// checking-cache → importing-lib (отдельный чанк vosk) → loading-model → ready (≈1 с на телефоне); у каждого этапа таймаут, завис/упал → failed с причиной. Все ушли (release) →
// через FREE_AFTER_MS модель выгружается (экономия памяти iPhone). Тап НИКОГДА не ждёт: движок выбирается из snapshot() синхронно (sayEnginePick.js); исключение — админский режим «Только Vosk»
// (whenSettled, sayVoskWait.js). Не в кэше — ждём, пока фоновая загрузка закончится (watchCached), системное распознавание на этот заход.
// Сбой (библиотека не подгрузилась, модель не открылась, таймаут этапа, микрофон/движок упал посреди попытки) → пауза BROKEN_MS (1 мин): Vosk не выбираем и не грузим, потом повтор САМ,
// пока кто-то держит модель (до MAX_AUTO_RETRIES подряд). Режим «Только системное» модель не греет (читается при каждом запуске, так что смена режима видна сразу).
// Ошибки и этапы пишутся в журнал плеера (pLog «[say-vosk] …»); ученику ничего не показываем. info() — подробности для админской диагностики (sayDiagWarm.js). Окружение подставляется (тесты).
import { pLog } from '../debug.js'
import { begin as beginNetBusy } from '../netBusy.js'
import { readModelUrl } from './voskConfig.js'
import { peekCached, readCached } from './voskStorage.js'
import { loadEngine, unloadEngine } from './voskEngine.js'
import { onBgCached } from './voskBgStatus.js'
import { readSayEngine } from '../speech/sayEngineMode.js'
import { STAGE_TEXT, STAGE_FAIL_TEXT, TRIGGER_TEXT, createStageGuard, StageTimeout, WarmAbandoned, addTrace } from './voskWarmStages.js'

export const FREE_AFTER_MS = 30000          // после ухода всех владельцев модель живёт в памяти ещё столько (вернулись — уже готова)
export const BROKEN_MS = 60 * 1000          // «Vosk не работает» после сбоя — 1 минута
export const MAX_AUTO_RETRIES = 5           // сколько сбоев подряд повторяем сами (ручной прогрев и смена режима счёт обнуляют)

export function createVoskRuntime(deps = {}) {
  const d = {
    url: () => readModelUrl(), peek: peekCached, read: readCached, load: loadEngine, unload: unloadEngine, mode: () => readSayEngine(),
    busy: beginNetBusy, watchCached: onBgCached, now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id), log: msg => pLog(`[say-vosk] ${msg}`),
    ...deps,
  }
  const st = {
    cached: null, model: null, loading: null, run: null, users: 0, holds: {}, acquires: 0, lastAcquire: null, timer: 0, retryTimer: 0, unwatch: null,
    brokenUntil: 0, brokenWhy: '', failures: 0, failure: null, lastError: '', warmAt: 0, loadedAt: 0, freeAt: 0, lastLoad: null,
    stage: 'idle', stageAt: 0, trigger: '', trace: [],
  }
  const listeners = new Set()
  const emit = () => listeners.forEach(fn => { try { fn() } catch { /* подписчик не должен ломать прогрев */ } })
  const isBroken = () => st.brokenUntil > d.now()

  function enter(stage, note = '') {
    st.stage = stage; st.stageAt = d.now()
    addTrace(st.trace, { stage, at: st.stageAt, note })
    st.run?.guard.arm(stage)
    d.log(`прогрев: ${STAGE_TEXT[stage]}${note ? ` — ${note}` : ''}`)
    emit()
  }

  function free(why) {
    d.clearTimer(st.timer); st.timer = 0; st.freeAt = 0
    if (st.users > 0 || !st.model) return
    const model = st.model
    st.model = null; st.loadedAt = 0
    try { d.unload(model) } catch { /* воркер уже остановлен */ }
    enter('idle', `модель выгружена из памяти (${why})`)
  }
  const scheduleFree = () => {
    d.clearTimer(st.timer)
    st.freeAt = d.now() + FREE_AFTER_MS
    st.timer = d.setTimer(() => free('все владельцы ушли'), FREE_AFTER_MS)
  }

  async function warmUp(run) {
    const alive = () => { if (run.abandoned) throw new WarmAbandoned() }
    const url = d.url()
    st.warmAt = d.now()
    enter('checking-cache', `прогрев запущен ${TRIGGER_TEXT[run.trigger] ?? run.trigger}`)
    st.cached = !!(await d.peek(url)); alive()
    if (!st.cached) { enter('idle', 'модели нет в кэше — этот заход на системном распознавании'); return }
    const got = await d.read(url); alive()
    if (!got) { st.cached = false; enter('idle', 'модель в кэше не читается — системное распознавание'); return }
    run.endBusy = d.busy() // библиотека (≈6 МБ) качается из сети: фоновая загрузка модели на это время уступает
    const t = d.now()
    st.warmAt = t
    enter('importing-lib')
    const r = await d.load(got.blob, stage => { if (stage === 'model') { run.endBusy?.(); enter('loading-model') } }, run.ctl)
    if (run.abandoned) { try { d.unload(r.model) } catch { /* воркер уже остановлен */ } throw new WarmAbandoned() }
    st.model = r.model; st.loadedAt = d.now(); st.lastLoad = { libMs: r.libMs, modelMs: r.modelMs }; st.failure = null; st.failures = 0
    enter('ready', `модель в памяти за ${d.now() - t} мс (библиотека ${r.libMs} мс, модель ${r.modelMs} мс)`)
  }

  function abandon(run) {
    if (!run) return
    run.abandoned = true
    try { run.ctl.cancel?.() } catch { /* загрузка уже закончилась */ }
    run.endBusy?.()
  }

  function scheduleRetry() {
    d.clearTimer(st.retryTimer); st.retryTimer = 0
    if (st.failures > MAX_AUTO_RETRIES) return
    const arm = ms => {
      st.retryTimer = d.setTimer(() => {
        st.retryTimer = 0
        const left = st.brokenUntil - d.now()
        if (left > 0) arm(left + 20) // таймер сработал чуть раньше конца паузы
        else startLoad('retry')
      }, ms)
    }
    arm(Math.max(0, st.brokenUntil - d.now()))
  }

  function pause(why) {
    st.brokenUntil = d.now() + BROKEN_MS
    st.brokenWhy = why
    st.failures++
    scheduleRetry()
  }

  function fail(e, run) {
    if (e instanceof WarmAbandoned || st.run !== run) return
    const at = st.stage
    if (e instanceof StageTimeout) abandon(run)
    st.lastError = e?.message || String(e)
    st.failure = { stage: at, text: st.lastError, at: d.now() }
    pause(st.lastError)
    d.log(`ошибка ${STAGE_FAIL_TEXT[at] ?? at}: ${st.lastError}; Vosk не используем ${Math.round(BROKEN_MS / 60000)} мин`)
    enter('failed', `${STAGE_FAIL_TEXT[at] ?? at}: ${st.lastError}`)
  }

  function startLoad(trigger, { force = false } = {}) {
    if (st.model || st.loading) return
    if (!force && (isBroken() || st.users === 0)) return
    if (d.mode() === 'system') return // «Только системное»: модель не греем
    const run = { abandoned: false, ctl: {}, endBusy: null, trigger, guard: createStageGuard({ setTimer: d.setTimer, clearTimer: d.clearTimer }) }
    st.run = run; st.trigger = trigger; st.failure = null; st.cached = null // кэш проверяем заново: модель могла докачаться или пропасть
    const p = (async () => {
      try { await run.guard.race(warmUp(run)) } catch (e) { fail(e, run) } finally {
        run.guard.stop(); run.endBusy?.()
        if (st.run === run) { st.run = null; st.loading = null; if (st.users === 0) scheduleFree() }
        emit()
      }
    })()
    st.loading = p
  }

  /** Результат для режима «Только Vosk»: { ok: true } | { ok: false, reason, text } | null (ещё идёт) */
  function settled() {
    if (st.model) return { ok: true }
    if (st.stage === 'failed' || isBroken()) return { ok: false, reason: 'failed', text: `ошибка ${STAGE_FAIL_TEXT[st.failure?.stage] ?? 'прогрева'}: ${st.failure?.text || st.brokenWhy || 'без подробностей'}` }
    if (st.cached === false) return { ok: false, reason: 'no-model', text: 'модели Vosk нет в кэше телефона' }
    return null
  }

  return {
    /** Кто-то держит модель (why: 'lesson' | 'panel'): прогреть, если она в кэше. Возвращает release() — вызвать, когда владелец ушёл (повторный вызов безопасен) */
    acquire(why = 'panel') {
      st.users++; st.acquires++
      st.holds[why] = (st.holds[why] || 0) + 1
      st.lastAcquire = { why, at: d.now() }
      d.clearTimer(st.timer); st.timer = 0; st.freeAt = 0
      if (!st.unwatch) st.unwatch = d.watchCached?.(() => startLoad('bg-cached')) ?? null // модель докачалась в фоне, пока кто-то держит прогрев — греем сразу
      startLoad(why)
      let done = false
      return () => {
        if (done) return
        done = true
        st.users = Math.max(0, st.users - 1)
        st.holds[why] = Math.max(0, (st.holds[why] || 0) - 1)
        if (st.users === 0) { st.unwatch?.(); st.unwatch = null }
        if (st.users === 0 && !st.loading) scheduleFree()
      }
    },
    /** Прогреть сейчас, игнорируя паузу и «нет владельцев» (кнопка диагностики 'manual' — перезапускает идущий прогрев; 'tap' — режим «Только Vosk», идущий не трогает) */
    warmNow(trigger = 'manual') {
      st.brokenUntil = 0; st.brokenWhy = ''; st.failures = 0
      d.clearTimer(st.retryTimer); st.retryTimer = 0
      if (st.model) return Promise.resolve()
      if (st.loading && trigger === 'manual') { abandon(st.run); st.run = null; st.loading = null }
      startLoad(trigger, { force: true })
      return st.loading ?? Promise.resolve()
    },
    /** Только для тестов и ожидания в админке: промис идущего прогрева */
    whenReady: () => st.loading ?? Promise.resolve(),
    /** Дождаться конца прогрева (готов / ошибка / нет модели) не дольше ms: { ok, reason?, text? }. Только для режима «Только Vosk» */
    whenSettled(ms) {
      const now = settled()
      if (now) return Promise.resolve(now)
      return new Promise(resolve => {
        const stop = () => { d.clearTimer(timer); listeners.delete(check) }
        const check = () => { const r = settled(); if (r) { stop(); resolve(r) } }
        const timer = d.setTimer(() => { stop(); resolve({ ok: false, reason: 'timeout', text: `не успел за ${Math.round(ms / 1000)} с: ${STAGE_TEXT[st.stage]}` }) }, ms)
        listeners.add(check)
      })
    },
    /** Подписка на смену этапа (для живой подписи «грузится библиотека…»). Возвращает отписку */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    /** Синхронный снимок для выбора движка на тапе: cached (null — ещё не проверяли), loaded (модель в памяти), loading, libReady, stage, brokenUntil (broken — пауза идёт сейчас) */
    snapshot: () => ({ cached: st.cached, loaded: !!st.model, loading: !!st.loading, libReady: !!st.model, stage: st.stage, broken: isBroken(), brokenUntil: st.brokenUntil, brokenWhy: st.brokenWhy }),
    getModel: () => st.model,
    /** Подробности для админской диагностики: сколько владельцев (и каких) держат прогрев, сколько раз его просили, этап и журнал этапов, кто запустил, ошибка, когда выгрузится (метки — d.now(), 0 — нет) */
    info: () => ({
      users: st.users, holds: { ...st.holds }, acquires: st.acquires, lastAcquire: st.lastAcquire, warmAt: st.warmAt, loadedAt: st.loadedAt, freeAt: st.freeAt, lastError: st.lastError, lastLoad: st.lastLoad,
      stage: st.stage, stageAt: st.stageAt, trigger: st.trigger, failure: st.failure, failures: st.failures, trace: st.trace.map(t => ({ ...t })), mode: d.mode(), now: d.now(),
    }),
    /** Vosk упал посреди попытки (микрофон / движок): модель выгружаем, до конца паузы не выбираем и не грузим, потом повтор сам */
    markBroken(why) {
      const text = String(why ?? 'сбой')
      d.log(`сбой: ${text}; Vosk не используем ${Math.round(BROKEN_MS / 60000)} мин`)
      pause(text)
      st.failure = { stage: 'ready', text, at: d.now() }
      const model = st.model
      st.model = null; st.loadedAt = 0
      if (model) { try { d.unload(model) } catch { /* воркер уже остановлен */ } }
      enter('failed', `при записи: ${text}`)
    },
    /** Админ сменил режим движка: «сбой» забываем и, если кто-то держит модель, греем заново — «Только Vosk» можно проверять сразу */
    clearBroken() {
      st.brokenUntil = 0; st.brokenWhy = ''; st.failures = 0
      d.clearTimer(st.retryTimer); st.retryTimer = 0
      startLoad('mode')
    },
  }
}

export const voskRuntime = createVoskRuntime()
