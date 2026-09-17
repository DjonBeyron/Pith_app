import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import TableGrid from '../../../../shared/ui/TableGrid.jsx'
import { pLog } from '../../../../shared/lib/debug.js'
import CellOptionsMenu from './CellOptionsMenu.jsx'
import { deriveAnswerTokens } from '../../../../shared/lib/tableCellMatch.js'
import { makeManualCheck } from './manualCheck.js'
import { cellIsPickable, allCellsPicked } from './manualCellPick.js'
import ListScrollThumb from '../ListScrollThumb.jsx'
import { tracePanelSync, tracePanelPaint } from '../tracePanelSync.js'
import { useTableToChat } from '../useTableToChat.js'
import { spacerStyle } from '../spacerStyle.js'
import { playFeedRelease } from '../feedRelease.js'
import { usePanelHeight } from '../usePanelHeight.js'
import BurstConfetti from '../../../../shared/ui/BurstConfetti.jsx'
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
  node, onDone, onAnswered, onAnswerToChat, onHeightChange, onSendToChat, onLandedInChat,
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
  // Высота, на которую надо сдвинуть историю при закрытии (см. useLayoutEffect)
  const releaseRef = useRef(0)

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

  // Сдвиг истории запускается ПОСЛЕ того, как распорка отдала место, но ДО
  // отрисовки — для этого и нужен layout-эффект. Вызов сразу за setShow(false)
  // был ошибкой: там место ещё занято, трансформ уводил ленту вниз на высоту
  // панели, и только следующим кадром React снимал распорку. На экране это
  // читалось как «ответ уходит вниз раньше, чем опускается таблица».
  useLayoutEffect(() => {
    if (show || !releaseRef.current) return
    const h = releaseRef.current
    releaseRef.current = 0
    // Кривая и длительность — РОВНО те же, что у самой панели (.tmPanel,
    // transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1) в table-manual.css).
    // Оба движения идут вниз одновременно, и глазу заметно не то, что они
    // стартуют вместе, а то, что идут по-разному: по кадрам панель давала
    // +7 +18 +26 +31 +38, а лента со своей ease-in-out +8 +31 +68 +76 +51.
    // Держи эти значения согласованными с CSS панели.
    // Держим ленту НА МЕСТЕ прямо сейчас, а отпускаем следующим кадром.
    //
    // Причина тонкая: панель уезжает CSS-переходом, а лента — WAAPI. WAAPI
    // стартует немедленно, из этого же layout-эффекта, а переход браузер
    // начинает только со следующего кадра — ему надо сперва зафиксировать
    // старое значение transform. Ровно на этот кадр ответ и уходил раньше
    // панели. Прежний замер этого не видел: он считал только кадры, где
    // панель УЖЕ едет, то есть отбрасывал как раз спорный первый.
    // Компенсировать надо ФАКТИЧЕСКИ отданное место, а не всю высоту панели.
    // Распорка снимается не в ноль: у неё есть min-height (safe-area + слот
    // индикатора «печатает», см. feed.css) — в замерах 307 → 28. Удерживая
    // ленту на все 307, мы поднимали её на лишние 28px, и в начале движения
    // ответ заметно уходил ВВЕРХ, прежде чем поехать вниз.
    const spacer = document.querySelector('.tmSpacer')
    const drop = Math.max(0, h - (spacer ? spacer.getBoundingClientRect().height : 0))
    if (drop < 1) return
    const inner = document.querySelector('.playerFeedInner')
    if (inner) inner.style.transform = `scaleY(-1) translateY(${-drop}px)`
    requestAnimationFrame(() => {
      playFeedRelease(drop, { duration: 280, easing: 'cubic-bezier(0.4, 0, 1, 1)' })
    })
  }, [show])

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

  function closePanelWith(trigger, variantId) {
    const done = () => { onHeightChange?.(0); onDone?.(trigger, variantId) }
    // Галочка «отправить таблицу в чат»: панель летит на место своего
    // сообщения в переписке, а не гаснет здесь (flyPanelToChat.js)
    if (onSendToChat) {
      pLog(`[tm] уходим в чат: trigger=${trigger} высота панели=${panelH}px слов=${assembled.length}`)
      // Та же собранная фраза и итог проверки уезжают в пузырь — чтобы после
      // посадки таблица в переписке выглядела как только что в панели
      // picked — какие ячейки ученик выбрал и КАКОЕ значение взял из ячейки со
      // списком вариантов. Уезжает в сообщение вместе с ответом, чтобы таблица
      // в переписке осталась в том же виде, в каком её собрали: выбранное
      // приглушено, а не «как новое». Массив пар, а не Map — sent проходит
      // через setState и сравнение пропсов
      const sent = {
        words: assembled.map(t => t.value),
        result,
        picked: [...assembledCellValues],
      }
      toChatCtl.sendToChat(panelRef.current, node.id, {
        send: arriving => onSendToChat(arriving, sent),
        reveal: onLandedInChat,
        done: () => { pLog('[tm] села в чат'); done() },
      })
    } else {
      timers.current.push(setTimeout(done, 420))
    }
    // Высоту запоминаем ЗДЕСЬ: к моменту, когда сдвиг реально запустится
    // (useLayoutEffect ниже), распорка уже отдана и panelH может обнулиться
    if (!onSendToChat) releaseRef.current = panelH
    setShow(false)
    pLog(`[tm] setShow(false) — панель закрывается (сдвиг истории ${panelH}px трансформом)`)
  }

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
      {/* Салют на верный ответ живёт ЗДЕСЬ, а не на пузыре в чате: пузырей
          может не быть вовсе — их даёт отдельная галочка «отправить ответ
          ученика». Праздник же положен за верный ответ, а не за наличие
          сообщения в переписке (AnswerBubbles получает confetti={false}) */}
      {result === 'correct' && (
        <BurstConfetti count={30} size={4} zIndex={60} portalTo=".lessonPlayer" />
      )}
      {/* Спейсер отпускается сразу: пока он держит высоту, лента приподнята
          на панель, и пузырь стоит ВЫШЕ неё на эту же высоту — клону пришлось
          бы лететь вверх через весь экран. Момент замера ловит whenStable */}
      <div className="tmSpacer" style={spacerStyle({ show, panelH, givenToBubble: toChatCtl.givenToBubble, released: toChatCtl.spacerReleased })} />
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
              ловушками кнопка ждёт phase==='extra' — появляется ОДНИМ
              моментом с откатом таблицы и самими словами, а не раньше
              (раньше всплывала уже с первой выбранной ячейкой, пока стол ещё
              на месте и ловушек не видно — рассинхрон с самим содержимым).
              У таблиц БЕЗ extras отката не бывает вовсе (phase никогда не
              'extra') — там кнопка по-прежнему доступна с первого слова,
              иначе проверить было бы нечем (checkBtnShown, см. выше).

              В разметке она есть ВСЕГДА, а до нужного момента лишь невидима.
              Раньше её не было вовсе, пока таблица не уехала влево, — и в этот
              момент она добавляла свою высоту к панели, из-за чего вся таблица
              скакала. Место под неё занято с самого начала, поэтому оба режима
              одной высоты и перехода по вертикали не видно. */}
          <button
            className={`tmCheckBtn${checkBtnShown ? '' : ' tmCheckBtnHidden'}`}
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
