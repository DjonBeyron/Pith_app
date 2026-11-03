// Режимы «Мини-игры 2.0» (этап 1) и порядок между ними — чистые данные и функции. Одна сессия ≈ 35–45 с, одна фраза:
//  start → listen → catch (повтор один раз после промаха) → shadow → recall → speed → done.
// Поля режима: line — реплика Пита перед режимом (rehearsalLines.js, rh2_*), show — какие пилюли на ленте (all / due / none), labels — подписи на пилюлях, voice — звучит ли озвучка фразы, gain — громкость (GainNode),
// rate — скорость (playbackRate озвучки и сжатие ленты), turn — ход пользователя (лента цвета микрофона, кольцо у линии, индикатор уровня), plate — слово на плашке режима (1,5 с), instr — постоянная строка-инструкция, input — как засчитываются слова (none / catch — ловим слово в момент, shadow — по порядку фразы), fill — как «горит» пилюля (karaoke — по ходу слова).
import { CATCH_WINDOW_MS, SHADOW_WINDOW_MS } from './game2Hits.js'

export const SPEED_UP = 1.2
export const SHADOW_DB = -6
export const dbGain = db => 10 ** (db / 20)

export const MODES = {
  start: { id: 'start', title: 'Старт', line: 'rh2_start', turn: false, plate: 'Пит', instr: 'Слушай Пита', show: 'none', labels: false, voice: false, gain: 1, rate: 1, input: 'none', lane: false },
  listen: { id: 'listen', title: 'Слушаю', line: 'rh2_listen', turn: false, plate: 'Слушаю', instr: 'Слушай и смотри, говорить не надо', show: 'all', labels: true, voice: true, gain: 1, rate: 1, input: 'none', fill: 'karaoke', lane: true },
  catch: { id: 'catch', title: 'Ловлю', line: 'rh2_catch', turn: true, plate: 'Твой ход', instr: 'Скажи слово, когда услышишь его', show: 'due', labels: false, voice: true, gain: 1, rate: 1, input: 'catch', window: CATCH_WINDOW_MS, lane: true },
  shadow: { id: 'shadow', title: 'Тень', line: 'rh2_shadow', turn: true, plate: 'Твой ход', instr: 'Говори вместе с Питом', show: 'all', labels: true, voice: true, gain: dbGain(SHADOW_DB), rate: 1, input: 'shadow', window: SHADOW_WINDOW_MS, lane: true },
  recall: { id: 'recall', title: 'По памяти', line: 'rh2_recall', turn: true, plate: 'Твой ход', instr: 'Скажи фразу сам', show: 'all', labels: false, voice: false, gain: 1, rate: 1, input: 'shadow', window: SHADOW_WINDOW_MS, hint: true, lane: true },
  speed: { id: 'speed', title: 'Скорость ×1,2', line: 'rh2_speed', turn: true, plate: 'Твой ход', instr: 'Ещё раз, быстрее', show: 'all', labels: true, voice: true, gain: dbGain(SHADOW_DB), rate: SPEED_UP, input: 'shadow', window: SHADOW_WINDOW_MS, lane: true },
  done: { id: 'done', title: 'Итог', line: 'rh2_done', turn: false, plate: 'Итог', instr: '', show: 'none', labels: false, voice: false, gain: 1, rate: 1, input: 'none', lane: false },
}
export const MODE_IDS = Object.keys(MODES)
export const SEQUENCE = ['start', 'listen', 'catch', 'shadow', 'recall', 'speed', 'done']
export const MAX_CATCH_TRIES = 2 // «Ловлю»: первая попытка и один повтор после промаха

/** Реплики Пита стенда (ключи каталога) — для прогрева, озвучки и счётчика «озвучено N из 8» */
export const GAME2_LINES = ['rh2_start', 'rh2_listen', 'rh2_catch', 'rh2_catch_miss', 'rh2_shadow', 'rh2_recall', 'rh2_speed', 'rh2_done']

/** Подсказка в «По памяти»: реплика «Начни с» перед словом (механизм репетиции, rehearsalHints.js) */
export const HINT_LINE = 'rh_blind_hint_pre'

/**
 * Что дальше после режима cur → { mode, say } или null (конец). ctx: dueCount — сколько слов «к повтору» на ленте (нет — «Ловлю» пропускается), missed — сколько слов не пойманы в только что
 * сыгранном «Ловлю», tries — сколько попыток «Ловлю» уже было. Промах → тот же режим ещё раз с репликой rh2_catch_miss (один повтор).
 */
export function nextStep(cur, { dueCount = 0, missed = 0, tries = 0 } = {}) {
  if (cur === 'catch' && missed > 0 && tries < MAX_CATCH_TRIES) return { mode: 'catch', say: 'rh2_catch_miss' }
  let i = SEQUENCE.indexOf(cur) + 1
  if (SEQUENCE[i] === 'catch' && dueCount === 0) i += 1 // нет слов «к повтору» — ловить нечего
  const mode = SEQUENCE[i]
  return mode ? { mode, say: MODES[mode].line } : null
}

/** Режим, с которого продолжается сессия после паузы: «Старт» заново не играем (Пит уже представил игру) — следующий за ним */
export const resumeFrom = mode => (mode === 'start' || !mode ? 'listen' : mode)
