import { useRef, useState, useLayoutEffect, useEffect } from 'react'
import { getVariantList, syncTriggers, triggersNeedSync, migrateDistractors } from './nodeVariants.js'

const BASE_PAIR = ['phrase_correct', 'phrase_wrong']

export default function NodePhraseAssemblyPicker({
  words = [], distractors = [],
  responseCorrect = '', responseWrong = '',
  onWordsChange, onDistractorsChange,
  onResponseCorrectChange, onResponseWrongChange,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const wordInputRef = useRef(null)
  const distInputRef = useRef(null)
  const rowRefs = useRef(new Map())
  const [wordText, setWordText] = useState('')
  const [variantOpenIds, setVariantOpenIds] = useState(() => new Set())

  // Раньше distractors — массив голых строк, без id не к чему привязать
  // особый триггер варианта. Переводим на {id, text} при первом обращении.
  useEffect(() => {
    const migrated = migrateDistractors(distractors)
    if (migrated !== distractors) onDistractorsChange(migrated)
  }, [distractors]) // eslint-disable-line react-hooks/exhaustive-deps

  const variantList = getVariantList('phrase_assembly', { distractors })

  // Normalize trigger format: базовая пара + по одному триггеру на distractor
  useEffect(() => {
    if (triggersNeedSync(BASE_PAIR, variantList, triggers)) {
      onTriggersChange(syncTriggers(BASE_PAIR, variantList, triggers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantList.map(v => v.id).join(','), triggers.map(t => t.if).join(',')])

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

  function commitWords() {
    const newWords = wordText.split(/\s+/).filter(Boolean)
    if (!newWords.length) return
    onWordsChange([...words, ...newWords])
    setWordText('')
    wordInputRef.current?.focus({ preventScroll: true })
  }

  function removeWord(idx) {
    onWordsChange(words.filter((_, i) => i !== idx))
  }

  function addDistractor() {
    const text = distInputRef.current?.value.trim()
    if (!text || distractors.some(d => d.text === text)) return
    onDistractorsChange([...distractors, { id: crypto.randomUUID(), text }])
    distInputRef.current.value = ''
    distInputRef.current.focus({ preventScroll: true })
  }

  function removeDistractor(id) {
    onDistractorsChange(distractors.filter(d => d.id !== id))
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
        {distractors.map(d => (
          <div key={d.id} className="nodePaDistractorRow" ref={el => rowRefs.current.set(d.id, el)}>
            <span className="nodePaDistractorChip">
              {d.text}
              <button
                className={`nodeWcGearBtn nodePaVariantBtn${variantThen(d.id) ? ' nodeWcGearBtnOn' : ''}`}
                onClick={() => toggleVariantOpen(d.id)}
                title="Особый переход для этого слова (замещает верно/неверно)"
              >{variantOpenIds.has(d.id) ? '▾' : '▸'}</button>
              <button className="nodePaDistractorDel" onClick={() => removeDistractor(d.id)}>×</button>
            </span>
            {variantOpenIds.has(d.id) && (
              <div className="nodeWcTriggerRow nodeWcVariantRow">
                <span className="nodeWcTriggerLabel">↳ Особый переход →</span>
                <select
                  className="nodeWcTriggerSelect"
                  value={variantThen(d.id)}
                  onChange={e => setVariantThen(d.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">— как верно/неверно —</option>
                  {otherNodes.map(n => (
                    <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
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
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('phrase_correct', el)}>
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
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('phrase_wrong', el)}>
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
