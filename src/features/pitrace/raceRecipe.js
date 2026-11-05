// Рецепт игры «Встряхни память» («Гонка с Питом», CONCEPT_RACE.md): из плана RehearsalPlan (того же, что у репетиции: planFor('sim') / фикстуры) — список АКТОВ. Чистые функции без React и DOM; в стадии рецепт раскладывает raceStages.js.
//  0 старт      — падает фраза, открываются дорожки, Пит говорит race_start (это вступление директора, в списке актов его нет; один раунд — без него);
//  1 sprint     — этап «Вспомни на слух», проход A: 6–10 пилюль с переводом внутри, каждая на 5 % быстрее предыдущей; Пит говорит перевод, ты — английское слово, пока пилюля доступна; дополнительный круг по слабым словам;
//  2 catch      — тот же этап, проход B (инверсия): Пит говорит английское слово, на пилюле русский перевод этого слова, ты его называешь (ловушек нет); дополнительный круг; объявление без плашки;
//  3 climb      — «Вершина»: N островков зигзагом по трём дорожкам (слова фразы), ступень k — сказать первые k слов; промах — соскальзывание; общий таймер 12 с + 5 с за ступень;
//  4 descent    — «Спуск»: Пит говорит всю фразу на скорости 1,1, потом человек — один раз;
//  5 summary    — итог: разгон N/M, слух N/M, вершина — медаль, спуск, XP, метрики и слабые слова.
// Правила пропуска: нет слов с переводом (и у других планов) — нет обоих проходов; у плана без слов фразы (пустые куски невозможны) «Вершина» есть всегда. plan.round — один раунд (raceOnly.js, итога нет).
import { pickRound } from './raceOnly.js'
import { sprintWords, catchWords, climbWords } from './raceWords.js'

export const DESCENT_RATE = 1.1 // скорость «Спуска»: Пит и человек говорят на 10 % быстрее

/**
 * @param {object} plan — нормализованный RehearsalPlan (game: 'race')
 * @returns {{ plan, acts: object[] }}
 */
export function buildRaceActs(plan) {
  const words = sprintWords(plan)
  const caught = catchWords(plan, words)
  const climb = climbWords(plan)
  const all = plan.chunks.map((_, i) => i)
  const acts = []
  if (words.length) acts.push({ id: 'sprint', title: 'Вспомни на слух', brief: 'скажи слово по переводу', task: 'перевод едет вниз, скажи слово по-английски, пока не убежало', line: 'race_sprint', words })
  if (caught.length) acts.push({ id: 'catch', title: 'Вспомни на слух', brief: 'назови перевод слова', task: 'теперь наоборот, я говорю по-английски, а ты называешь перевод', line: 'race_catch', words: caught })
  if (climb.length) acts.push({ id: 'climb', title: 'Вершина', brief: 'собери фразу по словам', task: 'собираем фразу по слову, с каждым шагом длиннее', line: 'race_climb', words: climb, topLine: 'race_climb_top', timeLine: 'race_climb_time' })
  acts.push({ id: 'descent', title: 'Спуск', brief: 'повтори всю фразу за мной', task: 'повтори всю фразу за мной на скорости', line: 'race_descent', parts: all, rate: DESCENT_RATE })
  acts.push({ id: 'summary', title: 'Итог' })
  return { plan, acts: pickRound(acts, plan.round) }
}

