// «Репетиция» → настройки игры в формате readWordLane (wordLaneConfig.js): нода { rotate_phone: { plan } } читается как обычная нода игры, только с cfg.plan. Записи автора и озвучки фразы пока нет (hasAudio: false) —
// диктор играет куски из библиотеки слов (cfg.extraWords — слова разминки, «Различи» и фразы: их тоже готовит тап «Начать»).
import { normalizePlan, planTexts } from './rehearsalPlan.js'
import { planFor, fixtureIdOf, nextFixture, DEFAULT_FIXTURE } from './rehearsalFixtures.js'

export function readRehearsalCfg(rawPlan) {
  const plan = normalizePlan(rawPlan)
  if (!plan) return null
  return {
    title: 'Репетиция с Питом',
    chunks: plan.chunks,
    word: plan.chunks.join(' '),
    translation: plan.translation,
    lang: plan.lang,
    isDemo: false,
    hasAudio: false,
    audio: null,
    clips: null,
    confusers: plan.chunks.map(() => []),
    extraWords: planTexts(plan),
    plan,
  }
}

/** «Ещё минутку?»: следующая фикстура по кругу; у плана не из фикстур (JSON из админки) — тоже следующая после фикстуры по умолчанию */
export const nextPlan = plan => planFor('sim', { fixture: nextFixture(fixtureIdOf(plan) ?? DEFAULT_FIXTURE) })
