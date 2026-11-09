import { useState, useRef } from 'react'
import useStandPlayer from './useStandPlayer.js'
import { SPEEDS, frameEvents, eventsAround, eventLine, EVENT_WIN_MS } from './pillStandPlayer.js'
import { summaryText } from './pillStandSummary.js'
import { saveTrace, copyText } from './standExport.js'
import { SAVE_HOW } from '../player/modules/rotate-phone/wordLaneDebugExport.js'

// Просмотр записи стенда пилюль («видео» из снимков, CONCEPT_PILLSTAND.md): пилюля плеера (pillRef — в поле .psReplay над этим блоком) принимает вид кадра, под ней — время, номер кадра, заливка
// (цель / экран), панель Vosk кадра, таймлайн, ▶ / ⏸, луп (A / B — границы отрезка, «весь»), скорость 1× / 0,5× / 0,25×, шаг ◀ ▶ (крупные кнопки и стрелки клавиатуры), события кадра и окна ±200 мс, выгрузка.
const n2 = v => (v == null ? '—' : v.toFixed(2).replace('.', ','))
const sec = ms => (ms / 1000).toFixed(3).replace('.', ',')

export default function PillStandPlayer({ rec, meta, pillRef, onClose }) {
  const audioRef = useRef(null)
  const p = useStandPlayer(rec, pillRef, audioRef)
  const [note, setNote] = useState('')
  const f = p.frame
  const t0 = rec.frames[0]?.t ?? 0
  const mine = new Set(frameEvents(rec.events, rec.frames, p.idx))
  const near = f ? eventsAround(rec.events, f.t) : []
  const copy = async () => { const text = summaryText({ ...meta, audio: rec.audio?.type ?? '' }, rec.events); setNote((await copyText(text)) ? 'Сводка записи скопирована' : 'Не получилось скопировать') }
  const save = async () => { const got = await saveTrace({ meta: { ...meta, record: { fps: rec.fps, ms: rec.ms } }, events: rec.events, frames: rec.frames, audio: rec.audio }); setNote(`${SAVE_HOW[got.how] ?? got.how}: ${got.name}`) }
  return (
    <div className="psPlayer" data-testid="ps-player">
      {rec.audio && <audio ref={audioRef} src={rec.audio.url} preload="auto" data-testid="ps-audio" />}
      <p className="psLine" data-testid="ps-frame-info" data-idx={p.idx} data-t={f?.t ?? ''}><b>кадр</b> {p.idx + 1}/{p.frames.length} · {f ? sec(f.t - t0) : '—'} с · {p.speed}× · {rec.fps} к/с{rec.audio ? ` · звук ${rec.audio.type}` : ' · без звука'}</p>
      <p className="psLine" data-testid="ps-frame-fill"><b>заливка</b> цель {n2(f?.g)} · экран {n2(f?.v)} · уровень {n2(f?.e?.lv)} · rms {f?.e?.rms ?? '—'} · затвор {f?.e?.gate == null ? '—' : f.e.gate ? 'откр.' : 'закр.'}</p>
      <p className="psLine" data-testid="ps-frame-ear"><b>Vosk</b> черн. «{f?.e?.p ?? ''}» · итог «{f?.e?.f ?? ''}»</p>
      <input type="range" className="psRange" min={0} max={Math.max(0, p.frames.length - 1)} value={p.idx} onChange={e => p.go(Number(e.target.value))} aria-label="Кадр" data-testid="ps-range" />
      <div className="psRow psRow--player">
        <button type="button" className="psBtn psBig" onClick={() => p.step(-1)} aria-label="Кадр назад" data-testid="ps-prev">|◀</button>
        <button type="button" className="psBtn psBig" onClick={p.toggle} data-testid="ps-play">{p.playing ? '⏸' : '▶'}</button>
        <button type="button" className="psBtn psBig" onClick={() => p.step(1)} aria-label="Кадр вперёд" data-testid="ps-next-frame">▶|</button>
        <span className="psSeg">{SPEEDS.map(v => <button key={v} type="button" className="psSegBtn" data-on={v === p.speed ? '1' : undefined} onClick={() => p.setSpeed(v)} data-testid={`ps-speed-${String(v).replace('.', '_')}`}>{String(v).replace('.', ',')}×</button>)}</span>
      </div>
      <div className="psRow psRow--player">
        <button type="button" className="psBtn" data-on={p.loop ? '1' : undefined} onClick={() => p.setLoop(!p.loop)} data-testid="ps-loop">🔁 луп</button>
        <button type="button" className="psBtn" onClick={() => p.setRange([f?.t ?? 0, p.range?.[1] ?? rec.frames.at(-1).t])} data-testid="ps-loop-a">A</button>
        <button type="button" className="psBtn" onClick={() => p.setRange([p.range?.[0] ?? t0, f?.t ?? 0])} data-testid="ps-loop-b">B</button>
        <button type="button" className="psBtn" onClick={() => p.setRange(null)} data-testid="ps-loop-all">весь</button>
        <span className="psSmall" data-testid="ps-loop-span">{sec(p.span[0] - t0)}–{sec(p.span[1] - t0)} с</span>
      </div>
      <div className="psRow psRow--player">
        <button type="button" className="psBtn" onClick={save} data-testid="ps-player-save">⬇ Трасса</button>
        <button type="button" className="psBtn" onClick={copy} data-testid="ps-player-copy">Сводка</button>
        <button type="button" className="psBtn" onClick={onClose} data-testid="ps-player-close">К стенду</button>
      </div>
      {note && <p className="psNote">{note}</p>}
      <ol className="psEvents" data-testid="ps-events">
        {near.map((e, i) => <li key={`${e.t}-${i}`} data-mine={mine.has(e) ? '1' : undefined}>{eventLine(e, f?.t ?? 0)}</li>)}
        {!near.length && <li>событий ±{EVENT_WIN_MS} мс нет</li>}
      </ol>
    </div>
  )
}
