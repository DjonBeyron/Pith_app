// Модели Vosk по языкам: английская — основная (voskRuntime.js), русская — второй такой же прогрев со своим адресом, кэшем, фоновой загрузкой и статусом. Нужна проходу «назови перевод» игры «Встряхни память»
// (русская речь). Модели в памяти телефона НЕ держим вместе (iPhone): перед русским проходом английскую выгружают (evict), русскую грузят, после игры возвращают английскую (features/pitrace/raceSwitch.js).
import { createVoskRuntime, voskRuntime } from './voskRuntime.js'
import { warmRecognizer } from './voskWarmRec.js'
import { readRuModelUrl } from './voskConfigRu.js'
import { onBgCached } from './voskBgStatus.js'

export const voskRuntimeRu = createVoskRuntime({ warmDecode: model => warmRecognizer(model, ['да', 'нет']), url: () => readRuModelUrl(), watchCached: fn => onBgCached(fn, 'ru') })

/** Прогрев нужного языка: 'ru' — русская модель, иначе английская */
export const runtimeOf = (lang = 'en') => (lang === 'ru' ? voskRuntimeRu : voskRuntime)

/** Занять модель языка lang (why: 'lesson' | 'panel' | …): acquire(why, lang) → release(). Прогрев и выгрузка после ухода — как у английской */
export const acquireModel = (why, lang = 'en') => runtimeOf(lang).acquire(why)
