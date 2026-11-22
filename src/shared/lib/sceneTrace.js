// Трасса сцены (CONCEPT_TIMELINE.md): структурные события прохождения игры — кто и когда заговорил, какая стадия началась, когда выехала пилюля и чем кончился ответ. Из них строится «Таймлайн игры» для админа
// (features/timeline): дорожки ведущих и паузы. Событие — { t (мс, performance.now), k (вид), …поля }. Каждое дублируется в журнал игры строкой «[scene] {json}» (pLog → gameJournal): трасса уходит в GitHub
// вместе с журналом, и таймлайн можно собрать из текста журнала (parseSceneLines). Запись дёшева и НИКОГДА не бросает: push в массив + одна строка журнала, без DOM, без await, без подписок — игра от неё не зависит.
// Прохождение (run) начинает begin(мета) на старте игры; хранятся последние SCENE_RUNS прохождений сеанса страницы. Событие без begin открывает прохождение само (auto) — ничего не теряется.
// Виды событий (k): run, stage-in, stage-out, line-start, line-end, ask, pill, claim, answer, note, count, count-end, wait, pause, resume, end — поля описаны в CONCEPT_TIMELINE.md.
import { pLog } from './debug.js'

export const SCENE_MAX = 6000   // потолок событий одного прохождения; старые вытесняются пачкой
export const SCENE_EVICT = 500
export const SCENE_RUNS = 3     // сколько последних прохождений держим
export const SCENE_TEXT_MAX = 240 // текст реплики в событии обрезается
const TAG = '[scene] '
const round1 = n => Math.round(n * 10) / 10
const cut = s => { const t = String(s ?? ''); return t.length > SCENE_TEXT_MAX ? `${t.slice(0, SCENE_TEXT_MAX)}…` : t }

export function createSceneTrace({ now = () => globalThis.performance?.now?.() ?? Date.now(), log = pLog, max = SCENE_MAX, evict = SCENE_EVICT, keep = SCENE_RUNS, clock = () => Date.now() } = {}) {
  let runs = []           // [{ id, at (время дня, мс), meta, events, dropped }]
  let seq = 0
  const texts = new Map() // id реплики Пита → текст, каким он прозвучит (кладёт useCatLines перед звуком)
  const miaIds = new Set() // id реплик Мии: её рот тоже сообщает cat-speak (тот же движок рта) — это не вторая реплика
  const open = (meta, auto) => {
    const run = { id: ++seq, at: clock(), meta: { ...meta, ...(auto ? { auto: true } : {}) }, events: [], dropped: 0 }
    runs.push(run); if (runs.length > keep) runs = runs.slice(-keep)
    return run
  }
  const put = (run, k, data) => {
    const ev = { t: round1(now()), k, ...data }
    run.events.push(ev)
    if (run.events.length > max) { const n = Math.min(run.events.length, run.events.length - max + evict); run.events.splice(0, n); run.dropped += n }
    log(TAG + JSON.stringify(ev))
    return ev
  }
  const api = {
    /** Новое прохождение. Повторный begin сразу за первым (ещё ни одного события) — то же прохождение, мета обновляется */
    begin(meta = {}) {
      try {
        const last = runs[runs.length - 1]
        if (last && !last.meta.auto && last.events.length <= 1) { last.meta = { ...meta }; return last.id }
        texts.clear()
        const run = open(meta, false); put(run, 'run', { run: run.id, ...meta }); return run.id
      } catch { return 0 }
    },
    /** Событие вида k с полями data → событие или null. Не бросает */
    push(k, data = {}) {
      try { if (k === 'line-start' && data.who === 'mia') miaIds.add(String(data.id)); return put(runs[runs.length - 1] ?? open({}, true), String(k), data) } catch { return null }
    },
    /** Текст реплики Пита id, каким он звучит (с правками админа и подстановками) — возьмёт line-start */
    hint(id, text) { try { if (id != null && text) { if (texts.size > 400) texts.clear(); texts.set(String(id), cut(text)) } } catch { /* трасса не мешает игре */ } },
    /** Рот Пита пошёл (cat-speak): реплика каталога (есть hint) — who 'pit' с текстом; иначе слово / перевод / фраза голосом Пита — who 'dictor' */
    speak(d = {}) {
      const id = d?.id == null ? '' : String(d.id), text = texts.get(id)
      if (miaIds.has(id)) return null // рот Мии: начало и конец её реплики пишет miaSpeech.js
      return api.push('line-start', text != null ? { who: 'pit', id, text, ms: d?.ms } : { who: 'dictor', id: cut(id), text: cut(id), ms: d?.ms })
    },
    /** Рот Пита закрылся (cat-speak-end): конец той же реплики */
    end(d = {}) { const id = d?.id == null ? '' : String(d.id); if (miaIds.has(id)) return null; return api.push('line-end', { id: texts.has(id) ? id : cut(id), played: d?.played, why: d?.why }) },
    /** Все прохождения сеанса (старые первыми): [{ id, at, meta, events, dropped }] */
    runs: () => runs.slice(),
    /** События последнего прохождения */
    events: () => runs[runs.length - 1]?.events ?? [],
    clear() { runs = []; texts.clear(); miaIds.clear() },
  }
  return api
}

/** Общая трасса страницы */
export const sceneTrace = createSceneTrace()
/** Короткая запись события для игрового кода: scenePush('вид', { … }) */
export const scenePush = (k, data) => sceneTrace.push(k, data)

/** Текст журнала (или массив строк) → события «[scene] {json}» по порядку. Битые строки пропускаются */
export function parseSceneLines(text) {
  const out = []
  for (const line of Array.isArray(text) ? text : String(text ?? '').split('\n')) {
    const i = line.indexOf(TAG); if (i < 0) continue
    try { const ev = JSON.parse(line.slice(i + TAG.length)); if (ev && typeof ev.t === 'number' && typeof ev.k === 'string') out.push(ev) } catch { /* обрезанная строка */ }
  }
  return out
}

/** События (из журнала) → прохождения: новое начинается на событии run. → [{ id, meta, events, dropped: 0 }] */
export function splitRuns(events) {
  const out = []
  for (const ev of events ?? []) {
    if (ev.k === 'run' || !out.length) { const { t: _t, k: _k, run, ...meta } = ev.k === 'run' ? ev : {}; out.push({ id: run ?? out.length + 1, meta: ev.k === 'run' ? meta : { auto: true }, events: [], dropped: 0 }) }
    out[out.length - 1].events.push(ev)
  }
  return out
}
