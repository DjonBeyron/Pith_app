import { describe, it, expect } from 'vitest'
import { checkFlow } from './lessonLintFlow.js'

const t = (ref, content, then) => ({ ref, type: 'text', data: { content }, triggers: then ? [{ if: 'timer', then }] : [] })

describe('ритм урока', () => {
  it('три текстовые ноды подряд — замечание, две — нет', () => {
    const three = [t('a', 'один', 'b'), t('b', 'два', 'c'), t('c', 'три')]
    expect(checkFlow(three).join()).toContain('[R-text-run] a → b → c')
    expect(checkFlow(three.slice(0, 2))).toEqual([])
  })
  it('тавтология: ответ type_word уже написан в предыдущем тексте', () => {
    const nodes = [t('a', 'Форма: tries', 'b'), { ref: 'b', type: 'type_word', data: { word: 'tries' }, triggers: [] }]
    expect(checkFlow(nodes).join()).toContain('[R-tautology] b')
  })
  it('ответ, которого нет в пояснении, — без замечаний; ответ в слове-подстроке не считается', () => {
    const nodes = [t('a', 'Форма с he, she, it', 'b'), { ref: 'b', type: 'type_word', data: { word: 'she tries' }, triggers: [] }]
    expect(checkFlow(nodes)).toEqual([])
    const sub = [t('a', 'Она entries', 'b'), { ref: 'b', type: 'type_word', data: { word: 'she tries' }, triggers: [] }]
    expect(checkFlow(sub)).toEqual([])
  })
  it('ветка ошибки не считается основным потоком', () => {
    const nodes = [
      { ref: 'q', type: 'word_choice', data: { options: [{ text: 'tries', isCorrect: true }] }, triggers: [{ if: 'word_wrong', then: 'h' }] },
      t('h', 'Подсказка: tries'),
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
})

describe('ритм: подсказки ветки ошибки', () => {
  it('текст подсказки, в который попадают только после ошибки, не считается пояснением', () => {
    const nodes = [
      { ref: 'q', type: 'phrase_assembly', data: { words: ['She', 'tries'] }, triggers: [{ if: 'phrase_wrong', then: 'h' }, { if: 'phrase_correct', then: 'n' }] },
      { ref: 'h', type: 'text', data: { content: 'Вот так: she tries' }, triggers: [{ if: 'timer', then: 'n' }] },
      { ref: 'n', type: 'text', data: { content: 'Дальше' }, triggers: [{ if: 'timer', then: 's' }] },
      { ref: 's', type: 'say_phrase', data: { phrase: 'She tries' }, triggers: [] },
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
  it('скрытая расшифровка audio — задание «на слух» не тавтология', () => {
    const nodes = [
      { ref: 'a', type: 'audio', data: { text: 'She is trying', showText: false }, triggers: [{ if: 'played', then: 'w' }] },
      { ref: 'w', type: 'word_choice', data: { options: [{ text: 'She is trying', isCorrect: true }] }, triggers: [] },
    ]
    expect(checkFlow(nodes)).toEqual([])
  })
})

describe('базовая подложка текста', () => {
  const base = { start: 0, end: 5, mode: 'text', color: '#ffffff', opacity: 0.75 }
  it('нода с текстом без базового highlight — замечание; с ним — нет', () => {
    const styled = { ref: 'b', type: 'text', data: { content: 'Ок', highlights: [{ ...base, end: 2 }] }, triggers: [] }
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст' }, triggers: [] }, styled]).join()).toContain('[R-base] a')
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст' }, triggers: [] }])).toEqual([]) // без раскраски вообще — не трогаем
    expect(checkFlow([{ ref: 'a', type: 'text', data: { content: 'Текст', highlights: [base] }, triggers: [] }])).toEqual([])
  })
})

describe('одинаковые задания подряд и ветки ошибки', () => {
  const ex = (ref, type, then) => ({ ref, type, data: {}, triggers: then ? [{ if: 'word_correct', then }] : [] })
  it('три одинаковых задания подряд — замечание, чередование — нет', () => {
    expect(checkFlow([ex('a', 'word_choice', 'b'), ex('b', 'word_choice', 'c'), ex('c', 'word_choice')]).join()).toContain('[R-same-type] a → b → c')
    expect(checkFlow([ex('a', 'word_choice', 'b'), ex('b', 'phrase_assembly', 'c'), ex('c', 'word_choice')])).toEqual([])
  })
  it('цепочка текстов внутри ветки ошибки не считается', () => {
    const nodes = [
      { ref: 'q', type: 'word_choice', data: { options: [] }, triggers: [{ if: 'word_wrong', then: 'h1' }, { if: 'word_correct', then: 'z' }] },
      t('h1', 'раз', 'h2'), t('h2', 'два', 'h3'), t('h3', 'три', 'z'), t('z', 'дальше'),
    ]
    expect(checkFlow(nodes).filter(w => /text-run/.test(w))).toEqual([])
  })
})

describe('type_word — мини-фраза', () => {
  const tw = (word) => [{ ref: 'a', type: 'type_word', data: { word }, triggers: [] }]
  it('одиночное слово — замечание, фраза из двух слов — нет', () => {
    expect(checkFlow(tw('tries')).join()).toContain('[R-type-phrase] a')
    expect(checkFlow(tw('she tries'))).toEqual([])
  })
})

describe('type_word — города и имена без запутывателей', () => {
  const tw = (word, extraLetters) => [{ ref: 'a', type: 'type_word', data: { word, extraLetters }, triggers: [] }]
  it('«go to Paris» с extraLetters — замечание; без них и без заглавного — нет', () => {
    expect(checkFlow(tw('go to Paris', 'ln')).join()).toContain('[R-type-place] a')
    expect(checkFlow(tw('go to Paris', ''))).toEqual([])
    expect(checkFlow(tw('she tries', 'xz'))).toEqual([])
  })
})

describe('подача заданий и таблицы', () => {
  const ex = (ref, then) => ({ ref, type: 'type_word', data: { word: 'she tries' }, triggers: then ? [{ if: 'type_correct', then }] : [] })
  const tx = (ref, then) => ({ ref, type: 'text', data: { content: 'вызов' }, triggers: [{ if: 'timer', then }] })
  const chain = types => {
    const nodes = []
    types.forEach((ty, i) => {
      const nextRef = `p${i}`
      nodes.push(ty === 'text' ? tx(`t${i}`, `e${i}`) : { ref: `t${i}`, type: ty, data: { caption: 'вызов' }, triggers: [{ if: 'timer', then: `e${i}` }] })
      nodes.push(ex(`e${i}`, i + 1 < types.length ? `t${i + 1}` : null))
      void nextRef
    })
    return nodes
  }
  it('все задания вызываются текстом — замечание; с голосом и фото — нет', () => {
    expect(checkFlow(chain(['text', 'text', 'text', 'text', 'text', 'text'])).join()).toContain('[R-task-variety]')
    expect(checkFlow(chain(['text', 'audio', 'text', 'photo', 'text', 'audio'])).filter(w => /task-variety/.test(w))).toEqual([])
  })
  it('в уроке из 4+ частей нужна хотя бы одна таблица на три части', () => {
    const sys = i => ({ ref: 's' + i, type: 'system', data: { content: 'Часть' }, triggers: [] })
    expect(checkFlow([sys(1), sys(2), sys(3), sys(4)]).join()).toContain('[R-table]')
    expect(checkFlow([sys(1), sys(2), sys(3), sys(4), { ref: 'tb', type: 'table', data: {}, triggers: [] }]).filter(w => /R-table/.test(w))).toEqual([])
  })
})

describe('практика, в которую входят через пункт меню (variant у верного варианта)', () => {
  const menu = { ref: 'm', type: 'word_choice', data: { options: [{ text: 'Практика', isCorrect: true }, { text: 'Объясни', isCorrect: true }] }, triggers: [
    { if: 'variant', variantLabel: 'Практика', then: 't' }, { if: 'variant', variantLabel: 'Объясни', then: null }] }
  const text = { ref: 't', type: 'text', data: { content: 'мы идём в парк: We go to the park' }, triggers: [{ if: 'timer', then: 's' }] }
  const say = { ref: 's', type: 'say_phrase', data: { phrase: 'We go to the park' }, triggers: [] }
  it('ветка практики не считается «веткой ошибки»: тавтология в ней ловится', () => {
    expect(checkFlow([menu, text, say]).join()).toContain('[R-tautology] s')
  })
  it('а вход через вариант НЕВЕРНОГО ответа остаётся веткой ошибки (подсказка, не пояснение)', () => {
    const wrongMenu = { ...menu, data: { options: [{ text: 'Практика', isCorrect: false }, { text: 'Объясни', isCorrect: true }] } }
    expect(checkFlow([wrongMenu, text, say]).filter(w => /R-tautology/.test(w))).toEqual([])
  })
  it('вопрос, называющий кандидата, перед выбором слова — не тавтология', () => {
    const wc = { ref: 'w', type: 'word_choice', data: { options: [{ text: 'am', isCorrect: true }, { text: 'is' }] }, triggers: [] }
    expect(checkFlow([t('q', 'а здесь нужно am? выбирай:', 'w'), wc]).filter(x => /R-tautology/.test(x))).toEqual([])
    expect(checkFlow([t('q', 'здесь нужно am.', 'w'), wc]).join()).toContain('[R-tautology] w')
  })
})
