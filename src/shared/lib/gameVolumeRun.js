// «Прогон громкости» (v3.3.204, просьба владельца: «тест сам запускает игру много раз, подсказывает, что нажать, спрашивает, что видел и слышал — соберём всё за раз, чтобы не гадать»).
// Одна итерация = короткая имитация старта игры на реальных модулях игры: тап «Голосом» (тип сессии → getUserMedia), микрофон закрыт по режиму 'close' (parkNow), вход в сцену (повторный begin), голос Пита
// играет через тот же вывод игры, окно речи gameMicHold на время реплики, потом повторное открытие микрофона. Конфигурация (режим микрофона × тип сессии) на экране НЕ показывается — оценка вслепую;
// она пишется в журнал. Итерации двух видов: 'listen' (громкость и хруст на слух, кнопки громкости НЕ трогаем — они сами «встряхивают» вывод) и 'icon' (в середине речи нажать ▲, посмотреть иконку, нажать ▼).
// Чистая логика: игровые модули и часы подставляются (тесты без браузера). Журнал: строки «[прогон] …» (pLog) + события audio-session / mic-hold, которые игровые модули пишут сами.
import { openGameMic, closeGameMic, shutGameMic, describeGameMic } from './gameMic.js'
import { unlockGameCtx, getGameCtx, peekGameCtx } from './gameAudioCtx.js'
import { playGameBuffer } from './gameBufferPlay.js'
import { gameAudioSession } from './gameMicSession.js'
import { gameMicHold } from './gameMicHold.js'
import { readAudioSessionMode, writeAudioSessionMode, readMicHoldMode, writeMicHoldMode } from './gameAudioSettings.js'
import { readNudgeMode, writeNudgeMode, testToneBuffer } from './gameVolumeNudge.js'
import { pLog } from './debug.js'

export const SETTLE_MS = 150     // как в игре: аудиосессия «укладывается» после открытия микрофона
export const PROMPT_AT_MS = 1000 // 'icon': столько мс после начала речи Пита просим нажать кнопку громкости
export const REOPEN_WAIT_MS = 900 // после конца речи ждём повторного открытия микрофона (режим 'close')

/** Конфигурации: mic:false — эталон (микрофон не открываем вовсе); hold — режим микрофона на речь Пита, sess — тип аудиосессии */
export const RUN_CONFIGS = [
  { id: 'N', title: 'эталон: микрофон не открывался', mic: false },
  { id: 'K', title: 'закрывать микрофон + запись/воспр.', hold: 'close', sess: 'play-and-record' },
  { id: 'D', title: 'выключать дорожку + запись/воспр. (как было)', hold: 'enabled-false', sess: 'play-and-record' },
  { id: 'KA', title: 'закрывать микрофон + сессия авто', hold: 'close', sess: 'auto' },
  { id: 'DA', title: 'выключать дорожку + сессия авто', hold: 'enabled-false', sess: 'auto' },
  { id: 'NA', title: 'не трогать + сессия авто', hold: 'none', sess: 'auto' },
]

/** Вопросы по видам итерации: [ключ, подпись, варианты] — ответ обязателен на каждый */
export const QUESTIONS = {
  listen: [['loud', 'Громкость Пита', ['тихо', 'норм', 'громко']], ['crack', 'Хруст в голосе', ['нет', 'есть']], ['tg', 'Сравнение с Telegram (то же начало Пита)', ['тише', 'так же', 'громче', 'не сравнивал']]],
  icon: [['icon', 'Иконка в полоске громкости', ['трубка', 'динамик', 'не успел']], ['jump', 'После нажатия стало громче?', ['да', 'нет', 'не заметил']]],
}

/** План: круг 1 — 'listen' в порядке списка, круг 2 — 'icon' в обратном (порядок не должен подыгрывать), дальше чередуются. → [{ n, of, cfg, mode }] */
export function buildPlan(configs = RUN_CONFIGS, rounds = 2) {
  const out = []
  for (let r = 0; r < rounds; r += 1) {
    const list = r % 2 === 0 ? configs : [...configs].reverse()
    list.forEach(cfg => out.push({ cfg, mode: r % 2 === 0 ? 'listen' : 'icon' }))
  }
  return out.map((it, i) => ({ ...it, n: i + 1, of: out.length }))
}

const nap = ms => new Promise(r => setTimeout(r, ms))
const typeNow = () => { try { return globalThis.navigator?.audioSession?.type ?? 'нет API' } catch { return 'нет API' } }

/** Снимок состояния звука и микрофона: тип сессии, контекст, поток (открыт / закрыт нами / нет), дорожки */
export function snapAudio(label, { mic = describeGameMic, ctx = peekGameCtx, type = typeNow } = {}) {
  let m = {}
  try { m = mic() } catch { /* без описания микрофона */ }
  const tr = (m.tracks ?? []).map(t => `${t.readyState}${t.enabled ? '' : '/выкл'}${t.muted ? '/muted' : ''}`).join(',') || '—'
  return { label, sess: type(), ctx: ctx()?.state ?? '—', mic: m.parked ? 'закрыт нами' : m.open ? 'открыт' : 'нет потока', tracks: tr }
}
export const snapText = s => `«${s.label}»: сессия=${s.sess} ctx=${s.ctx} микрофон=${s.mic} дорожки=${s.tracks}`

