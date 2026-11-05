// Проход B «назови перевод» этапа «Вспомни на слух» → стадии: ИНВЕРСИЯ прохода A на той же механике одной пилюли по дорожкам (raceStageKit.queueStep, raceStagesSprint.js). Пит произносит АНГЛИЙСКОЕ слово голосом (rep.say, библиотека слов,
// useRaceActs.pre), на пилюле русский перевод (rep.cap = w.shown = перевод этого же слова), ученик говорит этот русский перевод (цель — w.translation, слушает русская модель, lang 'ru'). Назвать перевод, пока она доступна (зачёт и взлёт,
// как в проходе A). Ловушек и чужих переводов нет: на пилюле всегда перевод того слова, которое сказал Пит.
// Перед проходом: переключение слуха на русскую модель (плашка «секунду, переключаю слух», stage.switchTo) и объявление БЕЗ плашки (race_catch «теперь наоборот …»). Нет русской модели или выбран «Тапаю» — проход идёт тапом по трём
// пилюлям (step.tapOnly), переключения нет. Дополнительный круг — как в проходе A (стадии catch2-ann / catch2, race_sprint_round2).
import { queueStages } from './raceStageKit.js'
import { SWITCH_MS } from './raceSwitch.js'

/** Слушать ли проход B русской моделью: голосовой режим и русская модель скачана; иначе — тап по трём пилюлям. ru: { tap, ready } */
export const passBByVoice = ru => !ru?.tap && !!ru?.ready

export function catchStages(kit, act, ru = {}) {
  const voice = passBByVoice(ru)
  const before = () => voice && kit.push({ type: 'announce', act: act.id, sid: 'catch-sw', switchTo: 'ru', round: { kind: 'switch', title: 'Секунду', task: 'переключаю слух', brief: 'переключаю слух' }, ms: SWITCH_MS, line: 'race_switch_ru' })
  queueStages(kit, act, w => ({ cap: w.shown, say: w.text }), {
    target: w => w.translation, lang: voice ? 'ru' : undefined, tapOnly: !voice, plain: true, before,
    mapStandby: w => ({ ...w, shown: w.translation, trap: false }),
  })
}
