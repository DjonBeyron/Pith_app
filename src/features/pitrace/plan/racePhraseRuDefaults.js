// Черновики смысла фраз по-русски для игры «Встряхни память» (этап 2 «Фразы», CONCEPT_PHRASES.md): намерение, а не перевод — то, что Пит
// говорит перед лентой («скажи, что рад знакомству»). Порядок источников смысла: правка админа (app_settings.race_phrase_ru[key]) →
// этот черновик → перевод названия модуля (curricula.title_translation). Черновики сгенерированы 2026-11-06 по списку фраз владельца
// и фразам стенда; владелец правит их в админке (RacePhraseMeaning.jsx / таблица озвучки), правка важнее черновика. Ключ — normText фразы.
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

const DRAFTS = [
  ["Let's go to your place", 'предложи поехать к нему домой'],
  ["I'm gonna go to sleep", 'скажи, что собираешься спать'],
  ["I'm trying to learn", 'скажи, что пытаешься учиться'],
  ['Nice to meet you', 'скажи, что рад знакомству'],
  ['Where are you from', 'спроси, откуда человек'],
  ['Remember', 'попроси запомнить'],
]

/** Карта normText(фраза) → черновик смысла */
export const PHRASE_RU_DEFAULTS = new Map(DRAFTS.map(([text, ru]) => [normText(text), ru]))

/** Черновик смысла по ключу фразы (normText) или по сырому тексту; нет — '' */
export const defaultPhraseRu = keyOrText => PHRASE_RU_DEFAULTS.get(keyOrText) ?? PHRASE_RU_DEFAULTS.get(normText(keyOrText)) ?? ''
