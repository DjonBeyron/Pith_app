import { useState, useEffect, useRef, useMemo } from 'react'
import { Languages } from 'lucide-react'
import CellOptionsMenu from '../table-manual/CellOptionsMenu.jsx'
import FillBlank from './FillBlank.jsx'
import { parseTemplateSegments, blankKind, BLANK_DOT_COUNT } from '../../../../shared/lib/fillBlanksTemplate.js'
import { makeFillBlanksCheck } from './fillBlanksCheck.js'
import { usePanelHeight } from '../usePanelHeight.js'
import { rememberTap } from '../../xpAnchor.js'
import { usePanelRiseDrop } from '../usePanelRiseDrop.js'
import { fireBurst } from '../../../../shared/lib/burstParticles.js'
import { isRewardOn } from '../../../../shared/lib/nodeReward.js'
import { useAdmin } from '../../../../app/AdminContext.jsx'
import { orderAnswers } from '../../useAnswerOrder.js'
import { normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { blankMatches } from './fillBlanksCheck.js'
import { blankWord } from '../../../../shared/lib/wordAudio/collectLessonWords.js'
import { playWord } from '../../word-audio/wordAudioPlayer.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'

// Точки-плейсхолдер в переводе — тусклый неинтерактивный двойник пропуска:
// та же логика количества (blankKind по индексу ИЗ template, не перевода —
// в переводе своя грамматика, но позиция пропуска соответствует той же
// blanks[i]), но без блеска и мельче (см. fill-blanks.css .fbTrDots)
function TranslationDots({ template, index }) {
  const kind = blankKind(template, index)
  const dots = BLANK_DOT_COUNT[kind] ?? BLANK_DOT_COUNT.word
  return (
    <span className="fbTrDots" aria-hidden="true">
      {Array.from({ length: dots }, (_, i) => <i key={i} />)}
    </span>
  )
}

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
  node, onDone, onAnswered, onAnswerToChat, onRevealAnswer, onChecked, onHeightChange, xpAmount = 0, onXpEarned,
}) {
  const fbData = node.typeData?.fill_blanks ?? {}
  const template    = fbData.template ?? ''
  const blanks      = fbData.blanks   ?? []
  const translation = (fbData.translation ?? '').trim()

  const segments = useMemo(() => parseTemplateSegments(template), [template])
  const trSegments = useMemo(
    () => (translation ? parseTemplateSegments(translation) : []),
    [translation],
  )
  const blanksCount = blanks.length
  // Варианты в меню каждого пропуска — порядок один раз на панель: ученику
  // случайный, админу верный (answer) первым (useAnswerOrder.js)
  const { isAdmin } = useAdmin()
  const [blankOptions] = useState(() => blanks.map(b => orderAnswers(b.options ?? [], isAdmin,
    o => normalizeAnswerText(o) === normalizeAnswerText(b.answer ?? ''))))

  const [show,         setShow]         = useState(false)
  const [picked,       setPicked]       = useState({})   // index → выбранный текст
  const [result,       setResult]       = useState(null) // null | 'correct' | 'wrong'
  const [blankMenu,    setBlankMenu]    = useState(null) // { index, options, rect }
  // Кнопка перевода: сама появляется (scale 0→1) спустя 1с после монтирования
  // панели, независимо от show/анимации выезда — раскрытие/закрытие перевода
  // дальше только меняет trOpen, кнопка с экрана не уходит
  const [trBtnShown,   setTrBtnShown]   = useState(false)
  const [trOpen,       setTrOpen]       = useState(false)
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

  // Кнопка перевода — ровно через 1с после появления модуля, не раньше
  useEffect(() => {
    if (!translation) return
    const id = setTimeout(() => setTrBtnShown(true), 1000)
    timers.current.push(id)
    return () => clearTimeout(id)
  }, [translation])

  // Очищаем все таймеры при анмаунте
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function tapBlank(index, rect) {
    // Заблокировано и на верном ответе (навсегда), и на кратком «неверно»
    // (пока не погасло) — та же логика, что disabled на кнопке ниже
    if (result) return
    rememberTap(rect)
    const options = blankOptions[index] ?? []
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
    // Озвучка — только верного выбора и ЦЕЛЫМ словом («tries», не «ie»)
    if (blankMatches(value, blanks[index])) playWord(wordKey(blankWord(template, blanks, index)))
    setPicked(prev => ({ ...prev, [index]: value }))
    setWrongIndices(prev => prev.filter(i => i !== index))
  }

  // Подъём/спуск с историей — общий хук (usePanelRiseDrop.js), как у «выбери
  // слово», таблиц и «собери фразу»
  const rise = usePanelRiseDrop({ show, panelRef, spacerSel: '.fbSpacer', panelH, label: 'fb' })

  // Закрытие по итогу («история знает высоту ответа заранее», PROJECT.md):
  // одним тиком — салют (на верном, по галочке награды), пузыри в ленту
  // НЕВИДИМЫМИ (sendBubbles(true) → arriving) и setShow(false); история едет
  // вниз с панелью ровно до места под ответ, на её остановке хук проявляет
  // пузыри, после въезда — закрывает ноду
  function closePanelWith(trigger, sendBubbles) {
    if (trigger === 'fill_correct' && isRewardOn('fill_blanks', fbData)) {
      fireBurst({ count: 30, size: 4, zIndex: 85, portalTo: '.lessonPlayer' })
    }
    rise.prepareClose({ reveal: {
      onReveal: () => onRevealAnswer?.(),
      done: () => { onHeightChange?.(0); onDone?.(trigger) },
    } })
    sendBubbles?.(true)
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

  const filledCount = Object.keys(picked).length

  if (!template || blanksCount === 0) return null

  const sentenceCls = `fbSentence${result === 'wrong' ? ' fbSentenceErr' : ''}`

  return (
    <>
      {/* Распорка: на подъёме и спуске высота меняется РАЗОМ — движение
          истории играет трансформ ленты (panelRise.js); между ними плавно
          следует за ростом панели (перевод/кнопка место держат заранее) */}
      <div
        className="fbSpacer"
        style={{
          height: show ? panelH : 0,
          transition: show && !rise.opening ? 'height 0.26s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      />
      <div ref={panelRef} className={`fbPanel${show ? ' fbPanelVisible' : ''}`}>
        <div className="fbInner">
          {/* Кнопка перевода — маленькая, в правом верхнем углу панели
              (absolute, вне потока — см. fill-blanks.css .fbTrBtn); фраза
              начинается ниже неё, длинные предложения под кнопку не заезжают */}
          {translation && (
            <button
              type="button"
              className={`fbTrBtn${trBtnShown ? ' fbTrBtnShown' : ''}${trOpen ? ' fbTrBtnOn' : ''}`}
              onClick={() => setTrOpen(o => !o)}
              aria-label="Перевод"
            >
              <Languages size={14} />
            </button>
          )}
          <div className="fbSentenceCol">
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
            {/* Место под перевод зарезервировано С САМОГО НАЧАЛА (рендерится
                всегда, пока задан translation) — trOpen меняет только
                видимость (opacity), не высоту: иначе раскрытие/закрытие
                двигало бы спейсер и сообщения над панелью */}
            {translation && (
              <div className={`fbTranslation${trOpen ? ' fbTranslationOpen' : ''}`}>
                {trSegments.map((seg, i) => (
                  seg.type === 'text'
                    ? <span key={i}>{seg.value}</span>
                    : <TranslationDots key={i} template={template} index={seg.index} />
                ))}
              </div>
            )}
            {/* Без автопроверки — ученик жмёт сам. Кнопка в разметке ВСЕГДА,
                до первого заполненного пропуска невидима (visibility): место
                занято с первого кадра, панель не подрастает и распорку не
                дёргает; проявляется opacity+scale, как у таблицы */}
            <button
              type="button"
              className={`fbCheckBtn${filledCount > 0 ? '' : ' fbCheckBtnHidden'}`}
              onClick={check}
              disabled={filledCount === 0 || !!result}
              aria-hidden={filledCount === 0}
              tabIndex={filledCount > 0 ? 0 : -1}
            >Проверить</button>
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
