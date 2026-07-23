import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import TableEditorModal from './table-editor/TableEditorModal.jsx'

// Управление нодой «Таблица»:
// — кнопка конструктора (открывает TableEditorModal)
// — переключатель режима: Авто (диктор) / Ручной (сборка фразы)
// — поле ответа: в ОБОИХ режимах (нужно для проверки correct/wrong)
// — поля ручного режима: distractors, responseCorrect/Wrong
// — два порта триггеров: table_correct / table_wrong
export default function NodeTablePicker({
  tData, onDataChange, lessonFiles, onPickFile,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const [open, setOpen] = useState(false)
  const [newD,  setNewD] = useState('')

  const correctRowRef = useRef(null)
  const wrongRowRef   = useRef(null)

  const tableData   = tData.table       ?? null
  const mode        = tData.mode        ?? 'dictator'
  const distractors = tData.distractors ?? []

  // Нормализация триггеров: гарантируем пару table_correct / table_wrong
  useEffect(() => {
    const hasCorrect = triggers.some(t => t.if === 'table_correct')
    const hasWrong   = triggers.some(t => t.if === 'table_wrong')
    const foreign    = triggers.filter(t => t.if !== 'table_correct' && t.if !== 'table_wrong')
    if (!hasCorrect || !hasWrong || foreign.length) {
      const correct = triggers.find(t => t.if === 'table_correct') ?? triggers[0]
      const wrong   = triggers.find(t => t.if === 'table_wrong')   ?? triggers[1]
      const adopt   = foreign.find(t => t.then)?.then ?? null
      onTriggersChange?.([
        { id: correct?.id ?? crypto.randomUUID(), if: 'table_correct', then: correct?.then ?? adopt },
        { id: wrong?.id   ?? crypto.randomUUID(), if: 'table_wrong',   then: wrong?.then   ?? null },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Измерение Y-центров строк триггеров для рисования проводов
  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = [correctRowRef, wrongRowRef].map(r => {
      const el = r.current
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  function addDistractor() {
    const w = newD.trim()
    if (!w) return
    onDataChange({ distractors: [...distractors, w] })
    setNewD('')
  }

  function removeDistractor(i) {
    onDataChange({ distractors: distractors.filter((_, j) => j !== i) })
  }

  const correctThen = (triggers.find(t => t.if === 'table_correct') ?? triggers[0])?.then ?? ''
  const wrongThen   = (triggers.find(t => t.if === 'table_wrong')   ?? triggers[1])?.then ?? ''

  function setTrigger(ifVal, then) {
    const existing = {
      table_correct: triggers.find(t => t.if === 'table_correct') ?? triggers[0],
      table_wrong:   triggers.find(t => t.if === 'table_wrong')   ?? triggers[1],
    }
    existing[ifVal] = { ...existing[ifVal], then: then || null }
    onTriggersChange?.([
      { id: existing.table_correct?.id ?? crypto.randomUUID(), if: 'table_correct', then: existing.table_correct?.then ?? null },
      { id: existing.table_wrong?.id   ?? crypto.randomUUID(), if: 'table_wrong',   then: existing.table_wrong?.then   ?? null },
    ])
  }

  const otherNodes = allNodes.filter(n => n.id !== nodeId)

  return (
    <div className="nodeTablePickerWrap" onClick={e => e.stopPropagation()}>

      <div className="nodeTablePickerRow">
        <button className="nodeTablePickerBtn" onClick={() => setOpen(true)}>
          {tableData
            ? `Редактировать таблицу (${tableData.rowCount}×${tableData.colCount})`
            : '+ Создать таблицу'}
        </button>
        {tData.file_id && <span className="nodeTableAudioBadge">♪</span>}
      </div>

      {/* Режим */}
      <div className="nodeTableModeRow">
        <button
          className={`nodeTableModeBtn${mode === 'dictator' ? ' nodeTableModeBtnActive' : ''}`}
          onClick={() => onDataChange({ mode: 'dictator' })}
        >♪ Авто</button>
        <button
          className={`nodeTableModeBtn${mode === 'manual' ? ' nodeTableModeBtnActive' : ''}`}
          onClick={() => onDataChange({ mode: 'manual' })}
        >✍ Ручной</button>
      </div>

      {/* Правильный ответ — для ОБОИХ режимов (нужен для проверки и дорожек таймлайна) */}
      <div className="nodeTableManualFields">
        <input
          className="nodeTableManualInput"
          value={tData.answer ?? ''}
          onChange={e => onDataChange({ answer: e.target.value })}
          placeholder="Правильный ответ (фраза целиком)"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />

        {/* Дополнительные поля — только в ручном режиме */}
        {mode === 'manual' && (
          <>
            <div className="nodeTableDRow">
              <input
                className="nodeTableManualInput"
                value={newD}
                onChange={e => setNewD(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDistractor()}
                placeholder="Слово-ловушка + Enter"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
              <button className="nodeTableDAdd" onClick={addDistractor}>+</button>
            </div>
            {distractors.length > 0 && (
              <div className="nodeTableDList">
                {distractors.map((w, i) => (
                  <span key={i} className="nodeTableDChip">
                    {w}<button onClick={() => removeDistractor(i)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input
              className="nodeTableManualInput"
              value={tData.responseCorrect ?? ''}
              onChange={e => onDataChange({ responseCorrect: e.target.value })}
              placeholder="Ответ верный (сообщение в чате)"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            />
            <input
              className="nodeTableManualInput"
              value={tData.responseWrong ?? ''}
              onChange={e => onDataChange({ responseWrong: e.target.value })}
              placeholder="Ответ неверный (сообщение в чате)"
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            />
          </>
        )}
      </div>

      {/* Триггеры: два выхода — верно / неверно */}
      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={correctRowRef}>
          <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">✓ Верно →</span>
          <select
            className="nodeWcTriggerSelect"
            value={correctThen}
            onChange={e => setTrigger('table_correct', e.target.value)}
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
            onChange={e => setTrigger('table_wrong', e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">—</option>
            {otherNodes.map(n => (
              <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <TableEditorModal
          initialTable={tableData}
          initialFileId={tData.file_id ?? null}
          initialWaveformData={tData.waveformData ?? null}
          initialDuration={tData.duration ?? null}
          initialTimeline={tData.timeline ?? null}
          initialAnswer={tData.answer ?? ''}
          lessonFiles={lessonFiles}
          onPickFile={onPickFile}
          onSave={data => { onDataChange(data); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
