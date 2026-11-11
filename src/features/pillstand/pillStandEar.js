// Состояние панели «что слышит Vosk» стенда пилюль (CONCEPT_PILLSTAND.md) из событий трассы: затвор, уровень, текущий черновик и история черновиков (мс от появления цели), итоги с «кто закрыл»,
// совпадение по кандидату (строки журнала слушателя фраз «… лучший «…» ratio …» / счёт слушателя слов), засчитанные слова по порядку, откаты, неверные слова и моменты: начало голоса → первый черновик,
// конец голоса → зачёт, слово → заливка дошла (событие 'reach' от standFillWatch.js). earStep(ear, ev) меняет ear на месте (панель рисует копию не чаще раза в 100 мс). Чистые функции.
import { VOICE_GAP_MS } from './pillStandHonesty.js'
import { isVoice } from './pillStandVoice.js'

export const KEEP = 40
export const STOP_TITLE = { endpoint: 'движок сам', manual: 'кнопка «Стоп»', auto: 'авто-стоп', full: 'все слова', max: 'потолок записи', ear: 'правило слова' }

export const emptyEar = () => ({ t0: 0, gate: null, rms: 0, voice: false, partial: '', final: '', partials: [], finals: [], ratio: null, best: '', words: [], backs: [], wrongs: [], reach: [], status: '', voiceStart: null, lastVoice: null, firstPartial: null, result: null, n: 0 })

const push = (list, item) => { list.push(item); if (list.length > KEEP) list.splice(0, list.length - KEEP) }
const RATIO = /лучший «([^»]*)» ratio ([\d.]+)/

/** Событие трассы → ear (на месте); возвращает true, если панель стоит перерисовать */
export function earStep(ear, e) {
  const rel = Math.round(e.t - ear.t0)
  switch (e.k) {
    case 'target': Object.assign(ear, emptyEar(), { t0: e.t, n: e.n, gate: ear.gate, status: ear.status }); return true
    case 'level': {
      ear.rms = e.rms
      const v = isVoice(e) // голос — по счётчику распознавания (метка куска)
      if (v) { ear.lastVoice = rel; if (ear.voiceStart == null) ear.voiceStart = rel }
      const r = ear.result
      if (r && r.endMs == null && ear.lastVoice != null && !v && rel - ear.lastVoice > VOICE_GAP_MS) { r.endMs = r.t - ear.lastVoice; ear.voice = v; return true } // голос после зачёта кончился: «от конца голоса» окончательно (отрицательное — зачёт раньше конца речи)
      const ch = v !== ear.voice
      ear.voice = v
      return ch
    }
    case 'gate': ear.gate = e.open; return true
    case 'vosk-partial': ear.partial = e.raw?.partial ?? ''; if (ear.partial) { push(ear.partials, { t: rel, text: ear.partial }); if (ear.firstPartial == null && ear.voiceStart != null) ear.firstPartial = rel } return true
    case 'vosk-final': ear.final = e.raw?.text ?? ''; ear.partial = ''; push(ear.finals, { t: rel, text: ear.final, by: STOP_TITLE[e.stopBy] ?? e.stopBy ?? '?', conf: (e.raw?.result ?? []).map(r => `${r.word} ${Math.round((r.conf ?? 0) * 100) / 100}`) }); return true
    case 'word': if (e.gone) push(ear.backs, { t: rel, index: e.index, text: e.text }); else if (!ear.words.some(w => w.index === e.index && !w.draft === !e.draft)) push(ear.words, { t: rel, index: e.index, text: e.text, draft: !!e.draft }); return true
    case 'listen': ear.status = e.status; if (e.seq?.length && !ear.words.length) push(ear.words, { t: rel, index: 0, text: e.heard || '?', draft: false }); ear.best = e.heard ?? ear.best; return true
    case 'phrase': ear.ratio = e.ratio; return true
    case 'reach': push(ear.reach, { word: e.word, ms: e.ms }); return true
    case 'result': ear.result = { ...e, t: rel }; return true
    case 'log': {
      const m = RATIO.exec(e.text)
      if (m) { ear.best = m[1]; ear.ratio = Number(m[2]); return true }
      const w = /неверное слово «([^»]*)», ждём «([^»]*)»/.exec(e.text)
      if (w) { push(ear.wrongs, { t: rel, word: w[1], expect: w[2] }); return true }
      return false
    }
    default: return false
  }
}

/** Задержки панели: { voiceToPartial, afterVoice } (мс или null) */
export const earTimes = ear => ({
  voiceToPartial: ear.firstPartial != null && ear.voiceStart != null ? ear.firstPartial - ear.voiceStart : null,
  afterVoice: ear.result?.endMs ?? ear.result?.afterVoiceMs ?? null,
})
