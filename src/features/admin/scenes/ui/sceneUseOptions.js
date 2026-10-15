// Что значит «Использовать» сцену из «Моих сцен» — зависит от того, откуда открыт сборщик
// (чистая функция, тест — sceneUseOptions.test.jsx):
//  • node   — сцена для ноды урока: одно действие «Применить к ноде» (сцена уходит в ноду, окно закрывается);
//  • module — сцена для модуля ленты: одно действие «Привязать к фразе» (сохранить как published и привязать);
//  • admin  — обычная админка: меню из нескольких пунктов.
// Пункт: { id, label, hint?, disabled?, reason? }. direct: true — без меню, сразу действие.

export const USE_MODES = ['node', 'module', 'admin']

export function sceneUseMode({ onApply, useMode }) {
  if (useMode && USE_MODES.includes(useMode)) return useMode
  return onApply ? 'node' : 'admin'
}

export function sceneUseOptions(mode, row) {
  const published = row?.status === 'published'
  if (mode === 'node') return { direct: true, items: [{ id: 'apply', label: 'Применить к ноде', hint: 'Сцена уйдёт в ноду урока, окно закроется' }] }
  if (mode === 'module') return { direct: true, items: [{ id: 'apply', label: 'Привязать к фразе', hint: published ? 'Сцена привяжется к модулю ленты, окно закроется' : 'Сцена опубликуется и привяжется к модулю ленты' }] }
  return {
    direct: false,
    items: [
      { id: 'open', label: 'Открыть в сборщике', hint: 'Редактировать эту сцену' },
      { id: 'copy', label: 'Сделать копию и редактировать', hint: 'Исходная сцена не меняется' },
      { id: 'link', label: 'Привязать к модулю ленты…', hint: 'Сцена заменит видео фразы в ленте', disabled: !published, reason: published ? '' : 'Сначала опубликуйте сцену — в ленту попадают только опубликованные' },
      { id: 'copyId', label: 'Скопировать id', hint: 'uuid строки библиотеки' },
      { id: 'copyJson', label: 'Скопировать JSON', hint: 'Полная сцена v2 текстом' },
    ],
  }
}

// Подсказка внизу меню: как взять сцену в уроке
export const USE_IN_LESSON_HINT = 'В уроке: нода «Сцена» → «Из библиотеки» — там же эта сцена, если она опубликована.'

// Текст подтверждения замены черновика шаблоном
export const TEMPLATE_CONFIRM = 'В сборщике есть несохранённые правки — они пропадут. Заменить черновик шаблоном?'
