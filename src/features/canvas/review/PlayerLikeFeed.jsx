import { useEffect, useRef } from 'react'
import PlayerMessage from '../../player/PlayerMessage.jsx'
import PhraseBank from '../../player/panels/phrase-assembly/PhraseBank.jsx'
import PhraseAnswerRow from '../../player/panels/phrase-assembly/PhraseAnswerRow.jsx'
import ChooseWordOption from '../../player/panels/choose-word/ChooseWordOption.jsx'
import { nodeFileKey } from '../../player/preloadQueue.js'
import { TYPE_COLOR } from '../nodeTypes.js'
import { PlayerMutedContext } from '../../player/playerMuted.js'
import { answerText } from './lessonTranscript.js'

const NOOP = () => {}
const NO_SET = new Set()
// Эти типы в настоящем плеере — не сообщения ленты, а панели ответа снизу: в копии рисуем панель теми же компонентами и классами, что в плеере
const EXERCISE_TYPES = new Set(['word_choice', 'phrase_assembly', 'type_word', 'say_phrase', 'fill_blanks', 'photo_choice', 'registration'])
const LABEL = { word_choice: 'Выбери слово', phrase_assembly: 'Собери фразу', type_word: 'Напечатай слово', say_phrase: 'Сказать фразу', fill_blanks: 'Составь предложение', photo_choice: 'Выбрать фото', registration: 'Регистрация' }

// Панель ответа «как у ученика»: настоящие кусочки панелей (банк слов, строка ответа, кнопки выбора). Верные варианты помечены для автора
function ExercisePanel({ node }) {
  const d = node.data ?? {}
  const accent = TYPE_COLOR[node.type] ?? '#7a7a96'
  let body
  if (node.type === 'phrase_assembly') {
    const chips = [...(d.words ?? []), ...(d.distractors ?? []).map(x => x.text)].map(text => ({ text }))
    body = (
      <div className="phraseInner">
        <PhraseAnswerRow placed={[]} result={null} onRemove={NOOP} />
        <PhraseBank chips={chips} usedIdxs={NO_SET} disabled onPick={NOOP} />
        <button className="phraseCheckBtn" disabled>Проверить</button>
      </div>
    )
  } else if (node.type === 'word_choice') {
    body = (
      <div className="chooseWordInner">
        {(d.options ?? []).map((o, i) => <div key={i} className={o.isCorrect ? 'rvwOptOk' : undefined}><ChooseWordOption text={o.text} state={null} disabled onClick={NOOP} /></div>)}
      </div>
    )
  } else {
    body = <div className="rvwTypeLine">{answerText(node) || LABEL[node.type]}</div>
  }
  return (
    <div className="rvwPanel" style={{ '--rvw-accent': accent }}>
      <div className="rvwPanelHead">{LABEL[node.type] ?? node.type}</div>
      {body}
    </div>
  )
}

// Ответ ученика — теми же классами, что в плеере (строка справа, пузырь)
function StudentRow({ item }) {
  return (
    <div className={`playerMsgRow playerMsgRowRight rvwStudentRow${item.ok ? '' : ' bad'}`}>
      <div className="playerMsgBubble playerMsgBubble--text"><p className="playerText">{item.ok ? (answerText(item.node) || 'верный ответ') : 'неверный ответ'}</p></div>
    </div>
  )
}

// Копии нод «как из истории»: isHistory выключает автозапуск видео/кружков и въезд (так их рисует сам плеер при «Продолжить урок»)
const HISTORY = new WeakMap()
const asHistory = node => {
  let c = HISTORY.get(node)
  if (!c) { c = { ...node, isHistory: true }; HISTORY.set(node, c) }
  return c
}

// Копия ленты плеера: те же классы и те же модули сообщений (PlayerMessage), что в уроке, но без триггеров — ничего не играет и не переходит
// дальше (звук выключен контекстом, файлов не передаём — медиа рисуются заглушками). Поверх каждого сообщения — выделение, номер, замечания и
// переключатель «верно / неверно» на заданиях
export default function PlayerLikeFeed({ items, canvasById, canvasNodes, files = [], selRef, selTick, warnMap, onSelect, onChoice }) {
  const outerRef = useRef(null)
  // К выбранному сообщению — каждый раз при выборе (в том числе повторном: selTick растёт при каждом клике)
  useEffect(() => {
    if (!selRef) return
    outerRef.current?.querySelector(`[data-ref="${CSS.escape(selRef)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selRef, selTick])

  return (
    <PlayerMutedContext.Provider value={false}>
      <div className="rvwPhone">
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
                const exercise = EXERCISE_TYPES.has(node.type)
                return (
                  <div key={`n-${it.ref}-${i}`} data-ref={it.ref} className={`rvwSlot${on ? ' on' : ''}${it.wrongBranch ? ' wrong' : ''}`} onClick={() => onSelect(it.ref)}>
                    <div className="rvwSlotMeta">
                      <span>{node.seq}</span>{it.wrongBranch && <span className="rvwTagWrong">ветка ошибки</span>}{warns > 0 && <span className="rvwWarn">⚠ {warns}</span>}
                    </div>
                    {exercise
                      ? <ExercisePanel node={it.node} />
                      : node.type === 'reaction'
                        ? <div className="playerMsgRow"><span className="rvwEmoji">{node.typeData?.reaction?.emoji}</span></div>
                        : <PlayerMessage node={asHistory(node)} file={files.find(f => f.id === nodeFileKey(node)) ?? null} lessonFiles={files} lessonNodes={canvasNodes} teacherName="" adminPreview pending={false} onDone={NOOP} onTrReveal={NOOP} />}
                    {it.choice && (
                      <div className="rvwSwitch" onClick={e => e.stopPropagation()}>
                        <button className={it.choice === 'right' ? 'on' : ''} onClick={() => onChoice(it.ref, 'right')}>✓ верно</button>
                        <button className={it.choice === 'wrong' ? 'on bad' : ''} disabled={!it.hasWrong} title={it.hasWrong ? '' : 'У задания нет ветки «неверно»'} onClick={() => onChoice(it.ref, 'wrong')}>✗ неверно</button>
                      </div>
                    )}
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
