// Настройки игры в комментарии (кнопка 💬): те, от которых зависит, «почему хрипит звук» — тип аудиосессии iOS (и что выбрано в настройке), глушение дорожки микрофона на речь Пита, обработка микрофона (эхо/шум),
// звук и громкость награды, безопасные слои пилюль, тап вместо речи, скорость голоса, lite; плюс живое состояние дорожки микрофона и Vosk. Те же источники, что у HUD (WordLaneHud.jsx, wordLaneHudSettings.js).
// Читатели подставляются в тестах; каждый вызывается через try — сбой одного не ломает комментарий.
import { APP_VERSION } from '../../../shared/lib/version.js'
import { isMicProcessingOn, describeGameMic } from '../../../shared/lib/gameMic.js'
import { readAudioSessionMode, readMicHoldMode } from '../../../shared/lib/gameAudioSettings.js'
import { isWeakDevice } from '../../../shared/lib/deviceTier.js'
import { voskRuntime } from '../../../shared/lib/vosk/voskRuntime.js'
import { getVoiceRate } from '../../player/lessonVolume.js'
import { getRewardSound, getRewardVolume } from '../../player/modules/rotate-phone/wordLaneMeow.js'
import { readPillSafe, readTapMode, readWeakStored, describeHud } from '../../player/modules/rotate-phone/wordLaneHudSettings.js'

export const DEFAULT_READERS = {
  hud: () => describeHud({ mic: describeGameMic, vosk: () => voskRuntime.snapshot(), weak: isWeakDevice, version: APP_VERSION }),
  sessionMode: readAudioSessionMode,
  micHold: readMicHoldMode,
  micProcessing: isMicProcessingOn,
  rewardSound: getRewardSound,
  rewardVolume: getRewardVolume,
  pillSafe: readPillSafe,
  tapMode: readTapMode,
  voiceRate: getVoiceRate,
  lite: () => readWeakStored() ?? isWeakDevice(),
}

const safe = (fn, fallback = null) => { try { return fn() } catch { return fallback } }
const pct = v => Math.round((Number(v) || 0) * 100)

/** → { version, audioSession (тип сейчас), audioSessionMode (настройка), micHold, micProcessing, rewardSound, rewardVolume (0…1), pillSafe, tapMode, voiceRate, lite, mic (дорожка), vosk } */
export function snapshotSettings(readers = DEFAULT_READERS) {
  const r = { ...DEFAULT_READERS, ...readers }
  const hud = safe(r.hud, {}) ?? {}
  return {
    version: hud.version ?? APP_VERSION,
    audioSession: hud.audioSession ?? '—',
    audioSessionMode: safe(r.sessionMode),
    micHold: safe(r.micHold),
    micProcessing: !!safe(r.micProcessing, false),
    rewardSound: safe(r.rewardSound),
    rewardVolume: safe(r.rewardVolume),
    pillSafe: !!safe(r.pillSafe, false),
    tapMode: !!safe(r.tapMode, false),
    voiceRate: safe(r.voiceRate),
    lite: !!safe(r.lite, false),
    mic: hud.mic ?? '—',
    vosk: hud.vosk ?? '—',
  }
}

const onOff = v => (v ? 'вкл' : 'выкл')

/** Настройки одной строкой для сводки */
export function settingsLine(s) {
  return [
    `аудиосессия ${s.audioSession} (режим «${s.audioSessionMode}»)`, `дорожка на речь Пита «${s.micHold}»`, `обработка микрофона ${onOff(s.micProcessing)}`,
    `награда «${s.rewardSound}» ${pct(s.rewardVolume)}%`, `безопасные слои ${onOff(s.pillSafe)}`, `тап вместо речи ${onOff(s.tapMode)}`, `голос ${s.voiceRate}×`, `lite ${onOff(s.lite)}`,
    `дорожка микрофона: ${s.mic}`, `Vosk: ${s.vosk}`,
  ].join(', ')
}
