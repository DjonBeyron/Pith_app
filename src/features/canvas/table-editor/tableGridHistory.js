// История правок конструктора таблицы для кнопки «Отменить» (↶).
//
// Хранится ПАМЯТЬ НА 10 ШАГОВ, и хранится дёшево: снимок — это сам объект
// table, который и так пересоздаётся при каждой правке иммутабельно. Общие
// части (ячейки, которых правка не касалась) переиспользуются по ссылке, так
// что десять шагов не копируют таблицу десять раз. Ничего не сериализуем.
export const HISTORY_LIMIT = 10

// tag склеивает подряд идущие однотипные правки в ОДИН шаг отмены: набор
// текста в одной ячейке — это один шаг, а не двадцать по букве, иначе память
// в 10 шагов сгорала бы на первом же слове. Смена действия (другая ячейка,
// объединение, удаление строки) сбрасывает склейку.
export function gridHistoryReducer(state, action) {
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return {
      table: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      tag: null,
    }
  }

  if (action.type === 'apply') {
    const next = action.fn(state.table)
    // Операция ничего не изменила (нечего разбивать, нечего объединять) —
    // пустой шаг в истории не заводим
    if (next === state.table) return state
    const glued = action.tag != null && action.tag === state.tag
    const past = glued ? state.past : [...state.past, state.table].slice(-HISTORY_LIMIT)
    return { table: next, past, tag: action.tag ?? null }
  }

  return state
}

export function initGridHistory(table) {
  return { table, past: [], tag: null }
}
