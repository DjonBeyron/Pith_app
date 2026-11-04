// Рецепт «Гонки с Питом» (CONCEPT_RACE.md): из плана RehearsalPlan (того же, что у репетиции: planFor('sim') / фикстуры) — список АКТОВ. Чистые функции без React и DOM; в стадии рецепт раскладывает raceStages.js.
//  0 старт      — падает фраза, открываются дорожки, Пит говорит race_start (это вступление директора, в списке актов его нет; один раунд — без него);
//  1 sprint     — «Разгон»: 6–10 пилюль с переводом внутри, каждая на 5 % быстрее предыдущей; сказать английское слово, пока пилюля доступна;
//  2 catch      — «Слушай и лови» (инверсия разгона): Пит говорит английское слово, затем выезжает пилюля с русским переводом; перевод верный (~70 %) — повтори слово, чужой (~30 %, ловушка) — промолчи; второй круг по ошибкам;
//  3 climb      — «Вершина»: N островков зигзагом по трём дорожкам (слова фразы), ступень k — сказать первые k слов; промах — соскальзывание; общий таймер 12 с + 5 с за ступень;
//  4 descent    — «Спуск»: Пит говорит всю фразу на скорости 1,1, потом человек — один раз;
//  5 summary    — итог: разгон N/M, слух N/M, вершина — медаль, спуск, XP, метрики и слабые слова.
// Правила пропуска: нет слов с переводом (и у других планов) — нет «Разгона» и «Слушай и лови»; у плана без слов фразы (пустые куски невозможны) «Вершина» есть всегда. plan.round — один раунд (raceOnly.js, итога нет).
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
  if (words.length) acts.push({ id: 'sprint', title: 'Разгон', task: 'успей сказать по-английски слово, перевод которого едет вниз, пока оно не убежало', line: 'race_sprint', words })
  if (caught.length) acts.push({ id: 'catch', title: 'Слушай и лови', task: 'я говорю слово, а ты повтори его, только если перевод на пилюле верный', line: 'race_catch', words: caught })
  if (climb.length) acts.push({ id: 'climb', title: 'Вершина', task: 'собираем фразу по слову, с каждым шагом длиннее', line: 'race_climb', words: climb, topLine: 'race_climb_top', timeLine: 'race_climb_time' })
  acts.push({ id: 'descent', title: 'Спуск', task: 'повтори всю фразу за мной на скорости', line: 'race_descent', parts: all, rate: DESCENT_RATE })
  acts.push({ id: 'summary', title: 'Итог' })
  return { plan, acts: pickRound(acts, plan.round) }
}

