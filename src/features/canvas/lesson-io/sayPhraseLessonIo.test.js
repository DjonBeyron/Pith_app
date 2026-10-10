import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { exportLesson } from './exportLesson.js'
import { importLesson } from './importLesson.js'
import { buildLegend } from './lessonSchema.js'
import { lintLesson, fromCanvasNodes } from './lessonLint.js'
import { PRINCIPLES } from './lessonRulesDefaults.js'
import { readSayData } from '../../../shared/lib/speech/sayPhraseData.js'
import { collectLessonWords } from '../../../shared/lib/wordAudio/collectLessonWords.js'
import { makeNode } from '../nodeGraph.js'
import { makeDefaultTriggers, TYPED_PAIRS } from '../nodeDefaults.js'
import { NODE_TYPES } from '../nodeTypes.js'

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const ex = (ref, seq, type, data, triggers = []) => ({ ref, seq, type, data, triggers })

describe('say_phrase — линтер урока', () => {
  const good = [
    ex('n1', 1, 'text', { content: 'Скажем вслух' }, [{ if: 'timer', then: 'n2' }]),
    ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', keywords: 'please', threshold: 70 }, [{ if: 'say_done', then: 'n3' }, { if: 'say_wrong', then: 'n3' }]),
    ex('n3', 3, 'text', { content: 'Дальше' }, []),
  ]

  it('чистый урок: пояснение перед нодой, всё заполнено → замечаний нет', () => {
    expect(lintLesson(good)).toEqual([])
  })

  it('пустая фраза, порог вне диапазона и ключевое слово не из фразы', () => {
    const w = lintLesson([good[0], ex('n2', 2, 'say_phrase', { phrase: '', threshold: 20, keywords: 'banana' }, []), good[2]]).join('\n')
    expect(w).toMatch(/n2 say_phrase: пустая phrase/)
    expect(w).toMatch(/threshold 20 вне 50–100/)
    expect(w).toMatch(/ключевых слов нет во фразе/)
  })

  it('нет текстовой ноды-задания перед модулем (рекомендация, не ошибка) / две подряд / первая нода урока', () => {
    const noIntro = [ex('n1', 1, 'audio', { text: 'x' }, [{ if: 'played', then: 'n2' }]), good[1], good[2]]
    expect(lintLesson(noIntro).join('\n')).toMatch(/n2 say_phrase: перед ней нет текстовой ноды-задания/)
    const twice = [good[0], good[1], ex('n3', 3, 'say_phrase', { phrase: 'Hello there' }, [])]
    twice[1] = { ...good[1], triggers: [{ if: 'say_done', then: 'n3' }] }
    expect(lintLesson(twice).join('\n')).toMatch(/n3 say_phrase: идёт сразу после другой say_phrase/)
    expect(lintLesson([ex('n1', 1, 'say_phrase', { phrase: 'Hello there' }, [])]).join('\n')).toMatch(/стоит первой нодой урока/)
  })

  it('замечание про задание — предупреждение (warnings), а не ошибка; поле showPhrase в старых данных ничего не ломает', () => {
    const noIntro = [ex('n1', 1, 'audio', { text: 'x' }, [{ if: 'played', then: 'n2' }]), good[1], good[2]]
    const w = lintLesson(noIntro)
    expect(w.some(x => /задания.*рекомендация/.test(x))).toBe(true)
    const old = [good[0], ex('n2', 2, 'say_phrase', { phrase: 'I am trying to please both', showPhrase: false, translation: 'x' }, [{ if: 'say_done', then: 'n3' }]), good[2]]
    expect(lintLesson(old)).toEqual([])
  })
})

