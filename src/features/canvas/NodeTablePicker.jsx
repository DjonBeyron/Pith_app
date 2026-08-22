import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import TableEditorModal from './table-editor/TableEditorModal.jsx'
import { getVariantList, syncTriggers, triggersNeedSync, migrateDistractors } from './nodeVariants.js'

const BASE_PAIR = ['table_correct', 'table_wrong']

// Переход ноды в режиме показа — ровно как у обычного сообщения
function demoTriggers(hasAudio, keepThen) {
  return [hasAudio
    ? { id: crypto.randomUUID(), if: 'played', then: keepThen }
    : { id: crypto.randomUUID(), if: 'timer', ms: 3000, then: keepThen }]
}

// Управление нодой «Таблица»:
// — кнопка конструктора (открывает TableEditorModal)
// — переключатель режима: Авто (диктор) / Ручной (сборка фразы) / Показ
// — поле ответа: в обоих отвечающих режимах (нужно для проверки correct/wrong)
// — поля ручного режима: distractors, responseCorrect/Wrong
// — два порта триггеров: table_correct / table_wrong
//
// «Показ» — таблица без вопроса: приходит в чат обычным сообщением от учителя
// (TableDemoModule), ученик ничего не отвечает. Поэтому и переход у неё один,
// как у текста/голосового: «доиграло» при озвучке или таймер без неё.
export default function NodeTablePicker({
  tData, onDataChange, lessonFiles, onPickFile,
  triggers = [], allNodes = [], nodeId,
  onTriggersChange, onTriggerMeasure,
}) {
  const [open, setOpen] = useState(false)
  const [newD,  setNewD] = useState('')
  const [variantOpenIds, setVariantOpenIds] = useState(() => new Set())

  const rowRefs = useRef(new Map())

  const tableData   = tData.table       ?? null
  const mode        = tData.mode        ?? 'dictator'
  const distractors = tData.distractors ?? []

  // Раньше distractors — массив голых строк, без id не к чему привязать
  // особый триггер варианта. Переводим на {id, text} при первом обращении.
  useEffect(() => {
    const migrated = migrateDistractors(distractors)
    if (migrated !== distractors) onDataChange({ distractors: migrated })
  }, [distractors]) // eslint-disable-line react-hooks/exhaustive-deps

  const variantList = getVariantList('table', { distractors })
  const isDemo = mode === 'demo'

  // Нормализация триггеров: базовая пара table_correct/table_wrong + по
  // одному триггеру на distractor. В режиме показа пары нет — там один
  // обычный переход, его нормализовать нечем
  useEffect(() => {
    if (isDemo) return
    if (triggersNeedSync(BASE_PAIR, variantList, triggers)) {
      onTriggersChange?.(syncTriggers(BASE_PAIR, variantList, triggers))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, variantList.map(v => v.id).join(','), triggers.map(t => t.if).join(',')])

  // Показ: озвучку могли приложить или убрать уже после выбора режима —
  // держим переход в соответствии («доиграло» с аудио, таймер без него)
  useEffect(() => {
    if (!isDemo) return
    const want = tData.file_id ? 'played' : 'timer'
    if (triggers.length === 1 && triggers[0].if === want) return
    onTriggersChange?.(demoTriggers(!!tData.file_id, triggers.find(t => t.then)?.then ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, tData.file_id, triggers.map(t => t.if).join(',')])

  // Измерение Y-центров строк триггеров для рисования проводов
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
    onTriggersChange?.(triggers.map(t => (t.if === id ? { ...t, then: then || null } : t)))
  }

  function addDistractor() {
    const w = newD.trim()
    if (!w || distractors.some(d => d.text === w)) return
    onDataChange({ distractors: [...distractors, { id: crypto.randomUUID(), text: w }] })
    setNewD('')
  }

  function removeDistractor(id) {
    onDataChange({ distractors: distractors.filter(d => d.id !== id) })
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
        {tData.file_id && (
          <span className="nodeTableAudioBadge">
            ♪
            <button
              className="nodeTableAudioDel"
              title="Убрать аудио из ноды (разметка таймлайна останется)"
              onClick={e => {
                e.stopPropagation()
                if (!window.confirm('Убрать аудио из таблицы? Разметка таймлайна останется.')) return
                onDataChange({ file_id: null, waveformData: null, duration: null })
              }}
            >×</button>
          </span>
        )}
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
        <button
          className={`nodeTableModeBtn${isDemo ? ' nodeTableModeBtnActive' : ''}`}
          title="Таблица уходит в чат обычным сообщением, ученик ничего не отвечает"
          onClick={() => onDataChange({ mode: 'demo' })}
        >👁 Показ</button>
      </div>

      {!isDemo && (
        <label className="nodeTableSendChat" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={tData.sendToChat === true}
            onChange={e => onDataChange({ sendToChat: e.target.checked })}
          />
          Отправить таблицу в чат после ответа
        </label>
      )}

      {isDemo && (
        <p className="nodeTableDemoHint">
          Таблица придёт в чат сообщением от учителя, во всю ширину.
          Ответа не ждём: с озвучкой переход по её окончании, без неё — по таймеру.
        </p>
      )}

      {/* Правильный ответ — для отвечающих режимов (проверка + дорожки таймлайна) */}
      {!isDemo && (
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
                {distractors.map(d => (
                  <div key={d.id} className="nodePaDistractorRow" ref={el => rowRefs.current.set(d.id, el)}>
                    <span className="nodeTableDChip">
                      {d.text}
                      <button
                        className={`nodeWcGearBtn nodePaVariantBtn${variantThen(d.id) ? ' nodeWcGearBtnOn' : ''}`}
                        onClick={() => toggleVariantOpen(d.id)}
                        title="Особый переход для этого слова (замещает верно/неверно)"
                      >{variantOpenIds.has(d.id) ? '▾' : '▸'}</button>
                      <button onClick={() => removeDistractor(d.id)}>×</button>
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
      )}

      {/* Триггеры: два выхода — верно / неверно. В режиме показа выход один
          и рисует его общий блок «Если/Тогда» (NodeTriggerEditor) */}
      {!isDemo && (
      <div className="nodeWcTriggerWrap">
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('table_correct', el)}>
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
        <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set('table_wrong', el)}>
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
      )}

      {open && (
        <TableEditorModal
          initialTable={tableData}
          initialFileId={tData.file_id ?? null}
          initialWaveformData={tData.waveformData ?? null}
          initialDuration={tData.duration ?? null}
          initialTimeline={tData.timeline ?? null}
          initialTimelineLen={tData.timelineLen ?? null}
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
