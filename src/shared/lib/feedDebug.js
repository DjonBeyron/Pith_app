import { APP_VERSION } from './version.js'
import { isWeakDevice, markWeakDevice, probeGpu } from './deviceTier.js'

// Дебаг ленты: кольцевой лог событий + снимок окружения (размеры окна,
// безопасные зоны iPhone, standalone-режим). Открывается кнопкой DBG
// в шапке ленты, отчёт можно скопировать/пошарить/скачать.

const log = []

export function fdbg(...args) {
  const t = (performance.now() / 1000).toFixed(2)
  log.push(`[${t}] ${args.join(' ')}`)
  if (log.length > 80) log.shift()
}

export function fdbgLog() {
  // Лог стартового сплэша пишется ещё до загрузки бандла (index.html,
  // window.__splashLog) — склеиваем его с обычным логом ленты
  const boot = window.__splashLog ?? []
  const all = [...boot, ...log]
  return all.length ? all.join('\n') : '(лог пуст)'
}

// Реальные значения env(safe-area-inset-*) через элемент-зонд
function probeSafeArea() {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;left:-9999px;top:0;' +
    'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const res = `top=${cs.paddingTop} bottom=${cs.paddingBottom}`
  el.remove()
  return res
}

// Мощность устройства: ядра CPU, память (Chrome/Android — на iOS deviceMemory
// нет вообще), тип сети. Это база для решения «стоит ли ориентироваться на
// такие слабые устройства» — снимок сравнивают между жалующимися пользователями
function probeDevice() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  return [
    `cores=${navigator.hardwareConcurrency ?? 'n/a'}`,
    `mem=${navigator.deviceMemory ?? 'n/a'}GB`,
    `net=${conn?.effectiveType ?? 'n/a'} downlink=${conn?.downlink ?? 'n/a'}Mbps rtt=${conn?.rtt ?? 'n/a'}ms saveData=${conn?.saveData ?? 'n/a'}`,
    `gpu=${probeGpu()}`,
  ].join(' ')
}

// ── Монитор FPS ленты ────────────────────────────────────────────────────
// Лёгкий rAF-счётчик (только запись timestamp — сам не должен заметно грузить
// даже слабое устройство). Копит окно 4с: из него считаем средний FPS и
// худший межкадровый интервал (просадку), а не только среднее — среднее
// прячет короткие подвисания. Порог в 5 сэмплов (не 10) — на предельно слабом
// устройстве (реально ~3fps) за 4с наберётся только ~12 сэмплов, а 10 почти
// не давало снимку собраться вовремя
let fpsWindow = []
let fpsRafId = 0
let weakChecked = false

function fpsTick(now) {
  fpsRafId = requestAnimationFrame(fpsTick)
  fpsWindow.push(now)
  while (fpsWindow.length > 1 && now - fpsWindow[0] > 4000) fpsWindow.shift()
  // Как только набралось достаточно данных — если лента реально тормозит,
  // на будущее переключаем визуально дешёвые режимы анимаций (см. deviceTier.js)
  if (!weakChecked && fpsWindow.length >= 15) {
    weakChecked = true
    const span = fpsWindow[fpsWindow.length - 1] - fpsWindow[0]
    const avgFps = ((fpsWindow.length - 1) / span) * 1000
    if (avgFps < 24) markWeakDevice()
  }
}

export function startFpsMonitor() {
  if (fpsRafId) return
  fpsRafId = requestAnimationFrame(fpsTick)
}

