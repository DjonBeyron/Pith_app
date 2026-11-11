// Громкость голоса ученика → 0..1 для колец микрофона и заливки пилюль — ОТ ШУМА МИКРОФОНА, а не от константы (v3.3.187).
// Зачем (отчёт владельца, iPhone, iOS 18.7): микрофон тихий — речь rms 0,003–0,005 при фоне 0,0003. Распознавание с v3.3.186 такую речь слышит (voskVoice.js: порог от шума микрофона,
// voskAgc.js: усиление перед Vosk), а анимация считала уровень прежней sensitiveLevel с жёстким полом 0,006: речь тише пола давала ровно 0 — пилюля стояла пустой, пока человек говорил,
// и прыгала с нуля в момент зачёта; кольца микрофона не горели. Теперь уровень считается так:
//  • кусок, который счётчик слушателя назвал ГОЛОСОМ (voice.heard() — тот же счётчик, что у правила слова и затвора тишины), умножается на усиление и идёт в ту же кривую sensitiveLevel;
//  • усиление = LEVEL_NOISE / шум микрофона: шум после него ложится на половину прежнего пола (0,003) — тихий микрофон ведёт себя как обычный с таким шумом. Шум 0,0003 → ×10: речь 0,003–0,005
//    даёт уровень 0,61–0,75 (как обычная речь 0,03–0,05 раньше). Шум ≥ 0,003 — усиления нет, кривая прежняя;
//  • усиление не поднимает пик высказывания выше LEVEL_PEAK (0,05 — «обычная речь», уровень 0,75): речь 0,02 на тихом микрофоне — ×2,5, а не ×10 (иначе кольца упирались бы в 1,0 и
//    не дышали); кусок 0,05 и громче не усиливается никогда — обычная и громкая речь идут как раньше;
//  • кусок, который счётчик голосом НЕ назвал (фон, шорох, дыхание), не усиливается: тишина и шум комнаты дают 0, как раньше (а громче пола 0,006 — как раньше, по прежней кривой; дальше
//    их отсекают ворота wordLaneVoiceGate.js — пол шума по уровню, запас ON_MARGIN, выдержка ON_MS).
// Без счётчика (createRmsLevel.push без voice: «Игра 2», «Скажи вслух» — у них своя sensitiveLevel) — прежняя кривая. Чистая логика; проверка — wordLaneVoiceLevel.test.js и замер стенда пилюль.
import { sensitiveLevel, SENSITIVE_FLOOR, GAME_LEVEL_DECAY_MS } from './wordLaneConfig.js'

export const LEVEL_NOISE = SENSITIVE_FLOOR / 2 // куда усиление приводит шум микрофона (rms): вдвое ниже пола кривой
export const LEVEL_PEAK = 0.05                 // выше этого пик высказывания усиление не поднимает («обычная речь», уровень 0,75)
export const LEVEL_GAIN_MAX = 20               // усиление не больше (шум 0,00015 и тише)

/** Усиление уровня: noise — шум микрофона (0 — ещё не знаем: без усиления), peak — пик высказывания вместе с этим куском */
export const levelGain = (noise, peak) => (noise > 0 ? Math.max(1, Math.min(LEVEL_GAIN_MAX, LEVEL_NOISE / noise, peak > 0 ? LEVEL_PEAK / peak : Infinity)) : 1)

/** → fromRms(rms, voice) для createRmsLevel({ fromRms }); fromRms.info() — последний кусок: { rms, level, gain, noise, peak, voice } (стенд пилюль пишет это в трассу) */
export function createVoiceLevel() {
  let info = { rms: 0, level: 0, gain: 1, noise: 0, peak: 0, voice: false }
  const fromRms = (rms, voice = null) => {
    const heard = !!voice?.heard?.(), noise = voice?.noise?.() ?? 0
    const peak = heard ? Math.max(rms, voice.state().peak) : 0, gain = heard ? levelGain(noise, peak) : 1
    const level = sensitiveLevel(rms * gain)
    info = { rms, level, gain, noise, peak, voice: heard }
    return level
  }
  fromRms.decayMs = GAME_LEVEL_DECAY_MS // createRmsLevel берёт спад отсюда — как у sensitiveLevel
  fromRms.info = () => info
  return fromRms
}