/** Одна итерация. buffer — AudioBuffer голоса Пита (нет — тон). → { ok, steps, snaps, ms }; ничего не бросает. Первым делом в нажатии: getUserMedia требует жест */
export async function runIteration(item, deps = {}) {
  const d = { unlock: unlockGameCtx, openMic: openGameMic, closeMic: closeGameMic, shutMic: shutGameMic, ses: gameAudioSession, hold: gameMicHold, play: b => playGameBuffer(b), ctx: getGameCtx, sleep: nap, snap: snapAudio, log: pLog, onPrompt: null, buffer: null, writeHold: writeMicHoldMode, writeSess: writeAudioSessionMode, writeNudge: writeNudgeMode, ...deps }
  const { cfg, mode, n, of } = item
  const tag = `#${n}/${of} (${cfg.id}, ${mode === 'icon' ? 'иконка' : 'слушаю'})`
  const steps = [], snaps = [], t0 = performance.now(), say = s => { steps.push(s); try { d.log(`[прогон] ${tag}: ${s}`) } catch { /* журнал не мешает */ } }
  let ok = false
  const snap = label => { const s = d.snap(label); snaps.push(s); say(`снимок ${snapText(s)}`) }
  try {
    d.unlock?.()
    d.writeNudge('off') // автовстряска громкости не должна подменять результат
    if (cfg.mic === false) { d.shutMic?.('прогон: эталон'); say('эталон: микрофон остановлен') } else { d.writeHold(cfg.hold); d.writeSess(cfg.sess); say(`режим микрофона=${cfg.hold}, сессия=${cfg.sess}`) }
    snap('до')
    if (cfg.mic !== false) {
      d.ses.begin() // тап «Голосом»: тип сессии → микрофон
      const r = await d.openMic()
      say(`микрофон: ${r}`)
      if (r !== 'granted') throw new Error(`микрофон не открылся (${r})`)
      if (cfg.hold === 'close') d.hold.parkNow()
      await d.sleep(SETTLE_MS)
      d.ses.begin() // сцена игры смонтирована (в игре это второй begin — см. v3.3.203)
    }
    const buf = d.buffer ?? testToneBuffer(d.ctx())
    const ms = Math.round((buf?.duration ?? 1.7) * 1000)
    const closeWin = cfg.mic === false ? () => {} : d.hold.holdFor(ms + 100)
    ok = !!buf && d.play(buf)
    say(ok ? `играет ${d.buffer ? 'голос Пита' : 'тон'} ${ms} мс` : 'звук не запустился')
    await d.sleep(mode === 'icon' ? PROMPT_AT_MS : 600)
    if (mode === 'icon') d.onPrompt?.()
    snap(mode === 'icon' ? 'в речи, момент нажатия' : 'в речи')
    await d.sleep(Math.max(0, ms - (mode === 'icon' ? PROMPT_AT_MS : 600)) + 200)
    closeWin()
    await d.sleep(REOPEN_WAIT_MS)
    snap('после речи')
  } catch (e) { say(`ошибка: ${e?.message ?? e}`) }
  try { d.hold.reset() } catch { /* уже сброшено */ }
  try { d.ses.end() } catch { /* уже закончена */ }
  try { d.closeMic() } catch { /* уже закрыт */ } // как пауза/конец игры: поток «жив, выключен»
  return { ok, steps, snaps, ms: Math.round(performance.now() - t0) }
}

/** Что было в настройках до прогона — вернуть после */
export const saveSettings = () => ({ hold: readMicHoldMode(), sess: readAudioSessionMode(), nudge: readNudgeMode() })
export function restoreSettings(s, deps = {}) {
  const d = { writeHold: writeMicHoldMode, writeSess: writeAudioSessionMode, writeNudge: writeNudgeMode, ...deps }
  d.writeHold(s.hold); d.writeSess(s.sess); d.writeNudge(s.nudge)
}

const noteOf = answers => (String(answers?.note ?? '').trim().replace(/\s+/g, ' '))
/** Ответы человека → строка журнала (комментарий — по желанию) */
export const answerLine = (item, answers) => `[прогон] #${item.n}/${item.of} (${item.cfg.id}, ${item.mode === 'icon' ? 'иконка' : 'слушаю'}) ответ: ${QUESTIONS[item.mode].map(([k, t]) => `${t}=${answers[k] ?? '—'}`).join('; ')}${noteOf(answers) ? `; комментарий: ${noteOf(answers)}` : ''}`

/** Итог текстом: таблица «конфигурация → что слышал / видел» + журнал прогона (строки журнала игры с начала прогона) */
export function summaryText({ results, header = [], journal = [] }) {
  const rows = results.map(r => `#${r.item.n} ${r.item.cfg.id.padEnd(2)} ${r.item.mode === 'icon' ? 'иконка ' : 'слушаю '}| ${QUESTIONS[r.item.mode].map(([k, t]) => `${t}: ${r.answers[k] ?? '—'}`).join(' | ')} ${noteOf(r.answers) ? ` | КОММЕНТАРИЙ: ${noteOf(r.answers)}` : ''} | ${r.item.cfg.title}${r.ok ? '' : ' | ЗВУК НЕ ИГРАЛ'}`)
  const keyRows = RUN_CONFIGS.map(c => `${c.id.padEnd(2)} = ${c.title}`)
  return [...header, '', 'Конфигурации:', ...keyRows, '', 'Ответы:', ...(rows.length ? rows : ['(нет ответов)']), '', 'Журнал прогона:', ...(journal.length ? journal : ['(пусто)'])].join('\n')
}
