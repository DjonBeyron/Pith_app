// Стратегии перезапуска распознавания в пробе «Голос» (выбор хранится в localStorage `pithy_admin_voice_restart_v1`; применяет контроллер через getRestart).
// Зачем: на iPhone (iOS 18) второй запуск подряд бывает «глухим» — audiostart за ~50 мс, а микрофон ничего не захватывает (аудиосессия прошлого экземпляра
// ещё не освобождена). Сами стратегии и затвор — shared/lib/speech/speechRestart.js; здесь подписи, выбор и хранение. Чистые функции, store передаётся снаружи.
import { STRATEGY_IDS } from '../../../shared/lib/speech/speechRestart.js'

export const RESTART_KEY = 'pithy_admin_voice_restart_v1'
export const DEFAULT_STRATEGY = 'S1'

export const STRATEGY_INFO = {
  S1: { title: 'Новый экземпляр на попытку', note: 'как сейчас, без ожидания', text: 'Каждая попытка — новый SpeechRecognition, прошлый гасится abort(); следующий создаётся сразу.' },
  S2: { title: 'Один экземпляр переиспользуется', note: 'start() после end', text: 'Один и тот же объект на все попытки: ждём end, затем start() на нём же, без пересоздания.' },
  S3: { title: 'Новый экземпляр + пауза 900 мс после end', note: 'ждём end', text: 'Ждём end прошлого экземпляра, ещё 900 мс тишины, потом создаём новый.' },
  S4: { title: 'stop() вместо abort(), ждём end, пауза 700 мс', note: 'мягкое закрытие', text: 'Прошлый экземпляр закрываем stop() (не abort()), ждём end, пауза 700 мс, новый экземпляр.' },
  S5: { title: 'Переиспользуемый экземпляр + пауза 700 мс', note: 'один объект, с паузой', text: 'Как S2, но после end ещё пауза 700 мс до start().' },
}

export const RESTART_INTRO = 'Проблема: после успешного «Сказать» следующий запуск иногда «глухой» — audiostart приходит почти мгновенно (40–60 мс против обычных 450–1400), ' +
  'а звука нет, и запись заканчивается «stopped» без текста. Похоже, аудиосессия iOS не освобождается сразу после end/abort(). Ниже — пять способов перезапуска. ' +
  'Выберите стратегию и пройдите «Серию из 6 нажатий подряд»: скажите фразу 6 раз, каждый раз нажимая «Сказать» по подсказке. Повторите на S1…S5 и пришлите «Скопировать итог серии стратегий».'

const mem = { id: DEFAULT_STRATEGY } // запасное хранилище, если localStorage недоступен (приватный режим)

export const isStrategyId = v => STRATEGY_IDS.includes(v)

/** Выбранная стратегия (читается в момент тапа контроллером); нет данных / мусор → S1 */
export function readStrategy(store = globalThis.localStorage) {
  try {
    const v = store.getItem(RESTART_KEY)
    if (isStrategyId(v)) { mem.id = v; return v }
    if (v == null) return mem.id
  } catch { /* приватный режим */ }
  return isStrategyId(mem.id) ? mem.id : DEFAULT_STRATEGY
}

export function writeStrategy(id, store = globalThis.localStorage) {
  if (!isStrategyId(id)) return DEFAULT_STRATEGY
  mem.id = id
  try { store.setItem(RESTART_KEY, id) } catch { /* выбор живёт до перезагрузки */ }
  return id
}

/** Подпись выбранной стратегии: «S3 — Новый экземпляр + пауза 900 мс после end» */
export const strategyLabel = id => `${id} — ${STRATEGY_INFO[id]?.title ?? '?'}`
