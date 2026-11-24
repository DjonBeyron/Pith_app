import { stageTitle } from './timelineStageNames.js'
import { voiceKey } from './timelineVoice.js'
import { RACE_LINE_SET } from '../admin/speech/voiceAudit.js'

// Блоки режима «Прослушать» (TimelineListen.jsx): реплики прохождения по стадиям в порядке игры. Только «Встряхни память» (владелец: «именно только из Встряхни память»): реплики Пита и Мии — из её каталога
// (гонка + эпизод Мии, voiceAudit.RACE_LINE_SET), диктор — как есть; чужие реплики трассы не берутся. ofLine — useClipAudio.of: { url, duration } либо { url: null, why }.
// → [{ key, title, t, items: [{ key, line, url, duration, why }], playable, sec }] — блоки без единой реплики пропускаются.
const LISTEN_WHO = new Set(['pit', 'mia', 'dictor'])
const inRace = l => LISTEN_WHO.has(l.who) && (l.who === 'dictor' || RACE_LINE_SET.has(l.id))

export function listenBlocks(m, ofLine) {
  if (!m) return []
  const stages = [{ t: -Infinity, end: m.stages[0]?.t ?? Infinity, sid: '', none: true }, ...m.stages]
  const out = []
  stages.forEach((s, n) => {
    const lines = m.lines.filter(l => inRace(l) && !l.silent && l.t >= (s.none ? -Infinity : s.t) && l.t < (s.end ?? Infinity)).sort((a, b) => a.t - b.t)
    if (!lines.length) return
    const items = lines.map(line => { const v = ofLine?.(line) ?? {}; return { key: voiceKey(line), line, url: v.url ?? null, duration: v.duration ?? (line.ms > 0 ? line.ms / 1000 : null), why: v.why ?? '' } })
    out.push({ key: `b${n}`, title: s.none ? 'до первой стадии' : stageTitle(s), t: s.none ? 0 : s.t, items, playable: items.filter(x => x.url).length, sec: items.reduce((a, x) => a + (x.url ? x.duration ?? 0 : 0), 0) })
  })
  return out
}
