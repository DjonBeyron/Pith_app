// Собирает один JSON-файл дебага: таймлайн событий (debugTimeline.js) +
// комментарии, оставленные в DebugToolbar.jsx + снимок всех анимаций на
// странице в момент нажатия (Web Animations API — видит любую CSS/JS
// анимацию без правок в её коде). Уходит в _debug/ рядом с кодом (debugSink.js)
// — Claude читает файл напрямую с диска, ничего пересылать не нужно.
import { APP_VERSION } from '../../shared/lib/version.js'
import { getTimelineEvents } from './debugTimeline.js'
import { buildSelector } from './debugSelector.js'
import { sendToSink, debugFileName } from './debugSink.js'
import { getSoundLog } from '../../shared/lib/soundTrace.js'
import { getJitterReport } from './debugJitter.js'

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
    // Что на самом деле прозвучало: «play() → OK» на этот вопрос не отвечает,
    // промис резолвится в момент старта (soundTrace.js)
    звук: getSoundLog(),
    // Сводка последнего замера дрожания, если его запускали (debugJitter.js)
    дрожание: getJitterReport(),
  }
}

// Возвращает путь сохранённого файла (или null, если dev-сервер не ответил и
// отчёт ушёл в Downloads запасным путём — см. debugSink.js)
export async function saveReport(comments) {
  return sendToSink(debugFileName('report'), buildReport(comments))
}
