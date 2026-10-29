// «Мяу» как звук награды игры «Повтори за диктором»: адреса трёх готовых файлов public/sounds/meow-{1,2,3}.wav (их делает scripts/meow/make_meow.mjs, RMS вдвое ниже прежних нот)
// и настройки выбора звука/громкости (живут в shared/lib/rewardSound.js — их читает и админка). Играют их слоты wordLaneNotes.js, прогретые в тапе «Начать» (unlockNotes).
export * from '../../../../shared/lib/rewardSound.js'

export const MEOW_REV = 1 // сменили wav — подними: браузер и iOS кэшируют файл по адресу
export const MEOW_PATHS = [1, 2, 3].map(n => `/sounds/meow-${n}.wav?v=${MEOW_REV}`)
