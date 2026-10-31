// Фикстуры «памяти человека» для репетиции (CONCEPT_REHEARSAL.md §4): готовые планы, пока вкладка «Память» не подключена. Выбор — Админ → «Голос» → «Тест игры» → «Репетиция (симуляция)».
// planFor(source, { fixture }) — единственный поставщик плана: сейчас только 'sim' (фикстура), потом 'memory' (wordMemory / phraseMemory) и 'node' (автор задал фразу в ноде).
import { normalizePlan } from './rehearsalPlan.js'

const word = (text, translation, lapses, confusers = [], due = true) => ({ text, translation, due, lapses, confusers })

export const FIXTURES = {
  three: {
    title: 'Три куска, двойник learn / earn / lean',
    plan: {
      phrase: "I'm | trying | to learn", translation: 'Я пытаюсь научиться', stressed: [1, 2],
      words: [word('trying', 'пытаюсь', 1), word('learn', 'учиться', 2, ['earn', 'lean'])],
    },
  },
  two: {
    title: 'Два куска, без двойников',
    plan: {
      phrase: 'Nice | to meet you', translation: 'Приятно познакомиться', stressed: [1],
      words: [word('meet', 'встретить', 1), word('nice', 'приятно', 1)],
    },
  },
  one: {
    title: 'Одно слово',
    plan: { phrase: 'Remember', translation: 'Помнить', words: [word('remember', 'помнить', 2, ['remind'])] },
  },
  none: {
    title: 'Фраза без слов «к повтору»',
    plan: {
      phrase: 'Where | are you | from', translation: 'Откуда ты', stressed: [2],
      words: [word('where', 'где', 0, [], false), word('from', 'откуда', 0, [], false)],
    },
  },
}

export const FIXTURE_IDS = Object.keys(FIXTURES)
export const DEFAULT_FIXTURE = 'three'

/** Следующая фикстура по кругу («Ещё минутку?») */
export const nextFixture = id => FIXTURE_IDS[(FIXTURE_IDS.indexOf(id) + 1) % FIXTURE_IDS.length] ?? DEFAULT_FIXTURE

/** Исходник плана фикстуры (то, что правится в админке: JSON без служебных полей) */
export const fixtureSource = id => (FIXTURES[id] ?? FIXTURES[DEFAULT_FIXTURE]).plan

/** Свой экземпляр плана (нормализованный) из фикстуры; неизвестная фикстура → по умолчанию */
export function fixturePlan(id) {
  const f = FIXTURES[id] ?? FIXTURES[DEFAULT_FIXTURE]
  return normalizePlan({ ...f.plan, source: 'sim' })
}

/** Какая фикстура лежит в плане (по фразе) — для «следующей»; нет такой — null */
export const fixtureIdOf = plan => FIXTURE_IDS.find(id => fixturePlan(id).phrase === plan?.phrase) ?? null

/** План для репетиции. Пока только source = 'sim' (фикстура); остальные источники ещё не подключены — null */
export function planFor(source = 'sim', { fixture = DEFAULT_FIXTURE } = {}) {
  if (source === 'sim') return fixturePlan(fixture)
  return null
}
