import { useEffect } from 'react'
import {
  prevCharStart, nextCharEnd, wordStart, wordEnd, lineStart, lineEnd,
} from '../../../shared/lib/textEditRange.js'

// Управляемый ввод в поле раскраски: правку применяем к МОДЕЛИ сами и
// запрещаем браузеру трогать DOM (preventDefault на beforeinput).
//
// Почему так. Внутри поля живёт разметка раскраски, которую рисует React
// (спаны/<br> из HighlightedText). Если печатать «как обычно», браузер
// правит этот DOM по-своему — вставляет собственные текстовые узлы, режет и
// перевешивает спаны, — а React ничего об этом не знает. Отсюда лезли:
// текст двоился, каретка после каждой буквы уезжала в начало (печать «задом
// наперёд»), а на правке рядом с покрашенным словом React падал на
// removeChild: узла, который он собирался удалить, в этом родителе уже нет.
//
// Единственное, что не перехватываем, — IME-композиция (insertCompositionText
// отменить нельзя): там остаётся прежний путь через onInput + diffTextEdit.

// Что съедает удаление, если выделения нет (каретка схлопнута)
const DELETE_BACK = {
  deleteContentBackward:  prevCharStart,
  deleteWordBackward:     wordStart,
  deleteSoftLineBackward: lineStart,
  deleteHardLineBackward: lineStart,
}
const DELETE_FWD = {
  deleteContentForward:  nextCharEnd,
  deleteWordForward:     wordEnd,
  deleteSoftLineForward: lineEnd,
  deleteHardLineForward: lineEnd,
}

export function useRichTextInput(ref, { value, currentRange, replaceRange }) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    function onBeforeInput(e) {
      const type = e.inputType
      // Отмена/повтор браузера правили бы DOM мимо модели — глушим их
      if (type === 'historyUndo' || type === 'historyRedo') { e.preventDefault(); return }

      const range = currentRange()
      if (!range) return

      if (type === 'insertText' || type === 'insertReplacementText') {
        const data = e.data ?? ''
        if (!data) return
        e.preventDefault()
        replaceRange(range.start, range.end, data)
        return
      }
      if (type === 'insertLineBreak' || type === 'insertParagraph') {
        e.preventDefault()
        replaceRange(range.start, range.end, '\n')
        return
      }
      // insertFromPaste сюда не попадает: событие paste гасится раньше и
      // вставку делает onPaste (там же чистится формат) — перехватывать её и
      // здесь значило бы вставить дважды
      if (type === 'insertFromDrop') {
        const text = e.dataTransfer?.getData('text/plain') ?? ''
        e.preventDefault()
        if (text) replaceRange(range.start, range.end, text)
        return
      }

      const back = DELETE_BACK[type]
      if (back) {
        e.preventDefault()
        const start = range.start === range.end ? back(value, range.start) : range.start
        replaceRange(start, range.end, '')
        return
      }
      const fwd = DELETE_FWD[type]
      if (fwd) {
        e.preventDefault()
        const end = range.start === range.end ? fwd(value, range.end) : range.end
        replaceRange(range.start, end, '')
        return
      }
      if (type === 'deleteByCut' || type === 'deleteByDrag') {
        e.preventDefault()
        if (range.start !== range.end) replaceRange(range.start, range.end, '')
      }
    }

    // Слушатель нативный (не onBeforeInput React): нужен inputType, которого
    // у синтетического события нет. Без массива зависимостей — переподписка
    // каждый рендер, чтобы замыкание видело свежие value/highlights
    el.addEventListener('beforeinput', onBeforeInput)
    return () => el.removeEventListener('beforeinput', onBeforeInput)
  })
}
