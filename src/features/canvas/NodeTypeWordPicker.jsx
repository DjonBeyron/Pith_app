import { useRef, useEffect } from 'react'
import NodeCorrectWrongTriggers from './NodeCorrectWrongTriggers.jsx'
import NodeSignalsPicker from './NodeSignalsPicker.jsx'
import { typeWordSlots } from '../../shared/lib/signalSlots.js'
import { cleanExtraLetters, litChars } from '../../shared/lib/typeWordKeys.js'
import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Редактор ноды «Напечатай слово»: само слово, дополнительные буквы (их админ выбирает
// вручную — они тоже светятся на клавиатуре и работают как «ловушки»), тексты ответов
// сигналы ошибок (слот = буква слова: подсказка на первую неверную букву, как у «Собери
// фразу») и пара триггеров верно/неверно. Напечатанное слово всегда уходит в чат —
// отдельной галочки нет.
export default function NodeTypeWordPicker({
  word = '', extraLetters = '', responseCorrect = '', responseWrong = '',
  onWordChange, onExtraChange, onResponseCorrectChange, onResponseWrongChange,
  signals = [], onSignalsChange, onSignalMeasure,
  triggers = [], allNodes = [], nodeId, onTriggersChange, onTriggerMeasure,
}) {
  const rowRefs = useRef(new Map())
  const extraInputRef = useRef(null)

  useEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = ['type_correct', 'type_wrong'].map(k => {
      const el = rowRefs.current.get(k)
      return el ? el.offsetTop + el.offsetHeight / 2 : 0
    })
    onTriggerMeasure(offsets)
  })

  const wordLit = [...litChars(word)].filter(ch => ch !== ' ')
  const extraList = [...cleanExtraLetters(extraLetters)]

  // Буква слова и так светится — в «дополнительные» её не кладём
  function addExtra() {
    const el = extraInputRef.current
    if (!el) return
    const lit = litChars(word)
    const added = [...cleanExtraLetters(el.value)].filter(ch => !lit.has(ch))
    if (added.length) onExtraChange(cleanExtraLetters(extraLetters + added.join('')))
    el.value = ''
    el.focus({ preventScroll: true })
  }

  const correctThen = (triggers.find(t => t.if === 'type_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'type_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      type_correct: triggers.find(t => t.if === 'type_correct') ?? triggers[0],
      type_wrong:   triggers.find(t => t.if === 'type_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange([
      { id: existing.type_correct?.id ?? crypto.randomUUID(), if: 'type_correct', then: existing.type_correct?.then ?? null },
      { id: existing.type_wrong?.id   ?? crypto.randomUUID(), if: 'type_wrong',   then: existing.type_wrong?.then   ?? null },
    ])
  }

  return (
    <div className="nodeTwWrap" onClick={e => e.stopPropagation()}>
      <input
        className="nodeWcInput"
        value={word}
        onChange={e => onWordChange(e.target.value)}
        placeholder="Слово, которое напечатает ученик (например: tries)"
        onClick={e => e.stopPropagation()}
        {...NO_AUTOCORRECT}
      />
      <span className="nodeTwLabel">Дополнительные буквы</span>
      <div className="nodeWcAddRow">
        <input
          ref={extraInputRef}
          className="nodeWcInput"
          placeholder="Лишние буквы, например xz..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }}
          onClick={e => e.stopPropagation()}
          {...NO_AUTOCORRECT}
        />
        <button className="nodeWcAddBtn" onClick={addExtra}>+</button>
      </div>
      <div className="nodePaDistractors">
        {wordLit.map(ch => <span key={`w${ch}`} className="nodeTwLetter">{ch}</span>)}
        {extraList.map(ch => (
          <span key={`e${ch}`} className="nodeTwLetter nodeTwLetterExtra">
            {ch}
            <button className="nodePaDistractorDel" onClick={() => onExtraChange(extraList.filter(c => c !== ch).join(''))}>×</button>
          </span>
        ))}
        {wordLit.length === 0 && extraList.length === 0 && <p className="nodeWcEmpty">Букв пока нет</p>}
      </div>
      <p className="nodeTwHint">
        Ученик печатает слово на клавиатуре — светятся только буквы слова (серые) и добавленные тобой (зелёные).
      </p>
      <div className="nodeWcResponseWrap">
        <div className="nodeWcResponseRow">
          <span className="nodeWcResponseLabel nodeWcResponseLabelOk">✓</span>
          <input
            className="nodeWcResponseInput"
            value={responseCorrect}
            onChange={e => onResponseCorrectChange(e.target.value)}
            placeholder="Текст верного ответа..."
            onClick={e => e.stopPropagation()}
            {...NO_AUTOCORRECT}
          />
        </div>
        <div className="nodeWcResponseRow">
          <span className="nodeWcResponseLabel nodeWcResponseLabelErr">✗</span>
          <input
            className="nodeWcResponseInput"
            value={responseWrong}
            onChange={e => onResponseWrongChange(e.target.value)}
            placeholder="Текст неверного ответа..."
            onClick={e => e.stopPropagation()}
            {...NO_AUTOCORRECT}
          />
        </div>
      </div>
      <NodeSignalsPicker
        slots={typeWordSlots(word)}
        signals={signals}
        onChange={onSignalsChange}
        otherNodes={allNodes.filter(n => n.id !== nodeId)}
        onSignalMeasure={onSignalMeasure}
      />
      <NodeCorrectWrongTriggers
        correctThen={correctThen} wrongThen={wrongThen}
        correctKey="type_correct" wrongKey="type_wrong"
        onSetTrigger={setTrigger} otherNodes={allNodes.filter(n => n.id !== nodeId)} rowRefs={rowRefs}
      />
    </div>
  )
}
