import { isObj } from './sceneConstants.js'
import { tokenizeTemplate, placeholdersOf, fillTemplate } from './sceneVarsTokens.js'
import { templateSegments } from './sceneVarsSegments.js'
import { wordSegment } from './sceneWordSegments.js'

export { tokenizeTemplate, placeholdersOf, fillTemplate }

// Слова пользователя в сцене (vars; «Слова пользователя» в сборщике) — шаблон сцены под слова из памяти. Чистая логика без UI.
//
// vars: { [name]: { pick: 'weak' | 'due' | 'known', fallback: { text, translation? } } }
//   name — латиница/цифры/_, 1–16 символов; не больше 3 переменных на сцену;
//   pick — какие слова памяти подходят: weak (новые слова, уровень 1: step 1–2), due (пора повторить: просрочены),
//          known (знакомые и выше, уровни 2–4: step ≥ 3); fallback.text ≤ 40 — слово, когда у пользователя подходящего нет
//          и в режимах «просто показать» (админ, предпросмотр, лента без пользователя).
// Плейсхолдеры: {name} — слово (timeline[].text), {name:ru} — его перевод (timeline[].translation).
// Скобки: {{ и }} — литеральные { и } (только в сцене с vars; в обычной сцене текст не трогаем).
// Реплика-шаблон может хранить segments (озвучка по частям, шаг 4б; sceneVarsSegments.js): текст реплики всегда
// собирается из text-шаблона, а segments при подстановке пересобираются: {var} → сегмент-слово
// { text, word: true, audioUrl? } (аудио слова — из библиотеки word_audio, sceneWordSegments.js).

export const VAR_LIMITS = { maxVars: 3, maxName: 16, maxWord: 40, maxSegments: 12 }
export const VAR_PICKS = ['weak', 'due', 'known']
export const VAR_NAME_RE = /^[A-Za-z0-9_]{1,16}$/
// Озвучка/тайминги целой реплики (оригинал и перевод) — сбрасываются у реплик с подстановкой
const ORIGINAL_AUDIO = ['audioUrl', 'wordTimings', 'audioMeta']
const TRANSLATION_AUDIO = ['translationAudioUrl', 'translationWordTimings', 'translationAudioMeta']

export const usesVars = scene => isObj(scene) && isObj(scene.vars) && Object.keys(scene.vars).length > 0
export const sceneVarNames = scene => (usesVars(scene) ? Object.keys(scene.vars) : [])

// Значения «все fallback»: { name: { text, translation? } }
export function previewValues(scene) {
  const out = {}
  for (const name of sceneVarNames(scene)) {
    const fb = scene.vars[name]?.fallback
    if (isObj(fb) && typeof fb.text === 'string' && fb.text) {
      out[name] = { text: fb.text, ...(typeof fb.translation === 'string' && fb.translation ? { translation: fb.translation } : {}) }
    }
  }
  return out
}

// Слово переменной: values[name] (непустой text) важнее fallback; нет ни того ни другого — null
function wordOf(scene, values, name) {
  const v = isObj(values) ? values[name] : null
  if (isObj(v) && typeof v.text === 'string' && v.text.trim()) return v
  return previewValues(scene)[name] ?? null
}

// Сцена, в которой плейсхолдеры заменены словами: values { name: { text, translation? } }, чего нет — из fallback.
// Возвращает НОВУЮ сцену без vars; сцена без vars — та же ссылка. Реплика, чей text/translation изменился,
// теряет озвучку целой реплики (audio*/translationAudio*): записанное под шаблон не подходит к новому слову.
// У реплики с segments озвучка идёт по частям: сегменты пересобираются по тексту (озвучка текстовых частей
// сохраняется, пока текст части тот же), {var} становится сегментом-словом с аудио из opts.wordAudio.
// opts.wordAudio — откуда брать аудио слов: Map/объект key → запись word_audio ({ url, duration }) либо функция;
// не задано — кэш библиотеки (wordAudioLookup, регистрирует wordAudioEnsure), null — слова без аудио («просто показать»).
// Неизвестная переменная и нет слова ({name} без vars) остаётся в тексте как есть.
// {name:ru} без перевода слова даёт само слово. Старые вызовы fillSceneVars(scene, values) работают как раньше.
export function fillSceneVars(scene, values = {}, opts = {}) {
  if (!usesVars(scene)) return scene
  const { vars: _vars, ...rest } = scene
  const pick = (name, ru) => {
    const w = wordOf(scene, values, name)
    return w ? (ru && w.translation ? w.translation : w.text.trim()) : null
  }
  const timeline = Array.isArray(scene.timeline) ? scene.timeline.map(l => {
    if (!isObj(l)) return l
    const { segments, ...line } = l
    const text = typeof l.text === 'string' ? fillTemplate(l.text, (n) => pick(n, false)) : l.text
    const tr = typeof l.translation === 'string' ? fillTemplate(l.translation, pick) : l.translation
    const out = { ...line, text }
    if (tr !== undefined) out.translation = tr
    if (segments !== undefined || text !== l.text) for (const k of ORIGINAL_AUDIO) delete out[k]
    if (tr !== l.translation) for (const k of TRANSLATION_AUDIO) delete out[k]
    if (Array.isArray(segments) && typeof l.text === 'string') {
      out.segments = templateSegments(l).map(seg => {
        if (seg.var === undefined) return seg
        const w = pick(seg.var, false)
        return w === null ? { text: `{${seg.var}}` } : wordSegment(w, opts.wordAudio)
      })
    }
    return out
  }) : scene.timeline
  return { ...rest, timeline }
}

// Нормализация vars: мусорные записи отбрасываются, остальное остаётся (счёт и имена проверяет валидатор).
// Пусто — undefined (поля в сцене нет вовсе, старые сцены не меняются)
export function normalizeVars(vars) {
  if (!isObj(vars)) return undefined
  const out = {}
  for (const [name, v] of Object.entries(vars)) {
    if (!isObj(v) || !isObj(v.fallback)) continue
    const fallback = { text: typeof v.fallback.text === 'string' ? v.fallback.text.trim() : '' }
    if (typeof v.fallback.translation === 'string' && v.fallback.translation.trim()) fallback.translation = v.fallback.translation.trim()
    out[name] = { pick: VAR_PICKS.includes(v.pick) ? v.pick : 'weak', fallback }
  }
  return Object.keys(out).length ? out : undefined
}

// Сегменты озвучки реплики: [{ text?, word?, audioUrl?, wordTimings?, audioMeta? } | { var }] — берём только годные элементы
export function normalizeSegments(segments) {
  if (!Array.isArray(segments)) return undefined
  const out = segments.filter(isObj).map(s => {
    if (typeof s.var === 'string') return { var: s.var }
    const seg = {}
    if (typeof s.text === 'string') seg.text = s.text
    if (s.word === true) seg.word = true // сегмент-слово подставленной реплики (sceneWordSegments.js)
    if (typeof s.audioUrl === 'string' && s.audioUrl) seg.audioUrl = s.audioUrl
    if (Array.isArray(s.wordTimings) && s.wordTimings.length) seg.wordTimings = s.wordTimings
    if (isObj(s.audioMeta) && typeof s.audioMeta.hash === 'string') seg.audioMeta = s.audioMeta
    return seg
  })
  return out.length ? out : undefined
}
