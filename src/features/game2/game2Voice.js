import { playGameBuffer, stopGameBuffers } from '../../shared/lib/gameBufferPlay.js'
import { bufferOfUrl } from '../player/modules/rotate-phone/wordLaneFetch.js'
import { mouthTrack } from '../player/modules/rotate-phone/wordLaneVisemes.js'

// Озвучка фразы на ленте: готовый AudioBuffer (скачан и декодирован при прогреве, wordLaneFetch.js) играется через игровой AudioContext (gameBufferPlay.js): громкость — GainNode (на «Тени» −6 дБ,
// чтобы микрофон ловил голос человека), скорость — playbackRate (в «Скорости» ×1,2: тон чуть выше, для стенда приемлемо; лента сжата на тот же коэффициент, поэтому голос и пилюли не расходятся).
// Нет озвучки / буфер не декодирован — start() возвращает false: режим идёт молча на оценке таймингов. Пит при этом говорит: рот двигается по дорожке слов озвучки (mouthTrack).
export function createPhraseVoice({ phrase, text = '', catApi = null, play = playGameBuffer, stop = stopGameBuffers, bufferOf = bufferOfUrl, log = () => {} }) {
  const buffer = () => (phrase?.url ? bufferOf(phrase.url) : null)
  return {
    /** Озвучка готова к проигрыванию (декодирована) */
    ready: () => !!buffer(),
    /** Включить озвучку; onStart() — когда звук ДЕЙСТВИТЕЛЬНО пошёл (по нему сверяются часы ленты); onEnd() — доиграл. → true, если звук принят */
    start({ rate = 1, gain = 1, onStart = null, onEnd = null } = {}) {
      const buf = buffer()
      if (!buf) { log('озвучки фразы нет — режим идёт молча, на оценке таймингов'); return false }
      const ms = Math.round((buf.duration * 1000) / (rate > 0 ? rate : 1))
      const ok = play(buf, {
        rate, gain, onEnd,
        onStart: () => { try { catApi?.current?.speak?.(mouthTrack(text, ms, phrase.words, buf.duration), ms, { id: 'rh2_phrase' }) } catch { /* рот не должен мешать звуку */ } onStart?.() },
        onResult: r => { if (r?.play !== 'started') log(`звук фразы не пошёл: ${r?.play}${r?.error ? ` (${r.error})` : ''}`) },
      })
      return ok
    },
    stop: () => stop(),
  }
}
