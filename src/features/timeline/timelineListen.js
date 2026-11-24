import { stageTitle } from './timelineStageNames.js'
import { voiceKey } from './timelineVoice.js'
import { RACE_LINE_SET } from '../admin/speech/voiceAudit.js'
import { CAT_LINES } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { CODE_TEXT_OF } from '../rehearsal/rehearsalLines.js'

// Блоки режима «Прослушать» (TimelineListen.jsx): реплики прохождения по стадиям в порядке игры. Только «Встряхни память» (владелец: «именно только из Встряхни память»): реплики Пита и Мии — из её каталога
// (гонка + эпизод Мии, voiceAudit.RACE_LINE_SET), диктор — как есть; чужие реплики трассы не берутся. ofLine — useClipAudio.of: { url, duration } либо { url: null, why }.
// → [{ key, title, t, items: [{ key, line, url, duration, why }], playable, sec }] — блоки без единой реплики пропускаются.
// v3.3.360 (владелец: «в режиме «Прослушать» старый текст — обнови»): прохождение записано на прежней сборке, поэтому текст реплики Пита и Мии берётся из ТЕКУЩЕГО каталога кода (по id), а реплики,
// которых в игре больше нет (склеенные и удалённые правкой 2026-11-24), и стадии вырезанного этапа «Конвейер ситуаций» (sid phrases…) в списке не показываются. Новые реплики появятся после новой игры.
const LISTEN_WHO = new Set(['pit', 'mia', 'dictor'])
const TEXT_NOW = new Map(CAT_LINES.map(d => [d.id, CODE_TEXT_OF[d.id] ?? d.text]))
const CUT_SID = /^phrases/
const inRace = l => LISTEN_WHO.has(l.who) && (l.who === 'dictor' || (RACE_LINE_SET.has(l.id) && TEXT_NOW.has(l.id)))

export function listenBlocks(m, ofLine) {
  if (!m) return []
  const stages = [{ t: -Infinity, end: m.stages[0]?.t ?? Infinity, sid: '', none: true }, ...m.stages]
  const out = []
  stages.forEach((s, n) => {
    if (CUT_SID.test(s.sid ?? '')) return // этап «Конвейер ситуаций» вырезан
    const lines = m.lines.filter(l => inRace(l) && !l.silent && l.t >= (s.none ? -Infinity : s.t) && l.t < (s.end ?? Infinity)).sort((a, b) => a.t - b.t)
    if (!lines.length) return
    const items = lines.map(l => { const text = l.who === 'dictor' ? l.text : TEXT_NOW.get(l.id) ?? l.text, line = { ...l, text }, v = ofLine?.(line) ?? {}; return { key: voiceKey(l), line, url: v.url ?? null, duration: v.duration ?? (l.ms > 0 ? l.ms / 1000 : null), why: v.why ?? '', stale: !!v.changed } })
    out.push({ key: `b${n}`, title: s.none ? 'до первой стадии' : stageTitle(s), t: s.none ? 0 : s.t, items, playable: items.filter(x => x.url).length, sec: items.reduce((a, x) => a + (x.url ? x.duration ?? 0 : 0), 0) })
  })
  return out
}
