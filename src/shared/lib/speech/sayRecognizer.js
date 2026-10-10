// Распознаватель модуля «Сказать фразу»: два движка за ОДНИМ интерфейсом speechController (start / stop / reset / isAudioActive) — Vosk (основной, закрытый словарь, на устройстве)
// и системное распознавание (speechController, запасное, остаётся как есть). На каждой попытке движок выбирает чистая pickEngine по синхронному снимку voskRuntime: тап
// НИЧЕГО не ждёт — не готов Vosk, эта попытка идёт на системном, без сообщений ученику (единственное исключение — админский режим «Только Vosk»: waitVosk). Vosk упал посреди попытки → onFail помечает «не работает» на 1 минуту (voskRuntime), следующая
// попытка идёт на системном. Выбор и причина запоминаются для админа (sayEngineLast.js, строка в настройках модуля и серая плашка над панелью).
// Для админской диагностики в уроке попытка записывается в sayAttemptLast.js (движок, что услышали, тайминги, причина остановки). Все виды (view) обоих движков идут в один onView; runNo пронумерован здесь общим счётчиком (иначе у двух движков номера совпали бы, и sayFlow принял бы итог за уже обработанный).
// Уровень голоса: level(t) отдаёт RMS Vosk, пока идёт его попытка, иначе null — вызывающий берёт прежний источник (синтетический / реальный по флагу админа).
import { createVoskRecognizer } from '../vosk/voskRecognizer.js'
import { voskRuntime } from '../vosk/voskRuntime.js'
import { createRmsLevel } from '../vosk/sayVoskLevel.js'
import { pLog } from '../debug.js'
import { pickEngine, pickLabel } from './sayEnginePick.js'
import { readSayEngine } from './sayEngineMode.js'
import { setLastEngine } from './sayEngineLast.js'
import { sayAttemptLog } from './sayAttemptLast.js'
import { needsVoskWait, startVoskWait } from './sayVoskWait.js'

/**
 * createSystem(onView) → speechController с теми же настройками, что были у модуля (его создаёт хук); onView — общий приёмник видов.
 * getSession() — тип аудиосессии для Vosk (sayAudioSessionType: 'play-and-record' по умолчанию, null — админ выключил).
 */
export function createSayRecognizer({
  createSystem, onView, getSession = () => null, runtime = voskRuntime, getMode = readSayEngine, now = Date.now,
  createVosk = createVoskRecognizer, level = createRmsLevel(), record = setLastEngine, attempts = sayAttemptLog, log = msg => pLog(`[say-vosk] ${msg}`),
}) {
  let active = 'system'
  let run = 0
  // Вид чужого (не текущего) движка не пропускаем; сброс (idle) — всегда. Номер захода — общий
  const forward = name => v => {
    attempts.view(name, v) // админская диагностика: что было на последней попытке (sayAttemptLast.js)
    if (v.status === 'idle') { onView(v); return }
    if (name === active) onView({ ...v, runNo: run })
  }
  const system = createSystem(forward('system'))
  const vosk = createVosk({
    runtime, level, getSession, onView: forward('vosk'),
    onFail: (code, message) => runtime.markBroken(`${code}: ${message}`),
  })
  const engine = () => (active === 'vosk' ? vosk : system)

  /** Какой движок пойдёт на эту попытку и почему: { engine: 'vosk'|'system', reason }. Синхронно, без ожидания */
  const choose = data => pickEngine({ mode: getMode(), phrase: data?.phrase, ...runtime.snapshot(), now: now() })

  return {
    choose,
    /** Вызывать прямо в тапе. data — readSayData шага; pick — результат choose() (чтобы решение, показанное в панели, и запуск совпали) */
    start({ reference, lang, data, pick }) {
      const p = pick ?? choose(data)
      active = p.engine
      run++
      record(p, now())
      attempts.begin(p)
      log(`попытка ${run}: ${pickLabel(p)}`)
      if (p.engine === 'vosk') vosk.start({ reference, lang, data })
      else system.start({ reference, lang })
    },
    /** Панель смонтирована: прогреть Vosk (модель из кэша в память, фоном). Режим «Только системное» runtime читает сам (владелец считается, модель не грузится — смена режима потом сработает). Возвращает release() — звать при закрытии панели */
    warm: (why = 'panel') => runtime.acquire(why),
    /** Режим «Только Vosk» (админ) и Vosk не готов: НЕ идём на системное — прогреваем и ждём до 20 с, этап виден в плашке админа (onNote). null — ждать не нужно, пусть идёт обычная попытка. Возвращает cancel() */
    waitVosk: (data, onNote) => (needsVoskWait({ mode: getMode(), phrase: data?.phrase, snap: runtime.snapshot(), now: now() }) ? startVoskWait({ runtime, onNote, now }) : null),
    stop: () => { attempts.userStop(); engine().stop() },
    reset() { system.reset(); vosk.reset(); level.reset() },
    isAudioActive: () => engine().isAudioActive(),
    /** Уровень голоса 0..1 от Vosk, пока идёт его попытка; иначе null (тогда уровень даёт системный источник) */
    level: t => (active === 'vosk' && vosk.isRunning() ? level.read(t) : null),
  }
}
