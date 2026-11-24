// Рецепт игры «Встряхни память» («Гонка с Питом», CONCEPT_RACE.md): из плана RehearsalPlan (того же, что у репетиции: planFor('sim') / фикстуры) — список АКТОВ. Чистые функции без React и DOM; в стадии рецепт раскладывает raceStages.js.
//  0 старт      — падает фраза, открываются дорожки, Пит говорит race_start (это вступление директора, в списке актов его нет; один раунд — без него);
//  1 sprint     — этап «Пинг-понг», проход A: 6–10 пилюль с переводом внутри, каждая на 5 % быстрее предыдущей; Пит говорит перевод, ты — английское слово, пока пилюля доступна; дополнительный круг по слабым словам;
//  2 catch      — тот же этап, проход B (инверсия): Пит говорит английское слово, на пилюле русский перевод этого слова, ты его называешь (ловушек нет); дополнительный круг; объявление без плашки;
//  2½ phrases  — этап 2 «Фразы» (raceStagesPhrases.js): три дорожки съезжаются в широкую ленту; только голосом, один круг «Скажи» (демо, потом каждая фраза по словам под маской и подряд); тап-круги «Пойми · Тапни фразу» и «Узнай · Тапни смысл» вырезаны (владелец 2026-11-24) — в режиме «Пальцами» этапа нет;
//                 нужно ≥ 3 фраз в plan.phrases и хотя бы одна своя (racePhraseData.hasPhrases), иначе этапа нет;
//  3 climb      — «Вершина»: N островков зигзагом по трём дорожкам (слова фразы), ступень k — сказать первые k слов; промах — соскальзывание; общий таймер 12 с + 5 с за ступень;
//  4 descent    — «Спуск»: Пит говорит всю фразу на скорости 1,1, потом человек — один раз;
//  4½ boss      — финал «Шкала памяти» (boss/): слабые слова этой игры по одному на широкой ленте, справа шкала времени реакции; проводит Мия; только голосом, нужно ≥ BOSS_MIN слов;
//  5 summary    — итог: разгон N/M, слух N/M, вершина — медаль, спуск, XP, метрики и слабые слова.
// Правила пропуска: нет слов с переводом (и у других планов) — нет обоих проходов; у плана без слов фразы (пустые куски невозможны) «Вершина» есть всегда. plan.round — один раунд (raceOnly.js, итога нет).
import { pickRound } from './raceOnly.js'
import { sprintWords, catchWords, climbWords } from './raceWords.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'
import { passBByVoice } from './raceStagesCatch.js'
import { ruReady } from './raceRu.js'
import { phrasesOf, hasPhrases } from './racePhraseData.js'
import { fromStage } from './raceStartStage.js'
import { BOSS_MIN } from './boss/bossWords.js'

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
  if (words.length) acts.push({ id: 'sprint', title: 'Конвейер слов', brief: 'переводи всё, что услышишь', task: 'перевод едет вниз, скажи слово по-английски, пока не убежало', line: null, ...(tapA ? { brief: 'тапни слово, которое услышал', task: 'я говорю перевод, тапни нужное слово, пока не убежало' } : {}), words }) // line: null (v3.3.131) — объявления этапа A нет: его заменяет стартовая фраза race_start / race_start_tap (raceTexts.raceStartId)
  if (caught.length) acts.push({ id: 'catch', title: 'Конвейер слов', brief: 'теперь переводи на русский', task: 'теперь наоборот, я говорю по-английски, а ты называешь перевод', line: null, ...(tapB ? { brief: 'теперь тапай перевод', task: 'теперь наоборот, я говорю по-английски, а ты тапни перевод' } : {}), words: caught }) // line: null — реплику про реверс говорит стадия-разворот catch-rev (raceReverseTurn.js), плашка этапа — после неё
  const phrases = phrasesOf(plan)
  if (!tapA && hasPhrases(phrases)) acts.push({ id: 'phrases', title: 'Конвейер ситуаций', brief: 'скажи фразу по-английски', task: 'я подскажу смысл, а ты скажи фразу', line: null, phrases }) // только голосом: тап-круги фраз («Пойми», «Узнай») вырезаны (владелец 2026-11-24) — в режиме «Пальцами» этапа нет; line: null — реплику плашки ставит raceStagesPhrases.js
  if (climb.length) acts.push({ id: 'climb', title: 'Конвейер фраз', brief: 'фраза по слову, потом целиком', task: 'собираем фразу по слову, с каждым шагом длиннее', line: 'race_climb', words: climb, topLine: 'race_climb_top', timeLine: 'race_climb_time' })
  acts.push({ id: 'descent', title: 'Конвейер фраз', brief: 'теперь целиком и быстро', task: 'повтори всю фразу за мной на скорости', line: 'race_descent', parts: all, rate: DESCENT_RATE })
  if (!tapA && words.length >= BOSS_MIN) acts.push({ id: 'boss', title: 'Шкала памяти', brief: 'скажи слово, пока линия едет', task: 'финал, скажи слово по-английски, пока линия не ушла вниз', line: null, words }) // line: null — реплик у акта нет: церемонию ведут Мия и Пит (boss_*), а подпись реплики pit_forgot на заставке при старте с финала была лишней; финал проводит Мия (boss/raceStagesBoss.js); только голосом
  acts.push({ id: 'summary', title: 'Итог' })
  const picked = fromStage(pickRound(acts, plan.round), plan.startAt)
  if (picked[0]?.id === 'catch') picked[0].line = tapB ? 'race_reverse_tap' : 'race_reverse' // проход B — первый акт игры (отладочный раунд / старт с этапа): разворота нет, реплику про «наоборот» говорит его плашка
  return { plan, acts: picked } // plan.startAt — «начать с этапа» (отладка, raceStartStage.js)
}

