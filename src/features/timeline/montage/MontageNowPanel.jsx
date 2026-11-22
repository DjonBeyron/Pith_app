import { nowAt } from './montageNow.js'
import { clock, dur, WHO, RES } from '../timelineFormat.js'
import { GAP_KIND } from './montageEditsText.js'

// Панель «В этот момент» рядом с указателем монтажа: какой этап идёт, кто и что говорит, какая пилюля на экране, сколько длится текущая тишина и между чем она. Обычные слова, без кода (sid и id — мелко).
const said = c => `${WHO[c.who] ?? c.who}: «${c.text}»`

export default function MontageNowPanel({ mont, t }) {
  const n = nowAt(mont, t)
  return (
    <section className="mtgNow" data-testid="mtg-now">
      <h4 className="mtgH">В этот момент — {clock(t, true)}</h4>
      <dl className="mtgNowRows">
        <div><dt>Этап</dt><dd>{n.stage ? <>{n.stage.title} <small>[{n.stage.sid}] · идёт {dur(n.stageMs)} из {dur(n.stage.end - n.stage.t)}</small></> : 'до первого этапа'}</dd></div>
        {n.speaking.map(c => (
          <div key={c.key} data-who={c.who}><dt>Говорит</dt><dd><b>{said(c)}</b> <small>звучит {dur(t - c.t)} из {dur(c.sound)}{c.who !== 'dictor' ? ` · ${c.id}` : ''}{c.silent ? ' · без озвучки (подпись)' : ''}</small></dd></div>
        ))}
        {!n.speaking.length && (
          <div data-kind={n.gap?.kind ?? 'none'}><dt>Тишина</dt><dd>
            {n.gap ? <><b>{GAP_KIND[n.gap.kind] ?? n.gap.kind}</b> — идёт {dur(n.gapMs)} из {dur(n.gap.ms)}{n.group && n.group.pieces.length > 1 ? <small> · вся тишина между репликами {dur(n.group.ms)}</small> : null}</> : 'никто не говорит'}
          </dd></div>
        )}
        {n.pills.map(p => <div key={p.t}><dt>На экране</dt><dd>{p.phrase ? 'ход фразы' : 'пилюля'} «{p.word}» <small>уже {dur(t - p.t)} · исход: {RES[p.res] ?? p.res}</small></dd></div>)}
        {n.marks.map(k => <div key={`${k.kind}${k.t}`}><dt>Игра</dt><dd>{k.text} <small>идёт {dur(t - k.t)} из {dur(k.end - k.t)}</small></dd></div>)}
        {!n.speaking.length && n.before && <div><dt>Перед этим</dt><dd>{said(n.before)} <small>кончил {dur(t - n.before.end)} назад</small></dd></div>}
        {n.after && <div><dt>Дальше</dt><dd>{said(n.after)} <small>через {dur(n.after.t - t)}</small></dd></div>}
      </dl>
    </section>
  )
}