describe('say_phrase — обмен JSON', () => {
  const node = () => {
    const n = makeNode(1, 0, 0, 'say_phrase')
    n.typeData.say_phrase = { ...n.typeData.say_phrase, phrase: 'I am trying to please both', translation: 'Я пытаюсь угодить обоим', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false }
    return n
  }

  it('узел есть в списке типов, у него пара триггеров say_done («верный») / say_wrong («неверный»)', () => {
    expect(NODE_TYPES.find(t => t.value === 'say_phrase')).toMatchObject({ label: 'Сказать фразу', group: 'interactive' })
    expect(TYPED_PAIRS.say_phrase).toEqual(['say_done', 'say_wrong'])
    expect(makeDefaultTriggers('say_phrase').map(t => t.if)).toEqual(['say_done', 'say_wrong'])
  })

  it('экспорт → импорт: поля phrase/translation/keywords/threshold/lang/listenAudio и переходы сохраняются', () => {
    const a = node()
    const b = makeNode(2, 400, 0, 'text')
    b.typeData.text.content = 'Дальше'
    a.triggers = [{ id: 't1', if: 'say_done', then: b.id }, { id: 't2', if: 'say_wrong', then: b.id }]
    const out = exportLesson([a, b], { title: 'Say' })
    const exported = out.nodes[0]
    expect(exported.type).toBe('say_phrase')
    expect(exported.data).toMatchObject({ phrase: 'I am trying to please both', translation: 'Я пытаюсь угодить обоим', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false })
    expect(exported.triggers.map(t => t.if)).toEqual(['say_done', 'say_wrong'])
    const back = importLesson(JSON.parse(JSON.stringify(out)))
    const n = back.nodes.find(x => x.type === 'say_phrase')
    expect(n.typeData.say_phrase).toMatchObject({ phrase: 'I am trying to please both', keywords: 'please, both', threshold: 80, lang: 'en-GB', listenAudio: false })
    expect(n.triggers.map(t => t.if)).toEqual(['say_done', 'say_wrong'])
    expect(n.triggers.every(t => t.then)).toBe(true)
    expect(back.warnings.filter(w => /неизвестный тип/.test(w))).toEqual([])
    expect(lintLesson(fromCanvasNodes(back.nodes)).filter(w => /say_phrase.*(пуст|threshold|ключев)/.test(w))).toEqual([])
  })

  it('strict: у НОВОЙ ноды включён, поле идёт туда и обратно; у существующей (поля нет) = выключено; старое showPhrase игнорируется', () => {
    const fresh = makeNode(1, 0, 0, 'say_phrase')
    expect(fresh.typeData.say_phrase.strict).toBe(true)
    expect(fresh.typeData.say_phrase).not.toHaveProperty('showPhrase')
    fresh.typeData.say_phrase.phrase = "I'm trying to please both"
    const out = exportLesson([fresh], { title: 'Say' })
    expect(out.nodes[0].data).toMatchObject({ strict: true })
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(readSayData(back)).toMatchObject({ strict: true, threshold: 100 })
    const legacy = readSayData({ phrase: 'Hello there', showPhrase: false })
    expect(legacy).toMatchObject({ strict: false, passRatio: 0.7 })
    expect(legacy).not.toHaveProperty('showPhrase')
  })

  it('легенда описывает тип, поля и триггеры; правило автора про say_phrase есть в зашитых принципах', () => {
    const legend = buildLegend()
    expect(Object.keys(legend.nodes.say_phrase.fields)).toEqual(expect.arrayContaining(['phrase', 'translation', 'keywords', 'threshold', 'lang', 'listenAudio', 'strict', 'hintsOn', 'hintSilence', 'hintMismatch', 'hintPartial']))
    expect(Object.keys(legend.triggers)).toEqual(expect.arrayContaining(['say_done', 'say_wrong']))
    expect(legend.triggers.say_wrong).toMatch(/трёх неудачных попыток/)
    expect(Object.keys(legend.nodes.say_phrase.fields)).not.toContain('showPhrase')
    expect(PRINCIPLES.some(p => p.startsWith('say_phrase («Сказать фразу»)'))).toBe(true)
  })

  it('легенда и правило автора объясняют «пару сообщений вокруг say_phrase» (задание перед, успех после) и пропуск парой', () => {
    const what = buildLegend().nodes.say_phrase.what
    const rule = PRINCIPLES.find(p => p.startsWith('say_phrase («Сказать фразу»)'))
    for (const text of [what, rule]) {
      expect(text).toMatch(/пара сообщений вокруг say_phrase/)
      expect(text).toMatch(/задание/)
      expect(text).toMatch(/успех/)
      expect(text).toMatch(/Я не могу говорить/)
      expect(text).not.toMatch(/«Получилось» засчитывает|можно нажать «Получилось»/)
    }
    expect(rule).toMatch(/САМ МОДУЛЬ НИЧЕГО В ЧАТ НЕ ПИШЕТ/)
    expect(rule).not.toMatch(/showPhrase/)
  })
})

