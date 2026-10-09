// Стратегии перезапуска распознавания в пробе «Голос» (выбор хранится в localStorage `pithy_admin_voice_restart_v2`; применяет контроллер через getRestart).
// Зачем: на iPhone (iOS 18) второй запуск подряд бывает «глухим» — audiostart за ~50 мс, а микрофон ничего не захватывает (аудиосессия прошлого экземпляра
// ещё не освобождена; главная гипотеза — любой звук страницы переключает аудиосессию WebKit, S6/S7 ставят navigator.audioSession='play-and-record'). Сами стратегии и затвор — shared/lib/speech/speechRestart.js; здесь подписи, выбор и хранение. Чистые функции, store передаётся снаружи.
import { STRATEGY_IDS } from '../../../shared/lib/speech/speechRestart.js'

// v2: ключ сменён вместе с умолчанием S1 → S6 (старый выбор S1, оставшийся с прошлых проб, не должен прятать новую лучшую гипотезу)
export const RESTART_KEY = 'pithy_admin_voice_restart_v2'
export const DEFAULT_STRATEGY = 'S6'

export const STRATEGY_INFO = {
  S1: { title: 'Новый экземпляр на попытку', note: 'как сейчас, без ожидания', text: 'Каждая попытка — новый SpeechRecognition, прошлый гасится abort(); следующий создаётся сразу.' },
  S2: { title: 'Один экземпляр переиспользуется', note: 'start() после end', text: 'Один и тот же объект на все попытки: ждём end, затем start() на нём же, без пересоздания.' },
  S3: { title: 'Новый экземпляр + пауза 900 мс после end', note: 'ждём end', text: 'Ждём end прошлого экземпляра, ещё 900 мс тишины, потом создаём новый.' },
  S4: { title: 'stop() вместо abort(), ждём end, пауза 700 мс', note: 'мягкое закрытие', text: 'Прошлый экземпляр закрываем stop() (не abort()), ждём end, пауза 700 мс, новый экземпляр.' },
  S5: { title: 'Переиспользуемый экземпляр + пауза 700 мс', note: 'один объект, с паузой', text: 'Как S2, но после end ещё пауза 700 мс до start().' },
  S6: { title: 'Новый экземпляр + пауза 700 мс + аудиосессия play-and-record', note: 'по умолчанию', text: 'Ждём end, пауза 700 мс, новый экземпляр. Перед start() (в том же тапе) navigator.audioSession.type = «play-and-record», после end — «auto». Нет API (iOS < 16.4) — работает как S3.' },
  S7: { title: 'S6 + принудительный сброс аудиосессии', note: 'сброс перед стартом', text: 'Как S6, но перед стартом тип сначала «auto», через 150 мс «play-and-record» и только потом start() (запуск на 150 мс позже тапа). Нет API — как S3.' },
}

export const RESTART_INTRO = 'Проблема: после успешного «Сказать» следующий запуск иногда «глухой» — audiostart приходит почти мгновенно (40–60 мс против обычных 450–1400), ' +
  'а звука нет, и запись заканчивается «stopped» без текста. Гипотезы: аудиосессия iOS не освобождается сразу после end/abort(), либо любой звук страницы (в том числе беззвучный wav «разблокировки») переключает её в режим воспроизведения. ' +
  'Ниже — семь способов перезапуска (S6/S7 ставят audioSession=play-and-record), на вкладке «Голос» звуки приложения отключены. В журнале и итоге серии есть «звуки до записи» — что играла страница за 6 с до старта. ' +
  'Выберите стратегию и пройдите «Серию из 6 нажатий подряд»: скажите фразу 6 раз, каждый раз нажимая «Сказать» по подсказке. Повторите на S6, S7, S3 и пришлите «Скопировать итог серии стратегий».'

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
