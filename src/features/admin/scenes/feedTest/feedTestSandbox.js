import { lintScene } from '../../../scene/v2/sceneLint.js'
import { loadBackup } from '../draftBackup.js'
import { SANDBOX_ID, writeSandbox, clearSandbox } from '../../../feed/scene/sandbox/feedSandbox.js'
import { setForcedSceneTask } from '../../../feed/scene/sceneTaskLimits.js'
import { sendToFeed } from '../../../feed/catch/catchForce.js'

// Модель «Тест без привязки (песочница)» — чистая логика без React. Песочница: черновик сборщика кладётся в sessionStorage
// и показывается в ленте обособленным слайдом (feed/scene/sandbox/). Не нужны библиотека, публикация и модуль; в БД
// ничего не пишется; виден только админу на этом устройстве. Ошибки линтера блокируют запуск (сцена не соберётся),
// предупреждения — нет.

export const lintCounts = lint => ({
  errors: (lint ?? []).filter(x => x.level === 'error').length,
  warnings: (lint ?? []).filter(x => x.level === 'warn' || x.level === 'warning').length,
})

// kind: ready | blocked — для цвета строки состояния (классы scbFtState-*)
export function sandboxState({ errors = 0, warnings = 0, hasScene = true } = {}) {
  if (!hasScene) return { kind: 'blocked', canRun: false, text: 'Нет черновика сцены — соберите сцену в сборщике' }
  if (errors > 0) return { kind: 'blocked', canRun: false, text: `Исправьте ошибки линтера (${errors}) — сцену с ошибками в ленте показать нельзя` }
  if (warnings > 0) return { kind: 'ready', canRun: true, text: `Можно проверять. Предупреждений линтера: ${warnings} — тест они не блокируют` }
  return { kind: 'ready', canRun: true, text: 'Черновик в порядке — можно проверять. Сохранять и публиковать ничего не нужно' }
}

export const SANDBOX_STEP_TEXT = {
  write: 'положить черновик в песочницу (только это устройство)',
  force: 'принудительно показать задание (лимиты не тратятся)',
  open: 'открыть ленту на тестовом слайде',
}

export function sandboxSteps({ force = true, open = true } = {}) {
  return ['write', ...(force ? ['force'] : []), ...(open ? ['open'] : [])]
}

// deps = { write({ scene, taskForce }) → bool, force(id) → bool, jump(id), close() }. → { ok, done, failedStep?, error? }
export function runSandbox({ scene, force = true, open = true, deps }) {
  const done = []
  const fail = (failedStep, error) => ({ ok: false, done, failedStep, error })
  try {
    if (!deps.write({ scene, taskForce: force })) return fail('write', 'Не удалось сохранить тестовую сцену (sessionStorage недоступен или сцена слишком большая)')
    done.push('write')
    if (force) {
      if (!deps.force(SANDBOX_ID)) return fail('force', 'Не удалось выставить принудительный показ (sessionStorage недоступен)')
      done.push('force')
    }
    if (open) {
      deps.jump(SANDBOX_ID)
      deps.close?.()
      done.push('open')
    }
  } catch (e) {
    return fail(sandboxSteps({ force, open })[done.length], e?.message || 'Не удалось выполнить шаг')
  }
  return { ok: true, done }
}

// С настоящими зависимостями: положить сцену в песочницу, (по желанию) принудительно показать задание и повернуть ленту
export function openSceneInSandbox(scene, { force = true, open = true, close, origin = 'admin' } = {}) {
  return runSandbox({
    scene, force, open,
    deps: { write: o => writeSandbox({ ...o, origin }), force: setForcedSceneTask, jump: sendToFeed, close },
  })
}

export const closeSandbox = () => clearSandbox()

// Последняя резервная копия черновика сборщика (draftBackup) для панели «Тест в ленте»: { scene, at, errors, warnings } | null
export function backupForSandbox(load = loadBackup, lint = lintScene) {
  const b = load()
  if (!b?.scene) return null
  return { scene: b.scene, at: b.at, ...lintCounts(lint(b.scene)) }
}

// Строка статуса окна сборщика после «← Вернуться в сборщик» с тестового слайда (origin — где сборщик был открыт до теста)
export const returnNotice = origin => (origin === 'node' || origin === 'module'
  ? 'Открыто из теста в ленте: это копия сцены из ноды/модуля (резервная копия вашего черновика не тронута). «Применить» здесь нет — скопируйте JSON или сохраните в библиотеку'
  : 'Открыто из теста в ленте: тот же черновик, правки не потерялись')
