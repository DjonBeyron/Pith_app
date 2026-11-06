// Рецепт игры «Встряхни память» («Гонка с Питом», CONCEPT_RACE.md): из плана RehearsalPlan (того же, что у репетиции: planFor('sim') / фикстуры) — список АКТОВ. Чистые функции без React и DOM; в стадии рецепт раскладывает raceStages.js.
//  0 старт      — падает фраза, открываются дорожки, Пит говорит race_start (это вступление директора, в списке актов его нет; один раунд — без него);
//  1 sprint     — этап «Пинг-понг», проход A: 6–10 пилюль с переводом внутри, каждая на 5 % быстрее предыдущей; Пит говорит перевод, ты — английское слово, пока пилюля доступна; дополнительный круг по слабым словам;
//  2 catch      — тот же этап, проход B (инверсия): Пит говорит английское слово, на пилюле русский перевод этого слова, ты его называешь (ловушек нет); дополнительный круг; объявление без плашки;
//  2½ phrases  — этап 2 «Фразы» (raceStagesPhrases.js): три дорожки съезжаются в широкую ленту; круг 1 «Пойми» — Пит говорит смысл, три фразы едут одна за другой, поймать верную; круг 2 «Скажи» (голосом) или «Узнай» (пальцами);
//                 нужно ≥ 3 фраз в plan.phrases и хотя бы одна своя (racePhraseData.hasPhrases), иначе этапа нет;
//  3 climb      — «Вершина»: N островков зигзагом по трём дорожкам (слова фразы), ступень k — сказать первые k слов; промах — соскальзывание; общий таймер 12 с + 5 с за ступень;
//  4 descent    — «Спуск»: Пит говорит всю фразу на скорости 1,1, потом человек — один раз;
//  5 summary    — итог: разгон N/M, слух N/M, вершина — медаль, спуск, XP, метрики и слабые слова.
// Правила пропуска: нет слов с переводом (и у других планов) — нет обоих проходов; у плана без слов фразы (пустые куски невозможны) «Вершина» есть всегда. plan.round — один раунд (raceOnly.js, итога нет).
import { pickRound } from './raceOnly.js'
import { sprintWords, catchWords, climbWords } from './raceWords.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { passBByVoice } from './raceStagesCatch.js'
import { ruReady } from './raceRu.js'
import { phrasesOf, hasPhrases } from './racePhraseData.js'

export const DESCENT_RATE = 1.1 // скорость «Спуска»: Пит и человек говорят на 10 % быстрее

/**
 * @param {object} plan — нормализованный RehearsalPlan (game: 'race')
 * tap — выбрано «Тапаю» (по умолчанию из настройки): тап-реплика race_catch_tap (и стартовая race_start_tap, raceTexts.js) и задания «тапни»; проход B на тапе и без русской модели.
 * @returns {{ plan, acts: object[] }}
 */
export function buildRaceActs(plan, tap = readTapMode(), ru = ruReady()) {
  const tapA = !!tap, tapB = !passBByVoice({ tap, ready: ru })
  const words = sprintWords(plan)
  const caught = catchWords(plan, words)
  const climb = climbWords(plan)
  const all = plan.chunks.map((_, i) => i)
  const acts = []
  if (words.length) acts.push({ id: 'sprint', title: 'Пинг-понг', brief: 'перевод туда, слово обратно', task: 'перевод едет вниз, скажи слово по-английски, пока не убежало', line: null, ...(tapA ? { brief: 'тапни нужное слово', task: 'я говорю перевод, тапни нужное слово, пока не убежало' } : {}), words }) // line: null (v3.3.131) — объявления этапа A нет: его заменяет стартовая фраза race_start / race_start_tap (raceTexts.raceStartId)
  if (caught.length) acts.push({ id: 'catch', title: 'Пинг-понг', brief: 'перевод туда, слово обратно', task: 'теперь наоборот, я говорю по-английски, а ты называешь перевод', line: 'race_catch', ...(tapB ? { brief: 'тапни нужное слово', task: 'теперь наоборот, я говорю по-английски, а ты тапни перевод', line: 'race_catch_tap' } : {}), words: caught })
  const phrases = phrasesOf(plan)
  if (hasPhrases(phrases)) acts.push({ id: 'phrases', title: 'Фразы', brief: 'пойми смысл, найди фразу', task: 'я говорю, что сказать, а ты находишь как', line: 'race_phrases', phrases })
  if (climb.length) acts.push({ id: 'climb', title: 'Вершина', brief: 'собери фразу по словам', task: 'собираем фразу по слову, с каждым шагом длиннее', line: 'race_climb', words: climb, topLine: 'race_climb_top', timeLine: 'race_climb_time' })
  acts.push({ id: 'descent', title: 'Спуск', brief: 'повтори всю фразу за мной', task: 'повтори всю фразу за мной на скорости', line: 'race_descent', parts: all, rate: DESCENT_RATE })
  acts.push({ id: 'summary', title: 'Итог' })
  return { plan, acts: pickRound(acts, plan.round) }
}

