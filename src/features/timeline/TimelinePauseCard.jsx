import { dur, atClock, stamp } from './timelineFormat.js'
import { SIDE_WHO } from './timelinePauseSides.js'
import TimelineBlockComment from './TimelineBlockComment.jsx'

// Карточка одной паузы «игра молчит» — так, чтобы админ без кода понял, ЧТО прозвучало перед тишиной и ЧТО после: крупно длина, когда, название этапа по-человечески; блоки «ПЕРЕД тишиной» и
// «ПОСЛЕ тишины» — кто (Пит / Мия / диктор / игрок / игра) и полный реальный текст; строка «внутри» — если шла анимация без речи или началась стадия. id реплики и sid — мелко и серым (для разработчика).
// p — пауза из timelinePauses.buildPauses; onGo(p) — «показать на ленте» (нет — кнопки нет: карточка уже на ленте); block — { head, send }: «💬 Комментарий в GitHub» к этой паузе (TimelineBlockComment; нет — кнопки нет).
function Side({ cap, side, said, saidWord }) {
  return (
    <div className="tlPSide" data-who={side.who}>
      <span className="tlPCap">{cap}</span>
      <span className="tlPLine"><b className="tlPWho">{SIDE_WHO[side.who] ?? side.who}</b> <span className="tlPText">{side.quoted ? `«${side.text}»` : side.text}</span></span>
      {(side.note || side.id) && <span className="tlPId">{[side.note, side.id].filter(Boolean).join(' · ')}</span>}
      {said && <span className="tlPSaid">{saidWord} ({dur(said.ago)} {saidWord.startsWith('след') ? 'после' : 'до'} паузы): <b>{SIDE_WHO[said.who] ?? said.who}</b> «{said.text}»{said.id ? <i className="tlPId"> {said.id}</i> : null}</span>}
    </div>
  )
}

export default function TimelinePauseCard({ p, onGo = null, block = null }) {
  const anim = p.inside?.some(x => x.includes('анимация без речи'))
  return (
    <article className="tlP" data-testid="tl-pause" data-anim={anim ? '1' : '0'}>
      <header className="tlPHead">
        <b className="tlPMs">{dur(p.ms)}</b>
        <span className="tlPAt" title={stamp(p.t)}>{atClock(p.t)}</span>
        <span className="tlPStage">{p.stage}{p.sid ? <i className="tlPId"> {p.sid}</i> : null}</span>
        {onGo && <button type="button" className="tlBtn tlPGo" onClick={() => onGo(p)} data-testid="tl-pause-go">показать на ленте</button>}
        {block && <TimelineBlockComment sel={{ kind: 'pause', ref: p }} block={block} className="tlBtn tlPGo" />}
      </header>
      <div className="tlPSides">
        <Side cap="Перед тишиной" side={p.before} said={p.saidBefore} saidWord="последняя реплика" />
        <Side cap="После тишины" side={p.after} said={p.saidAfter} saidWord="следующая реплика" />
      </div>
      {p.inside?.length > 0 && <p className="tlPIn" data-testid="tl-pause-in"><b>внутри:</b> {p.inside.join('; ')}</p>}
    </article>
  )
}
