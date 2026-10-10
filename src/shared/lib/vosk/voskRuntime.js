// Модель Vosk «в памяти» для модуля «Сказать фразу»: прогрев при открытии панели, освобождение после ухода, пометка «Vosk не работает».
// Модель (≈40 МБ архив) уже лежит в Cache Storage — её туда тихо докачала фоновая загрузка (voskBackground.js). Здесь: панель смонтирована (acquire) → если модель в кэше,
// фоном импортируем библиотеку (отдельный чанк) и загружаем модель в память (≈1 с, UI не ждёт); панель размонтирована (release) → через FREE_AFTER_MS, если её не открыли снова,
// модель выгружается (экономия памяти на iPhone). Не в кэше — ничего не делаем (системное распознавание). Тап НИКОГДА не ждёт: решение о движке берётся из snapshot() синхронно
// (sayEnginePick.js). Сбой (библиотека не подгрузилась офлайн, модель не открылась, микрофон/движок упал посреди попытки) → markBroken: на BROKEN_MS модель не грузим и Vosk не выбираем.
// Фоновая загрузка закончилась, пока панель открыта (модель появилась в кэше после первой проверки) → прогреваем сразу, не ждём следующего открытия панели (watchCached).
// Ошибки пишутся в журнал плеера (pLog «[say-vosk] …»); пользователю ничего не показываем. info() — подробности для админской диагностики в уроке (sayDiagRows.js). Окружение подставляется (тесты без настоящей модели).
import { pLog } from '../debug.js'
import { begin as beginNetBusy } from '../netBusy.js'
import { readModelUrl } from './voskConfig.js'
import { peekCached, readCached } from './voskStorage.js'
import { loadEngine, unloadEngine } from './voskEngine.js'
import { onBgCached } from './voskBgStatus.js'

export const FREE_AFTER_MS = 30000     // после ухода из модуля модель живёт в памяти ещё столько (вернулись — уже готова)
export const BROKEN_MS = 10 * 60 * 1000 // «Vosk не работает» в рамках сессии

export function createVoskRuntime(deps = {}) {
  const d = {
    url: () => readModelUrl(), peek: peekCached, read: readCached, load: loadEngine, unload: unloadEngine,
    busy: beginNetBusy, watchCached: onBgCached, now: () => Date.now(), setTimer: setTimeout, clearTimer: clearTimeout, log: msg => pLog(`[say-vosk] ${msg}`),
    ...deps,
  }
  const st = { cached: null, model: null, loading: null, users: 0, timer: 0, brokenUntil: 0, brokenWhy: '', lastError: '', warmAt: 0, loadedAt: 0, freeAt: 0, lastLoad: null, unwatch: null }

  const isBroken = () => st.brokenUntil > d.now()

  function free(why) {
    d.clearTimer(st.timer); st.timer = 0; st.freeAt = 0
    if (st.users > 0 || !st.model) return
    const model = st.model
    st.model = null; st.loadedAt = 0
    try { d.unload(model) } catch { /* воркер уже остановлен */ }
    d.log(`модель выгружена из памяти (${why})`)
  }
  const scheduleFree = () => {
    d.clearTimer(st.timer)
    st.freeAt = d.now() + FREE_AFTER_MS
    st.timer = d.setTimer(() => free('панель закрыта'), FREE_AFTER_MS)
  }

  async function warmUp() {
    const url = d.url()
    st.cached = !!(await d.peek(url))
    if (!st.cached) { d.log('модели нет в кэше — этот заход на системном распознавании'); return }
    const got = await d.read(url)
    if (!got) { st.cached = false; d.log('модель в кэше не читается — системное распознавание'); return }
    const endBusy = d.busy() // библиотека (≈6 МБ) качается из сети: фоновая загрузка модели на это время уступает
    const t = d.now()
    st.warmAt = t
    try {
      const r = await d.load(got.blob, stage => { if (stage === 'model') endBusy() })
      st.model = r.model; st.loadedAt = d.now(); st.lastLoad = { libMs: r.libMs, modelMs: r.modelMs }
      d.log(`модель в памяти за ${d.now() - t} мс (библиотека ${r.libMs} мс, модель ${r.modelMs} мс)`)
    } finally { endBusy() }
  }

  function fail(e) {
    st.lastError = e?.message || String(e)
    st.brokenUntil = d.now() + BROKEN_MS
    st.brokenWhy = st.lastError
    d.log(`ошибка прогрева: ${st.lastError}; Vosk не используем ${Math.round(BROKEN_MS / 60000)} мин`)
  }

  const startLoad = () => {
    if (st.model || st.loading || isBroken() || st.users === 0) return
    st.loading = warmUp().catch(fail).finally(() => { st.loading = null; if (st.users === 0) scheduleFree() })
  }

  return {
    /** Панель открыта: прогреть (если модель в кэше). Возвращает release() — вызвать при закрытии панели (повторный вызов безопасен) */
    acquire() {
      st.users++
      d.clearTimer(st.timer); st.timer = 0; st.freeAt = 0
      if (!st.unwatch) st.unwatch = d.watchCached?.(() => startLoad()) ?? null // модель докачалась в фоне, пока панель открыта — греем сразу
      startLoad()
      let done = false
      return () => {
        if (done) return
        done = true
        st.users = Math.max(0, st.users - 1)
        if (st.users === 0) { st.unwatch?.(); st.unwatch = null }
        if (st.users === 0 && !st.loading) scheduleFree()
      }
    },
    /** Только для тестов и ожидания в админке: промис идущего прогрева */
    whenReady: () => st.loading ?? Promise.resolve(),
    /** Синхронный снимок для выбора движка на тапе: cached (null — ещё не проверяли), loaded (модель в памяти), loading, libReady, brokenUntil (broken — пауза идёт сейчас) */
    snapshot: () => ({ cached: st.cached, loaded: !!st.model, loading: !!st.loading, libReady: !!st.model, broken: isBroken(), brokenUntil: st.brokenUntil, brokenWhy: st.brokenWhy }),
    getModel: () => st.model,
    /** Подробности для админской диагностики в уроке: сколько панелей держат прогрев, когда началась / закончилась загрузка в память, когда выгрузится, последняя ошибка (метки времени — d.now(), 0 — нет) */
    info: () => ({ users: st.users, warmAt: st.warmAt, loadedAt: st.loadedAt, freeAt: st.freeAt, lastError: st.lastError, lastLoad: st.lastLoad, now: d.now() }),
    /** Vosk упал посреди попытки (микрофон / движок): модель выгружаем, до конца паузы не выбираем и не грузим */
    markBroken(why) {
      st.brokenUntil = d.now() + BROKEN_MS
      st.brokenWhy = String(why ?? 'сбой')
      d.log(`сбой: ${st.brokenWhy}; Vosk не используем ${Math.round(BROKEN_MS / 60000)} мин`)
      const model = st.model
      st.model = null; st.loadedAt = 0
      if (model) { try { d.unload(model) } catch { /* воркер уже остановлен */ } }
    },
    /** Админ сменил режим движка: «сбой» забываем и, если панель открыта, греем модель заново — «Только Vosk» можно проверять сразу */
    clearBroken() { st.brokenUntil = 0; st.brokenWhy = ''; startLoad() },
  }
}

export const voskRuntime = createVoskRuntime()
