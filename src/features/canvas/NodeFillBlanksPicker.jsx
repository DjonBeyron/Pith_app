import { useRef, useEffect } from 'react'
import NodeCorrectWrongTriggers from './NodeCorrectWrongTriggers.jsx'
import { countBlanks } from '../../shared/lib/fillBlanksTemplate.js'

// Редактор ноды «Составь предложение»: textarea с шаблоном фразы (пропуски —
// буквально "___") + по одной карточке настроек на каждый найденный пропуск
// (варианты выбора + отметка верного), тексты ответов, пара триггеров
// верно/неверно. Сигналов ошибок здесь нет — пользователь явно исключил их
// для этого модуля (см. PROJECT.md), в отличие от table/phrase_assembly.
export default function NodeFillBlanksPicker({
  template = '', blanks = [],
  responseCorrect = '', responseWrong = '',
  onTemplateChange, onBlanksChange,
  onResponseCorrectChange, onResponseWrongChange,
  sendAnswerToChat = false, onSendAnswerToChatChange,
  triggers = [], allNodes = [], nodeId, onTriggersChange, onTriggerMeasure,
}) {
  const rowRefs = useRef(new Map())
  const optionInputRefs = useRef(new Map())
  const blanksCount = countBlanks(template)

  // Число пропусков в blanks[] держим в шаге с числом "___" в шаблоне: автор
  // дописал ещё один пропуск в тексте — тут же появляется пустая карточка
  // под него; убрал — лишняя карточка исчезает. Тот же приём, что у
  // migrateDistractors в NodePhraseAssemblyPicker.jsx
  useEffect(() => {
    if (blanks.length === blanksCount) return
    onBlanksChange(Array.from({ length: blanksCount }, (_, i) => blanks[i] ?? { options: [], answer: '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blanksCount])

  useEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = ['fill_correct', 'fill_wrong'].map(k => {
      const el = rowRefs.current.get(k)
      return el ? el.offsetTop + el.offsetHeight / 2 : 0
    })
    onTriggerMeasure(offsets)
  })

  function updateBlank(i, patch) {
    onBlanksChange(blanks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  function addOption(i) {
    const el = optionInputRefs.current.get(i)
    const text = el?.value.trim()
    if (!text) return
    const b = blanks[i]
    if (!b.options.includes(text)) updateBlank(i, { options: [...b.options, text] })
    el.value = ''
    el.focus({ preventScroll: true })
  }

  function removeOption(i, text) {
    const b = blanks[i]
    updateBlank(i, {
      options: b.options.filter(o => o !== text),
      answer: b.answer === text ? '' : b.answer,
    })
  }

  const correctThen = (triggers.find(t => t.if === 'fill_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'fill_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      fill_correct: triggers.find(t => t.if === 'fill_correct') ?? triggers[0],
      fill_wrong:   triggers.find(t => t.if === 'fill_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange([
      { id: existing.fill_correct?.id ?? crypto.randomUUID(), if: 'fill_correct', then: existing.fill_correct?.then ?? null },
      { id: existing.fill_wrong?.id   ?? crypto.randomUUID(), if: 'fill_wrong',   then: existing.fill_wrong?.then   ?? null },
    ])
  }

  const otherNodes = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodeFbWrap" onClick={e => e.stopPropagation()}>
      <textarea
        className="nodeTextInput"
        value={template}
        onChange={e => onTemplateChange(e.target.value)}
        placeholder={'Фраза с пропусками, например: She ___ to cook every weekend.\nПропуск — ровно три подчёркивания ___ (можно внутри слова: tr___s)'}
        onClick={e => e.stopPropagation()}
        rows={3}
      />
      {blanksCount === 0 && template.trim() !== '' && (
        <p className="nodeFbHint">Нет ни одного пропуска — вставь ___ туда, где ученик выбирает вариант</p>
      )}
      {blanks.map((b, i) => (
        <div key={i} className="nodeFbBlankRow" ref={el => rowRefs.current.set(`blank-${i}`, el)}>
          <span className="nodeFbBlankLabel">Пропуск {i + 1}</span>
          <div className="nodePaDistractors">
            {b.options.map(opt => (
              <span key={opt} className="nodePaDistractorChip">
                <button
                  className={`nodeWcCorrectBtn${b.answer === opt ? ' nodeWcCorrectBtnOn' : ''}`}
                  onClick={() => updateBlank(i, { answer: opt })}
                  title="Верный вариант"
                >✓</button>
                {opt}
                <button className="nodePaDistractorDel" onClick={() => removeOption(i, opt)}>×</button>
              </span>
            ))}
            {b.options.length === 0 && <p className="nodeWcEmpty">Вариантов нет</p>}
          </div>
          <div className="nodeWcAddRow">
            <input
              ref={el => optionInputRefs.current.set(i, el)}
              className="nodeWcInput"
              placeholder="Добавь вариант..."
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(i) } }}
              onClick={e => e.stopPropagation()}
            />
            <button className="nodeWcAddBtn" onClick={() => addOption(i)}>+</button>
          </div>
        </div>
      ))}
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
      <label className="nodeTableSendChat" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={sendAnswerToChat === true}
          onChange={e => onSendAnswerToChatChange?.(e.target.checked)}
        />
        Отправить ответ ученика в чат после проверки
      </label>
      <NodeCorrectWrongTriggers
        correctThen={correctThen} wrongThen={wrongThen}
        correctKey="fill_correct" wrongKey="fill_wrong"
        onSetTrigger={setTrigger} otherNodes={otherNodes} rowRefs={rowRefs}
      />
    </div>
  )
}
