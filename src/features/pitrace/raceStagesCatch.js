// Раунд 2 «Слушай и лови» → стадии: ИНВЕРСИЯ «Разгона» на той же механике одной пилюли по дорожкам (raceStageKit.queueStep, raceStagesSprint.js). Пит произносит АНГЛИЙСКОЕ слово голосом (rep.say, библиотека слов, useRaceActs.pre),
// затем выезжает пилюля с РУССКИМ переводом (rep.cap = w.shown). Перевод верный (~70 %) — повторить английское слово, пока пилюля доступна (зачёт и взлёт, как в разгоне). Перевод чужой (rep.trap, ~30 %) — верное действие: промолчать,
// пилюля уезжает вниз («ловушка пропущена»); сказал слово — микро-анимация ошибки на пилюле (quiet), «поверил чужому переводу» (rep.believed). Второй круг по ошибкам — как в разгоне (стадии catch2-ann / catch2, race_sprint_round2).
import { queueStages } from './raceStageKit.js'

export const catchStages = (kit, act) => queueStages(kit, act, w => ({ cap: w.shown, say: w.text, trap: w.trap }))
