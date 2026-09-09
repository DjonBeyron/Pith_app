// Собирает один JSON-файл дебага: таймлайн событий (debugTimeline.js) +
// комментарии, оставленные в DebugToolbar.jsx + снимок всех анимаций на
// странице в момент нажатия (Web Animations API — видит любую CSS/JS
// анимацию без правок в её коде). Скачивается в Downloads — Claude читает
// файл напрямую с диска, ничего пересылать не нужно.
import { APP_VERSION } from '../../shared/lib/version.js'
import { getTimelineEvents } from './debugTimeline.js'
import { buildSelector } from './debugSelector.js'

function snapshotAnimations() {
  if (!document.getAnimations) return []
  return document.getAnimations().map(a => {
    const target = a.effect?.target
    return {
      target: target ? buildSelector(target) : null,
      animationName: a.animationName ?? null,
      playState: a.playState,
      currentTime: typeof a.currentTime === 'number' ? Math.round(a.currentTime) : a.currentTime,
      duration: a.effect?.getTiming?.().duration ?? null,
    }
  })
}

export function buildReport(comments) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    },
    comments,
    timeline: getTimelineEvents(),
    runningAnimations: snapshotAnimations(),
  }
}

export function downloadReport(comments) {
  const report = buildReport(comments)
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const a = document.createElement('a')
  a.href = url
  a.download = `pithy-debug-${ts}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return report
}
