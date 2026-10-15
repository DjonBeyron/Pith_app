import { taskGrammar, taskExpectedPhrases, checkSpeechAnswer, taskNeedsMic } from '../../scene/v2/sceneTaskVoice.js'
import { PASS_RATIO } from '../../../shared/lib/speech/speechMatch.js'
import { sayPermission } from '../../../shared/lib/speech/sayPermission.js'

// Тонкий адаптер голосовых заданий сцены ('say' «Ответь коту», 'repeat' «Повтори за диктором») к модулю «Сказать фразу»:
// вся проводка к ядру сцены (sceneTaskVoice.js) — здесь, остальные файлы ленты берут отсюда.
// Хук useSayPhrase и распознаватель (Vosk / системное) принимают «данные шага» вида readSayData: их собирает voiceSayData —
// грамматика Vosk из taskGrammar, ПРОВЕРКА — своя (data.judge → checkSpeechAnswer, см. judgeRun в sayResult.js).
export { taskNeedsMic, taskExpectedPhrases }

const LANG = 'en-US'
const clean = list => (Array.isArray(list) ? list : []).map(h => String(h ?? '').replace(/\[unk\]/gi, ' ').replace(/\s+/g, ' ').trim())

// Вердикт в форме judgeRun (sayFlow / sayReply / админская диагностика читают те же поля) + best — эталон для показа
export function voiceVerdict(task, line, hyps) {
  const alts = clean(hyps)
  const r = checkSpeechAnswer(task, line, alts)
  const heard = alts[0] ?? ''
  return {
    passed: !!r.ok, ratio: r.score ?? 0, ratioPct: Math.round((r.score ?? 0) * 100), matched: r.matched ?? [], missed: r.missingKeys ?? [],
    items: [], extra: [], heard, text: heard, index: heard ? 0 : -1, consensus: false, engineFixed: [], best: r.best ?? null,
  }
}

/** Данные для useSayPhrase: info — feedTaskOf (task, line). open — словаря нет (у «say» только ключевые слова): Vosk не берём, системное распознавание */
export function voiceSayData(info) {
  const { task, line } = info
  const grammar = taskGrammar(task, line)
  return {
    phrase: grammar[0] ?? '', grammar, open: grammar.length === 0, pattern: '', translation: '', keywords: [],
    threshold: Math.round((task.passRatio ?? PASS_RATIO) * 100), passRatio: task.passRatio ?? PASS_RATIO, lang: LANG,
    listenAudio: false, strict: false, voiceReply: false, hintsOn: false, hintSilence: '', hintMismatch: '', hintPartial: '',
    judge: alts => voiceVerdict(task, line, alts),
  }
}

/** Почему голосовое задание нельзя показать: 'browser' (Firefox) | 'unsupported' (нет распознавания) | 'cant_speak' | 'denied' | null — можно */
export const voiceTaskBlockReason = (perm = sayPermission) => {
  const d = perm.decide()
  return d.action === 'fallback' ? (d.reason ?? 'unsupported') : null
}

/** Голосовое задание можно показывать: микрофон допустим (не Firefox, есть распознавание, не отказали, не «не могу говорить»). Иначе панель тихо пропускается */
export const voiceTaskAvailable = (perm = sayPermission) => voiceTaskBlockReason(perm) === null
