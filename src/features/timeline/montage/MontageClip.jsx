import { labelMode } from '../timelineView.js'
import { dur, WHO } from '../timelineFormat.js'
import { TAIL_MIN_MS } from './montageModel.js'

// Клип монтажного стола — одна реплика. ШИРИНА клипа строго пропорциональна времени: сплошная часть — сколько реально звучало аудио (c.sound), полупрозрачное продолжение — «хвост» до события конца реплики
// (c.tail: рот закрылся позже звука). На клипе — текст реплики и длительность звука («1,8 с»); клип узкий — только длительность; совсем узкий — без подписи (всё есть в подсказке). Реплика без озвучки
// (подпись) — штриховка. В режиме «Правка» клип тянут по горизонтали (onDown — useClipDrag): moved — сдвинут правкой, warn — звучит одновременно с другим говорящим, hit — упёрся в предел.
export default function MontageClip({ c, scale, on = false, edit = false, moved = false, warn = false, drag = false, hit = false, onDown = null, onPick = null }) {
  const w = Math.max(3, (c.end - c.t) * scale), mode = labelMode(w), tail = c.tail >= TAIL_MIN_MS
  const title = `${WHO[c.who] ?? c.who}: «${c.text}» — звучало ${dur(c.sound)}${tail ? `, хвост ${dur(c.tail)}` : ''}${c.silent ? ' (без озвучки — подпись)' : ''}${warn ? ' — ЗВУЧИТ ОДНОВРЕМЕННО с другим говорящим' : ''}`
  return (
    <button
      type="button" className="mtgClip" style={{ left: c.t * scale, width: w }} title={title} data-testid="mtg-clip" data-key={c.key} data-who={c.who} data-mode={mode}
      data-silent={c.silent ? '1' : undefined} data-on={on ? '1' : undefined} data-edit={edit ? '1' : undefined} data-moved={moved ? '1' : undefined} data-warn={warn ? '1' : undefined}
      data-drag={drag ? '1' : undefined} data-hit={hit ? '1' : undefined} data-ms={Math.round(c.sound)}
      onPointerDown={edit && onDown ? e => onDown(e, c.key) : undefined} onClick={edit ? undefined : () => onPick?.(c.key)}
    >
      <i className="mtgClipSound" style={{ width: Math.max(2, c.sound * scale) }} />
      {mode === 'text' && <span className="mtgClipText" lang={/[а-яё]/i.test(c.text) ? 'ru' : 'en'}>{c.text}</span>}
      {mode !== 'none' && <b className="mtgClipDur">{dur(c.sound)}{warn && mode === 'text' ? ' · ⚠ одновременно' : ''}</b>}
    </button>
  )
}
