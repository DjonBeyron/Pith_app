// Громкость голоса (0…1) → форма рта кота-маскота (closed / half / open, mouthDriver.setMouth). Пороги с запасом: тихий шум рот не открывает, обычная речь — половина, громкая — широко.
// Общие для «Поворота телефона» (wordLaneMouth.js) и для Пита сцен v2 (гейт по огибающей, mouthVisemes.js).
export const OPEN_AT = 0.42
export const HALF_AT = 0.12

export const mouthShape = level => (level >= OPEN_AT ? 'open' : level >= HALF_AT ? 'half' : 'closed')

// Гейт рта Пита в сценах v2 (mouthVisemes.js) — мягче: огибающая нормирована к пику реплики, и при порогах «Поворота телефона»
// (0.12 / 0.42) рот почти всё время сидел в полуоткрытых формах (стенд ?scene=cmp). Тише SCENE_HALF_AT — X, до SCENE_OPEN_AT — полуоткрытая форма
export const SCENE_OPEN_AT = 0.22
export const SCENE_HALF_AT = 0.05
