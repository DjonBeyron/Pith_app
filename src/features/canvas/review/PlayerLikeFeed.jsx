import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import PlayerMessage from '../../player/PlayerMessage.jsx'
import PhraseBank from '../../player/panels/phrase-assembly/PhraseBank.jsx'
import PhraseAnswerRow from '../../player/panels/phrase-assembly/PhraseAnswerRow.jsx'
import ChooseWordOption from '../../player/panels/choose-word/ChooseWordOption.jsx'
import { nodeFileKey } from '../../player/preloadQueue.js'
import { TYPE_COLOR } from '../nodeTypes.js'
import { PlayerMutedContext } from '../../player/playerMuted.js'
import { Mic, Copy, Check, MessageSquarePlus } from 'lucide-react'
import { answerText } from './lessonTranscript.js'
import { nodeCopyText } from './nodeCopyText.js'

const NOOP = () => {}
const NO_SET = new Set()
// Эти типы в настоящем плеере — не сообщения ленты, а панели ответа снизу: в копии рисуем панель теми же компонентами и классами, что в плеере
const EXERCISE_TYPES = new Set(['word_choice', 'phrase_assembly', 'type_word', 'say_phrase', 'fill_blanks', 'photo_choice', 'registration'])
const LABEL = { word_choice: 'Выбери слово', phrase_assembly: 'Собери фразу', type_word: 'Напечатай слово', say_phrase: 'Сказать фразу', fill_blanks: 'Составь предложение', photo_choice: 'Выбрать фото', registration: 'Регистрация' }

// Панель ответа «как у ученика», КОМПАКТНО: настоящие кусочки панелей (банк слов, кнопки выбора), чтобы было ясно, что за модуль.
// «Выбери слово»: варианты кликаются — выбираем реальный ответ, и лента идёт по ветке этого варианта. Остальным заданиям — переключатель верно/неверно.
// Клавиатуры (напечатай), микрофона с анимациями (скажи) нет — только суть задания
function ExercisePanel({ node, item, onPick, onChoice }) {
  const d = node.data ?? {}
  const accent = TYPE_COLOR[node.type] ?? '#7a7a96'
  let body
  if (node.type === 'phrase_assembly') {
    const chips = [...(d.words ?? []), ...(d.distractors ?? []).map(x => x.text)].map(text => ({ text }))
    body = <div className="phraseInner"><PhraseBank chips={chips} usedIdxs={NO_SET} disabled onPick={NOOP} /></div>
  } else if (node.type === 'word_choice') {
    body = (
      <div className="chooseWordInner">
        {(d.options ?? []).map((o, i) => (
          <div key={o.id ?? i} className={`rvwOpt${o.isCorrect ? ' ok' : ''}${item.picked === o.id ? ' picked' : ''}`} onClick={e => { e.stopPropagation(); onPick(item.ref, o.id) }}>
            <ChooseWordOption text={o.text} state={null} onClick={NOOP} />
          </div>
        ))}
      </div>
    )
  } else if (node.type === 'say_phrase') {
    body = <div className="rvwSay"><span className="rvwMic"><Mic size={14} /></span><span className="rvwTypeLine">{answerText(node) || d.pattern || ''}</span></div>
  } else {
    body = <div className="rvwTypeLine">{answerText(node) || LABEL[node.type]}</div>
  }
  return (
    <div className="rvwPanel" style={{ '--rvw-accent': accent }}>
      <div className="rvwPanelHead">
        <span>{LABEL[node.type] ?? node.type}</span>
        {node.type !== 'word_choice' && item.choice && (
          <span className="rvwSwitch" onClick={e => e.stopPropagation()}>
            <button className={item.choice === 'right' ? 'on' : ''} onClick={() => onChoice(item.ref, 'right')}>✓</button>
            <button className={item.choice === 'wrong' ? 'on bad' : ''} disabled={!item.hasWrong} title={item.hasWrong ? 'Показать ветку ошибки' : 'У задания нет ветки «неверно»'} onClick={() => onChoice(item.ref, 'wrong')}>✗</button>
          </span>
        )}
      </div>
      {body}
    </div>
  )
}