describe('say_phrase — подсказки в чат: поля ноды, JSON, линтер, редактор, правило автору', () => {
  const hinted = () => {
    const n = makeNode(1, 0, 0, 'say_phrase')
    n.typeData.say_phrase = { ...n.typeData.say_phrase, phrase: 'I am trying to please both', hintsOn: false, hintSilence: 'Громче!', hintMismatch: 'Не то.', hintPartial: 'Верно: {ok}; нет: {missed}' }
    return n
  }

  it('поля hintsOn/hintSilence/hintMismatch/hintPartial идут туда и обратно через JSON', () => {
    const out = exportLesson([hinted()], { title: 'Say' })
    expect(out.nodes[0].data).toMatchObject({ hintsOn: false, hintSilence: 'Громче!', hintMismatch: 'Не то.', hintPartial: 'Верно: {ok}; нет: {missed}' })
    const back = importLesson(JSON.parse(JSON.stringify(out))).nodes[0].typeData.say_phrase
    expect(readSayData(back)).toMatchObject({ hintsOn: false, hintSilence: 'Громче!', hintMismatch: 'Не то.', hintPartial: 'Верно: {ok}; нет: {missed}' })
  })

  it('дефолты: нет полей = подсказки включены со стандартными текстами; новая нода получает hintsOn: true', () => {
    expect(readSayData({ phrase: 'Hi there' })).toMatchObject({
      hintsOn: true,
      hintSilence: 'Не слышу вас. Говорите громче и ближе к микрофону.',
      hintMismatch: 'Не совсем. Попробуйте ещё раз, чуть медленнее.',
      hintPartial: 'Почти! Верно: {ok}. Не хватило: {missed}.',
    })
    expect(makeNode(1, 0, 0, 'say_phrase').typeData.say_phrase.hintsOn).toBe(true)
  })

  it('линтер: неизвестная {подстановка} в подсказке — замечание; {ok} и {missed} — нет', () => {
    const base = text => [
      ex('n1', 1, 'text', { content: 'Скажем вслух' }, [{ if: 'timer', then: 'n2' }]),
      ex('n2', 2, 'say_phrase', { phrase: 'I am here', hintPartial: text }, [{ if: 'say_done', then: 'n3' }]),
      ex('n3', 3, 'text', { content: 'Дальше' }, []),
    ]
    expect(lintLesson(base('Верно: {ok}, нет: {missed}'))).toEqual([])
    expect(lintLesson(base('Привет, {name}')).join('\n')).toMatch(/n2 say_phrase: в hintPartial неизвестные подстановки \{name\}/)
  })

  it('легенда описывает {ok}/{missed} и «подсказки в чате пузырём слева»; правило автору — тоже, плюс простое пояснение про «Я не могу говорить»', () => {
    const f = buildLegend().nodes.say_phrase.fields
    expect(f.hintPartial).toMatch(/\{ok\}/)
    expect(f.hintPartial).toMatch(/\{missed\}/)
    expect(f.hintsOn).toMatch(/Нет поля = включены/)
    const r = PRINCIPLES.find(p => p.startsWith('say_phrase («Сказать фразу»)'))
    for (const word of ['hintsOn', 'hintSilence', 'hintMismatch', 'hintPartial', '{ok}', '{missed}', 'пузырём слева', 'три неудачные', 'say_wrong', 'ВСЕГДА ведёт по say_done', 'одну короткую текстовую ноду с заданием', 'ноду «Получилось!»', 'пропуск разовый']) {
      expect(r, word).toContain(word)
    }
  })

  it('редактор: блок «Подсказки в чате» (переключатель + три поля, дефолты как placeholder, пояснение про {ok}/{missed} в попапе «i») и блок про «Я не могу говорить» (текст в попапе)', () => {
    const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    const hints = read('../NodeSayHints.jsx')
    expect(hints).toContain('Подсказки в чате')
    expect(hints).toContain("onChange({ hintsOn: e.target.checked })")
    for (const k of ['hintSilence', 'hintMismatch', 'hintPartial']) expect(hints).toContain(k)
    expect(hints).toContain('placeholder={f.def}')
    expect(hints).toMatch(/\{'\{ok\}'\} и \{'\{missed\}'\} подставляются автоматически/)
    expect(hints).toContain('HINT_PARTIAL_DEFAULT')
    expect(hints).toContain('<InfoPopup') // пояснения — в попапах, не абзацами (сторож — sayNodeInfoPopups.test.js)
    const note = read('../NodeSayCantSpeakNote.jsx')
    expect(note).toContain('после третьей неудачной попытки')
    expect(note).toContain('всегда ведёт по «Верно»')
    expect(note).toContain('Пропуск разовый')
    expect(note).not.toContain('на весь урок')
    expect(note).toContain('<InfoPopup')
    const picker = read('../NodeSayPhrasePicker.jsx')
    expect(picker).toContain('<NodeSayHints')
    expect(picker).toContain('<NodeSayCantSpeakNote')
    expect(read('../NodeAnswerFields.jsx')).toContain('hintsOn={tData.hintsOn !== false}')
  })
})

