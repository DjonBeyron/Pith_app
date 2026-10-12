import ChatBubblePreview from '../ChatBubblePreview.jsx'
import { answerText } from './lessonTranscript.js'

const TAG = {
  system: 'Заголовок', pin_message: 'Закреп', audio: 'Голос', photo: 'Фото', circle: 'Кружок', video: 'Видео', sticker: 'Стикер',
  word_choice: 'Выбор слова', phrase_assembly: 'Собери фразу', type_word: 'Напечатай', say_phrase: 'Скажи', fill_blanks: 'Составь предложение',
  photo_choice: 'Выбор фото', table: 'Таблица', rotate_phone: 'Поверни телефон', lesson_ref: 'Ссылка на урок',
}
const textOf = n => n.data?.content ?? n.data?.text ?? n.data?.caption ?? ''

// Простая карточка задания (v1): суть задания и верный ответ; интерактивность плеера здесь не воспроизводится
function ExerciseBody({ node }) {
  const d = node.data ?? {}
  if (node.type === 'word_choice') {
    return <div className="rvwOpts">{(d.options ?? []).map((o, i) => <span key={i} className={`rvwOpt${o.isCorrect ? ' ok' : ''}`}>{o.text}</span>)}</div>
  }
  if (node.type === 'phrase_assembly') {
    return <div className="rvwOpts">{[...(d.words ?? []), ...(d.distractors ?? []).map(x => x.text)].map((w, i) => <span key={i} className={`rvwOpt${i < (d.words ?? []).length ? ' ok' : ''}`}>{w}</span>)}</div>
  }
  return <div className="rvwOpts"><span className="rvwOpt ok">{answerText(node) || '—'}</span>{d.pattern && <span className="rvwOpt">шаблон: {d.pattern}</span>}</div>
}

export default function FeedItem({ item, selected, warnCount, onSelect, onChoice }) {
  const { node } = item
  const cls = `rvwItem${selected ? ' on' : ''}${item.wrongBranch ? ' wrong' : ''}`
  if (item.kind === 'student') {
    return (
      <div className={`rvwItem rvwStudent${item.ok ? '' : ' bad'}`} onClick={() => onSelect(node.ref)}>
        <span className="rvwStudentBubble">{item.ok ? `✓ ${answerText(node) || 'верный ответ'}` : '✗ неверный ответ'}</span>
      </div>
    )
  }
  let body
  if (node.type === 'reaction') body = <span className="rvwEmoji">{node.data?.emoji}</span>
  else if (item.choice) body = <><ExerciseBody node={node} /></>
  else if (['circle', 'video', 'sticker', 'photo'].includes(node.type) && !String(textOf(node)).trim()) body = <span className="rvwMedia">▶ {TAG[node.type]}{node.data?.imagePrompt ? ` · ${node.data.imagePrompt}` : ''}</span>
  else body = <ChatBubblePreview text={String(textOf(node))} highlights={node.data?.highlights ?? []} hardWrap={!!node.data?.hardWrap} />
  return (
    <div className={cls} onClick={() => onSelect(node.ref)}>
      <div className="rvwMeta">
        <span className="rvwSeq">{node.seq ?? ''}</span>
        {TAG[node.type] && <span className="rvwTag">{TAG[node.type]}</span>}
        {item.wrongBranch && <span className="rvwTag rvwTagWrong">ветка ошибки</span>}
        {node.type === 'audio' && node.data?.showText === false && <span className="rvwTag">текст скрыт</span>}
        {warnCount > 0 && <span className="rvwWarn" title="Есть замечания линтера">⚠ {warnCount}</span>}
      </div>
      {body}
      {item.choice && (
        <div className="rvwSwitch" onClick={e => e.stopPropagation()}>
          <button className={item.choice === 'right' ? 'on' : ''} onClick={() => onChoice(node.ref, 'right')}>✓ верно</button>
          <button className={item.choice === 'wrong' ? 'on bad' : ''} disabled={!item.hasWrong} title={item.hasWrong ? '' : 'У задания нет ветки «неверно»'} onClick={() => onChoice(node.ref, 'wrong')}>✗ неверно</button>
        </div>
      )}
    </div>
  )
}
