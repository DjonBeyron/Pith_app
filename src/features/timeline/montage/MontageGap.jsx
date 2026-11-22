import { dur } from '../timelineFormat.js'
import { GAP_KIND } from './montageEditsText.js'

// Зазор монтажного стола — кусок времени, когда НИКТО не говорит: колонка через все три дорожки речи со скобкой и числом секунд (ширина — по времени, как у клипов).
// Цвет — чем игра занята: «игра молчит» дольше порога — красный, «ждём игрока» — серый с подписью, анимация без речи — жёлтый, отсчёт нотами / техника — синий, пауза игры — штриховка.
// Нажатие: указатель встаёт в начало зазора, а в режиме «Правка» открывается правка зазора (клип после него).
export const GAP_NUM_PX = 30   // зазор шире — на нём число секунд
export const GAP_NAME_PX = 96  // ещё шире — и подпись, чем игра занята
const NAME = { dead: '', anim: 'анимация', player: 'ждём игрока', count: 'отсчёт', wait: 'техника', paused: 'пауза игры' }

export default function MontageGap({ g, scale, on = false, onPick = null }) {
  const w = Math.max(2, (g.end - g.t) * scale), name = g.kind === 'dead' ? (g.long ? 'игра молчит' : 'тишина') : NAME[g.kind]
  return (
    <button
      type="button" className="mtgGap" style={{ left: g.t * scale, width: w }} title={`${GAP_KIND[g.kind] ?? g.kind} — ${dur(g.ms)}${g.stage ? ` · ${g.stage}` : ''}`}
      data-testid="mtg-gap" data-kind={g.kind} data-long={g.long ? '1' : undefined} data-on={on ? '1' : undefined} data-ms={Math.round(g.ms)} onClick={() => onPick?.(g)}
    >
      <i className="mtgGapBr" />
      {w >= GAP_NUM_PX && <b>{dur(g.ms)}</b>}
      {w >= GAP_NAME_PX && name && <span>{name}</span>}
    </button>
  )
}
