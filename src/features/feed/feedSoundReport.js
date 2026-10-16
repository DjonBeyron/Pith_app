import { straceLines, mediaState } from '../../shared/lib/soundGestureTrace.js'
import { soundCtxState } from '../../shared/lib/sounds.js'
import { sceneAudioUnlocked, SCENE_AUDIO_EAGER_UNLOCK, sceneUnlockDeferred, forEachSceneAudio } from '../scene/v2/sceneAudioUnlock.js'

// Секция DBG-панели «звук (жест)»: что было в последнем тапе по звуку и каково состояние звука сейчас.
// Пользователь на iPhone присылает скриншот/текст панели — по нему видно порядок unlock/play и исход каждого play()
export function feedSoundReport() {
  const ss = typeof window !== 'undefined' ? window.speechSynthesis : null
  const vids = [...document.querySelectorAll('video.poolVideo')].map(v => {
    const tag = v.dataset.active === '1' ? 'АКТИВНОЕ' : v.dataset.parked === '1' ? 'парковка' : 'сосед'
    return `  ${(v.dataset.url || '—').slice(-8)} [${tag}] ${mediaState(v)}`
  })
  const aud = []
  forEachSceneAudio(a => aud.push(mediaState(a)))
  const trace = straceLines()
  return [
    `iOS-standalone: navigator.standalone=${String(window.navigator.standalone ?? 'n/a')} display-mode=${window.matchMedia('(display-mode: standalone)').matches}`,
    `AudioContext (звуки интерфейса): ${soundCtxState() ?? 'не создан'}`,
    `speechSynthesis: ${ss ? `speaking=${ss.speaking} paused=${ss.paused} pending=${ss.pending}` : 'нет'}`,
    `аудио сцен: открыто=${sceneAudioUnlocked()} EAGER=${SCENE_AUDIO_EAGER_UNLOCK} отложено до жеста на сцене=${sceneUnlockDeferred()} <audio>: ${aud.join(' | ') || 'нет'}`,
    `видео пула (${vids.length}):`,
    ...vids,
    'трасса последнего жеста звука:',
    ...(trace.length ? trace.map(l => `  ${l}`) : ['  (жеста звука ещё не было)']),
  ].join('\n')
}
