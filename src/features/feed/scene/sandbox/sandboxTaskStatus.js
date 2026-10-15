import { useSyncExternalStore } from 'react'
import { SANDBOX_ID } from './feedSandbox.js'

// Строка статуса задания на тестовом слайде песочницы: админ должен ВИДЕТЬ, что с заданием — ждёт конца диалога,
// показано или пропущено и ПОЧЕМУ (раньше пропуск был тихим: нет микрофона/распознавания, лимит, нет эталона).
// Состояние живёт в маленьком внешнем сторе (useSceneTask сообщает о ходе круга только для SANDBOX_ID; обычные слайды
// ничего не сообщают и не подписаны). Текст строится чистой функцией taskStatusText — её тестируют.
//   phase: idle (слайд не играет) | waiting (ждём конец диалога) | shown (панель открыта) | skipped (не показано, reason)
//   reason: { code, text } — code для тестов, text — по-русски для админа

const IDLE = Object.freeze({ phase: 'idle', index: 0, total: 0, reason: null })
let cur = IDLE
const subs = new Set()
const set = next => { cur = next; subs.forEach(fn => fn()) }

export const KIND_LABEL = { translate: 'Перевод', say: 'Ответь коту', repeat: 'Повтори за диктором' }
const MIC_TEXT = {
  browser: 'этот браузер (Firefox) не умеет распознавать речь — откройте в Chrome или Safari',
  unsupported: 'в этом браузере нет распознавания речи',
  cant_speak: 'в этой сессии нажато «Не могу говорить» (закройте вкладку и откройте заново)',
  denied: 'микрофон запрещён в этой сессии',
}

export const sandboxTask = {
  get: () => cur,
  subscribe: fn => { subs.add(fn); return () => subs.delete(fn) },
  reset: () => set(IDLE),
  idle: () => { if (cur !== IDLE) set(IDLE) },
  // Отказ ворот (gate:*, звук выключен) держится на экране, пока задание не покажут: круг идёт заново и перепроверит, но причину админ должен успеть прочитать
  waiting: (index, total) => { if (cur.phase === 'skipped' && cur.reason?.code?.startsWith('gate:')) return; if (cur.phase !== 'waiting' || cur.index !== index || cur.total !== total) set({ phase: 'waiting', index, total, reason: null }) },
  shown: () => set({ ...cur, phase: 'shown', reason: null }),
  skipped: reason => set({ ...cur, phase: 'skipped', reason }),
}

export const useSandboxTask = () => useSyncExternalStore(sandboxTask.subscribe, sandboxTask.get, () => IDLE)
export const isSandboxScene = id => id === SANDBOX_ID

// Причины пропуска
export const micReason = code => ({ code: `mic:${code}`, text: `нет микрофона/распознавания: ${MIC_TEXT[code] ?? 'недоступно'}` })
export const limitReason = text => ({ code: 'limit', text: text || 'сработал лимит показа' })
export const inactiveReason = () => ({ code: 'inactive', text: 'слайд не активен или сцена не играет' })

// Почему задания нет вовсе (scene.task есть, а feedTaskOf вернул null → нечем проверять ответ) или не выбрано
export function noTaskReason(task) {
  if (!task) return 'в сцене не выбран вид задания (сборщик → «Задание после сцены»)'
  if (task.kind === 'translate') return 'нет эталона: впишите перевод целевой реплики или варианты ответа'
  if (task.kind === 'repeat') return 'у целевой реплики нет текста'
  return 'нет ни готовых ответов, ни ключевых слов'
}

// → { tone: 'wait' | 'ok' | 'bad' | 'off', text } — одна строка для SandboxBar
export function taskStatusText({ task, info, status }) {
  if (!info) return { tone: 'off', text: `задание: нет — ${noTaskReason(task)}` }
  const label = `задание: ${KIND_LABEL[info.task.kind] ?? info.task.kind}`
  const { phase, index, total, reason } = status
  if (phase === 'shown') return { tone: 'ok', text: `${label} · показано` }
  if (phase === 'skipped') return { tone: 'bad', text: `${label} · пропущено: ${reason?.text ?? 'причина неизвестна'}` }
  if (phase === 'waiting') return { tone: 'wait', text: `${label} · ждём конец диалога (реплика ${Math.min(total, index + 1)}/${total}) → появится` }
  return { tone: 'wait', text: `${label} · ждём, пока сцена начнёт играть` }
}
