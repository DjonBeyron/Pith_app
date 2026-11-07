// Черновики СИТУАЦИИ фраз для игры «Встряхни память» (этап 2 «Фразы», CONCEPT_PHRASES.md): контекст без подсказки слов — то, что Пит говорит в круге 1 «Пойми»
// («ты знакомишься с новым человеком»), а игрок тапает подходящую фразу. Круг 2 говорит прямой смысл (racePhraseRuDefaults.js). Порядок источников ситуации: правка админа
// (app_settings.race_phrase_scene[key]) → этот черновик → '' (пусто — круг 1 говорит смысл ru). Черновики — 2026-11-07 по решению владельца; правка в админке важнее. Ключ — normText фразы.
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

const DRAFTS = [
  ['Nice to meet you', 'ты знакомишься с новым человеком'],
  ['Where are you from', 'ты хочешь узнать, из какой он страны'],
  ["I'm trying to learn", 'тебя спросили, зачем тебе английский'],
  ["Let's go to your place", 'вечер затянулся, и вы решаете, куда ехать'],
  ["I'm gonna go to sleep", 'поздно, ты устал и прощаешься на ночь'],
  ['Remember', 'ты просишь собеседника не забыть'],
]

/** Карта normText(фраза) → черновик ситуации */
export const PHRASE_SCENE_DEFAULTS = new Map(DRAFTS.map(([text, scene]) => [normText(text), scene]))

/** Черновик ситуации по ключу фразы (normText) или по сырому тексту; нет — '' */
export const defaultPhraseScene = keyOrText => PHRASE_SCENE_DEFAULTS.get(keyOrText) ?? PHRASE_SCENE_DEFAULTS.get(normText(keyOrText)) ?? ''
