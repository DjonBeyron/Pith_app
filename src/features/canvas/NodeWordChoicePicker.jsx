import { useRef, useState, useLayoutEffect, useEffect } from 'react'
import NodeLessonLink from './NodeLessonLink.jsx'

export default function NodeWordChoicePicker({
  options = [],
  responseCorrect = '', responseWrong = '',
  onOptionsChange, onResponseCorrectChange, onResponseWrongChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
  statLessonId = null, onStatLessonChange, moduleLessons = [],
}) {
  const inputRef      = useRef(null)
  const correctRowRef = useRef(null)
  const wrongRowRef   = useRef(null)
  const [expandedId, setExpandedId] = useState(null) // вариант с раскрытыми настройками анализа

  // Normalize trigger format on mount.
  // CanvasBoard.handleMouseUp writes t.then by array INDEX, not by t.if.
  // If the node was saved before changeType initialized the format, triggers
  // may still be [{ if:'played', then: null }]. After normalization every drag
  // correctly maps to word_correct (index 0) / word_wrong (index 1).
  // Existing t.then connections are preserved during normalization.
  useEffect(() => {
    const hasCorrect = triggers.some(t => t.if === 'word_correct')
    const hasWrong   = triggers.some(t => t.if === 'word_wrong')
    // Чужие триггеры (например 'played', добавленный старой кнопкой «+») дают
    // лишний порт на ноде — вычищаем, но их связь не теряем: отдаём её
    // свободному word_correct.
    const foreign = triggers.filter(t => t.if !== 'word_correct' && t.if !== 'word_wrong')
    if (!hasCorrect || !hasWrong || foreign.length) {
      const correct = triggers.find(t => t.if === 'word_correct') ?? triggers[0]
      const wrong   = triggers.find(t => t.if === 'word_wrong')   ?? triggers[1]
      const adopt   = foreign.find(t => t.then)?.then ?? null
      onTriggersChange([
        { id: correct?.id ?? crypto.randomUUID(), if: 'word_correct', then: correct?.then ?? adopt },
        { id: wrong?.id   ?? crypto.randomUUID(), if: 'word_wrong',   then: wrong?.then   ?? null },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Measure y-center of each trigger row for CanvasConnections port positions
  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = [correctRowRef, wrongRowRef].map(r => {
      const el = r.current
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function addOption() {
    const text = inputRef.current?.value.trim()
    if (!text) return
    onOptionsChange([...options, { id: crypto.randomUUID(), text, isCorrect: false }])
    inputRef.current.value = ''
    inputRef.current.focus()
  }

  function toggleCorrect(id) {
    onOptionsChange(options.map(o => o.id === id ? { ...o, isCorrect: !o.isCorrect } : o))
  }

  function removeOption(id) {
    onOptionsChange(options.filter(o => o.id !== id))
  }

  function patchOption(id, diff) {
    onOptionsChange(options.map(o => o.id === id ? { ...o, ...diff } : o))
  }

  // Display: find by if-field, fall back to array index for the first render
  // before normalization effect has run.
  const correctThen = (triggers.find(t => t.if === 'word_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'word_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      word_correct: triggers.find(t => t.if === 'word_correct') ?? triggers[0],
      word_wrong:   triggers.find(t => t.if === 'word_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    // Always write normalized format so future lookups are consistent
    onTriggersChange([
      { id: existing.word_correct?.id ?? crypto.randomUUID(), if: 'word_correct', then: existing.word_correct?.then ?? null },
      { id: existing.word_wrong?.id   ?? crypto.randomUUID(), if: 'word_wrong',   then: existing.word_wrong?.then   ?? null },
    ])
  }

  const otherNodes = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodeWordChoiceWrap" onClick={e => e.stopPropagation()}>
      {/* привязка ноды к уроку для анализа (наследуется вариантами) */}
      <NodeLessonLink
        value={statLessonId}
        onChange={v => onStatLessonChange?.(v)}
        moduleLessons={moduleLessons}
      />
      {/* варианты */}
      <div className="nodeWordChoiceList">
        {options.map(o => (
          <div key={o.id} className="nodeWcOptionWrap">
            <div className="nodeWordChoiceRow">
              <button
                className={`nodeWcCorrectBtn${o.isCorrect ? ' nodeWcCorrectBtnOn' : ''}`}
                onClick={() => toggleCorrect(o.id)}
                title="Верный ответ"
              >✓</button>
              <span className="nodeWcOptionText">{o.text}</span>
              <button
                className={`nodeWcGearBtn${(o.statLessonId || o.signal) ? ' nodeWcGearBtnOn' : ''}`}
                onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                title="Анализ: свой урок / сигнал"
              >⚙</button>
              <button className="nodeWcDelBtn" onClick={() => removeOption(o.id)}>×</button>
            </div>
            {expandedId === o.id && (
              <div className="nodeWcOptSettings">
                <NodeLessonLink
                  value={o.statLessonId ?? null}
                  onChange={v => patchOption(o.id, { statLessonId: v })}
                  moduleLessons={moduleLessons}
                  emptyLabel="— как у ноды —"
                />
                <div className="nodeStatLinkRow">
                  <span className="nodeStatLinkLabel">Сигнал</span>
                  <select
                    className={`nodeStatLinkSelect${o.signal ? ' nodeStatLinkSelectOn' : ''}`}
                    value={o.signal ?? ''}
                    onChange={e => patchOption(o.id, { signal: e.target.value || null })}
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="">— нет (по галочке ✓) —</option>
                    <option value="know">знает (пропуск)</option>
                    <option value="dont_know">не знает / хочет объяснение</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
        {options.length === 0 && <p className="nodeWcEmpty">Вариантов нет</p>}
      </div>
      {/* добавить */}
      <div className="nodeWcAddRow">
        <input
          ref={inputRef}
          className="nodeWcInput"
          placeholder="Новый вариант..."
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
          onClick={e => e.stopPropagation()}
        />
        <button className="nodeWcAddBtn" onClick={addOption}>+</button>
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
            onChange={e => setTrigger('word_correct', e.target.value)}
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
            onChange={e => setTrigger('word_wrong', e.target.value)}
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
