import { GAME2_LINES, HINT_LINE } from './game2Modes.js'

// Настройки игры для движка звука (startGameAudio / warmGameSounds / useWordLanePause): у «Мини-игры 2.0» нет кусков из библиотеки слов и нет записи автора — готовим только реплики Пита
// (cfg.firstLines: rh2_* и «Начни с» подсказки; по ним ворота старта ждут первые N файлов). Озвучка самой фразы качается отдельно (game2Warm.js): её адрес лежит не в каталоге реплик.
const CFG = {
  title: 'Мини-игра 2.0', chunks: [], word: '', translation: '', lang: 'en-US', isDemo: false, hasAudio: false, audio: null, clips: null, confusers: [], extraWords: [],
  firstLines: [...GAME2_LINES, HINT_LINE], plan: null,
}

/** cfg для движка звука игры (один общий объект: подпись прогрева не меняется от рендера к рендеру) */
export const game2Cfg = () => CFG