// ── Сторож подвисаний главного потока ───────────────────────────────────
// Жалоба: весь iPhone (даже мощный) на секунду-другую лагает кадрами
// именно в момент сворачивания приложения. setInterval, не rAF — rAF
// замирает в фоне и не покажет сам момент сворачивания. Тикаем каждые
// 50мс; если реальный зазор между тиками намного больше — где-то на
// главном потоке было длинное синхронное дело. Каждая запись держит
// «через сколько мс после последнего visibilitychange» — по этому видно,
// совпадает ли лаг с уходом в фон или это что-то другое.
//
// Первый живой лог показал: пока страница continuously hidden, спека
// клэмпит фоновые таймеры примерно до 1 раза в секунду — сам этот клэмп
// давал ложные «stall: ~1000мс» на каждом тике, топя реальный сигнал в
// шуме. Логика ниже пропускает НЕ БОЛЬШЕ ОДНОЙ записи за время нахождения
// в фоне (первый тик сразу после ухода — это ещё может быть реальным
// подвисанием; дальше — гарантированно троттлинг). На переднем плане
// (hidden=false, в т.ч. сам момент возврата) ограничений нет — там любой
// зазор уже настоящий, не троттлинг
const STALL_TICK_MS = 50
const STALL_THRESHOLD_MS = 150
let lastVisChangeAt = 0
let loggedThisHiddenSpan = false

export function startStallWatch() {
  document.addEventListener('visibilitychange', () => {
    lastVisChangeAt = performance.now()
    if (!document.hidden) loggedThisHiddenSpan = false
    fdbg(`visibilitychange → hidden=${document.hidden}`)
  })
  window.addEventListener('pagehide', () => fdbg('pagehide'))

  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    const gap = now - last
    last = now
    if (gap <= STALL_THRESHOLD_MS) return
    if (document.hidden) {
      if (loggedThisHiddenSpan) return // дальше по фону — штатный троттлинг таймеров, не сигнал
      loggedThisHiddenSpan = true
    }
    const sinceVis = lastVisChangeAt ? (now - lastVisChangeAt).toFixed(0) : 'n/a'
    fdbg(`stall: главный поток встал на ${gap.toFixed(0)}мс (через ${sinceVis}мс после visibilitychange, hidden=${document.hidden})`)
  }, STALL_TICK_MS)
}

export function fpsSnapshot() {
  if (fpsWindow.length < 5) return 'n/a (монитор ещё копит данные)'
  const span = fpsWindow[fpsWindow.length - 1] - fpsWindow[0]
  const avgFps = ((fpsWindow.length - 1) / span) * 1000
  let worst = 0
  for (let i = 1; i < fpsWindow.length; i++) worst = Math.max(worst, fpsWindow[i] - fpsWindow[i - 1])
  return `avg=${avgFps.toFixed(1)}fps худший кадр=${worst.toFixed(0)}мс (окно ${(span / 1000).toFixed(1)}с)`
}

export function collectEnv() {
  const vv = window.visualViewport
  const nav = document.querySelector('.shellV2Nav')?.getBoundingClientRect()
  const shell = document.querySelector('.shellV2')?.getBoundingClientRect()
  return [
    `version: ${APP_VERSION}`,
    `time: ${new Date().toISOString()}`,
    `device: ${probeDevice()}`,
    `weakDevice: ${isWeakDevice()}`,
    `fps: ${fpsSnapshot()}`,
    `ua: ${navigator.userAgent}`,
    `standalone: navigator=${String(window.navigator.standalone ?? 'n/a')} media=${window.matchMedia('(display-mode: standalone)').matches}`,
    `window.inner: ${window.innerWidth}x${window.innerHeight}`,
    `docEl.client: ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
    `screen: ${window.screen.width}x${window.screen.height}`,
    `visualViewport: ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} offsetTop=${vv.offsetTop}` : 'n/a'}`,
    `screen pos: screenY=${window.screenY} availH=${window.screen.availHeight} dpr=${window.devicePixelRatio}`,
    `safe-area: ${probeSafeArea()}`,
    `--v2-app-h: ${document.documentElement.style.getPropertyValue('--v2-app-h') || 'не задан'}`,
    `shellV2 rect: ${shell ? `top=${shell.top.toFixed(1)} bottom=${shell.bottom.toFixed(1)} h=${shell.height.toFixed(1)}` : 'нет'}`,
    `nav rect: ${nav ? `top=${nav.top.toFixed(1)} bottom=${nav.bottom.toFixed(1)} h=${nav.height.toFixed(1)} (winH=${window.innerHeight})` : 'нет'}`,
  ].join('\n')
}
