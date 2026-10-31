// Снимок «что на экране» для комментария владельца (кнопка 💬 в игре): стадия и акт, ступень, пилюли (дорожка, текст, заполнение, состояние), подписи дорожек, подпись кота, плашка, статус микрофона и слушателя
// (принято / промахов / услышал). Чистая функция от состояния игры f (useWordLaneFlow) и DOM-корня игры (.wl): корень нужен только для пилюль — их состояние живёт в DOM, а не в React (useWordLanePills).
// Снимок берётся ДО паузы (в момент тапа по 💬), поэтому видны пилюли и стадия такими, какими владелец их увидел.
import { onlyOf, ONLY_TITLES } from '../rehearsalOnly.js'

// Состояние пилюли по признакам пула (wordLanePool.js): data-fail — не успел, data-lock — принята, data-live — наливается, иначе летит
const PILL_STATES = [['data-fail', 'не успел'], ['data-lock', 'принята'], ['data-live', 'наливается']]
const has = (el, attr) => el.getAttribute?.(attr) != null
const round2 = v => Math.round(v * 100) / 100

/** Пилюли в игре (взятые из пула): [{ lane, text, fill (0…1), state }] — слева направо. Нет корня (тест, закрытая игра) — пусто */
export function pillsOf(root, laneTexts = []) {
  const list = root?.querySelectorAll ? [...root.querySelectorAll('[data-pill][data-held]')] : []
  return list.map(el => {
    const lane = Number(el.getAttribute('data-lane')) || 0
    const fill = Number.parseFloat(el.querySelector?.('.wlPillSparks i')?.style?.getPropertyValue?.('--fill'))
    return { lane, text: laneTexts[lane] ?? '', fill: Number.isFinite(fill) ? round2(fill) : 0, state: PILL_STATES.find(([a]) => has(el, a))?.[1] ?? 'летит' }
  }).sort((a, b) => a.lane - b.lane)
}

/** Где игра сейчас: этап шлифовки (act), его название, стадия директора (name), ключ журнала (sid), тип, номер, вид для движка (phase) */
export function stageOf(f, fallbackAct = 'intro') {
  const st = f.stage === 'run' ? f.stageObj : null
  const act = st ? onlyOf(st.act) : f.stage === 'drop' || f.stage === 'lanes' ? 'intro' : fallbackAct
  return { act, actTitle: ONLY_TITLES[act] ?? act, name: f.stage ?? '', sid: st?.sid ?? '', type: st?.type ?? '', idx: f.idx ?? 0, phase: f.phase ?? '' }
}

/** Этап шлифовки, к которому относится сейчас комментарий (для ключа хранилища) */
export const commentActOf = (f, fallbackAct = 'intro') => stageOf(f, fallbackAct).act

/**
 * @param {{ f, root, chunks?: string[], phrase?: string, version?: string, fallbackAct?: string }} o
 * f — результат useWordLaneFlow (stage, idx, stageObj, phase, labels, catLine, plate, rh, mic, seq, misses, note); root — корень игры (.wl); chunks — куски фразы; fallbackAct — этап на финале (reveal).
 */
export function snapshotScreen({ f, root = null, chunks = [], phrase = '', version = '', fallbackAct = 'intro' }) {
  const st = f.stage === 'run' ? f.stageObj : null
  const laneTexts = st?.step?.chunks ?? chunks
  const step = st?.step ? { id: st.step.id, text: st.step.text, parts: st.step.parts, reps: st.step.reps?.length ?? 0, ...(st.word ? { word: st.word.text } : {}) } : null
  return {
    version, phrase,
    stage: stageOf(f, fallbackAct),
    step,
    pills: pillsOf(root, laneTexts),
    lanes: (f.labels ?? []).map((l, lane) => ({ lane, text: l.text, on: !!l.on })).filter(l => l.text),
    cat: f.catLine || '',
    plate: f.plate || '',
    tag: f.rh?.tag || '',
    mic: f.mic ?? '',
    listener: { seq: f.seq?.length ?? 0, misses: f.misses ?? 0, heard: f.note || '' },
  }
}

/** Снимок одной строкой для сводки: «стадия … · ступень … · пилюли … · кот … · микрофон …» */
export function screenLine(s) {
  const parts = []
  parts.push(`стадия ${s.stage?.name || '—'}${s.stage?.type ? `/${s.stage.type}` : ''}${s.stage?.sid ? ` (${s.stage.sid})` : ''}`)
  if (s.step) parts.push(`ступень «${s.step.text}» ×${s.step.reps}`)
  parts.push(s.pills?.length ? `пилюли ${s.pills.map(p => `${p.lane + 1}:«${p.text}» ${p.state} ${Math.round(p.fill * 100)}%`).join(', ')}` : 'пилюль нет')
  if (s.lanes?.length) parts.push(`подписи ${s.lanes.map(l => `«${l.text}»${l.on ? '*' : ''}`).join(' ')}`)
  if (s.cat) parts.push(`кот: «${s.cat}»`)
  if (s.plate) parts.push(`плашка «${s.plate}»`)
  if (s.tag) parts.push(`ярлык «${s.tag}»`)
  parts.push(`микрофон ${s.mic || '—'}, принято ${s.listener?.seq ?? 0}, промахов ${s.listener?.misses ?? 0}${s.listener?.heard ? `, ${s.listener.heard}` : ''}`)
  return parts.join(' · ')
}
