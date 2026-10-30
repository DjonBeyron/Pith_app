// Один дубль акта 5 без React (useRehearsalTake — тонкая обёртка): запись голоса на потоке игры + слова слушателей игры → данные экрана зеркала. Проверяется тестами без микрофона.
//  begin(listener) — вход в стадию take: recordTake на ГОТОВОМ потоке игры (тот же MediaStream, что слушает Vosk: второго диалога разрешения и второго слушателя нет). Поток может прийти обещанием
//    (gameMic: микрофон открывался заново) — запись стартует, когда он готов. Нет потока / MediaRecorder / поток мёртв — recordTake не бросает, handle.ok === false, а stop() отклоняется err.code;
//  finish(listener) — дубль закончен: слушатели отдают итог последнего захода (flush — слова последней фразы приходят только с итогом), запись останавливается, слова слушателей (мс от start() каждого)
//    приводятся к шкале записи (takeWordsOf), считаются диктор, measure и note (buildMirror). Любой сбой записи (err.code: 'no-recorder' | 'dead-stream' | 'failed' | 'empty' | 'cancelled' | 'timeout' |
//    'no-record') → take = null: зеркало покажет полосу диктора и заметку о сбое (noteFor(null)). finish не бросает;
//  cancel() — вышли из игры или стадии до конца: запись отменяется.
import { recordTake } from './mirror/takeRecorder.js'
import { libraryRms } from './mirror/dictorFromLibrary.js'
import { makeMirrorDictor, takeWordsOf, buildMirror } from './rehearsalMirror.js'

export const TAKE_MAX_MS = 9000     // потолок записи дубля
export const STOP_WAIT_MS = 3000    // запись не отдала файл за это время — сбой 'timeout'
export const RMS_WAIT_MS = 1200     // громкость файлов диктора не посчиталась — заметки про громкость не будет

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Зависимости (record, loudness, dictorOf, now, log) подставляются в тестах */
export function createTake({ chunks, rate = 1, lang, getStream, record = recordTake, loudness = libraryRms, dictorOf = makeMirrorDictor, now = () => Date.now(), log = () => {} }) {
  const listeners = new Set()
  let rec = null
  let at = 0       // старт записи (мс по now())
  let over = false

  return {
    begin(listener = null) {
      if (listener) listeners.add(listener)
      const start = stream => {
        if (over || rec) return
        at = now()
        rec = record({ stream, maxMs: TAKE_MAX_MS, log })
        if (!rec.ok) log(`[rehearsal] запись дубля не началась: ${rec.error}`)
      }
      let mic = null
      try { mic = getStream() } catch { mic = null }
      if (mic?.then) mic.then(start, () => start(null)); else start(mic)
    },

    /** → { take (Take | null), error (код сбоя | null), words, mirror: { dictor, student, measure, note, tempo } } */
    async finish(listener = null) {
      if (listener) listeners.add(listener)
      const ls = [...listeners]
      await Promise.all(ls.map(l => Promise.resolve(l.flush?.()).catch(() => {})))
      let take = null
      let error = rec ? null : 'no-record'
      if (rec) {
        try { take = await Promise.race([rec.stop(), wait(STOP_WAIT_MS).then(() => { throw Object.assign(new Error('stop timeout'), { code: 'timeout' }) })]) } catch (e) { error = e?.code ?? 'failed' }
      }
      over = true
      const words = takeWordsOf(ls.map(l => ({ words: l.words(), startedAt: l.startedAt() })), at)
      const dictor = dictorOf({ chunks, rate, lang })
      const dictorRms = take ? await Promise.race([loudness(chunks), wait(RMS_WAIT_MS).then(() => null)]).catch(() => null) : null
      const mirror = buildMirror({ chunks, take, words, dictor, dictorRms })
      log(`[rehearsal] дубль: ${take ? `${take.durationMs} мс, rms ${Number(take.rms).toFixed(3)}` : `записи нет (${error})`}; слов Vosk ${words.length}; темп ${mirror.tempo ?? '—'}; заметка «${mirror.note.key}»`)
      return { take, error, words, mirror }
    },

    cancel() { over = true; try { rec?.cancel() } catch { /* уже остановлена */ } },
  }
}
