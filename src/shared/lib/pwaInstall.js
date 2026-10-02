import { fdbg } from './feedDebug.js'

// Установка приложения на телефон (Add to Home Screen / «Установить
// приложение»). beforeinstallprompt Chrome шлёт МАКСИМУМ один раз за
// загрузку страницы и только если браузер сам решил, что сайт «устанавливаем»
// (манифест + активный service worker — см. main.jsx). Ловим его здесь
// глобально и максимально рано (модуль импортируется в main.jsx до рендера
// React) — если не поймать сразу, событие теряется безвозвратно, второго
// шанса до перезагрузки страницы не будет.
let deferredPrompt = null
let promptCaptured = false

// Диагностика установки на Android: адрес с ?nativeinstall=1 — событие НЕ перехватываем (без preventDefault), Chrome
// сам показывает свой диалог и ведёт установку из меню. Нужен, чтобы проверить, не мешает ли перехват установке «Установить»
// из меню Chrome. События установки пишутся в лог DBG (feedDebug.js)
export const NATIVE_INSTALL = (() => {
  try { return new URLSearchParams(location.search).has('nativeinstall') } catch { return false }
})()

window.addEventListener('beforeinstallprompt', e => {
  if (NATIVE_INSTALL) { fdbg('pwa: beforeinstallprompt (режим nativeinstall — не перехватываем)'); return }
  e.preventDefault()
  deferredPrompt = e
  promptCaptured = true
  fdbg('pwa: beforeinstallprompt пойман')
})
window.addEventListener('appinstalled', () => fdbg('pwa: appinstalled'))

export function getInstallPrompt() {
  return deferredPrompt
}

export function hasInstallPrompt() {
  return promptCaptured
}

// Standalone — уже установлено и запущено как приложение (иконка на столе),
// а не в обычной вкладке браузера
export function isStandalone() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
}

export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

// «100% гарантии» определения браузера/платформы не существует нигде в вебе
// (UA можно подменить) — это лучшая практически достижимая эвристика
export function isMobile() {
  if (navigator.userAgentData) return navigator.userAgentData.mobile
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// Точный браузер — под конкретные пункты меню (у каждого своя формулировка
// «Установить»/«Добавить на экран» и свой значок меню). Порядок проверок
// важен: у Samsung/Yandex/Firefox/Edge Android в UA ТОЖЕ есть "Chrome" (все
// они на Chromium/Gecko-обёртке над тем же движком), поэтому сначала ищем
// уникальный маркер конкретного браузера, а Chrome — это то, что осталось
export function detectBrowser() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/YaBrowser/i.test(ua)) return 'yandex'
  if (/EdgA/i.test(ua)) return 'edge'
  if (/Firefox/i.test(ua)) return 'firefox'
  if (/Chrome/i.test(ua)) return 'chrome'
  return 'other'
}
