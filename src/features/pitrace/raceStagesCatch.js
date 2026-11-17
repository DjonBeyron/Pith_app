// Проход B «назови перевод» этапа «Пинг-понг» → стадии: ИНВЕРСИЯ прохода A на той же механике одной пилюли по дорожкам (raceStageKit.queueStep, raceStagesSprint.js). Пит произносит АНГЛИЙСКОЕ слово голосом (rep.say, библиотека слов,
// useRaceActs.pre), в голосе на пилюле ТО ЖЕ английское слово (rep.cap = w.text: «Говорю» — пилюля = язык Пита), ученик говорит этот русский перевод (цель — w.translation, слушает русская модель, lang 'ru'). Назвать перевод, пока она доступна (зачёт и взлёт,
// как в проходе A). Ловушек и чужих слов в голосовом режиме нет: на пилюле всегда слово, которое сказал Пит (в тапе — три пилюли с РУССКИМИ переводами, язык противоположен речи Пита: верная — перевод слова, чужие — переводы других слов, raceTapTrio.js).
// Перед проходом: переключение слуха на русскую модель (плашка «секунду, переключаю слух», stage.switchTo) и объявление БЕЗ плашки (race_catch «теперь наоборот …»; в тапе и без русской модели — race_catch_tap, act.line из raceRecipe.js). Нет русской модели или выбран «Тапаю» — проход идёт тапом по трём
// пилюлям (step.tapOnly), переключения нет. Похвала — одна реплика race_good_ok «Отлично» (произношение не хвалим: ответ по-русски). Дополнительный круг — как в проходе A (стадии catch2-ann / catch2, race_sprint_round2).
import { queueStages } from './raceStageKit.js'
import { OK_IDS } from './raceGood.js'
import { SWITCH_MS } from './raceSwitch.js'
import { REV_MS } from './raceReverseTurn.js'

/** Слушать ли проход B русской моделью: голосовой режим и русская модель скачана; иначе — тап по трём пилюлям. ru: { tap, ready } */
export const passBByVoice = ru => !ru?.tap && !!ru?.ready

export function catchStages(kit, act, ru = {}) {
  const voice = passBByVoice(ru)
  // разворот в реверс (владелец 2026-11-17): три пилюли со стрелками приезжают, разворачиваются и уезжают вверх, Пит говорит реплику, слух (голосом) переключается на русский; потом плашка «Конвейер слов» и три ноты
  const alone = kit.stages.length === 0 // проход B — первый акт игры (отладочный раунд «Слушай и лови»): разворота не будет, реплику про «наоборот» говорит плашка этапа
  const revLine = voice ? 'race_reverse' : 'race_reverse_tap'
  const before = () => (alone ? voice && kit.push({ type: 'announce', act: act.id, sid: 'catch-sw', switchTo: 'ru', round: { kind: 'switch', title: '', task: '', brief: '' }, ms: SWITCH_MS, line: null }) : kit.push({ type: 'announce', act: act.id, sid: 'catch-rev', rev: REV_MS, round: { kind: 'switch', title: '', task: '', brief: '' }, ms: Math.max(REV_MS, voice ? SWITCH_MS : 0), line: revLine, ...(voice ? { switchTo: 'ru' } : {}) }))
  queueStages(kit, act, w => ({ cap: w.text, say: w.text }), {
    target: w => w.translation, lang: voice ? 'ru' : undefined, tapOnly: !voice, plate: true, plateLine: alone ? (voice ? null : revLine) : null, reverse: true, tapLine: 'race_reverse_tap', tapLineSid: alone ? 'catch-ann' : 'catch-rev', before, goodIds: OK_IDS, // похвала — просто «Отлично», без слов о произношении
    mapStandby: w => ({ ...w, trap: false }),
  })
}
