// Прохождение С НАСТРОЙКАМИ ПАУЗ для стенда и тестов экрана таймлайна (_stand/timeline/index.html?fixture=knobs): вырезка настоящей игры (timelineFixtureReal.js, записана до v3.3.351 — без настроек),
// в которую по её же таймингам вставлено то, что игра пишет с v3.3.351 (формат — shared/lib/scenePauseTrace.js, проверен в pitrace/scenePausesWiring.test.js):
//  • событие knob { t, k: 'knob', key, ms, from, until, sid?, set? } — похвала после верного слова (good.delay), следующее слово после похвалы (afterGood.gap) и без неё (preSay.gap),
//    пауза очереди Мии (mia.gap — по фактическому промежутку: в этой игре она «была изменена», set: true);
//  • поле pauses у stage-in — минимум плашки (race.announce, as: 'ms'), плашка после слов Пита (plate.hold, as: 'pause'), реплика этапа после плашки (line.at, as: 'lead');
//  • pauses в событии run — что было переопределено («mia.gap=…»).
// Это ПОДСТАВНЫЕ отметки на настоящих таймингах: для проверки экрана, а не доказательство того, как игра их пишет.
import { realEvents } from './timelineFixtureReal.js'

const BAKED = { 'sprint-ann': [{ key: 'race.announce', ms: 1700, as: 'ms' }, { key: 'plate.hold', ms: 1200, as: 'pause' }], 'catch-rev': [{ key: 'line.at', ms: 250, as: 'lead' }], 'catch-ann': [{ key: 'race.announce', ms: 1700, as: 'ms' }, { key: 'plate.hold', ms: 1200, as: 'pause' }] }

export function knobEvents() {
  const ev = realEvents(), out = []
  let sid = '', miaGap = null
  const nextLine = i => ev.slice(i + 1).find(e => e.k === 'line-start')
  ev.forEach((e, i) => {
    if (e.k === 'stage-in') { sid = e.sid; out.push(BAKED[e.sid] ? { ...e, pauses: BAKED[e.sid] } : { ...e, pauses: [] }); return }
    out.push(e)
    const nx = nextLine(i)
    if (e.k === 'answer' && e.res === 'win' && nx && nx.t - e.t < 2500) out.push(nx.who === 'pit' ? { t: e.t + 1, k: 'knob', key: 'good.delay', ms: 500, from: 'rise', until: 'praise' } : { t: e.t + 1, k: 'knob', key: 'preSay.gap', ms: 450, from: 'rise', until: 'say' })
    if (e.k === 'line-end' && String(e.id).startsWith('race_good') && nx?.who === 'dictor' && nx.t - e.t < 1500) out.push({ t: e.t + 1, k: 'knob', key: 'afterGood.gap', ms: 350, from: 'praise', until: 'say' })
    if (e.k === 'line-end' && e.who === 'mia' && nx && nx.t - e.t >= 100 && nx.t - e.t <= 2000) {
      const ms = miaGap ?? Math.round((nx.t - e.t) / 50) * 50
      if (ms !== 350) miaGap = ms
      out.push({ t: e.t + 1, k: 'knob', key: 'mia.gap', ms, sid, from: e.id, until: nx.id, ...(ms !== 350 ? { set: true } : {}) })
    }
  })
  return out.map(e => (e.k === 'run' && miaGap ? { ...e, pauses: `mia.gap=${miaGap}` } : e))
}
