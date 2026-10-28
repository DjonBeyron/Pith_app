// Флаг «Живой Пит v2» (рот из 9 форм по буквам и громкости, зрачки, усы): по умолчанию ВЫКЛЮЧЕН, пока владелец не сравнил со старой анимацией
// (стенд ?scene=cmp). Включается в админке («Переключатели») — она пишет '1' в localStorage pithy_scene_anim_v2 — или явно пропом animV2
// у SceneRenderer (стенд сравнения держит рядом обе версии). Только для маскота (скин kit / mia); обычный кот не меняется.
// Читается на каждое создание режиссёра/рендер, не кэшируется: переключатель в админке действует со следующей реплики/сцены.

export const ANIM_V2_KEY = 'pithy_scene_anim_v2'

export function isAnimV2() {
  try { return globalThis.localStorage?.getItem(ANIM_V2_KEY) === '1' } catch { return false }
}

export function setAnimV2(on) {
  try {
    if (on) globalThis.localStorage?.setItem(ANIM_V2_KEY, '1')
    else globalThis.localStorage?.removeItem(ANIM_V2_KEY)
  } catch { /* приватный режим: не запомнится */ }
}

// Итоговое значение: явный проп (true / false) сильнее флага; undefined/null — читаем флаг
export const resolveAnimV2 = prop => (typeof prop === 'boolean' ? prop : isAnimV2())
