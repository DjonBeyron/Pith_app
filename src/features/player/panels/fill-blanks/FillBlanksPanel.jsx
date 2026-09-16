import { useState, useEffect, useRef, useMemo } from 'react'
import CellOptionsMenu from '../table-manual/CellOptionsMenu.jsx'
import FillBlank from './FillBlank.jsx'
import { parseTemplateSegments } from '../../../../shared/lib/fillBlanksTemplate.js'
import { makeFillBlanksCheck } from './fillBlanksCheck.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { rememberTap } from '../../xpAnchor.js'

// Панель «Составь предложение»: фраза рисуется ОДНИМ текстом (принцип
// «заполненное слово — без плашки», см. table-manual.css/phrase-assembly.css)
// с несколькими интерактивными пропусками внутри строки (сам пропуск —
// FillBlank.jsx). Тап по пропуску открывает CellOptionsMenu (готовый
// компонент table-manual — переиспользуем как есть, см.
// NodeFillBlanksPicker.jsx и PROJECT.md).
//
// Никаких сигналов ошибок здесь нет (пользователь явно исключил их для этого
// модуля) — стандартный поток из трёх попыток, как у table (ручной режим).
// onAnswerToChat — необязательный: PlayerPanels.jsx передаёт его, только
// если у ноды включена галочка «отправить ответ в чат» (см. fillBlanksCheck.js).
export default function FillBlanksPanel({
  node, onDone, onAnswered, onAnswerToChat, onChecked, onHeightChange, xpAmount = 0, onXpEarned,
}) {
  const fbData = node.typeData?.fill_blanks ?? {}
  const template = fbData.template ?? ''
  const blanks   = fbData.blanks   ?? []

  const segments = useMemo(() => parseTemplateSegments(template), [template])
  const blanksCount = blanks.length

  const [show,         setShow]         = useState(false)
  const [picked,       setPicked]       = useState({})   // index → выбранный текст
  const [result,       setResult]       = useState(null) // null | 'correct' | 'wrong'
  const [blankMenu,    setBlankMenu]    = useState(null) // { index, options, rect }
  // Неверно заполненные пропуски — мигают красным (см. FillBlank.jsx), пока
  // ученик не перевыберет ИМЕННО этот пропуск (не по таймеру, тот же приём,
  // что у мигающего слова в «Собери фразу» — держится до собственного
  // исправления, не общего сброса result)
  const [wrongIndices, setWrongIndices] = useState([])

  const panelRef   = useRef(null)
  const wrongCount = useRef(0)
  const timers     = useRef([])

  const panelH = usePanelHeight(panelRef, onHeightChange)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Очищаем все таймеры при анмаунте
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function tapBlank(index, rect) {
    // Заблокировано и на верном ответе (навсегда), и на кратком «неверно»
    // (пока не погасло) — та же логика, что disabled на кнопке ниже
    if (result) return
    rememberTap(rect)
    const options = blanks[index]?.options ?? []
    if (!options.length) return
    setBlankMenu({ index, options, rect })
  }

  // Повторный тап по уже заполненному пропуску — снова открывает меню и
  // меняет выбор (см. tapBlank выше — там нет разницы «пусто/заполнено»).
  // Перевыбор снимает мигание именно с ЭТОГО пропуска (не со всех сразу) —
  // независимо от того, попал ли новый выбор в точку: ученик уже отреагировал
  // на подсказку, дальше её решает следующая проверка
  function pickOption(value) {
    const index = blankMenu.index
    setBlankMenu(null)
    setPicked(prev => ({ ...prev, [index]: value }))
    setWrongIndices(prev => prev.filter(i => i !== index))
  }

  function closePanelWith(trigger) {
    timers.current.push(setTimeout(() => { onHeightChange?.(0); onDone?.(trigger) }, 420))
    setShow(false)
  }

  // wrongCount/timers — рефы, отданные фабрике проверки (тот же приём, что у
  // table-manual/manualCheck.js): они читаются не здесь, а внутри check(),
  // который вызывается позже из эффекта/таймера, не во время рендера —
  // см. xpAnchor.js про этот же случай
  // eslint-disable-next-line react-hooks/refs
  const check = makeFillBlanksCheck({
    picked, blanks, tData: fbData, wrongCount, timers, xpAmount, onXpEarned,
    setResult, setWrongIndices, onAnswered, onAnswerToChat, onChecked, closePanelWith,
  })

  const allFilled = blanksCount > 0 && Object.keys(picked).length === blanksCount

  // Автопроверка, как только заполнены ВСЕ пропуски — тот же приём, что у
  // TableManualPanel.jsx (без отдельной кнопки «Проверить»). Эффект зависит
  // от picked целиком: после неудачной попытки ученик меняет один из уже
  // заполненных пропусков — это тоже смена picked, и проверка идёт заново.
  useEffect(() => {
    if (result) return // на любом текущем результате (в т.ч. краткой вспышке «неверно») ждём
    if (!allFilled) return
    const id = setTimeout(() => check(), 300)
    timers.current.push(id)
    return () => clearTimeout(id)
  }, [picked]) // eslint-disable-line

  if (!template || blanksCount === 0) return null

  const sentenceCls = `fbSentence${result === 'wrong' ? ' fbSentenceErr' : ''}`

  return (
    <>
      <div
        className="fbSpacer"
        style={{
          height: show ? panelH : 0,
          transition: show
            ? 'height 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
            : 'height 0.28s cubic-bezier(0.4, 0, 1, 1)',
        }}
      />
      <div ref={panelRef} className={`fbPanel${show ? ' fbPanelVisible' : ''}`}>
        <div className="fbInner">
          <div className={sentenceCls}>
            {segments.map((seg, i) => {
              if (seg.type === 'text') return <span key={i}>{seg.value}</span>
              const index = seg.index
              return (
                <FillBlank
                  key={i}
                  template={template}
                  index={index}
                  value={picked[index] ?? null}
                  wrong={wrongIndices.includes(index)}
                  disabled={!!result}
                  onTap={e => tapBlank(index, e.currentTarget.getBoundingClientRect())}
                />
              )
            })}
          </div>
        </div>
      </div>
      {blankMenu && (
        <CellOptionsMenu
          options={blankMenu.options}
          anchorRect={blankMenu.rect}
          onPick={pickOption}
          onClose={() => setBlankMenu(null)}
        />
      )}
    </>
  )
}
