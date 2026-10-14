// Клавиатура панели «О чём диалог»: свободная фраза по-русски, поэтому все буквы живые (нет «тусклых» и
// запутывателей, как в «Ловле слов»). Модель — в форме keyboardModel из shared/lib/typeWordKeys.js
// ({ rows, lastExtra, cols, space }), чтобы рисовать её тем же TypeWordKeyboard: три ряда, «ё» слева от «я»
// (как знаки вне раскладки), «Стереть» справа внизу, ряд с пробелом. Экранная, без системной — раскладка слайда не прыгает.
const ROWS_RU = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю']
const EXTRA_LAST = 'ё'

export function taskKeyboardModel() {
  const key = ch => ({ ch, lit: true, lure: false })
  const rows = ROWS_RU.map(r => [...r].map(key))
  rows[rows.length - 1] = [...[...EXTRA_LAST].map(key), ...rows[rows.length - 1]]
  return {
    rows,
    lastExtra: EXTRA_LAST.length,
    cols: Math.max(...rows.map(r => r.length), Math.ceil(rows[rows.length - 1].length + 1.5)),
    space: true,
  }
}

export const TASK_KEYBOARD = taskKeyboardModel()