describe('say_phrase — слова для озвучки (collectLessonWords)', () => {
  const nodes = on => [{ type: 'say_phrase', typeData: { say_phrase: { phrase: "I'm here, please.", ...(on ? {} : { listenAudio: false }) } } }]

  it('фраза целиком (если чистая латиница) и каждое слово — для прогрева и списка «нужна озвучка»', () => {
    const keys = [...collectLessonWords([{ type: 'say_phrase', typeData: { say_phrase: { phrase: 'I am here' } } }]).keys()]
    expect(keys).toEqual(expect.arrayContaining(['i am here', 'i', 'am', 'here']))
    expect([...collectLessonWords(nodes(true)).keys()]).toEqual(expect.arrayContaining(["i'm", 'here', 'please']))
  })

  it('listenAudio=false — слов нет', () => {
    expect(collectLessonWords(nodes(false)).size).toBe(0)
  })
})

describe('say_phrase — миграции правила автору', () => {
  const sql = name => readFileSync(fileURLToPath(new URL(`../../../../supabase/migrations/${name}`, import.meta.url)), 'utf8')
  const rule = () => PRINCIPLES.find(p => p.startsWith('say_phrase («Сказать фразу»)'))

  it('v4 (текущая): текст правила в миграции дословно равен зашитому принципу (одна копия в $rule$); update по префиксу, вставка, если строки нет; идемпотентно', () => {
    const v4 = sql('20261010120000_say_phrase_rules_v4.sql')
    expect(rule()).toBeTruthy()
    expect(rule()).not.toContain('$rule$')
    expect(v4.split(`$rule$${rule()}$rule$`)).toHaveLength(2) // ровно одно вхождение: переменная t используется и в update, и в insert
    expect(v4).toMatch(/update public\.lesson_rules\s+set rule_text = t\s+where rule_text like 'say_phrase \(«Сказать фразу»\) — ученик ПРОИЗНОСИТ%'/)
    expect(v4).toMatch(/if not found then\s+insert into public\.lesson_rules \(rule_text, sort_order, category\) values \(t, 250, 'principle'\)/)
    expect(v4).not.toMatch(/\b(create|alter|drop)\s+(table|policy|function)/i) // таблиц и политик не трогаем
    expect(v4.split('\n').length).toBeLessThan(90) // SQL Editor не обрезает вставку
  })

  it('v3 (уже могла быть применена) не менялась: свой текст правила («на весь урок», say_skip) и тот же префикс поиска', () => {
    const v3 = sql('20261009130000_say_phrase_rules_v3.sql')
    expect(v3).toMatch(/where rule_text like 'say_phrase \(«Сказать фразу»\) — ученик ПРОИЗНОСИТ%'/)
    expect(v3).toContain('на весь урок')
    expect(v3).not.toContain('say_wrong')
  })

  it('v2 (уже могла быть применена) не менялась и ищет строку по тому же префиксу, что и v3', () => {
    const v2 = sql('20261009120000_say_phrase_rules_v2.sql')
    expect(v2).toMatch(/where rule_text like 'say_phrase \(«Сказать фразу»\) — ученик ПРОИЗНОСИТ%'/)
    expect(v2).not.toContain('hintPartial')
    expect(v2).toContain('«Ещё раз»/«Получилось»')
  })

  it('v1 (уже применялась) не менялась: только вставка правила; её префикс совпадает с тем, по которому v2 находит строку', () => {
    const v1 = sql('20261009110000_say_phrase_module.sql')
    expect(v1).toMatch(/where not exists/)
    expect(v1).toContain("ученик ПРОИЗНОСИТ английскую фразу в микрофон%'")
    expect(rule().startsWith('say_phrase («Сказать фразу») — ученик ПРОИЗНОСИТ')).toBe(true)
  })
})
