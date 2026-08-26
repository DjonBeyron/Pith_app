import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import CellOptionsMenu from './CellOptionsMenu.jsx'
import { deriveAnswerTokens, normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { cellIsPickable, allCellsPicked } from './manualCellPick.js'


function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// onAnswerToChat(text, result) — галочка «отправить ответ ученика в чат»:
// собранная фраза уходит пузырём справа. Верная — сразу; неверная — ОДИН раз,
// последней (третьей) попыткой: промежуточные варианты в переписке не нужны.
export default function TableManualPanel({ node, onDone, onAnswered, onAnswerToChat, onHeightChange, onSendToChat }) {
  const tData       = node.typeData?.table ?? {}
  const table       = tData.table          ?? null
  const answer      = tData.answer         ?? ''
  const distractors = tData.distractors    ?? []
  const cells       = table?.cells         ?? []

  const tokens = useMemo(() => deriveAnswerTokens(answer, cells), [answer, cells])

  // Куски ответа, которые собираются из таблицы. Работаем со ЗНАЧЕНИЯМИ, а не
  // с id ячеек: одно и то же слово стоит в таблице в нескольких местах
  // (manualCellPick.js)
  const cellTokens = useMemo(() => tokens.filter(t => t.type === 'cell'), [tokens])
  const extraFromAnswer = useMemo(
    () => tokens.filter(t => t.type === 'extra').map(t => t.value),
    [tokens]
  )
  const hasExtras = extraFromAnswer.length > 0 || distractors.length > 0

  // Список слов вне таблицы перемешивается один раз при маунте (lazy useState).
  // distractorId нужен, чтобы при неверном ответе понять, какое именно
  // слово-ловушка попало в собранную фразу (особый переход варианта,
  // nodeVariants.js) — у настоящих «лишних» слов из ответа его нет
  const [shuffledExtras] = useState(() => shuffle([
    ...extraFromAnswer.map(w => ({ text: w, distractorId: null })),
    ...distractors.map(d => ({ text: d.text, distractorId: d.id })),
  ]))

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

  const allCellsDone = allCellsPicked(cellTokens, assembled)
  // Фаза полностью производная: extra только когда все ячейки выбраны и есть слова-ловушки
  const phase        = (allCellsDone && hasExtras) ? 'extra' : 'table'

  // Особая ячейка: вместо того чтобы сразу уйти в фразу, открывает меню
  // своих вариантов — какое значение выбрал ученик, то и соберётся
  const [cellMenu, setCellMenu] = useState(null)   // { cellId, options, rect }

  function tapCell(cellId, rect) {
    if (assembledCellIds.has(cellId) || result) return
    const cell = cells.find(c => c.id === cellId)
    // Нажать можно любую ячейку, чьё значение ещё нужно ответу — не важно, в
    // какой она строке (в таблице «to be» одно «was» стоит в нескольких)
    if (!cellIsPickable(cell, cellTokens, assembled)) return
    const options = cell?.options ?? []
    if (options.length) { setCellMenu({ cellId, options, rect }); return }
    pickCell(cellId, cell?.value?.trim() ?? '')
  }

  function pickCell(cellId, value) {
    setCellMenu(null)
    setAssembled(prev => [...prev, { type: 'cell', cellId, value, key: `cell-${cellId}` }])
  }

  function tapExtra(chip, idx) {
    const key = `extra-${idx}`
    if (assembledExtraKeys.has(key) || result) return
    setAssembled(prev => [...prev, { type: 'extra', value: chip.text, key, distractorId: chip.distractorId }])
  }

  function removeFromBox(i) {
    if (result) return
    setAssembled(prev => prev.filter((_, j) => j !== i))
    // фаза пересчитается автоматически (производная от allCellsDone + hasExtras)
  }

  function closePanelWith(trigger, variantId) {
    // Галочка «отправить таблицу в чат»: таблица уходит сообщением следом за
    // разбором — с небольшой паузой, чтобы не наехать на уезжающую панель
    if (onSendToChat) timers.current.push(setTimeout(onSendToChat, 600))
    setShow(false)
    const id = setTimeout(() => { onHeightChange?.(0); onDone?.(trigger, variantId) }, 420)
    timers.current.push(id)
  }

  function check() {
    // Разбор закончен — открытое меню ячейки уже ни к чему
    setCellMenu(null)
    const phrase = assembled.map(t => t.value).join(' ')
    // Сверяем по смыслу (тот же normalizeAnswerText, что и в дикторе): регистр,
    // лишние пробелы/переносы из ячейки и вид апострофа значения не имеют
    if (normalizeAnswerText(phrase) === normalizeAnswerText(answer)) {
      setResult('correct')
      if (phrase.trim()) onAnswerToChat?.(phrase, 'correct')
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
        // Именно последняя попытка — её ученик и видит в переписке
        if (phrase.trim()) onAnswerToChat?.(phrase, 'wrong_final')
        if (answer.trim()) onAnswered?.(answer, 'wrong_final')
        const variantId = assembled.find(t => t.distractorId)?.distractorId ?? null
        const id = setTimeout(() => closePanelWith('table_wrong', variantId), 800)
        timers.current.push(id)
        return
      }
      const id = setTimeout(() => setResult(null), 700)
      timers.current.push(id)
    }
  }

  // Кнопки «Проверить» нет: как только слов собрано столько же, сколько в ответе — проверяем сами
  // (небольшая задержка — чтобы было видно, как встало последнее слово, и чтобы setState не
  // вызывался синхронно в теле эффекта)
  useEffect(() => {
    if (result) return
    if (tokens.length === 0 || assembled.length !== tokens.length) return
    const id = setTimeout(() => check(), 300)
    timers.current.push(id)
    return () => clearTimeout(id)
  }, [assembled]) // eslint-disable-line

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
                onCellClick={phase === 'table' && !result
                  ? (cell, e) => tapCell(cell.id, e?.currentTarget?.getBoundingClientRect?.())
                  : undefined}
              />
            </div>

            {phase === 'extra' && (
              <div className="tmExtrasSection">
                {shuffledExtras.map((chip, i) => {
                  const used = assembledExtraKeys.has(`extra-${i}`)
                  return (
                    <button
                      key={i}
                      style={{ animationDelay: `${i * 50}ms` }}
                      className={`tmExtraChip${used ? ' tmExtraChipUsed' : ''}`}
                      onClick={() => tapExtra(chip, i)}
                      disabled={used || !!result}
                    >{chip.text}</button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Кнопка «Проверить» — как в «собери фразу», только компактнее.
              Появляется вместе со списком слов вне таблицы: до этого ученик
              ещё выбирает ячейки, проверять нечего. Автопроверка по полному
              набору слов остаётся — кнопка нужна, когда собрано не всё или
              в бокс попало лишнее слово-ловушка. */}
          {phase === 'extra' && (
            <button
              className="tmCheckBtn"
              onClick={check}
              disabled={assembled.length === 0 || !!result}
            >Проверить</button>
          )}

        </div>
      </div>
      {cellMenu && (
        <CellOptionsMenu
          options={cellMenu.options}
          anchorRect={cellMenu.rect}
          onPick={value => pickCell(cellMenu.cellId, value)}
          onClose={() => setCellMenu(null)}
        />
      )}
    </>
  )
}
