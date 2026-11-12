// Стенд громкости (v3.3.197, замечание владельца: «при 30–40 % я почти не слышу Пита — что-то сильно приглушает; сделаем мини-стенд?»). Громкость динамика из страницы не измерить (микрофон тон не слышит,
// замеры 3.3.195–196 это показали), поэтому стенд играет ОДИН И ТОТ ЖЕ тест-звук в разных состояниях звука и микрофона, а оценивает человек на слух: «тихо / нормально / громко». Громкость телефона
// ставится один раз (например 35 %) и не трогается; строки играются по очереди. Какая строка тише остальных — то состояние и приглушает. Каждая строка готовит своё состояние САМА (закрыть / открыть
// микрофон, тип сессии, дорожка) и играет звук; getUserMedia зовётся первым делом, пока жив жест нажатия. Зависимости подставляются (тесты без браузера). Итог строки — в журнале игры «[audio] стенд громкости: …».
import { peekGameMic, openGameMic, closeGameMic } from './gameMic.js'
import { getGameCtx, unlockGameCtx } from './gameAudioCtx.js'
import { playGameBuffer } from './gameBufferPlay.js'
import { createAudioSession } from './speech/speechAudioSession.js'
import { testToneBuffer, toneSamples, wavUrlOf } from './gameVolumeNudge.js'
import { pLog } from './debug.js'

export const LAB_ROWS = [
  { id: 'A', title: 'Микрофон закрыт, обычная сессия — эталон', mic: false, session: 'auto' },
  { id: 'B', title: 'Микрофон открыт, сессия «авто»', mic: true, session: 'auto' },
  { id: 'C', title: 'Микрофон открыт, «запись+воспроизведение» (как в игре)', mic: true, session: 'play-and-record' },
  { id: 'D', title: 'Как C, но дорожка микрофона выключена (как при речи Пита)', mic: true, session: 'play-and-record', muteTrack: true },
  { id: 'E', title: 'Как C, но перед звуком «playback на миг»', mic: true, session: 'play-and-record', flip: true },
  { id: 'F', title: 'Как C, но звук через элемент <audio>, не Web Audio', mic: true, session: 'play-and-record', element: true },
  { id: 'G', title: 'Микрофон открыт, сессия «playback» (микрофон может заглушиться)', mic: true, session: 'playback' },
]

const nap = ms => new Promise(r => setTimeout(r, ms))

/** Одна строка стенда. → { id, ok, steps: [строки], ms }; ничего не бросает */
export async function playLabRow(id, deps = {}) {
  const row = LAB_ROWS.find(r => r.id === id)
  if (!row) return { id, ok: false, steps: ['нет такой строки'], ms: 0 }
  const d = { closeMic: closeGameMic, openMic: openGameMic, mic: peekGameMic, unlock: unlockGameCtx, ctx: getGameCtx, play: b => playGameBuffer(b), session: createAudioSession(), audio: url => new globalThis.Audio(url), sleep: nap, log: pLog, ...deps }
  const steps = [], t0 = performance.now()
  let ok = false
  const live = () => (d.mic()?.getAudioTracks?.() ?? []).some(t => t.readyState === 'live')
  try {
    d.unlock?.()
    if (!row.mic) { if (d.mic()) { d.closeMic(); steps.push('микрофон закрыт') } else steps.push('микрофон и так закрыт') }
    else if (!live()) { const r = await d.openMic(); steps.push(`микрофон открыт: ${r}`); if (r !== 'granted') throw new Error(`микрофон не открылся (${r})`) }
    else steps.push('микрофон уже открыт')
    if (d.session.supported()) { const was = d.session.current(); d.session.set(row.session); steps.push(`сессия ${was}→${row.session}`) } else steps.push('audioSession: нет API')
    await d.sleep(600) // маршрут и громкость успокаиваются
    const tracks = d.mic()?.getAudioTracks?.() ?? []
    const wasOn = tracks.map(t => t.enabled)
    if (row.muteTrack) { tracks.forEach(t => { t.enabled = false }); steps.push('дорожка микрофона выключена') }
    if (row.flip) { d.session.set('playback'); await d.sleep(150); d.session.set('play-and-record'); await d.sleep(300); steps.push('playback на 150 мс и назад') }
    const pit = d.sound ?? null // озвучка Пита вместо тона
    if (row.element) {
      const a = d.audio(pit?.url ?? wavUrlOf(toneSamples(22050), 22050))
      await Promise.resolve(a.play()); steps.push(`играет <audio> (${pit?.url ? 'голос Пита' : 'тон'})`); ok = true
    } else {
      const buf = pit?.buffer ?? testToneBuffer(d.ctx())
      ok = !!buf && d.play(buf)
      steps.push(ok ? `играет Web Audio (${pit?.buffer ? 'голос Пита' : 'тон'}, ctx ${d.ctx()?.state})` : 'звук не запустился')
    }
    await d.sleep(pit?.buffer?.duration ? Math.round(pit.buffer.duration * 1000) + 300 : 1700)
    if (row.muteTrack) tracks.forEach((t, i) => { t.enabled = wasOn[i] })
    if (row.session !== 'play-and-record' && row.mic) { d.session.set('play-and-record'); steps.push('сессия возвращена: play-and-record') }
  } catch (e) { steps.push(`ошибка: ${e?.message ?? e}`) }
  const res = { id, ok, steps, ms: Math.round(performance.now() - t0) }
  try { d.log(`[audio] стенд громкости: строка ${id} (${row.title}) — ${ok ? 'сыграно' : 'не вышло'}; ${steps.join('; ')}`) } catch { /* журнал не мешает */ }
  return res
}

/** Оценки человека → строка журнала: «A=норм B=тихо …» */
export function ratingsLine(ratings) {
  return LAB_ROWS.map(r => `${r.id}=${ratings[r.id] ?? '—'}`).join(' ')
}
