import { useRef, useEffect, useLayoutEffect } from 'react'
import HighlightedText from '../../../shared/ui/HighlightedText.jsx'
import { useRichTextEdit } from './useRichTextEdit.js'
import { useRichTextInput } from './useRichTextInput.js'
import { useRichTextCaret } from './useRichTextCaret.js'
import { useRichTextSelection } from './useRichTextSelection.js'
import RichTextToolbar from './RichTextToolbar.jsx'
import CopyPlainButton from './CopyPlainButton.jsx'
import { preloadRichTextFavorites, RICH_TEXT_FAV_ID } from './useRichTextFavorites.js'
import { autoGrowTextarea } from '../../../shared/lib/autoGrowTextarea.js'
import { useTextareaHeight } from '../useTextareaHeight.js'

// Поле ввода текста ноды, которое сразу показывает раскраску — выделил слово
// прямо во время печати, всплыл тулбар, покрасил, без захода в отдельное
// окно (как в Notion). Заменяет textarea+кнопку кисти для всех текстовых
// полей ноды с раскраской (content/caption/text у аудио/proText); у
// policyText раскраски нет, там просто textarea.
export default function RichTextField({
  // highlightsField — большинство полей делят одно общее tData.highlights,
  // но proText у про-режима хранит СВОЙ массив (proHighlights), чтобы не
  // путать раскраску перевода с раскраской основного текста
  field, highlightsField = 'highlights', value, highlights = [], onChange, placeholder,
  growTextarea = false, heightKey, className = '',
}) {
  const ref = useRef(null)
  const pendingCaretRef = useRef(null)
  const heightRef = useTextareaHeight(heightKey, !growTextarea)

  function patchChange({ value: newText, highlights: newHl }) {
    onChange({ [field]: newText, [highlightsField]: newHl })
  }

  const edit = useRichTextEdit({ ref, value, highlights, onChange: patchChange, pendingCaretRef })
  // Печать/удаление/вставка правят модель напрямую, браузеру DOM поля трогать
  // нельзя — иначе он рассинхронит разметку раскраски с моделью
  useRichTextInput(ref, { value, currentRange: edit.currentRange, replaceRange: edit.replaceRange })
  useRichTextCaret(ref, pendingCaretRef, value, highlights)
  const selection = useRichTextSelection(ref)

  // Печать больше не проходит через onInput (правку делает useRichTextInput,
  // а браузеру ввод запрещён — значит и события input нет), поэтому высоту
  // растущего поля пересчитываем по изменению самого текста
  useLayoutEffect(() => {
    if (growTextarea) autoGrowTextarea(ref.current)
  }, [growTextarea, value])

  // Пока пользователь только печатает/читает, тулбара ещё нет — но избранное
  // можно запросить уже сейчас, чтобы к моменту первого выделения текста
  // оно уже пришло и не мигало пустым
  useEffect(() => { preloadRichTextFavorites(RICH_TEXT_FAV_ID) }, [])

  function setNodeRef(el) {
    ref.current = el
    heightRef.current = el
    if (growTextarea) autoGrowTextarea(el)
  }

  function handleInput() {
    edit.onInput()
    if (growTextarea) autoGrowTextarea(ref.current)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { closeToolbar(); return }
    edit.onKeyDown(e)
  }

  // Крестик тулбара и клик снаружи него ведут сюда же — прячем сам тулбар
  // (на случай если браузер почему-то не собьёт выделение сам) и снимаем
  // реальное выделение текста, чтобы не осталась «зависшая» синяя подсветка
  function closeToolbar() {
    selection.hide()
    window.getSelection()?.removeAllRanges()
  }

  return (
    <>
      {/* Обёртка нужна только чтобы кнопка копирования могла позиционироваться
          по полю и показываться на его :hover. Обычный блок, без флексов —
          раскладку родителя не меняет */}
      <div className="richTextBox">
      <CopyPlainButton text={value} />
      <div
        ref={setNodeRef}
        className={className ? `richTextField ${className}` : 'richTextField'}
        contentEditable
        suppressContentEditableWarning
        data-empty={value === '' ? 'true' : undefined}
        data-placeholder={placeholder}
        onInput={handleInput}
        onPaste={edit.onPaste}
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <HighlightedText text={value} highlights={highlights} />
      </div>
      </div>
      {selection.range && (
        <RichTextToolbar
          rect={selection.rect}
          range={selection.range}
          highlights={highlights}
          onClose={closeToolbar}
          onApply={next => {
            // Возвращаем ВЫДЕЛЕНИЕ целиком, не каретку — иначе тулбар решит,
            // что выделение снято, и закроется после первого же клика
            pendingCaretRef.current = selection.range
            onChange({ [field]: value, [highlightsField]: next })
          }}
        />
      )}
    </>
  )
}
