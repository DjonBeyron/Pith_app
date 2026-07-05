import { useEffect, useState } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import ReplyPreview from '../../ReplyPreview.jsx'
import TranslationSection from '../../TranslationSection.jsx'
import HighlightedText from '../../../../shared/ui/HighlightedText.jsx'

// Иконка перевода (стиль Google Translate: 文 + A) — когда надпись не задана
function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
    </svg>
  )
}

export default function TextModule({ node, lessonNodes = [], lessonFiles = [], teacherName, allWordChoiceStates, allPhotoChoiceStates, allPhraseStates, onDone }) {
  useEffect(() => { onDone?.() }, []) // eslint-disable-line
  const tData      = node.typeData?.text ?? {}
  const content    = tData.content ?? ''
  const highlights = tData.highlights ?? []
  const replyToSeq = tData.replyToSeq
  const replyNode  = replyToSeq > 0 ? lessonNodes.find(n => n.seq === replyToSeq) : null

  // Про-режим: перевод по кнопке на пузыре (RU/EN/...)
  const pro = !!tData.pro && !!(tData.proText ?? '').trim()
  const [trOpen,    setTrOpen]    = useState(false)
  const [typingKey, setTypingKey] = useState(0) // растёт при каждом открытии — печать заново

  // Открытие — кнопкой (она плавно тает), закрытие — тапом по самому переводу
  function openTr(e) {
    e.stopPropagation()
    setTypingKey(k => k + 1)
    setTrOpen(true)
  }
  function closeTr(e) {
    e.stopPropagation()
    setTrOpen(false)
  }

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--text">
        {replyNode && (
          <ReplyPreview
            replyNode={replyNode}
            lessonFiles={lessonFiles}
            teacherName={teacherName}
            allWordChoiceStates={allWordChoiceStates}
            allPhotoChoiceStates={allPhotoChoiceStates}
            allPhraseStates={allPhraseStates}
          />
        )}
        <p className="playerText">
          {content
            ? <HighlightedText text={content} highlights={highlights} />
            : <span className="playerTextEmpty">Пустой текст</span>
          }
        </p>
        {pro && (
          /* «Призрак» перевода: невидим и не занимает высоты, но участвует в
             расчёте ширины — пузырь сразу и НАВСЕГДА нужной ширины. Рендерится
             всегда (в т.ч. при открытом переводе): печать начинается с нуля
             символов, и без призрака ширина схлопывалась бы и рисовалась заново */
          <div className="trGhost" aria-hidden="true">
            <p className="playerText">{tData.proText}</p>
          </div>
        )}
        {pro && (
          <TranslationSection
            open={trOpen}
            typingKey={typingKey}
            text={tData.proText}
            highlights={tData.proHighlights ?? []}
            reveal={tData.proReveal ?? 'type'}
            onCollapse={closeTr}
          />
        )}
      </PlayerBubble>
      {pro && (() => {
        /* Кнопка перевода — РЯДОМ с пузырём: тёмный кружок с иконкой
           перевода; если в редакторе задана надпись — пилл с текстом */
        const trLabel = (tData.proLabel ?? '').trim()
        return (
          <button
            className={`playerTrBtn${trLabel ? '' : ' playerTrBtn--icon'}${trOpen ? ' playerTrBtnGone' : ''}`}
            onClick={openTr}
            disabled={trOpen}
            aria-label="Перевести"
          >
            {trLabel || <TranslateIcon />}
          </button>
        )
      })()}
    </div>
  )
}
