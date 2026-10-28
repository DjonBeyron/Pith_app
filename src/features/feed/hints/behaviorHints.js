// Подсказки ленты по поведению (PLAN_NEW_USER.md → B2). Чистая логика без React: судья получает события журнала
// (feed_pause, feed_swipe, feed_sound, feed_slow, feed_phrase_open, feed_reveal, feed_word_tap) и смену слайда и
// отвечает, какую подсказку пора показать. Показывает её хук useBehaviorHints.js через шторку Пита (бюджет A1).
//
// Правила (id → когда):
//   sound — 8 с на слайде при выключенном звуке (звук за сессию не включали) → «Послушаем?» / «Без звука»;
//   slow  — дважды пауза на одной фразе ИЛИ вернулся к просмотренной фразе (свайп назад = «переслушал»), звук включён;
//   rub   — открыл фразу (feed_phrase_open), перевод не трогает 7 с, слайд тот же;
//   word  — два слайда подряд открывал перевод фразы (feed_reveal), но по слову не тапнул.
// Всё вместе — не больше ОДНОЙ подсказки за сессию (sessionShown), и каждая — один раз на устройстве (список id в
// localStorage). Кто уже пользуется приёмом (feed_slow, feed_reveal, feed_word_tap), тому подсказка не нужна: id уходит
// в тот же список без показа. Контрольная группа эти подсказки не видит — это решает бюджет (reason ui_hint, без legacy).

export const STORAGE_KEY = 'pithy_feed_hints_v2' // id, которые уже показывали или которыми человек уже пользуется
export const SOUND_WAIT_MS = 8000                // без звука на слайде столько — «Послушаем?»
export const RUB_WAIT_MS = 7000                  // фраза открыта, перевод не тронут (6–8 с)
export const RELISTEN_MS = 3000                  // «переслушал» живёт столько после свайпа назад (слайд успевает смениться)
export const PAUSES_FOR_SLOW = 2                 // пауз на одной фразе для подсказки замедления
export const REVEAL_SLIDES_FOR_WORD = 2          // слайдов подряд с переводом фразы и без тапа по слову

export const HINTS = {
  sound: {
    id: 'sound',
    text: 'Эти фразы лучше слышать.',
    answers: [{ id: 'listen', label: 'Послушаем?' }, { id: 'later', label: 'Без звука' }],
    reply: { listen: '', later: 'Если сейчас неудобно — можно и без звука, текст под видео' },
  },
  slow: { id: 'slow', text: 'Не успеваешь? Зажми над сердечком — видео замедлится.' },
  rub: { id: 'rub', text: 'Потри фразу пальцем — появится перевод.' },
  word: { id: 'word', text: 'Тапни слово — увидишь его перевод.' },
}

const OK_ANSWERS = [{ id: 'ok', label: 'Понятно' }]

function defaultStore() {
  return {
    load() {
      try {
        const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
      } catch { return [] }
    },
    save(list) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* нет localStorage */ } },
  }
}

export function createHintJudge({ store = defaultStore() } = {}) {
  const known = new Set(store.load())
  let sessionShown = false
  let soundOn = false
  let heardSound = false     // звук включали в этой сессии — «Послушаем?» уже ни к чему
  let slideSince = null      // когда стал активным текущий слайд (null — ленты на экране нет)
  let silentSince = null     // с какого момента на этом слайде нет звука
  let relistenAt = null      // когда вернулся к просмотренной фразе
  const pauses = {}          // module_id → число пауз
  let opened = null          // { at } — фраза открыта, перевод ещё не трогали
  let revealedHere = false   // на этом слайде открывали перевод фразы
  let tappedHere = false     // на этом слайде тапали слово
  let revealStreak = 0       // слайдов подряд: перевод фразы открыт, слово не тронуто

  const remember = id => {
    if (known.has(id)) return
    known.add(id)
    store.save([...known])
  }

  function onEvent(name, props, now) {
    const mod = props?.module_id ?? null
    switch (name) {
      case 'feed_pause':
        if (props?.on && mod != null) pauses[mod] = (pauses[mod] || 0) + 1
        break
      case 'feed_swipe':
        if (props?.dir === 'prev') relistenAt = now
        break
      case 'feed_sound':
        if (props?.on) { heardSound = true; soundOn = true; silentSince = null } else if (soundOn) {
          soundOn = false
          if (slideSince != null) silentSince = now
        }
        break
      case 'feed_slow':
        if (props?.on) remember('slow') // уже зажимал — подсказка не нужна
        break
      case 'feed_phrase_open':
        opened = { at: now }
        break
      case 'feed_reveal':
        revealedHere = true
        opened = null
        remember('rub')
        break
      case 'feed_word_tap':
        tappedHere = true
        remember('word')
        break
      default:
    }
  }

  // Слайд стал активным (idx < 0 — ленты на экране нет). Подводит итог прошлого слайда для подсказки про слово
  function onSlide(idx, now) {
    if (revealedHere && !tappedHere) revealStreak += 1
    else revealStreak = 0
    revealedHere = false
    tappedHere = false
    opened = null
    slideSince = idx >= 0 ? now : null
    silentSince = idx >= 0 && !soundOn ? now : null
  }

  // Звук ленты включён/выключен (состояние, а не жест): без звука отсчёт 8 с идёт с этого момента
  function setSound(on, now) {
    if (on === soundOn) return
    soundOn = on
    if (on) { silentSince = null; heardSound = true } else if (slideSince != null) silentSince = now
  }

  const free = id => !known.has(id)
  const relistened = now => relistenAt != null && now - relistenAt < RELISTEN_MS

  // → { id, text, answers, reply? } | null. Порядок проверки — от самой нужной к менее нужной
  function next(now) {
    if (sessionShown) return null
    let id = null
    if (free('slow') && soundOn && (relistened(now) || Object.values(pauses).some(n => n >= PAUSES_FOR_SLOW))) id = 'slow'
    else if (free('rub') && opened && now - opened.at >= RUB_WAIT_MS) id = 'rub'
    else if (free('word') && revealStreak >= REVEAL_SLIDES_FOR_WORD && slideSince != null) id = 'word'
    else if (free('sound') && !soundOn && !heardSound && silentSince != null && now - silentSince >= SOUND_WAIT_MS) id = 'sound'
    if (!id) return null
    const h = HINTS[id]
    return { ...h, answers: h.answers ?? OK_ANSWERS }
  }

  // Через сколько мс стоит спросить next() снова (ближайший срок по времени), или null, если ждать нечего
  function nextDeadline(now) {
    if (sessionShown) return null
    const waits = []
    if (free('rub') && opened) waits.push(opened.at + RUB_WAIT_MS - now)
    if (free('sound') && !soundOn && !heardSound && silentSince != null) waits.push(silentSince + SOUND_WAIT_MS - now)
    const left = waits.filter(w => w > 0)
    return left.length ? Math.min(...left) : null
  }

  // Подсказку показали человеку: больше за сессию ничего, а эту — никогда
  function markShown(id) {
    if (!HINTS[id]) return
    sessionShown = true
    remember(id)
  }

  return { onEvent, onSlide, setSound, next, nextDeadline, markShown, isKnown: id => known.has(id) }
}
