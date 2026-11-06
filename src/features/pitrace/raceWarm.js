// Прогрев «Встряхни память» ЗАРАНЕЕ — в жесте «Начать» (openAsk, raceLaunch.js), пока виден попап «Говорю / Тапаю» и пока ждём микрофон (CONCEPT_RACE.md, «Попап внутри игры»). Звука и микрофона здесь нет:
//  • игровой AudioContext создаётся и открывается в этом жесте (unlockGameCtx: resume + беззвучный буфер в 1 кадр) — к входу в игру он уже 'running', реплике остаётся только start() буфера;
//  • первыми скачиваются и ДЕКОДИРУЮТСЯ в память (prefetchWords: AudioBuffer) файлы, которые звучат первыми: race_start, реплика первого этапа, похвалы race_good_*, первые слова круга. Остальное греет карточка (wordLaneWarm.js);
//  • в журнал — «[warm] гонка: …»: когда начат прогрев, что декодировано и за сколько, а при входе в игру (entryReport) — что из этого уже в памяти. Чистая логика: зависимости подставляются (тесты).
import { unlockGameCtx, gameCtxState } from '../../shared/lib/gameAudioCtx.js'
import { prefetchWords, bufferOfUrl } from '../player/modules/rotate-phone/wordLaneFetch.js'
import { settledOf } from '../player/modules/rotate-phone/wordLaneSettled.js'
import { wordsPlan } from '../player/modules/rotate-phone/wordLaneStart.js'
import { lineKey } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { pLog } from '../../shared/lib/debug.js'
import { GOOD_IDS } from './raceGood.js'

export const WARM_FIRST_WORDS = 3 // сколько первых слов круга (переводы и куски) декодировать вместе с первыми репликами

const isLine = it => String(it?.key ?? '').startsWith('line:')
const short = key => String(key ?? '').replace(/^line:/, '')
const uniq = items => [...new Map(items.filter(i => i?.url).map(i => [i.url, i])).values()]

/** Что звучит первым: [{ key, url }] — первые реплики (race_start, реплика первого этапа), похвалы, первые WARM_FIRST_WORDS слов. Без озвучки (нет url) — не попадают */
export function raceWarmItems({ cfg, lines }) {
  const { now } = wordsPlan({ cfg, lines })
  const good = GOOD_IDS.filter(id => lines?.[id]?.url).map(id => ({ key: lineKey(id), url: lines[id].url }))
  return uniq([...now.filter(isLine), ...good, ...now.filter(it => !isLine(it)).slice(0, WARM_FIRST_WORDS)])
}

const decodedDefault = url => !!bufferOfUrl(url) || settledOf(url) === 'ok'

export function createRaceWarm({ unlock = unlockGameCtx, ctxState = gameCtxState, prefetch = prefetchWords, decoded = decodedDefault, log = pLog, now = () => performance.now() } = {}) {
  let items = []
  let t0 = null
  const say = text => { try { log(text) } catch { /* журнал не мешает игре */ } }
  return {
    /** Жест «Начать»: открыть контекст (без звука) и начать декодировать первые файлы. → промис «первые файлы обработаны» (не отклоняется) */
    start({ cfg, lines }) {
      const at = now()
      t0 = at
      try { items = raceWarmItems({ cfg, lines }) } catch { items = [] }
      let ctx
      try { ctx = Promise.resolve(unlock()) } catch { ctx = Promise.resolve(null) }
      say(`[warm] гонка: прогрев начат в «Начать» (без звука и микрофона), ctx=${ctxState() ?? 'нет'}; первыми декодирую ${items.length}: ${items.map(i => short(i.key)).join(', ') || '—'}`)
      ctx.then(st => say(`[warm] гонка: AudioContext открыт в жесте «Начать»: ${st ?? 'нет Web Audio'} через ${Math.round(now() - at)} мс`), () => {})
      return Promise.resolve(items.length ? prefetch(items) : undefined).catch(() => {}).then(() => {
        if (t0 !== at) return
        const miss = items.filter(i => !decoded(i.url)).map(i => short(i.key))
        say(`[warm] гонка: декодировано ${items.length - miss.length}/${items.length} за ${Math.round(now() - at)} мс${miss.length ? `; нет в памяти: ${miss.join(', ')}` : ''}`)
      })
    },
    /** Вход в игру: что из первых файлов уже в памяти (строка в журнал). → { ok, total, start } (start — декодирован ли race_start; null — его нет в списке) */
    entryReport() {
      const st = items.find(i => i.key === lineKey('race_start'))
      const r = { ok: items.filter(i => decoded(i.url)).length, total: items.length, start: st ? decoded(st.url) : null }
      say(`[warm] гонка: вход в игру — в памяти ${r.ok}/${r.total}${st ? `, race_start ${r.start ? 'декодирован' : 'НЕ декодирован'}` : ''}, ctx=${ctxState() ?? 'нет'}${t0 != null ? `, прогрев начат ${Math.round(now() - t0)} мс назад` : ', прогрева в «Начать» не было'}`)
      return r
    },
    items: () => items.slice(),
  }
}

export const raceWarm = createRaceWarm()
