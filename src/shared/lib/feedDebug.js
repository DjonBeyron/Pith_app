import { APP_VERSION } from './version.js'

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
  return log.length ? log.join('\n') : '(лог пуст)'
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

export function collectEnv() {
  const vv = window.visualViewport
  const nav = document.querySelector('.shellV2Nav')?.getBoundingClientRect()
  const shell = document.querySelector('.shellV2')?.getBoundingClientRect()
  return [
    `version: ${APP_VERSION}`,
    `time: ${new Date().toISOString()}`,
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
