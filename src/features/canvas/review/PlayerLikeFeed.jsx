import { useEffect, useRef } from 'react'
import PlayerMessage from '../../player/PlayerMessage.jsx'
import { PlayerMutedContext } from '../../player/playerMuted.js'
import { answerText } from './lessonTranscript.js'

const NOOP = () => {}
// Эти типы в настоящем плеере — не сообщения ленты, а панели ответа снизу: в копии рисуем «заглушку задания»
const EXERCISE_TYPES = new Set(['word_choice', 'phrase_assembly', 'type_word', 'say_phrase', 'fill_blanks', 'photo_choice', 'registration'])
const LABEL = { word_choice: 'Выбор слова', phrase_assembly: 'Собери фразу', type_word: 'Напечатай слово', say_phrase: 'Скажи фразу', fill_blanks: 'Составь предложение', photo_choice: 'Выбор фото', registration: 'Регистрация' }

function ExerciseStub({ node }) {
  const d = node.data ?? {}
  const opts = node.type === 'word_choice' ? (d.options ?? []).map(o => ({ t: o.text, ok: o.isCorrect }))
    : node.type === 'phrase_assembly' ? [...(d.words ?? []).map(t => ({ t, ok: true })), ...(d.distractors ?? []).map(x => ({ t: x.text, ok: false }))]
      : [{ t: answerText(node) || LABEL[node.type], ok: true }]
  return (
    <div className="rvwStub">
      <div className="rvwStubHead">⌨ {LABEL[node.type] ?? node.type} · панель ответа</div>
      <div className="rvwOpts">{opts.map((o, i) => <span key={i} className={`rvwOpt${o.ok ? ' ok' : ''}`}>{o.t}</span>)}</div>
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

// Копия ленты плеера: те же классы и те же модули сообщений (PlayerMessage), что в уроке, но без триггеров — ничего не играет и не переходит
// дальше (звук выключен контекстом, файлов не передаём — медиа рисуются заглушками). Поверх каждого сообщения — выделение, номер, замечания и
// переключатель «верно / неверно» на заданиях
export default function PlayerLikeFeed({ items, canvasById, canvasNodes, selRef, selTick, warnMap, onSelect, onChoice }) {
  const outerRef = useRef(null)
  // К выбранному сообщению — каждый раз при выборе (в том числе повторном: selTick растёт при каждом клике)
  useEffect(() => {
    if (!selRef) return
    outerRef.current?.querySelector(`[data-ref="${CSS.escape(selRef)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selRef, selTick])

  return (
    <PlayerMutedContext.Provider value={true}>
      <div className="rvwPhone">
        <div className="lessonPlayer rvwLessonPlayer">
          {/* Лента настоящая: .playerFeed перевёрнута (scrollY), .playerFeedInner переворачивает обратно. Прокрутка начинается снизу — к началу урока скроллим вверх */}
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
                      ? <ExerciseStub node={node} />
                      : node.type === 'reaction'
                        ? <div className="playerMsgRow"><span className="rvwEmoji">{node.typeData?.reaction?.emoji}</span></div>
                        : <PlayerMessage node={node} lessonNodes={canvasNodes} teacherName="" adminPreview pending={false} onDone={NOOP} onTrReveal={NOOP} />}
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
