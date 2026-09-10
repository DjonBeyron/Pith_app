import { pLog } from './debug.js'

// Почему звук успеха слышно не всегда — вопрос, на который «play() → OK» не
// отвечает: промис резолвится в момент СТАРТА, а дальше элемент может встать
// на паузу, оказаться заглушенным, доиграть за 0мс или не доиграть вовсе.
// Здесь на каждый запрос заводится карточка, и в неё дописывается всё, что с
// этим воспроизведением потом случилось.
//
// Отдельный файл, а не строчки в sounds.js: тот отвечает за «как проиграть на
// iOS», а это — за «что на самом деле прозвучало». Лог уезжает в отчёт
// дебага (debugReport.js), поэтому живёт в памяти, а не только в консоли.

const MAX = 200
const log = []
const t0 = typeof performance !== 'undefined' ? performance.now() : 0
const ms = () => Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0)

// Считаем «не прозвучало», если элемент не отдал ни одного playing-события
// или отыграл заметно меньше, чем длится сам файл
const SILENT_MS = 60

export function traceSoundRequest(name, audio, extra = {}) {
  const rec = {
    звук: name,
    время: ms(),
    ...extra,
    // Состояние ПЕРЕД запуском — половина ответов видна уже здесь
    готовность: audio?.readyState ?? null,   // 4 = можно играть до конца
    длительность: Number.isFinite(audio?.duration) ? +audio.duration.toFixed(2) : null,
    громкость: audio?.volume ?? null,
    заглушен: !!audio?.muted,
    // Перезапуск поверх ещё звучащего — частая причина «звук съело»
    перезапуск: audio ? !audio.paused : false,
    позиция: audio ? +(audio.currentTime ?? 0).toFixed(2) : null,
    вкладкаСкрыта: typeof document !== 'undefined' ? document.hidden : null,
    итог: 'ждём',
  }
  push(rec)

  if (audio) {
    const started = ms()
    const onPlaying = () => { rec.зазвучалЧерез = ms() - started }
    const onEnded   = () => {
      rec.доигралЗа = ms() - started
      // Длительность на момент запроса часто ещё неизвестна (readyState 0) —
      // дописываем её здесь, иначе в отчёте не с чем сравнивать
      if (rec.длительность == null && Number.isFinite(audio.duration)) {
        rec.длительность = +audio.duration.toFixed(2)
      }
      finish(rec)
      cleanup()
    }
    const onPause   = () => {
      // ВАЖНО: на нормальном конце файла Chrome шлёт 'pause' РАНЬШЕ 'ended'
      // (проверено: pause@1.71 → ended@1.71 на файле длиной 1.71с). Если
      // решать прямо здесь, каждый доигравший звук попадал бы в отчёт как
      // «оборван» — и это была бы не диагностика, а ложная тревога.
      // Поэтому даём кадр: если следом пришёл ended, это штатный финал.
      if (audio.ended) return
      setTimeout(() => {
        if (audio.ended) return
        if (rec.итог === 'ждём' || rec.итог === 'играет') {
          rec.оборванНа = +(audio.currentTime ?? 0).toFixed(2)
          rec.длительность = Number.isFinite(audio.duration) ? +audio.duration.toFixed(2) : rec.длительность
          rec.итог = 'ОБОРВАН'
          pLog(`[sound] ${name} ОБОРВАН на ${rec.оборванНа}с из ${rec.длительность ?? '?'}с — кто-то поставил паузу`)
          cleanup()
        }
      }, 0)
    }
    const cleanup = () => {
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
    }
    audio.addEventListener('playing', onPlaying, { once: true })
    audio.addEventListener('ended', onEnded, { once: true })
    audio.addEventListener('pause', onPause)
    // Файл короткий; если за 5с ничего не случилось — так и записываем
    setTimeout(() => { if (rec.итог === 'ждём' || rec.итог === 'играет') finish(rec); cleanup() }, 5000)
  }
  return rec
}

export function traceSoundStarted(rec) {
  if (rec && rec.итог === 'ждём') rec.итог = 'играет'
}

export function traceSoundFailed(rec, message) {
  if (!rec) return
  rec.итог = 'отказ'
  rec.причина = message
}

function finish(rec) {
  if (rec.итог === 'отказ' || rec.итог === 'ОБОРВАН') return
  const heard = rec.зазвучалЧерез != null
  const played = rec.доигралЗа ?? null
  if (!heard) {
    rec.итог = 'НЕ ПРОЗВУЧАЛ (не было playing)'
    pLog(`[sound] ${rec.звук} НЕ ПРОЗВУЧАЛ: событие playing не пришло`)
  } else if (played != null && played < SILENT_MS) {
    rec.итог = `НЕ ПРОЗВУЧАЛ (оборвался за ${played}мс)`
    pLog(`[sound] ${rec.звук} оборвался за ${played}мс — на слух это тишина`)
  } else {
    rec.итог = 'прозвучал'
  }
}

function push(rec) {
  log.push(rec)
  if (log.length > MAX) log.splice(0, log.length - MAX)
}

// Для отчёта дебага: весь лог + короткая сводка по каждому звуку
export function getSoundLog() {
  const byName = {}
  for (const r of log) {
    const b = byName[r.звук] ?? (byName[r.звук] = { запросов: 0, прозвучал: 0, проблем: 0 })
    b.запросов += 1
    if (r.итог === 'прозвучал') b.прозвучал += 1
    else if (r.итог !== 'играет' && r.итог !== 'ждём') b.проблем += 1
  }
  return { сводка: byName, запросы: log.slice() }
}
