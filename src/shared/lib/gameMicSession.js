// Тип аудиосессии (navigator.audioSession.type, Safari 16.4+) на время игры «Повтори за диктором» — режимы для проверки на iPhone (Админ → «Голос» → «Микрофон игры», pithy_game_audio_session_v1).
// Зачем: пока открыт микрофон игры, iOS держит аудиосессию в режиме «запись + воспроизведение» и сам решает, как играть звук страницы: приглушает его (ducking), меняет громкость на переходах,
// а при выборе типа 'auto' может переключать вывод между динамиком и «разговорным» (ресивером). Явный тип снимает часть этих решений.
//  • 'play-and-record' (по умолчанию): ставим при старте игры и держим до конца — WebKit в этом типе не переключает вывод и не пересчитывает категорию при каждом play().
//  • 'auto': ничего не трогаем (как было раньше) — для сравнения.
//  • 'phases' (экспериментальный): 'playback' на время речи Пита и диктора, 'play-and-record' на очередь ученика. Риск: playback при открытом захвате может приглушить/остановить дорожку микрофона.
// Нет navigator.audioSession — всё no-op (в журнал уходит supported:false). Прежнее значение возвращаем в конце игры. Чистая логика: navigator и хранилище передаются снаружи (тесты).
import { createAudioSession } from './speech/speechAudioSession.js'
import { readAudioSessionMode } from './gameAudioSettings.js'
import { gameAudioNote } from './gameAudioSink.js'

export const SESSION_SPEAK = 'playback'
export const SESSION_LISTEN = 'play-and-record'

export function createGameAudioSession({ nav = globalThis.navigator, store = globalThis.localStorage, note = gameAudioNote } = {}) {
  const api = createAudioSession({ nav })
  let active = false
  let changed = false // мы действительно меняли тип — в конце игры вернём прежний
  let prev = null
  let mode = 'auto'

  const report = (why, requested, ok) => note('audio-session', { mode, why, requested, ok, as: api.current(), prev, supported: api.supported() })
  function apply(type, why) {
    if (!api.supported()) { report(why, type, false); return false }
    if (api.current() === type) return true // уже так — не шумим в журнале
    const ok = api.set(type)
    if (ok) changed = true
    report(why, type, ok)
    return ok
  }

  return {
    get active() { return active },
    /** Старт игры (тап «Начать», до openGameMic): запомнить прежний тип и поставить нужный по настройке. Повторный вызов — no-op */
    begin() {
      if (active) return
      active = true; changed = false
      mode = readAudioSessionMode(store)
      prev = api.current()
      if (mode === 'auto') { report('begin', null, true); return }
      apply(SESSION_LISTEN, 'begin')
    },
    /** Фаза игры: 'speak' (говорит Пит или диктор) / 'listen' (очередь ученика). Работает только в режиме 'phases' */
    phase(p) {
      if (!active || mode !== 'phases') return
      apply(p === 'speak' ? SESSION_SPEAK : SESSION_LISTEN, `phase:${p}`)
    },
    /** Режим микрофона 'close': поток закрыт (треки остановлены) — тип сессии 'auto', запись сессию не держит. В режимах 'auto' (не трогаем) и 'phases' (тип ведёт phase) — no-op */
    micClosed() {
      if (!active || mode === 'auto' || mode === 'phases') return
      apply('auto', 'mic-closed')
    },
    /** Режим микрофона 'close': СЕЙЧАС откроем поток заново — тип 'play-and-record' ставим ДО getUserMedia (как «Сказать фразу»: тип → микрофон) */
    micOpening() {
      if (!active || mode === 'auto' || mode === 'phases') return
      apply(SESSION_LISTEN, 'mic-open')
    },
    /** Конец игры: вернуть прежний тип (если мы его меняли). Повторный вызов безопасен */
    end() {
      if (!active) return
      active = false
      if (changed && api.supported()) {
        const back = prev ?? 'auto'
        const ok = api.set(back)
        report('end', back, ok)
      }
      changed = false
    },
    /** Для панели админки и отладки: режим из настройки, есть ли API, текущий тип */
    describe: () => ({ mode: readAudioSessionMode(store), supported: api.supported(), type: api.current(), active }),
  }
}

/** Общий экземпляр игры */
export const gameAudioSession = createGameAudioSession()

/** Состояние для панели админки: режим из настройки, есть ли navigator.audioSession, текущий type (читается заново при каждом вызове) */
export const describeAudioSession = () => ({ ...createGameAudioSession().describe(), active: gameAudioSession.active })
