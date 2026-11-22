// Фикстура «Таймлайна игры»: события трассы правдоподобного прохождения (3 этапа: «Разгон» → «Слушай и лови» с Мией → «Фразы»), собранные маленьким сценарием. Для стенда (_stand/timeline) и тестов.
// В прохождении есть всё, что показывает экран: реплики Пита и Мии, слова диктора, пилюли с исходами, отсчёт нотами, ожидание техники, пауза игры и ТРИ долгие паузы «игра молчит» (≈ 2,6 с, 1,9 с и 3,2 с).
const WORDS = [['meet', 'встречать'], ['later', 'позже'], ['see', 'видеть'], ['street', 'улица'], ['bring', 'приносить'], ['early', 'рано']]

export function fixtureEvents(start = 5000) {
  const ev = []
  let t = start
  const at = (k, d = {}) => ev.push({ t: Math.round(t * 10) / 10, k, ...d })
  const go = ms => { t += ms }
  const say = (who, id, text, ms, gap = 0) => { at('line-start', { who, id, text, ms }); go(ms); at('line-end', who === 'mia' ? { who, id } : { id, played: ms, why: 'done' }); go(gap) }
  const stage = (idx, sid, act, type, title = '', line = null) => at('stage-in', { idx, sid, act, type, title, line })
  const word = (i, res, think, praise) => {
    const [en, ru] = WORDS[i % WORDS.length]
    at('ask', { idx: i, word: en }); say('dictor', ru, ru, 620, 140)
    at('pill', { idx: i, word: en, lane: i % 3, speed: 1 }); go(think)
    if (res === 'win') { at('claim', { idx: i, ms: think }); go(380); at('answer', { res: 'win', idx: i, word: en, final: true }); at('note', { order: i % 3 }); go(420); if (praise) say('pit', praise[0], praise[1], praise[2], 300) } else if (res === 'miss') { at('answer', { res: 'miss', idx: i, word: en, final: false }); go(1500); at('answer', { res: 'fail', idx: i, word: en, final: true }); go(500) } else { at('answer', { res: 'fail', idx: i, word: en, final: true }); go(500) }
  }
  at('run', { run: 1, game: 'race', only: 'stages', seed: 'r1', stages: 9, ask: 'voice' })
  go(200); say('pit', 'race_start', 'Встряхнём память, я говорю слова, а ты переводишь вслух', 3400, 500)
  stage(0, 'sprint-ann', 'sprint', 'announce', 'Конвейер слов', 'race_sprint_go'); go(250)
  say('pit', 'race_sprint_go', 'Поехали, говори перевод, пока слово не уехало', 2600, 100)
  at('count', { what: '«sprint» (плашка Конвейер слов)', ms: 2500 }); go(2500); at('count-end', {}); go(150)
  stage(1, 'sprint', 'sprint', 'student'); go(300)
  word(0, 'win', 1300, ['race_good_1', 'отличное произношение', 1500]); word(1, 'win', 900); word(2, 'miss', 1700); word(3, 'win', 2100, ['race_good_3', 'вот это да, чисто', 1400]); word(4, 'fail', 3600)
  at('stage-out', { idx: 1, sid: 'sprint' }); go(2600) // долгая пауза 1: после хода — до плашки следующего круга
  stage(2, 'catch-ann', 'catch', 'announce', 'Слушай и лови', 'race_catch'); go(250)
  say('pit', 'race_catch', 'Теперь наоборот, я говорю слово, а ты ловишь перевод', 3100, 200)
  at('wait', { why: 'русская модель слуха', ms: 1200 }); go(100)
  stage(3, 'catch', 'catch', 'student'); go(250)
  word(0, 'win', 1100, ['race_good_ok', 'Отлично', 700]); word(1, 'fail', 3400)
  at('line-start', { who: 'mia', id: 'mia_enter', text: 'Так, так, кто тут путает слова? Сейчас ускорим дорожку', ms: 3300 }); go(3300); at('line-end', { who: 'mia', id: 'mia_enter' }); go(350)
  say('pit', 'pit_mia_hello', 'Мия, только не быстро', 1500, 350)
  at('line-start', { who: 'mia', id: 'mia_fast', text: 'Быстро, быстро', ms: 1600, silent: true }); go(1600); at('line-end', { who: 'mia', id: 'mia_fast' }); go(300)
  word(2, 'win', 800); word(3, 'win', 950, ['race_good_2', 'звучит очень хорошо', 1500]); word(4, 'win', 700)
  at('line-start', { who: 'mia', id: 'mia_leave', text: 'Ладно, справились, я пошла', ms: 2100 }); go(2100); at('line-end', { who: 'mia', id: 'mia_leave' })
  at('stage-out', { idx: 3, sid: 'catch' }); go(1900) // долгая пауза 2
  at('pause', { why: 'hidden' }); go(4200); at('resume', { sid: 'catch' }); go(300)
  stage(4, 'phrases-ann', 'phrases', 'announce', 'Конвейер ситуаций', 'race_phrases'); go(250)
  say('pit', 'race_phrases', 'Конвейер ситуаций, подбери фразу к ситуации', 2900, 400)
  stage(5, 'phrases1', 'phrases', 'student'); go(200)
  at('ask', { idx: 0, word: 'See you later', phrase: true, mode: 'pick' }); say('dictor', 'ты прощаешься с другом до вечера', 'ты прощаешься с другом до вечера', 2300, 0); go(2400); at('answer', { res: 'win', idx: 0, word: 'See you later', final: true }); go(700)
  say('dictor', 'See you later', 'See you later', 1300, 3200) // долгая пауза 3: после фразы — до следующего хода
  at('ask', { idx: 1, word: 'Nice to meet you', phrase: true, mode: 'pick' }); at('line-start', { who: 'pit', id: 'race_phrases_pick', text: 'я описываю ситуацию, а ты тапни фразу, которая подходит', ms: 2000, silent: true }); go(2000); go(1800); at('answer', { res: 'miss', idx: 1, word: 'Nice to meet you', final: true }); go(600)
  stage(6, 'summary', 'summary', 'summary'); go(100); say('pit', 'race_done', 'Финиш, завтра ещё заезд?', 1900, 400)
  at('end', {})
  return ev
}

/** Длинное прохождение для проверки производительности: n слов подряд (≈ 6 событий на слово) */
export function longFixture(n = 600, start = 1000) {
  const ev = [{ t: start, k: 'run', run: 1, game: 'race', seed: 'long' }, { t: start + 10, k: 'stage-in', idx: 0, sid: 'sprint', act: 'sprint', type: 'student', title: '' }]
  let t = start + 100
  for (let i = 0; i < n; i++) {
    const w = WORDS[i % WORDS.length]
    ev.push({ t, k: 'line-start', who: 'dictor', id: w[1], text: w[1], ms: 600 }, { t: t + 600, k: 'line-end', id: w[1], why: 'done' }, { t: t + 700, k: 'pill', idx: i, word: w[0], lane: i % 3 }, { t: t + 1700, k: 'answer', res: i % 7 ? 'win' : 'fail', idx: i, word: w[0], final: true })
    if (i % 4 === 0) ev.push({ t: t + 1900, k: 'line-start', who: 'pit', id: 'race_good_1', text: 'отличное произношение', ms: 1400 }, { t: t + 3300, k: 'line-end', id: 'race_good_1', why: 'done' })
    t += i % 4 === 0 ? 3600 : i % 9 === 0 ? 4200 : 2100
  }
  ev.push({ t, k: 'end' })
  return ev
}
