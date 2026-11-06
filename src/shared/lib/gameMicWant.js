// Нужен ли микрофон текущей игре «Повтори за диктором» / «Встряхни память». «Тапаю» в «Гонке» (CONCEPT_RACE.md, «Попап внутри игры») — игра без голоса: ни getUserMedia, ни слушателя Vosk,
// ни типа аудиосессии записи (play-and-record). Флаг ставит startGameAudio (wordLaneStart.js) в тапе запуска, читает useGameAudioModes при монтировании игры (тип сессии подтверждается только с микрофоном).
let wanted = true

/** Старт игры: нужен ли ей микрофон (по умолчанию — да) */
export function setGameMicWanted(v) { wanted = v !== false }

/** Нужен ли микрофон игре, которая сейчас запущена (или запускается) */
export const gameMicWanted = () => wanted
