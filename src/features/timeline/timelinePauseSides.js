// «Что прозвучало перед тишиной и что после» для паузы таймлайна — словами, понятными админу без кода: кто (Пит / Мия / диктор / игрок / игра) и ПОЛНЫЙ реальный текст (реплика как прозвучала, с правками
// админа; слово диктора; ответ игрока «не успел «bring»»; название стадии; «отсчёт — три ноты»). id реплики и sid стадии идут отдельным полем — их показывают мелко и серым.
// Сторона (side): { who: 'pit' | 'mia' | 'dictor' | 'player' | 'game', text, quoted (текст — прямая речь, в кавычках), id, note }. Чистые функции без React.
import { WHO, RES } from './timelineFormat.js'
import { stageInfo, stageTitle } from './timelineStageNames.js'

export const SIDE_WHO = { ...WHO, dictor: 'Диктор', player: 'Игрок', game: 'Игра' }
const ANSWER = { win: 'ответил верно', late: 'ответил верно (в последний момент)', miss: 'ошибся', fail: 'не успел', none: 'без ответа' }
const game = (text, extra = {}) => ({ who: 'game', text, quoted: false, id: '', note: '', ...extra })
const word = w => (w ? ` «${w}»` : '')

/** Опорные события прохождения по времени: [{ t, edge: 'start' | 'end', rank (кто главнее на одной границе: 0 — реплика, 1 — игрок, 2 — отсчёт…), stage (стадия — для «началась внутри»), side }] */
export function markers(m) {
  const out = []
  for (const l of m.lines) {
    const side = { who: l.who, text: l.text || l.id, quoted: true, id: l.who === 'dictor' ? '' : l.id, note: l.silent ? 'без озвучки — подпись' : '' }
    out.push({ t: l.t, edge: 'start', rank: 0, side }, { t: l.end, edge: 'end', rank: 0, side })
  }
  for (const s of m.stages) {
    out.push({ t: s.t, edge: 'start', rank: 5, stage: s, side: game(`началась стадия «${stageTitle(s)}»`, { id: s.sid }) })
    if (s.out != null) out.push({ t: s.out, edge: 'end', rank: 6, side: game(`кончился ход стадии «${stageTitle(s)}»`, { id: s.sid }) })
  }
  for (const u of m.turns) {
    if (u.pillT != null) out.push({ t: u.pillT, edge: 'start', rank: 7, side: game(`выехала пилюля${word(u.word)}`) })
    if (u.claimT != null) out.push({ t: u.claimT, edge: 'end', rank: 1, side: { who: 'player', text: `ответ${word(u.word)} принят`, quoted: false, id: '', note: '' } })
  }
  for (const a of m.answers) out.push({ t: a.t, edge: 'end', rank: 1, side: { who: 'player', text: `${ANSWER[a.late && a.res === 'win' ? 'late' : a.res] ?? RES[a.res] ?? a.res}${word(a.word)}`, quoted: false, id: '', note: '' } })
  for (const c of m.counts) out.push({ t: c.t, edge: 'start', rank: 2, side: game('отсчёт — три ноты') }, { t: c.end, edge: 'end', rank: 2, side: game('отсчёт — три ноты', { note: 'отзвучал' }) })
  for (const w of m.waits) out.push({ t: w.end, edge: 'end', rank: 4, side: game(`кончилось ожидание техники${w.why ? `: ${w.why}` : ''}`) })
  for (const h of m.holds) out.push({ t: h.t, edge: 'start', rank: 3, side: game('поставлена на паузу (свернули или открыли окно)') }, { t: h.end, edge: 'end', rank: 3, side: game('снята с паузы') })
  return out.sort((a, b) => a.t - b.t)
}

export const SIDE_START = game('начало игры')
export const SIDE_END = game('конец игры')

/** Что происходило внутри паузы: стадия-анимация (шла на начало паузы или началась внутри) и стадии, начавшиеся внутри. cur — стадия на начало паузы, mid — стадии, начавшиеся внутри. → [строки] */
export function insideOf(cur, mid = []) {
  const out = [], seen = new Set()
  for (const s of [cur, ...mid]) {
    if (!s || seen.has(s)) continue
    seen.add(s)
    const info = stageInfo(s.sid), started = s !== cur
    if (info?.kind === 'animation') out.push(`${started ? `началась стадия «${stageTitle(s)}»: ` : ''}идёт ${info.anim} (анимация без речи)`)
    else if (started) out.push(`началась стадия «${stageTitle(s)}»`)
  }
  return out
}

/** Сторона одной строкой для отчёта и списка: «Пит: «текст» [race_reverse]» / «игрок: не успел «bring»» / «игра: отсчёт — три ноты» */
export function sideLine(side) {
  if (!side) return '—'
  const who = side.quoted ? SIDE_WHO[side.who] ?? side.who : (SIDE_WHO[side.who] ?? side.who).toLowerCase()
  return `${who}: ${side.quoted ? `«${side.text}»` : side.text}${side.note ? ` (${side.note})` : ''}${side.id ? ` [${side.id}]` : ''}`
}
