import { useState } from 'react'
import { sec as dur } from './montage/montageEditsText.js'

// Одна настройка паузы с управлением (карточка зазора, панель «⚙ Настройки пауз»): название, «между чем и чем», значение сейчас и по умолчанию, откуда значение (по умолчанию / это устройство / сервер /
// черновик), ползунок в пределах min…max с шагом 50 мс, «−», «+», поле в секундах, «по умолчанию»; сразу «было → стало» и оценка «эта игра стала бы короче на X с» (сколько раз настройка сработала
// в выбранной игре × разница). Значение вне пределов не принимается — причина словами. Меняется ЧЕРНОВИК (usePauseKnobs): игра не меняется, пока не нажато «попробовать на устройстве» или «для всех».
// p — запись реестра (scenePauses.SCENE_PAUSES); knobs — usePauseKnobs; note — строка сверх (сколько мс этой тишины дала настройка).
const sec = ms => (ms / 1000).toFixed(2).replace('.', ',')
const parse = s => { const n = Number(String(s).replace(',', '.').replace(/[^\d.-]/g, '')); return String(s).trim() && Number.isFinite(n) ? Math.round(n * 1000) : null }

export default function TimelinePauseKnob({ p, knobs, note = '', focus = false }) {
  const [text, setText] = useState(null) // null — в поле текущее значение
  const [err, setErr] = useState('')
  const v = knobs.value(p.key), now = knobs.eff.values[p.key], use = knobs.usage[p.key], can = knobs.can
  const put = ms => { setErr(ms == null ? 'нужно число секунд, например 0,6' : knobs.set(p.key, ms)); setText(null) }
  const gain = use.n ? knobs.shorter(p.key, v) : 0
  return (
    <div className="tlKnob" data-testid="tl-knob" data-key={p.key} data-changed={v !== p.def ? '1' : undefined} data-draft={v !== now ? '1' : undefined} data-focus={focus ? '1' : undefined}>
      <div className="tlKnobHead"><b className="tlKnobTitle">⚙ {p.title}</b><span className="tlKnobVal" data-testid="tl-knob-val">{dur(v)}</span></div>
      <p className="tlKnobWhere">{p.where}</p>
      {note && <p className="tlKnobNote">{note}</p>}
      <p className="tlKnobMeta" data-testid="tl-knob-meta">
        {v !== now ? <b className="tlKnobDiff">было {dur(now)} → стало {dur(v)}</b> : <span>сейчас {dur(now)}</span>} · по умолчанию {dur(p.def)} · <span data-testid="tl-knob-src">{knobs.source(p.key)}</span> · можно {dur(p.min)} … {dur(p.max)}
      </p>
      <p className="tlKnobMeta" data-testid="tl-knob-use">
        {use.n ? <>в этой игре сработала {use.n} раз{use.n % 10 >= 2 && use.n % 10 <= 4 && (use.n < 10 || use.n > 20) ? 'а' : ''}, всего {dur(use.ms)}{Math.abs(gain) >= 50 ? <b className="tlKnobGain" data-testid="tl-knob-gain"> · с таким значением эта игра стала бы {gain > 0 ? 'короче' : 'длиннее'} на {dur(Math.abs(gain))}</b> : null}</> : 'в этой игре не срабатывала'}
      </p>
      {can && (
        <div className="tlKnobCtl">
          <button type="button" className="tlChip" onClick={() => put(v - p.step)} aria-label={`${p.title}: меньше на ${p.step} мс`} data-testid="tl-knob-minus">−</button>
          <input type="range" className="tlKnobRange" min={p.min} max={p.max} step={p.step} value={v} onChange={e => put(Number(e.target.value))} aria-label={`${p.title}, мс`} data-testid="tl-knob-range" />
          <button type="button" className="tlChip" onClick={() => put(v + p.step)} aria-label={`${p.title}: больше на ${p.step} мс`} data-testid="tl-knob-plus">+</button>
          <form className="tlKnobForm" onSubmit={e => { e.preventDefault(); put(parse(text ?? sec(v))) }}>
            <input className="tlKnobInput" inputMode="decimal" value={text ?? sec(v)} onChange={e => setText(e.target.value)} onBlur={() => { if (text != null) put(parse(text)) }} aria-label={`${p.title}, секунд`} data-testid="tl-knob-input" /> с
          </form>
          <button type="button" className="tlChip" onClick={() => put(p.def)} disabled={v === p.def} data-testid="tl-knob-default">по умолчанию</button>
        </div>
      )}
      {err && <p className="tlKnobErr" role="alert" data-testid="tl-knob-err">{err}</p>}
    </div>
  )
}
