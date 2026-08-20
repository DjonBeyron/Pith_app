import { useRef, useState, useLayoutEffect, useEffect } from 'react'
import NodeLessonLink from './NodeLessonLink.jsx'
import NodeWordChoiceResponses from './NodeWordChoiceResponses.jsx'
import { getVariantList, syncTriggers, triggersNeedSync } from './nodeVariants.js'

const BASE_PAIR = ['word_correct', 'word_wrong']

export default function NodeWordChoicePicker({
  options = [],
  responseCorrect = '', responseWrong = '',
  sendPickToChat = false, onSendPickChange,
  onOptionsChange, onResponseCorrectChange, onResponseWrongChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
  statLessonId = null, onStatLessonChange, moduleLessons = [],
}) {
  const inputRef = useRef(null)
  // Y-координаты портов: базовая пара + по одному на вариант — Map, а не
  // фиксированные refs, т.к. число вариантов произвольное
  const rowRefs = useRef(new Map())
  const [expandedId, setExpandedId] = useState(null) // вариант с раскрытыми настройками анализа
  // Варианты с раскрытым «особым переходом» — отдельно от expandedId
  // (аналитика и особый переход — разные панели одной строки)
  const [variantOpenIds, setVariantOpenIds] = useState(() => new Set())

  const variantList = getVariantList('word_choice', { options })

  // Нормализация триггеров: базовая пара word_correct/word_wrong + по одному
  // триггеру на вариант (id варианта — ключ). CanvasBoard.handleMouseUp пишет
  // t.then по индексу массива, поэтому порядок здесь должен совпадать с
  // порядком строк — держит canonicalIfs внутри syncTriggers.
  useEffect(() => {
    if (triggersNeedSync(BASE_PAIR, variantList, triggers)) {
      onTriggersChange(syncTriggers(BASE_PAIR, variantList, triggers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantList.map(v => v.id).join(','), triggers.map(t => t.if).join(',')])

  // Measure y-center of each trigger row for CanvasConnections port positions
  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const keys = [...BASE_PAIR, ...variantList.map(v => v.id)]
    const offsets = keys.map(k => {
      const el = rowRefs.current.get(k)
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function toggleVariantOpen(id) {
    setVariantOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function variantThen(id) {
    return triggers.find(t => t.if === id)?.then ?? ''
  }

  function setVariantThen(id, then) {
    onTriggersChange(triggers.map(t => (t.if === id ? { ...t, then: then || null } : t)))
  }

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
          <div key={o.id} className="nodeWcOptionWrap" ref={el => rowRefs.current.set(o.id, el)}>
            <div className="nodeWordChoiceRow">
              <button
                className={`nodeWcCorrectBtn${o.isCorrect ? ' nodeWcCorrectBtnOn' : ''}`}
                onClick={() => toggleCorrect(o.id)}
                title="Верный ответ"
              >✓</button>
              {/* Текст варианта правится прямо здесь: id не меняется, поэтому
                  особый переход и привязка к уроку остаются на месте */}
              <input
                className="nodeWcOptionText nodeWcOptionInput"
                value={o.text}
                onChange={e => patchOption(o.id, { text: e.target.value })}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                placeholder="Вариант…"
              />
              <button
                className={`nodeWcGearBtn${variantThen(o.id) ? ' nodeWcGearBtnOn' : ''}`}
                onClick={() => toggleVariantOpen(o.id)}
                title="Особый переход для этого варианта (замещает верно/неверно)"
              >{variantOpenIds.has(o.id) ? '▾' : '▸'}</button>
              <button
                className={`nodeWcGearBtn${(o.statLessonId || o.signal) ? ' nodeWcGearBtnOn' : ''}`}
                onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                title="Анализ: свой урок / сигнал"
              >⚙</button>
              <button className="nodeWcDelBtn" onClick={() => removeOption(o.id)}>×</button>
            </div>
            {variantOpenIds.has(o.id) && (
              <div className="nodeWcTriggerRow nodeWcVariantRow">
                <span className="nodeWcTriggerLabel">↳ Особый переход →</span>
                <select
                  className="nodeWcTriggerSelect"
                  value={variantThen(o.id)}
                  onChange={e => setVariantThen(o.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">— как верно/неверно —</option>
                  {otherNodes.map(n => (
                    <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
                  ))}
                </select>
              </div>
            )}
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
      {/* что уходит в чат после ответа */}
      <NodeWordChoiceResponses
        responseCorrect={responseCorrect}
        responseWrong={responseWrong}
        onResponseCorrectChange={onResponseCorrectChange}
        onResponseWrongChange={onResponseWrongChange}
        sendPickToChat={sendPickToChat}
        onSendPickChange={onSendPickChange}
      />
      {/* триггеры */}
      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('word_correct', el)}>
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
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('word_wrong', el)}>
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
