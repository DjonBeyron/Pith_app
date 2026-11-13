// «Громкость как у медиа» (v3.3.201). Проверка владельца на iPhone (журнал и сравнение с Telegram при одной громкости телефона): звук игры — и голос Пита, и «ту-ту-ту» — в ДВА раза тише того же
// файла в Telegram; усиление программно (+9 дБ, режимы «Громче») на слух ничего не даёт; единственное, что выравнивает громкость, — «Встряхнуть: <audio>» (играет беззвучный элемент <audio>).
// Вывод: пока на странице не играет медиа-элемент, звук Web Audio идёт по приглушённому пути аудиосессии; любой играющий <audio> переключает страницу на обычную «медиа»-громкость.
// Что делаем: на время игры (микрофон игры открыт) в фоне крутится беззвучный зацикленный <audio>. start() — из нажатия (openGameMic зовётся в тапе «Начать» / «Продолжить»: элемент «разблокируется»
// жестом, потом play() работает и без жеста), refresh() — когда микрофон открылся (аудиосессия сменилась на запись → элемент перезапускаем, так же как делала кнопка «Встряхнуть: <audio>»), stop() — пауза / конец игры.
// Настройка pithy_game_media_keep_v1 ('on' / 'off'); с v3.3.202 по умолчанию ВЫКЛЮЧЕНО: журнал владельца по 3.3.201 — элемент «играл» («старт — играет»), а игра осталась такой же тихой (причина — открытый поток микрофона, режим звонка, а не отсутствие медиа-элемента); на Android и iOS играющий <audio> ещё и показывает карточку «Сейчас играет».
// Побочный эффект на iOS: пока игра идёт, у приложения может быть карточка «Сейчас играет» — после паузы / конца игры пропадает. Зависимости подставляются (тесты без браузера).
import { silentWavUrl } from './gameVolumeNudge.js'
import { pLog } from './debug.js'

export const MEDIA_KEEP_KEY = 'pithy_game_media_keep_v1'

export const readMediaKeep = (store = globalThis.localStorage) => { try { const v = store?.getItem(MEDIA_KEEP_KEY); return v === 'on' ? 'on' : 'off' } catch { return 'off' } }
export const writeMediaKeep = (value, store = globalThis.localStorage) => { try { if (value === 'on' || value === 'off') store?.setItem(MEDIA_KEEP_KEY, value); else store?.removeItem(MEDIA_KEEP_KEY) } catch { /* приватный режим */ } }

export function createMediaKeep({ make = url => new globalThis.Audio(url), read = readMediaKeep, log = pLog } = {}) {
  let el = null, playing = false
  const say = t => { try { log(`[audio] громкость как у медиа: ${t}`) } catch { /* журнал не мешает */ } }
  const play = why => {
    try {
      const p = el.play()
      playing = true
      Promise.resolve(p).then(() => say(`${why} — играет (беззвучный <audio>)`), e => { playing = false; say(`${why} — не сыграл: ${e?.name ?? e}`) })
    } catch (e) { playing = false; say(`${why} — ошибка: ${e?.message ?? e}`) }
  }
  const ensure = () => {
    if (el) return true
    try { el = make(silentWavUrl(1000)); el.loop = true; el.preload = 'auto'; el.setAttribute?.('playsinline', ''); return true } catch (e) { say(`<audio> не создаётся: ${e?.message ?? e}`); return false }
  }
  return {
    /** Из нажатия: создать элемент и запустить (разблокировка жестом). → true, если запущен */
    start() { if (read() !== 'on' || !ensure()) return false; if (!playing) play('старт'); return true },
    /** Микрофон открылся: перезапустить элемент (сессия сменилась на запись) */
    refresh() {
      if (read() !== 'on' || !ensure()) return false
      try { el.pause?.(); el.currentTime = 0 } catch { /* элемент ещё не готов */ }
      playing = false; play('обновлён после открытия микрофона'); return true
    },
    /** Пауза / конец игры */
    stop() { if (!el || !playing) return; try { el.pause?.() } catch { /* уже остановлен */ } playing = false; say('остановлен (пауза / конец игры)') },
    isPlaying: () => playing,
  }
}

/** Общий экземпляр игры */
export const gameMediaKeep = createMediaKeep()
