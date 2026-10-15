// Модель «Проверить в ленте» (диалог FeedTestDialog) — чистая логика без React, с тестами.
// Цель: админ в два клика видит голосовое/любое задание сцены в настоящей ленте. Нужно: сцена в библиотеке и опубликована
// (ученик получает только published), привязана к модулю ленты (curricula.scene_id), принудительный показ задания
// (sceneTaskLimits.setForcedSceneTask — лимиты не тратятся) и переход в ленту на слайд модуля (catchForce.sendToFeed).

export function feedPushMessage(ok) {
  return ok
    ? { kind: 'ok', text: 'Задание покажется в ленте на этой сцене после первого проигрывания (один раз, без лимитов)' }
    : { kind: 'error', text: 'Не удалось записать (sessionStorage недоступен)' }
}

// Что с сценой перед проверкой: ready | save (нет в библиотеке / есть правки) | publish (лежит черновиком) | blocked
//   saved — { id, status } строки библиотеки, dirty — есть несохранённые правки, errors — число ошибок линтера
export function feedTestState({ saved = {}, dirty = false, errors = 0, missingTable = false }) {
  const needs = !saved.id || saved.status !== 'published' || dirty
  if (missingTable && needs) return { kind: 'blocked', needsSave: true, text: 'Таблицы scenes нет в базе — сохранить сцену в библиотеку нельзя' }
  if (errors > 0 && needs) return { kind: 'blocked', needsSave: true, text: `Сначала исправьте ошибки линтера (${errors}) — опубликовать сцену нельзя` }
  if (!saved.id) return { kind: 'save', needsSave: true, text: 'Сцены ещё нет в библиотеке — сохраню и опубликую одним шагом' }
  if (saved.status !== 'published') return { kind: 'publish', needsSave: true, text: 'Сцена в библиотеке — черновик, ученик её не получит. Опубликую вместе с сохранением' }
  if (dirty) return { kind: 'save', needsSave: true, text: 'Есть несохранённые правки — сохраню их, чтобы лента показала актуальную версию' }
  return { kind: 'ready', needsSave: false, text: 'Сцена сохранена и опубликована' }
}

// Шаги запуска по порядку: save → link → force → open
export function feedTestSteps({ state, module, savedId = null, force = true, open = true }) {
  const steps = []
  if (state.needsSave) steps.push('save')
  if (!savedId || module?.scene_id !== savedId) steps.push('link')
  if (force) steps.push('force')
  if (open) steps.push('open')
  return steps
}

export const STEP_TEXT = {
  save: 'сохранить и опубликовать сцену', link: 'привязать к модулю', force: 'принудительно показать задание (лимиты не тратятся)', open: 'открыть ленту на этом слайде',
}

// Deep-link на модуль ленты (useFeedModules читает ?m=): для копирования/проверки на телефоне
export function feedDeepLink(moduleId, origin = '') {
  return moduleId ? `${origin}/?m=${encodeURIComponent(moduleId)}` : ''
}

// Что показать про модуль под строкой выбора
export function moduleNote(m, savedId) {
  const base = m.scene_id && m.scene_id === savedId ? 'уже привязана' : m.scene_id ? 'другая сцена — заменится' : m.video_url ? 'есть видео — сцена станет главной' : 'без медиа'
  return m.published ? base : `${base} · не опубликован`
}

// Запуск: deps = { save(status) → строка {id}|null, link(moduleId, sceneId), force(sceneId) → bool, jump(moduleId), close() }.
// Возвращает { ok, done: [шаги], sceneId, error?, failedStep? } — ошибка шага останавливает цепочку, сделанное остаётся в done
export async function runFeedTest({ state, module, savedId = null, force = true, open = true, deps }) {
  const done = []
  let sceneId = savedId
  const fail = (failedStep, error) => ({ ok: false, done, sceneId, failedStep, error })
  const steps = feedTestSteps({ state, module, savedId, force, open })
  try {
    for (const step of steps) {
      if (step === 'save') {
        const row = await deps.save('published')
        if (!row?.id) return fail('save', 'Не удалось сохранить сцену в библиотеку')
        sceneId = row.id
      } else if (step === 'link') {
        await deps.link(module.id, sceneId)
      } else if (step === 'force') {
        if (!deps.force(sceneId)) return fail('force', 'Не удалось выставить принудительный показ (sessionStorage недоступен)')
      } else if (step === 'open') {
        deps.jump(module.id)
        deps.close?.()
      }
      done.push(step)
    }
  } catch (e) {
    return fail(steps[done.length], e?.message || 'Не удалось выполнить шаг')
  }
  return { ok: true, done, sceneId }
}

// Инструкция «как проверить голосовое задание» — в диалоге и в блоке «Тест в ленте»
export const FEED_TEST_HOWTO = [
  'Чтобы проверить голосовое задание на телефоне, откройте приложение и разрешите микрофон в браузере (иконка замка у адреса → Микрофон → Разрешить).',
  'Лента покажет модуль на нужном слайде; дождитесь, пока диалог проиграется один раз — снизу выедет панель задания.',
  'Скажите ответ или повторите реплику вслух; результат совпадёт с тестером в сборщике. Лимиты показа при тесте не тратятся.',
]
