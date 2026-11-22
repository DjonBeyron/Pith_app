// Фикстура «прохождения с другого устройства» для стенда (_stand/timeline, ?server=1) и тестов: игра с НАСТОЯЩИМИ sid стадий гонки — «Конвейер слов», допрос у Мии (заставка, церемония, круг, концовка),
// разворот конвейера (анимация без речи: после реплики race_reverse 5,5 с тишины до отсчёта нотами), реверс, итог. serverRuns() — два прохождения в формате сервера (shared/api/timelineApi.js).
import { fixtureEvents } from './timelineFixture.js'

export function reverseEvents(start = 2000) {
  const ev = []
  let t = start
  const at = (k, d = {}) => ev.push({ t: Math.round(t * 10) / 10, k, ...d })
  const go = ms => { t += ms }
  const say = (who, id, text, ms, gap = 0) => { at('line-start', { who, id, text, ms }); go(ms); at('line-end', who === 'mia' ? { who, id } : { id, played: ms, why: 'done' }); go(gap) }
  const stage = (idx, sid, act, type, title = '', line = null) => at('stage-in', { idx, sid, act, type, title, line })
  const word = (i, en, ru, res, think) => {
    at('ask', { idx: i, word: en }); say('dictor', ru, ru, 600, 150); at('pill', { idx: i, word: en, lane: i % 3, speed: 1 }); go(think)
    if (res === 'win') { at('claim', { idx: i, ms: think }); go(380); at('answer', { res: 'win', idx: i, word: en, final: true }); go(400) } else { at('answer', { res: 'fail', idx: i, word: en, final: true }); go(500) }
  }
  at('run', { run: 1, game: 'race', only: 'pingpong', seed: 'r7', stages: 11, ask: 'voice' })
  go(200); say('pit', 'race_start', 'Встряхнём память: я говорю перевод, а ты — слово по-английски', 3600, 400)
  stage(0, 'sprint-ann', 'sprint', 'announce', 'Конвейер слов'); go(1200); at('count', { what: 'sprint', ms: 2400 }); go(2400); at('count-end', {}); go(100)
  stage(1, 'sprint', 'sprint', 'student'); go(250)
  word(0, 'meet', 'встречать', 'win', 1200); word(1, 'bring', 'приносить', 'fail', 3500); word(2, 'early', 'рано', 'fail', 3400); word(3, 'street', 'улица', 'win', 900)
  say('pit', 'race_good_2', 'звучит очень хорошо', 1500, 200); at('stage-out', { idx: 1, sid: 'sprint' }); go(600)
  stage(2, 'sprint3-intro-ann', 'sprint', 'announce', 'Допрос у Мии'); go(2300) // плашка Мии без реплики
  stage(3, 'sprint3-ann', 'sprint', 'announce', '', 'pit_forgot'); go(300)
  say('pit', 'pit_forgot', 'Ой, эти два слова я, кажется, забыл', 2300, 2900) // Мия приходит и забирает Пита — без речи
  say('mia', 'mia_take', 'Так, Пит, ты идёшь со мной. Проверим, что ты забыл', 3200, 500)
  stage(4, 'sprint3', 'sprint', 'student'); go(200)
  word(0, 'bring', 'приносить', 'win', 1100); word(1, 'early', 'рано', 'win', 1300)
  at('stage-out', { idx: 4, sid: 'sprint3' }); go(300)
  stage(5, 'sprint3-end', 'sprint', 'announce'); go(2100) // Мия уходит с коробкой — без речи
  say('mia', 'mia_ok', 'Ладно, оба слова на месте. Забирай своего Пита', 2800, 400)
  stage(6, 'catch-rev', 'catch', 'announce', '', 'race_reverse'); go(250)
  say('pit', 'race_reverse', 'А теперь наоборот: я говорю слово по-английски, а ты — перевод', 3700, 5500) // конвейер разворачивается — анимация без речи
  at('count', { what: 'catch', ms: 2400 }); go(2400); at('count-end', {}); go(100)
  stage(7, 'catch-ann', 'catch', 'announce', 'Конвейер слов'); go(900)
  stage(8, 'catch', 'catch', 'student'); go(200)
  word(0, 'встречать', 'meet', 'win', 1000); word(1, 'улица', 'street', 'win', 1400); say('pit', 'race_good_ok', 'Отлично', 700, 300)
  at('stage-out', { idx: 8, sid: 'catch' }); go(1800)
  stage(9, 'summary', 'summary', 'summary'); go(150); say('pit', 'race_done', 'Финиш! Завтра ещё заезд?', 2000, 2600)
  at('end', {})
  return ev
}

/** Два прохождения «на сервере» с других устройств (старое первым), как их хранит timelineApi */
export function serverRuns(now = Date.now()) {
  const run = (id, ago, device, appVersion, meta, events) => ({ id, savedAt: new Date(now - ago).toISOString(), at: now - ago - 120000, device, appVersion, meta, events, dropped: 0 })
  return [
    run('srv-a', 26 * 3600000, 'Android 412×915', '3.3.338', { game: 'race', only: 'stages', seed: 'r1', stages: 9, ask: 'voice' }, fixtureEvents(9000)),
    run('srv-b', 14 * 60000, 'iPhone 390×844', '3.3.339', { game: 'race', only: 'pingpong', seed: 'r7', stages: 11, ask: 'voice' }, reverseEvents()),
  ]
}
