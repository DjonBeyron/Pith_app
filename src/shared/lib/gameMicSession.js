// Тип аудиосессии (navigator.audioSession.type, Safari 16.4+) на время игры «Повтори за диктором» — режимы для проверки на iPhone (Админ → «Голос» → «Микрофон игры», pithy_game_audio_session_v1).
// Зачем: пока открыт микрофон игры, iOS держит аудиосессию в режиме «запись + воспроизведение» и сам решает, как играть звук страницы: приглушает его (ducking), меняет громкость на переходах,
// а при выборе типа 'auto' может переключать вывод между динамиком и «разговорным» (ресивером). Явный тип снимает часть этих решений.
//  • 'play-and-record' (по умолчанию): ставим при старте игры и держим до конца — WebKit в этом типе не переключает вывод и не пересчитывает категорию при каждом play().
//  • 'auto': ничего не трогаем (как было раньше) — для сравнения.
//  • 'playback' (v3.3.210): после открытия микрофона тип playback ставится один раз и держится весь сеанс игры (afterMic) — без переключений на каждой реплике.
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
  let held = false   // режим 'playback': после открытия микрофона тип playback поставлен и держится до конца игры (afterMic)
  let micOff = false // режим 'close': поток микрофона закрыт нами (между micClosed и micOpening) — тип 'play-and-record' в это время не ставим

  const report = (why, requested, ok) => note('audio-session', { mode, why, requested, ok, as: api.current(), prev, supported: api.supported() })
  function apply(type, why) {
    if (!api.supported()) { report(why, type, false); return false }
    if (api.current() === type) { if (why === 'begin') report(`${why}:уже так`, type, true); return true } // уже так — в журнал только на старте (видно, каким тип пришёл после фона)
    const ok = api.set(type)
    if (ok) changed = true
    report(why, type, ok)
    return ok
  }

  return {
    get active() { return active },
    /** Старт игры (тап «Начать», до openGameMic): запомнить прежний тип и поставить нужный по настройке. Повторный вызов — no-op */
    begin() {
      if (active) { if (mode !== 'auto' && !micOff && !held) apply(SESSION_LISTEN, 'begin-again'); return } // повторный старт без конца прошлой игры (после фона тип мог сброситься): ставим тип заново — кроме закрытого микрофона ('close': иначе вернём «режим звонка» на речь Пита, v3.3.203)
      active = true; changed = false; micOff = false; held = false
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
    /** Режим 'playback' (v3.3.210): микрофон открыт (getUserMedia прошёл при типе play-and-record) — ставим playback ОДИН раз и держим до конца игры. Журнал 3.3.209: при переключении playback ↔ play-and-record на каждой реплике первые ≈ секунды реплики тихие (громкость «догоняет»), в конце хруст; захват микрофона при playback продолжает отдавать звук (стенд, круг 4). В остальных режимах — no-op */
    afterMic() {
      if (!active || mode !== 'playback') return
      held = true
      apply(SESSION_SPEAK, 'mic-ready')
    },
    /** Режим микрофона 'close': поток закрыт (треки остановлены) — тип сессии 'auto', запись сессию не держит. В режимах 'auto' (не трогаем) и 'phases' (тип ведёт phase) — no-op */
    micClosed() {
      if (!active || mode === 'auto' || mode === 'phases' || mode === 'playback') return
      micOff = true
      apply('auto', 'mic-closed')
    },
    /** Режим микрофона 'close': СЕЙЧАС откроем поток заново — тип 'play-and-record' ставим ДО getUserMedia (как «Сказать фразу»: тип → микрофон) */
    micOpening() {
      if (!active || mode === 'auto' || mode === 'phases' || mode === 'playback') return
      micOff = false
      apply(SESSION_LISTEN, 'mic-open')
    },
    /** Конец игры: вернуть прежний тип (если мы его меняли). Повторный вызов безопасен */
    end() {
      if (!active) return
      active = false; micOff = false; held = false
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
