import { useRef, useState, useLayoutEffect, useEffect } from 'react'

export default function NodePhraseAssemblyPicker({
  words = [], distractors = [],
  responseCorrect = '', responseWrong = '',
  onWordsChange, onDistractorsChange,
  onResponseCorrectChange, onResponseWrongChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const wordInputRef  = useRef(null)
  const distInputRef  = useRef(null)
  const correctRowRef = useRef(null)
  const wrongRowRef   = useRef(null)
  const [wordText, setWordText] = useState('')

  // Normalize trigger format on mount (same pattern as NodeWordChoicePicker)
  useEffect(() => {
    const hasCorrect = triggers.some(t => t.if === 'phrase_correct')
    const hasWrong   = triggers.some(t => t.if === 'phrase_wrong')
    if (!hasCorrect || !hasWrong) {
      onTriggersChange([
        { id: triggers[0]?.id ?? crypto.randomUUID(), if: 'phrase_correct', then: triggers[0]?.then ?? null },
        { id: triggers[1]?.id ?? crypto.randomUUID(), if: 'phrase_wrong',   then: triggers[1]?.then ?? null },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = [correctRowRef, wrongRowRef].map(r => {
      const el = r.current
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function commitWords() {
    const newWords = wordText.split(/\s+/).filter(Boolean)
    if (!newWords.length) return
    onWordsChange([...words, ...newWords])
    setWordText('')
    wordInputRef.current?.focus()
  }

  function removeWord(idx) {
    onWordsChange(words.filter((_, i) => i !== idx))
  }

  function addDistractor() {
    const text = distInputRef.current?.value.trim()
    if (!text || distractors.includes(text)) return
    onDistractorsChange([...distractors, text])
    distInputRef.current.value = ''
    distInputRef.current.focus()
  }

  // Display: find by if-field, fallback to index for pre-normalization render
  const correctThen = (triggers.find(t => t.if === 'phrase_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'phrase_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      phrase_correct: triggers.find(t => t.if === 'phrase_correct') ?? triggers[0],
      phrase_wrong:   triggers.find(t => t.if === 'phrase_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange([
      { id: existing.phrase_correct?.id ?? crypto.randomUUID(), if: 'phrase_correct', then: existing.phrase_correct?.then ?? null },
      { id: existing.phrase_wrong?.id   ?? crypto.randomUUID(), if: 'phrase_wrong',   then: existing.phrase_wrong?.then   ?? null },
    ])
  }

  const otherNodes = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodePaWrap" onClick={e => e.stopPropagation()}>
      {/* слова фразы */}
      <div className="nodeWcAddRow">
        <input
          ref={wordInputRef}
          className="nodeWcInput"
          value={wordText}
          onChange={e => setWordText(e.target.value)}
          placeholder="введи фразу..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitWords() } }}
          onClick={e => e.stopPropagation()}
        />
        <button className="nodeWcAddBtn" onClick={commitWords}>✓</button>
      </div>
      {words.length > 0 && (
        <div className="nodePaWordsPreview">
          {words.map((w, i) => (
            <span key={i} className="nodePaWordChip">
              {w}
              <button className="nodePaDistractorDel" onClick={() => removeWord(i)}>×</button>
            </span>
          ))}
        </div>
      )}
      {/* лишние слова */}
      <p className="nodePaLabel">Лишние слова</p>
      <div className="nodePaDistractors">
        {distractors.map((d, i) => (
          <span key={i} className="nodePaDistractorChip">
            {d}
            <button className="nodePaDistractorDel" onClick={() => onDistractorsChange(distractors.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <div className="nodeWcAddRow">
        <input
          ref={distInputRef}
          className="nodeWcInput"
          placeholder="Доп. слово..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDistractor() } }}
          onClick={e => e.stopPropagation()}
        />
        <button className="nodeWcAddBtn" onClick={addDistractor}>+</button>
      </div>
      {/* тексты ответов */}
      <div className="nodeWcResponseWrap">
        <div className="nodeWcResponseRow">
          <span className="nodeWcResponseLabel nodeWcResponseLabelOk">✓</span>
          <input
            className="nodeWcResponseInput"
            value={responseCorrect}
            onChange={e => onResponseCorrectChange(e.target.value)}
            placeholder="Текст верного ответа..."
            onClick={e => e.stopPropagation()}
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
          />
        </div>
      </div>
      {/* триггеры */}
      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={correctRowRef}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">✓ Верно →</span>
          <select
            className="nodeWcTriggerSelect"
            value={correctThen}
            onChange={e => setTrigger('phrase_correct', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">—</option>
            {otherNodes.map(n => (
              <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
            ))}
          </select>
        </div>
        <div className="nodeWcTriggerRow" ref={wrongRowRef}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelErr">✗ Неверно →</span>
          <select
            className="nodeWcTriggerSelect"
            value={wrongThen}
            onChange={e => setTrigger('phrase_wrong', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">—</option>
            {otherNodes.map(n => (
              <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
