import { describe, it, expect } from 'vitest'
import { createHintJudge, SOUND_WAIT_MS, RUB_WAIT_MS, RELISTEN_MS, STORAGE_KEY } from './behaviorHints.js'

// Память вместо localStorage: можно проверить и «что сохранили», и «что было до запуска»
const memStore = (init = []) => {
  const box = { list: init }
  return { box, load: () => box.list, save: l => { box.list = l } }
}
const make = (init = []) => {
  const store = memStore(init)
  return { j: createHintJudge({ store }), store }
}

describe('звук: «Послушаем?»', () => {
  it('через 8 с на слайде без звука — подсказка с двумя ответами и репликой «без звука»', () => {
    const { j } = make()
    j.onSlide(0, 0)
    expect(j.next(SOUND_WAIT_MS - 1)).toBeNull()
    const h = j.next(SOUND_WAIT_MS)
    expect(h.id).toBe('sound')
    expect(h.answers.map(a => a.id)).toEqual(['listen', 'later'])
    expect(h.answers[0].label).toBe('Послушаем?')
    expect(h.reply.later).toBe('Если сейчас неудобно — можно и без звука, текст под видео')
    expect(h.reply.listen).toBe('')
  })
  it('срок отсчитывается от начала слайда; новый слайд начинает отсчёт заново', () => {
    const { j } = make()
    j.onSlide(0, 0)
    j.onSlide(1, 5000)
    expect(j.next(SOUND_WAIT_MS)).toBeNull()
    expect(j.nextDeadline(5000)).toBe(SOUND_WAIT_MS)
    expect(j.next(5000 + SOUND_WAIT_MS).id).toBe('sound')
  })
  it('звук включён — подсказки нет; выключили — отсчёт с момента выключения; а раз включали за сессию, не нужна вовсе', () => {
    const { j } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    expect(j.next(60000)).toBeNull()
    expect(j.nextDeadline(0)).toBeNull()
    j.onEvent('feed_sound', { on: false }, 60000)
    expect(j.next(60000 + SOUND_WAIT_MS)).toBeNull() // heardSound: звук был, человек в курсе
  })
  it('ленты на экране нет (idx < 0) — отсчёта нет', () => {
    const { j } = make()
    j.onSlide(-1, 0)
    expect(j.next(60000)).toBeNull()
  })
  it('показали один раз — навсегда: в новой сессии (новый судья) её нет', () => {
    const { j, store } = make()
    j.onSlide(0, 0)
    j.markShown('sound')
    expect(store.box.list).toEqual(['sound'])
    const j2 = createHintJudge({ store })
    j2.onSlide(0, 0)
    expect(j2.next(60000)).toBeNull()
  })
})

describe('замедление', () => {
  const withSound = () => {
    const { j, store } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    return { j, store }
  }
  it('дважды пауза на одной фразе', () => {
    const { j } = withSound()
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 1000)
    j.onEvent('feed_pause', { module_id: 'a', on: false }, 2000)
    expect(j.next(2500)).toBeNull()
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 3000)
    expect(j.next(3000).id).toBe('slow')
  })
  it('паузы на разных фразах не складываются; возобновление (on: false) не считается', () => {
    const { j } = withSound()
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 1000)
    j.onEvent('feed_pause', { module_id: 'b', on: true }, 2000)
    j.onEvent('feed_pause', { module_id: 'b', on: false }, 3000)
    expect(j.next(3000)).toBeNull()
  })
  it('переслушал — свайп назад к просмотренной фразе; через RELISTEN_MS не считается', () => {
    const { j } = withSound()
    j.onEvent('feed_swipe', { dir: 'prev' }, 1000)
    j.onSlide(1, 1200)
    expect(j.next(1300).id).toBe('slow')
    expect(j.next(1000 + RELISTEN_MS)).toBeNull()
  })
  it('свайп вперёд — не «переслушал»', () => {
    const { j } = withSound()
    j.onEvent('feed_swipe', { dir: 'next' }, 1000)
    expect(j.next(1100)).toBeNull()
  })
  it('без звука замедление ни к чему', () => {
    const { j } = make()
    j.onSlide(0, 0)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 100)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 200)
    expect(j.next(300)).toBeNull()
  })
  it('уже зажимал (feed_slow on) — подсказка не нужна и в список уходит без показа', () => {
    const { j, store } = withSound()
    j.onEvent('feed_slow', { module_id: 'a', on: true }, 100)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 200)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 300)
    expect(j.next(400)).toBeNull()
    expect(store.box.list).toContain('slow')
  })
})

