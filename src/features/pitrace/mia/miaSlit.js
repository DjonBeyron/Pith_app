// Зрачок-щель у Мии (владелец, v3.3.287: «сужение зрачка до тонкой вертикальной щели в некоторые логичные моменты»): хищный, сосредоточенный взгляд.
// Когда: (1) Мия в прыжке — летит к коробке, смотрит на цель; (2) говорит колкую или грозную реплику (приказ Питу, подкол на ошибку, «подозрительно хорошо», уход с обещанием вернуться).
// На доброжелательных репликах («допустим», «время вышло…») и в покое зрачок обычный. Сужение рисует CSS (race-mia.css: [data-slit] → --slit-x / --slit-y), здесь только решение.
export const SLIT_TAIL_MS = 250 // щель держится ещё немного после конца реплики
export const SLIT_LINES = Object.freeze(['mia_push', 'mia_announce_1', 'mia_announce_2', 'mia_announce_3', 'mia_streak2', 'mia_miss_1', 'mia_miss_2', 'mia_miss_3', 'mia_leave', 'boss_mia_hush', 'boss_mia_exam'])

/** talkId — id реплики Мии сейчас (или null), mode — режим движения Мии ('flight' — в прыжке, 'off' — не на экране, иначе сидит) → true, если зрачок сужен */
export const slitOn = (talkId, mode) => mode === 'flight' || (!!talkId && SLIT_LINES.includes(talkId))
