// Проход B «назови перевод» этапа «Вспомни на слух» → стадии: ИНВЕРСИЯ прохода A на той же механике одной пилюли по дорожкам (raceStageKit.queueStep, raceStagesSprint.js). Пит произносит АНГЛИЙСКОЕ слово голосом (rep.say, библиотека слов,
// useRaceActs.pre), на пилюле ТО ЖЕ английское слово (rep.cap = w.text: текст пилюли = язык, на котором Пит произносит слово), ученик говорит этот русский перевод (цель — w.translation, слушает русская модель, lang 'ru'). Назвать перевод, пока она доступна (зачёт и взлёт,
// как в проходе A). Ловушек и чужих слов в голосовом режиме нет: на пилюле всегда слово, которое сказал Пит (в тапе чужие пилюли — английские слова других слов круга, raceTapTrio.js).
// Перед проходом: переключение слуха на русскую модель (плашка «секунду, переключаю слух», stage.switchTo) и объявление БЕЗ плашки (race_catch «теперь наоборот …»). Нет русской модели или выбран «Тапаю» — проход идёт тапом по трём
// пилюлям (step.tapOnly), переключения нет. Похвала — одна реплика race_good_ok «Отлично» (произношение не хвалим: ответ по-русски). Дополнительный круг — как в проходе A (стадии catch2-ann / catch2, race_sprint_round2).
import { queueStages } from './raceStageKit.js'
import { OK_IDS } from './raceGood.js'
import { SWITCH_MS } from './raceSwitch.js'

/** Слушать ли проход B русской моделью: голосовой режим и русская модель скачана; иначе — тап по трём пилюлям. ru: { tap, ready } */
export const passBByVoice = ru => !ru?.tap && !!ru?.ready

export function catchStages(kit, act, ru = {}) {
  const voice = passBByVoice(ru)
  const before = () => voice && kit.push({ type: 'announce', act: act.id, sid: 'catch-sw', switchTo: 'ru', round: { kind: 'switch', title: 'Секунду', task: 'переключаю слух', brief: 'переключаю слух' }, ms: SWITCH_MS, line: 'race_switch_ru' })
  queueStages(kit, act, w => ({ cap: w.text, say: w.text }), {
    target: w => w.translation, lang: voice ? 'ru' : undefined, tapOnly: !voice, plain: true, before, goodIds: OK_IDS, // похвала — просто «Отлично», без слов о произношении
    mapStandby: w => ({ ...w, trap: false }),
  })
}