// Ответ ученика — теми же классами, что в плеере (строка справа, пузырь)
function StudentRow({ item }) {
  return (
    <div className={`playerMsgRow playerMsgRowRight rvwStudentRow${item.ok ? '' : ' bad'}`}>
      <div className="playerMsgBubble playerMsgBubble--text"><p className="playerText">{item.pickedText ?? (item.ok ? (answerText(item.node) || 'верный ответ') : 'неверный ответ')}</p></div>
    </div>
  )
}

// Копии нод «как из истории»: isHistory выключает автозапуск видео/кружков и въезд (так их рисует сам плеер при «Продолжить урок»)
const HISTORY = new WeakMap()
const asHistory = node => {
  let c = HISTORY.get(node)
  if (!c) {
    c = { ...node, isHistory: true }
    // Голосовое со скрытой расшифровкой в разборе показываем с текстом: автор должен видеть, что в нём сказано
    if (node.type === 'audio' && node.typeData?.audio?.showText === false) c.typeData = { ...node.typeData, audio: { ...node.typeData.audio, showText: true } }
    HISTORY.set(node, c)
  }
  return c
}

// Копия ленты плеера: те же классы и те же модули сообщений (PlayerMessage), что в уроке, но без триггеров — ничего не играет и не переходит
// дальше (звук выключен контекстом, файлов не передаём — медиа рисуются заглушками). Поверх каждого сообщения — выделение, номер, замечания и
// переключатель «верно / неверно» на заданиях
// Мини-иконки в углу выделенного сообщения (только режим разбора): копировать текст и оставить замечание
function SlotTools({ item, count, onNote }) {
  const [copied, setCopied] = useState(false)
  const copy = async e => {
    e.stopPropagation()
    try { await navigator.clipboard.writeText(nodeCopyText(item.node)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* буфер недоступен */ }
  }
  return (
    <div className={`rvwSlotTools${count > 0 ? ' keep' : ''}`} onClick={e => e.stopPropagation()}>
      <button className="rvwTool" title="Скопировать текст" aria-label="Скопировать текст" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
      <button className="rvwTool" title="Оставить замечание к этому сообщению" aria-label="Замечание" onClick={e => { e.stopPropagation(); onNote(item.ref) }}>
        <MessageSquarePlus size={13} />{count > 0 && <span className="rvwToolCount">{count}</span>}
      </button>
    </div>
  )
}

/** Само сообщение «как в плеере»: панель задания, реакция или настоящий PlayerMessage (без триггеров). Общее для ленты и окна замечания */
export function SlotBody({ item, canvasNode, canvasNodes, files, teacherName = '', onPick = NOOP, onChoice = NOOP }) {
  if (EXERCISE_TYPES.has(canvasNode.type)) return <ExercisePanel node={item.node} item={item} onPick={onPick} onChoice={onChoice} />
  if (canvasNode.type === 'reaction') return <div className="playerMsgRow"><span className="rvwEmoji">{canvasNode.typeData?.reaction?.emoji}</span></div>
  // Закреп: строка «<имя учителя> закрепил сообщение» (имя берётся из настроек урока, не «учитель») + что именно закреплено
  if (canvasNode.type === 'pin_message') {
    const pinned = canvasNode.typeData?.pin_message?.content ?? ''
    return (
      <div className="rvwPin">
        <div className="playerMsgRow pinSystemRow"><span className="pinSystemText">{teacherName || '⚠ имя учителя не задано'} закрепил сообщение</span></div>
        {pinned && <div className="rvwPinned"><span className="rvwPinIcon">📌</span><span>{pinned}</span></div>}
      </div>
    )
  }
  const msg = tableSent => <PlayerMessage node={asHistory(canvasNode)} file={files.find(f => f.id === nodeFileKey(canvasNode)) ?? null} lessonFiles={files} lessonNodes={canvasNodes} teacherName={teacherName} adminPreview pending={false} tableSent={tableSent} onDone={NOOP} onTrReveal={NOOP} />
  // «Авто»/«ручной» таблица в плеере — панель снизу, в ленте её нет. В разборе рисуем её итоговый вид (как «таблица в чате») в карточке и показываем текст озвучки
  const t = canvasNode.type === 'table' ? canvasNode.typeData?.table ?? {} : null
  if (t && (t.mode ?? 'dictator') !== 'demo') {
    return (
      <div className="rvwPanel" style={{ '--rvw-accent': TYPE_COLOR.table ?? '#7a7a96' }}>
        <div className="rvwPanelHead"><span>Таблица · {t.mode === 'manual' ? 'ручной режим' : 'авто (по озвучке)'}</span></div>
        {msg(true)}
        {t.script && <div className="rvwTypeLine">🔊 {t.script}</div>}
      </div>
    )
  }
  return msg(undefined)
}

export default function PlayerLikeFeed({ items, canvasById, canvasNodes, files = [], selRef, selTick, warnMap, noteCounts, changeMarks, teacherName, onNote, onSelect, onChoice, onPick }) {
  const outerRef = useRef(null)
  const phoneRef = useRef(null)
  // Переключили «верно/неверно» или выбрали вариант — под заданием меняется лента; само задание остаётся на экране там же, где было (история не «едет»)
  const anchorRef = useRef(null)
  const anchored = fn => (ref, ...rest) => {
    const el = outerRef.current?.querySelector(`[data-ref="${CSS.escape(ref)}"]`)
    if (el) anchorRef.current = { ref, top: el.getBoundingClientRect().top }
    fn(ref, ...rest)
  }
  useLayoutEffect(() => {
    const a = anchorRef.current
    if (!a) return
    anchorRef.current = null
    const el = outerRef.current?.querySelector(`[data-ref="${CSS.escape(a.ref)}"]`)
    if (el && outerRef.current) outerRef.current.scrollTop += el.getBoundingClientRect().top - a.top
  }, [items])
  // Колесо всей рамкой телефона крутит ленту само (не зависит от того, на какой элемент попал курсор — границы сообщений, промежутки, панели плеера
  // с pointer-events: none): иначе на таких местах скролл «залипал», пока не сдвинешь мышь
  useEffect(() => {
    const box = phoneRef.current
    const onWheel = e => {
      const feed = outerRef.current
      if (!feed || e.ctrlKey) return
      e.preventDefault()
      feed.scrollTop += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
    }
    box?.addEventListener('wheel', onWheel, { passive: false })
    return () => box?.removeEventListener('wheel', onWheel)
  }, [])
  // К выбранному сообщению — каждый раз при выборе (в том числе повторном: selTick растёт при каждом клике)
  useEffect(() => {
    if (!selRef) return
    outerRef.current?.querySelector(`[data-ref="${CSS.escape(selRef)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selRef, selTick])

  return (
    <PlayerMutedContext.Provider value={false}>
      <div className="rvwPhone" ref={phoneRef}>
        <div className="lessonPlayer rvwLessonPlayer">
          {/* Классы ленты настоящие, но переворот scaleY(-1) отключён (rvwPlayerFeed): колесо идёт в обычную сторону, лента начинается сверху */}
          <div className="playerFeed rvwPlayerFeed" ref={outerRef}>
            <div className="playerFeedInner">
              {items.map((it, i) => {
                const node = canvasById.get(it.ref)
                if (!node) return null
                const on = it.ref === selRef
                const warns = warnMap.get(it.ref)?.length ?? 0
                if (it.kind === 'student') {
                  return <div key={`s-${it.ref}-${i}`} data-ref={it.ref} className={`rvwSlot${on ? ' on' : ''}`} onClick={() => onSelect(it.ref)}><StudentRow item={it} /></div>
                }
                return (
                  <div key={`n-${it.ref}-${i}`} data-ref={it.ref} className={`rvwSlot${on ? ' on' : ''}${it.wrongBranch ? ' wrong' : ''}${changeMarks?.has(it.ref) ? ' rvwChg' : ''}`} onClick={() => onSelect(it.ref)}>
                    <div className="rvwSlotMeta">
                      <span>{node.seq}</span>{it.wrongBranch && <span className="rvwTagWrong">ветка ошибки</span>}{changeMarks?.has(it.ref) && <span className="rvwTagChg">{changeMarks.get(it.ref) === 'new' ? 'новая' : 'изменена'}</span>}{warns > 0 && <span className="rvwWarn">⚠ {warns}</span>}
                    </div>
                    <SlotTools item={it} count={noteCounts?.get(it.ref) ?? 0} onNote={onNote} />
                    <SlotBody item={it} canvasNode={node} canvasNodes={canvasNodes} files={files} teacherName={teacherName} onPick={anchored(onPick)} onChoice={anchored(onChoice)} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </PlayerMutedContext.Provider>
  )
}
