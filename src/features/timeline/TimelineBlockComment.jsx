import { useState } from 'react'
import SendLogButton from '../../shared/ui/SendLogButton.jsx'

// «💬 Комментарий в GitHub» к любому блоку таймлайна (карточка блока, карточка паузы): открывает обычное окно комментария (shared/ui/SendLogButton), в начало текста подставлены строка-адрес блока
// и одна человеческая строка (timelineBlock.blockHead) — владелец дописывает своё. В отправку кроме обычных логов уходит файл-контекст блока (timelineBlockContext.js): что было до и после, какие звуки шли,
// сырые события трассы; для игры с сервера — ещё и все события прохождения.
// block — { head(sel) → начало комментария, send(sel, comment, opts) → строка-результат } (собирает TimelineScreen; null — отправки нет: кнопки нет). sel — { kind, ref }.
export default function TimelineBlockComment({ sel, block, className = 'tlBtn', label = '💬 Комментарий в GitHub' }) {
  const [info, setInfo] = useState('')
  if (!block || !sel) return null
  return (
    <span className="tlCmt">
      <SendLogButton className={className} label={label} prefill={block.head(sel)} send={(comment, opts) => block.send(sel, comment, opts)} onResult={setInfo} stop data-testid="tl-block-comment" title="Написать комментарий к этому блоку — уйдёт в GitHub вместе с контекстом: что было до и после, какие звуки шли" />
      {info && <small className="tlCmtInfo" data-testid="tl-block-sent">{info}</small>}
    </span>
  )
}
