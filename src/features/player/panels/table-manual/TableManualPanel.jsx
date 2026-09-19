import { useState, useEffect, useRef, useMemo } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import { pLog } from '../../../../shared/lib/debug.js'
import CellOptionsMenu from './CellOptionsMenu.jsx'
import { deriveAnswerTokens } from '../../../../shared/lib/tableCellMatch.js'
import { makeManualCheck } from './manualCheck.js'
import { makeManualClose } from './manualClose.js'
import { cellIsPickable, allCellsPicked } from './manualCellPick.js'
import ListScrollThumb from '../ListScrollThumb.jsx'
import { tracePanelSync, tracePanelPaint } from '../tracePanelSync.js'
import { useTableToChat } from '../useTableToChat.js'
import { spacerStyle } from '../spacerStyle.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { rememberTap } from '../../xpAnchor.js'
import { useSignalState } from '../signal-overlay/useSignalState.js'


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
export default function TableManualPanel({
  node, onDone, onAnswered, onAnswerToChat, onRevealAnswer, onHeightChange, onSendToChat, onLandedInChat,
  xpAmount = 0, onXpEarned,
  // Сигналы ошибок (см. PROJECT.md): nodes — все ноды урока, чтобы найти
  // живую ноду по ref сигнала; onSignalFired(node, release, exerciseNodeId)
  // — рисует её как обычное сообщение ленты (LessonPlayer/useSignalMessages.js)
  // вместо прежнего самодельного оверлея; hasSignalFired(nodeId) — та же
  // нода-сигнал срабатывает один раз за урок (см. manualCheck.js)
  nodes = [], onSignalFired, hasSignalFired,
}) {
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
  // Уход «в чат» — панель поднимается и тает, см. table-manual.css
  // Уход таблицы в переписку целиком живёт в useTableToChat
  const toChatCtl = useTableToChat('tm', '.tmSpacer')
  const [assembled, setAssembled] = useState([])
  const [result,    setResult]    = useState(null)       // null | 'correct' | 'wrong'

  const panelRef   = useRef(null)
  const wrongCount = useRef(0)
  const timers     = useRef([])

  const panelH = usePanelHeight(panelRef, onHeightChange)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      pLog(`[tm] показываем панель (высота на этот момент ${panelH}px)`)
      tracePanelSync('tm', panelRef.current, '.tmSpacer')
      // Композитный слой нужен только на время выезда: дальше он лишь размывает
      // край панели субпиксельным сглаживанием (см. комментарий в CSS). Снимаем
      // по факту конца перехода, а не по таймеру — иначе размытие держится
      // дольше самой анимации
      const el = panelRef.current
      if (el) {
        const drop = () => { el.style.willChange = 'auto' }
        el.addEventListener('transitionend', drop, { once: true })
        setTimeout(drop, 600)   // страховка, если перехода не случилось
      }
      tracePanelPaint('tm-показ', panelRef.current)
      setShow(true)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Очищаем все таймеры при анмаунте
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Салют на верный ответ — ЗДЕСЬ, а не на пузыре в чате: пузырей может не
  // быть вовсе (галочка «отправить ответ ученика»), а праздник положен за сам
  // ответ. Императивный fireBurst, а не <BurstConfetti>: панель теперь
  // размонтируется через ~0.5с после ответа, а залп летит 1.4–2.1с —
  // компонент внутри панели обрывал его на первой трети
  useEffect(() => {
    pLog(`[tm] result → ${result ?? 'null'}${result === 'correct' ? ' — запускаем салют' : ''}`)
    if (result === 'correct') fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
  }, [result])

  // Подъём/спуск с историей — общий хук (usePanelRiseDrop.js → panelRise.js):
  // распорка меняет высоту разом, история стоит до касания панели и едет с
  // ней 1:1; на спуске опускается ровно до места под уже вставленные (пока
  // невидимые) пузыри ответа — см. manualClose.js
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.tmSpacer', panelH, label: 'tm' })

  // cellId → выбранное значение (не Set: нужно знать ИМЕННО какое слово из
  // ячейки со списком вариантов ушло в ответ, чтобы погасить только его —
  // см. pickedValues в TableGrid)
  const assembledCellValues = useMemo(
    () => new Map(assembled.filter(t => t.type === 'cell').map(t => [t.cellId, t.value])),
    [assembled]
  )
  const assembledExtraKeys = useMemo(
    () => new Set(assembled.filter(t => t.type === 'extra').map(t => t.key)),
    [assembled]
  )

  const allCellsDone = allCellsPicked(cellTokens, assembled)
  // Фаза полностью производная: extra только когда все ячейки выбраны и есть слова-ловушки
  const phase        = (allCellsDone && hasExtras) ? 'extra' : 'table'
  // Кнопка «Проверить» должна появляться ОДНИМ моментом со словами-ловушками
  // и откатом таблицы (phase==='extra'), а не раньше — иначе она всплывала
  // сразу с первой выбранной ячейкой, пока таблица ещё стоит на месте и
  // слов не видно. У таблиц БЕЗ extras отката вообще не бывает (phase
  // никогда не 'extra') — там кнопка по-прежнему доступна с первого же слова
  const checkBtnShown = assembled.length > 0 && (!hasExtras || phase === 'extra')

  // Особая ячейка: вместо того чтобы сразу уйти в фразу, открывает меню
  // своих вариантов — какое значение выбрал ученик, то и соберётся
  const [cellMenu, setCellMenu] = useState(null)   // { cellId, options, rect }
  const extrasRef = useRef(null)

  // Сигнал ошибки автора (см. PROJECT.md, «Сигналы ошибок»): пока сигнальное
  // сообщение играет в ленте (freeze), ни новые тапы, ни удаление из бокса
  // не проходят
  const signalState = useSignalState()

  function tapCell(cellId, rect) {
    if (assembledCellValues.has(cellId) || result || signalState.freeze) return
    rememberTap(rect)
    const cell = cells.find(c => c.id === cellId)
    // Нажать можно ЛЮБУЮ ячейку со значением, даже не ту, что нужна ответу:
    // иначе ошибиться невозможно и проверка фразы ничего не проверяет
    if (!cellIsPickable(cell)) return
    const options = cell?.options ?? []
    if (options.length) { setCellMenu({ cellId, options, rect }); return }
    pickCell(cellId, cell?.value?.trim() ?? '')
  }

  function pickCell(cellId, value) {
    setCellMenu(null)
    setAssembled(prev => [...prev, { type: 'cell', cellId, value, key: `cell-${cellId}` }])
  }

  function tapExtra(chip, idx, rect) {
    const key = `extra-${idx}`
    if (assembledExtraKeys.has(key) || result || signalState.freeze) return
    rememberTap(rect)
    setAssembled(prev => [...prev, { type: 'extra', value: chip.text, key, distractorId: chip.distractorId }])
  }

  function removeFromBox(i) {
    if (result || signalState.freeze) return
    // Удаление любого чипа тем же тапом, никакой новой механики — но
    // мигание гасится, только если убрали именно помеченный чип
    // (см. useSignalState.js/nextBlinkIndex)
    signalState.onRemoved(i)
    setAssembled(prev => prev.filter((_, j) => j !== i))
    // фаза пересчитается автоматически (производная от allCellsDone + hasExtras)
  }

  // Закрытие по итогу проверки (уход панели → пузыри → onDone) — manualClose.js
  const closePanelWith = makeManualClose({
    node, panelRef, panelH, setShow, toChatCtl, rise,
    assembled, result, assembledCellValues,
    onDone, onHeightChange, onSendToChat, onLandedInChat, onRevealAnswer,
  })

  const check = makeManualCheck({
    assembled, tokens, answer, tData, wrongCount, timers, xpAmount, onXpEarned,
    setCellMenu, setResult, onAnswered, onAnswerToChat, closePanelWith,
    nodes, hasSignalFired,
    onSignal: (slotIndex, signalNode) => {
      signalState.fire(slotIndex, signalNode)
      onSignalFired?.(signalNode, signalState.dismissOverlay, node.id)
    },
  })

  if (!table) return null

  const boxCls = [
    'tmAnswerBox',
    assembled.length > 0 && !result ? 'tmAnswerBoxFilled' : '',
    result === 'correct'            ? 'tmAnswerBoxOk'     : '',
    result === 'wrong'              ? 'tmAnswerBoxErr'     : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      {/* Спейсер отпускается сразу: пока он держит высоту, лента приподнята
          на панель, и пузырь стоит ВЫШЕ неё на эту же высоту — клону пришлось
          бы лететь вверх через весь экран. Момент замера ловит whenStable */}
      <div className="tmSpacer" style={spacerStyle({ show, panelH, opening: rise.opening, givenToBubble: toChatCtl.givenToBubble, released: toChatCtl.spacerReleased })} />
      <div ref={panelRef}
        className={`tmPanel${show ? ' tmPanelVisible' : ''}${!show && toChatCtl.toChat ? ' tmPanelToChat' : ''}`}>
        <div className="tmPanelInner">

          {/* Бокс сборки: нажимая на чип — удаляем его из ответа */}
          <div className={boxCls}>
            {assembled.length === 0
              ? <span className="tmAnswerPlaceholder">Собери фразу…</span>
              : assembled.map((item, i) => (
                  <button
                    key={item.key}
                    className={`tmAnswerChip${i === signalState.blinkIndex ? ' signalBlinkChip' : ''}`}
                    onClick={() => removeFromBox(i)}
                    disabled={result === 'correct' || signalState.freeze}
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
                pickedValues={assembledCellValues}
                onCellClick={phase === 'table' && !result && !signalState.freeze
                  ? (cell, e) => tapCell(cell.id, e?.currentTarget?.getBoundingClientRect?.())
                  : undefined}
              />
            </div>

            {hasExtras && (
              // Смонтирована ВСЕГДА (не только при phase==='extra'), но
              // спрятана visibility:hidden, пока таблица не уехала: flex-wrap
              // сетке нужен реальный reflow (ширины чипов по тексту), и если
              // делать его В ТОТ ЖЕ момент, когда таблица начинает свой
              // transform-переход, оба процесса накладываются — на экране
              // видно микро-дёрганье. Заранее посчитанный (но невидимый)
              // layout к моменту показа уже стабилен — остаётся только сдвиг
              // таблицы, слова уже на месте БЕЗ отдельной entrance-анимации
              // (раньше был свой въезд поверх слайда — читался как лишнее
              // движение).
              <div
                className={`tmExtrasSection${phase === 'extra' ? '' : ' tmExtrasSectionHidden'}`}
                ref={extrasRef}
              >
                {shuffledExtras.map((chip, i) => {
                  const used = assembledExtraKeys.has(`extra-${i}`)
                  return (
                    <button
                      key={i}
                      className={`tmExtraChip${used ? ' tmExtraChipUsed' : ''}`}
                      onClick={e => tapExtra(chip, i, e.currentTarget.getBoundingClientRect())}
                      disabled={phase !== 'extra' || used || !!result || signalState.freeze}
                      tabIndex={phase === 'extra' ? 0 : -1}
                    >{chip.text}</button>
                  )
                })}
              </div>
            )}
            {/* Полоса — СНАРУЖИ прокручиваемого блока: внутри она уезжала бы
                вместе с содержимым. Родитель (.tmStage) position: relative */}
            {phase === 'extra' && <ListScrollThumb targetRef={extrasRef} />}
          </div>

          {/* Кнопка «Проверить» — как в «собери фразу»: никакой автопроверки
              по факту заполнения, ученик жмёт сам. У таблиц СО словами-
              ловушками кнопка ждёт phase==='extra' и ПРОЯВЛЯЕТСЯ (opacity +
              скейл, table-manual.css) с задержкой на длину отката — когда
              таблица целиком ушла за край, а не раньше.
              У таблиц БЕЗ extras отката не бывает вовсе (phase никогда не
              'extra') — там кнопка по-прежнему доступна с первого слова,
              иначе проверить было бы нечем (checkBtnShown, см. выше).

              В разметке она есть ВСЕГДА, а до нужного момента лишь невидима.
              Раньше её не было вовсе, пока таблица не уехала влево, — и в этот
              момент она добавляла свою высоту к панели, из-за чего вся таблица
              скакала. Место под неё занято с самого начала, поэтому оба режима
              одной высоты и перехода по вертикали не видно. */}
          <button
            className={`tmCheckBtn${hasExtras ? '' : ' tmCheckBtnNoWait'}${checkBtnShown ? '' : ' tmCheckBtnHidden'}`}
            onClick={check}
            disabled={!checkBtnShown || !!result || signalState.freeze}
            aria-hidden={!checkBtnShown}
            tabIndex={checkBtnShown ? 0 : -1}
          >Проверить</button>

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