describe('перевод фразы: «потри»', () => {
  const opened = () => {
    const { j, store } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    j.onEvent('feed_phrase_open', { module_id: 'a' }, 1000)
    return { j, store }
  }
  it('фраза открыта, перевод не тронут 7 с — подсказка', () => {
    const { j } = opened()
    expect(j.next(1000 + RUB_WAIT_MS - 1)).toBeNull()
    expect(j.nextDeadline(1000)).toBe(RUB_WAIT_MS)
    expect(j.next(1000 + RUB_WAIT_MS).id).toBe('rub')
  })
  it('перевод открыт (потёр или стрелкой) — подсказки нет, и больше не будет', () => {
    const { j, store } = opened()
    j.onEvent('feed_reveal', { module_id: 'a' }, 3000)
    expect(j.next(20000)).toBeNull()
    expect(store.box.list).toContain('rub')
  })
  it('ушёл на другой слайд — отсчёт сброшен', () => {
    const { j } = opened()
    j.onSlide(1, 4000)
    expect(j.next(20000)).toBeNull()
  })
})

describe('перевод слова: «тапни слово»', () => {
  const slides = () => {
    const { j, store } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    return { j, store }
  }
  it('перевод фразы открывали на двух слайдах подряд, слово не трогал — подсказка', () => {
    const { j } = slides()
    j.onEvent('feed_reveal', { module_id: 'a' }, 100)
    j.onSlide(1, 1000)
    expect(j.next(1100)).toBeNull() // один слайд — рано
    j.onEvent('feed_reveal', { module_id: 'b' }, 1200)
    j.onSlide(2, 2000)
    expect(j.next(2100).id).toBe('word')
  })
  it('слайд без перевода разрывает «подряд»', () => {
    const { j } = slides()
    j.onEvent('feed_reveal', { module_id: 'a' }, 100)
    j.onSlide(1, 1000)
    j.onSlide(2, 2000) // на слайде 1 перевода не открывали
    j.onEvent('feed_reveal', { module_id: 'c' }, 2100)
    j.onSlide(3, 3000)
    expect(j.next(3100)).toBeNull()
  })
  it('тап по слову — подсказка не нужна', () => {
    const { j, store } = slides()
    j.onEvent('feed_reveal', { module_id: 'a' }, 100)
    j.onEvent('feed_word_tap', { module_id: 'a' }, 200)
    j.onSlide(1, 1000)
    j.onEvent('feed_reveal', { module_id: 'b' }, 1100)
    j.onSlide(2, 2000)
    expect(j.next(2100)).toBeNull()
    expect(store.box.list).toContain('word')
  })
})

describe('не больше одной подсказки за сессию', () => {
  it('после показа любой подсказки остальные молчат (и таймеров не просят)', () => {
    const { j, store } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    j.onEvent('feed_phrase_open', { module_id: 'a' }, 0)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 100)
    j.onEvent('feed_pause', { module_id: 'a', on: true }, 200)
    const first = j.next(RUB_WAIT_MS)
    expect(first.id).toBe('slow') // slow важнее rub
    j.markShown(first.id)
    expect(j.next(RUB_WAIT_MS + 1)).toBeNull()
    expect(j.nextDeadline(0)).toBeNull()
    expect(store.box.list).toEqual(['slow'])
  })
  it('показанная подсказка не повторяется на следующий день (список из хранилища)', () => {
    const { j } = make(['rub'])
    j.onSlide(0, 0)
    j.setSound(true, 0)
    j.onEvent('feed_phrase_open', { module_id: 'a' }, 0)
    expect(j.next(RUB_WAIT_MS * 3)).toBeNull()
  })
  it('у подсказок без своих ответов — «Понятно»', () => {
    const { j } = make()
    j.setSound(true, 0)
    j.onSlide(0, 0)
    j.onEvent('feed_phrase_open', { module_id: 'a' }, 0)
    expect(j.next(RUB_WAIT_MS).answers).toEqual([{ id: 'ok', label: 'Понятно' }])
  })
  it('ключ хранилища — pithy_feed_hints_v2', () => {
    expect(STORAGE_KEY).toBe('pithy_feed_hints_v2')
  })
})
