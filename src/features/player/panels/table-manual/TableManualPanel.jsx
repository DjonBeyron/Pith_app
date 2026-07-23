import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'

// Разбить фразу ответа по словам, сопоставить с ячейками таблицы.
// Слова, найденные в таблице → type:'cell'; остальные → type:'extra'
function deriveTokens(answer, cells) {
  const words = (answer ?? '').trim().split(/\s+/).filter(Boolean)
  const usedIds = new Set()
  return words.map(word => {
    const cell = cells.find(
      c => c.value?.trim().toLowerCase() === word.toLowerCase() && !usedIds.has(c.id)
    )
    if (cell) {
      usedIds.add(cell.id)
      return { type: 'cell', cellId: cell.id, value: cell.value.trim() }
    }
    return { type: 'extra', value: word }
  })
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TableManualPanel({ node, onDone, onAnswered, onHeightChange }) {
  const tData       = node.typeData?.table ?? {}
  const table       = tData.table          ?? null
  const answer      = tData.answer         ?? ''
  const distractors = tData.distractors    ?? []
  const cells       = table?.cells         ?? []

  const tokens = useMemo(() => deriveTokens(answer, cells), [answer, cells])

  const answerCellIds = useMemo(
    () => new Set(tokens.filter(t => t.type === 'cell').map(t => t.cellId)),
    [tokens]
  )
  const extraFromAnswer = useMemo(
    () => tokens.filter(t => t.type === 'extra').map(t => t.value),
    [tokens]
  )
  const hasExtras = extraFromAnswer.length > 0 || distractors.length > 0

  // Список слов вне таблицы перемешивается один раз при маунте (lazy useState)
  const [shuffledExtras] = useState(() => shuffle([...extraFromAnswer, ...distractors]))

  const [show,      setShow]      = useState(false)
  const [assembled, setAssembled] = useState([])
  const [result,    setResult]    = useState(null)       // null | 'correct' | 'wrong'
  const [panelH,    setPanelH]    = useState(0)

  const panelRef   = useRef(null)
  const wrongCount = useRef(0)
  const timers     = useRef([])

  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    setPanelH(h); onHeightChange?.(h)
  }, []) // eslint-disable-line

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Очищаем все таймеры при анмаунте
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const assembledCellIds = useMemo(
    () => new Set(assembled.filter(t => t.type === 'cell').map(t => t.cellId)),
    [assembled]
  )
  const assembledExtraKeys = useMemo(
    () => new Set(assembled.filter(t => t.type === 'extra').map(t => t.key)),
    [assembled]
  )

  const allCellsDone = answerCellIds.size > 0 && [...answerCellIds].every(id => assembledCellIds.has(id))
  const canCheck     = allCellsDone && (!hasExtras || assembled.some(t => t.type === 'extra'))
  // Фаза полностью производная: extra только когда все ячейки выбраны и есть слова-ловушки
  const phase        = (allCellsDone && hasExtras) ? 'extra' : 'table'

  function tapCell(cellId) {
    if (!answerCellIds.has(cellId) || assembledCellIds.has(cellId) || result) return
    const val = cells.find(c => c.id === cellId)?.value?.trim() ?? ''
    setAssembled(prev => [...prev, { type: 'cell', cellId, value: val, key: `cell-${cellId}` }])
  }

  function tapExtra(word, idx) {
    const key = `extra-${idx}`
    if (assembledExtraKeys.has(key) || result) return
    setAssembled(prev => [...prev, { type: 'extra', value: word, key }])
  }

  function removeFromBox(i) {
    if (result) return
    setAssembled(prev => prev.filter((_, j) => j !== i))
    // фаза пересчитается автоматически (производная от allCellsDone + hasExtras)
  }

  function closePanelWith(trigger) {
    setShow(false)
    const id = setTimeout(() => { onHeightChange?.(0); onDone?.(trigger) }, 420)
    timers.current.push(id)
  }

  function check() {
    const phrase = assembled.map(t => t.value).join(' ')
    if (phrase.trim().toLowerCase() === answer.trim().toLowerCase()) {
      setResult('correct')
      if (tData.responseCorrect?.trim()) onAnswered?.(tData.responseCorrect, 'correct')
      const id = setTimeout(() => closePanelWith('table_correct'), 800)
      timers.current.push(id)
    } else {
      wrongCount.current += 1
      setResult('wrong')
      if (wrongCount.current === 1 && tData.responseWrong?.trim()) {
        onAnswered?.(tData.responseWrong, 'wrong')
      }
      if (wrongCount.current >= 3) {
        if (answer.trim()) onAnswered?.(answer, 'wrong_final')
        const id = setTimeout(() => closePanelWith('table_wrong'), 800)
        timers.current.push(id)
        return
      }
      const id = setTimeout(() => setResult(null), 700)
      timers.current.push(id)
    }
  }

  if (!table) return null

  const boxCls = [
    'tmAnswerBox',
    assembled.length > 0 && !result ? 'tmAnswerBoxFilled' : '',
    result === 'correct'            ? 'tmAnswerBoxOk'     : '',
    result === 'wrong'              ? 'tmAnswerBoxErr'     : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <div
        className="tmSpacer"
        style={{
          height: show ? panelH : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      <div ref={panelRef} className={`tmPanel${show ? ' tmPanelVisible' : ''}`}>
        <div className="tmPanelInner">

          {/* Бокс сборки: нажимая на чип — удаляем его из ответа */}
          <div className={boxCls}>
            {assembled.length === 0
              ? <span className="tmAnswerPlaceholder">Собери фразу…</span>
              : assembled.map((item, i) => (
                  <button
                    key={item.key}
                    className="tmAnswerChip"
                    onClick={() => removeFromBox(i)}
                    disabled={result === 'correct'}
                  >{item.value}</button>
                ))
            }
          </div>

          {/* Область со сдвигом таблицы и словами-ловушками */}
          <div className="tmStage">
            <div className={`tmTableSection${phase === 'extra' ? ' tmTableSectionSlid' : ''}`}>
              <TableGrid
                columns={table.columns}
                rows={table.rows}
                cells={table.cells}
                rowCount={table.rowCount}
                selectedIds={assembledCellIds}
                onCellClick={phase === 'table' && !result ? cell => tapCell(cell.id) : undefined}
              />
            </div>

            {phase === 'extra' && (
              <div className="tmExtrasSection">
                {shuffledExtras.map((word, i) => {
                  const used = assembledExtraKeys.has(`extra-${i}`)
                  return (
                    <button
                      key={i}
                      style={{ animationDelay: `${i * 50}ms` }}
                      className={`tmExtraChip${used ? ' tmExtraChipUsed' : ''}`}
                      onClick={() => tapExtra(word, i)}
                      disabled={used || !!result}
                    >{word}</button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            className="tmCheckBtn"
            onClick={check}
            disabled={!canCheck || !!result}
          >Проверить</button>

        </div>
      </div>
    </>
  )
}
