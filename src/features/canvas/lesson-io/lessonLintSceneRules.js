import { isSolo, PIT } from '../../scene/v2/scenePit.js'
import { LIMITS } from '../../scene/v2/sceneConstants.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'

// Правила группы «Сцены» (S1–S4, S7, S8) для lintLesson — только про уроки-слова (план Б2 в PROJECT.md).
// Формат ноды — обмен урока: { ref, seq, type, data: { scene, mode, … }, triggers }.
// Урок-слово = заголовок урока — слово латиницей (как is_word_lesson в БД, wordKey); Старт и Финал
// модуля («Старт», «Финал» — не латиница) правила не затрагивают. В файле урока другого признака нет:
// без заголовка (opts.title не передан) S1/S2 мягкие (предупреждение), остальное — как у слова.
// Уроки без единой сцены не трогаем: сцены в уроке по желанию, правила про них — когда они есть.
//  · [R-scene-open]    S1: первая и последняя сцены — кружок Пита (mode circle, один кот a без b);
//  · [R-scene-count]   S2: 2–4 сцены; две подряд (рядом по seq или прямым переходом) нельзя;
//  · [R-scene-word]    S3: целевое слово (заголовок) есть в тексте каждой сцены (предупреждение);
//  · [R-scene-lines]   S4: 2–6 реплик в сцене (в кружке Пита ровно 2: формат без task пропускает меньше двух), ≤ 12 слов в реплике;
//  · [R-scene-task]    S7: у сцены урока нет task (плеер урока задания не играет);
//  · [R-scene-middle]  S7: сцены между кружками — диалог двух котов, mode bubble;
//  · [R-scene-voice]   S8: audioUrl без audioMeta — озвучку выдумали (предупреждение). Реплики БЕЗ
//                      audioUrl — норма, это needsVoice (sceneVoiceNeeds ниже, шлюз выводит списком).

export const MAX_WORDS = 12
const err = (ref, code, text) => `[${code}] ${ref} (scene): ошибка — ${text}`
const warn = (ref, code, text) => `[${code}] ${ref} (scene): предупреждение — ${text}`

const linesOf = n => (Array.isArray(n.data?.scene?.timeline) ? n.data.scene.timeline : [])
// Служебные слова (to, the, with…) в репликах сцены не требуем: звучат неестественно, когда их вставляют ради линтера
const FUNCTION_WORDS = new Set(['to', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'of', 'with', 'by', 'from', 'and', 'or', 'but', 'is', 'am', 'are'])
const wordsIn = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length
const isPitCircle = n => (n.data?.mode) === 'circle' && isSolo(n.data?.scene)

// Корень слова для простого поиска форм: try / trying → «tr» (tries, tried), make → «mak»
const stemOf = w => (w.length >= 3 ? w.replace(/(ing|ed|es|s)$/, m => (w.length - m.length >= 2 ? '' : m)).replace(/[ey]$/, '') : w)
function wordInText(title, text) {
  const t = text.toLowerCase()
  return title.split(/[\s-]+/).filter(w => w.length >= 2).some(w => t.includes(stemOf(w)))
}

/** Сцены урока по порядку seq */
function scenesOf(nodes) {
  return [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

/** Реплики сцен без audioUrl: [{ ref, lines }] — шлюз выводит их как «нужно озвучить» (S8) */
export function sceneVoiceNeeds(nodes) {
  return (nodes ?? []).filter(n => n.type === 'scene').map(n => ({
    ref: n.ref, lines: linesOf(n).filter(l => l && !l.audioUrl).length,
  })).filter(x => x.lines)
}

export function checkSceneRules(nodes, { title } = {}) {
  const out = []
  const ordered = scenesOf(nodes ?? [])
  const scenes = ordered.filter(n => n.type === 'scene')
  if (!scenes.length) return out
  const known = typeof title === 'string' && title.trim() !== ''
  const word = known ? wordKey(title) : null
  if (known && !word) return out // Старт / Финал — сцены правилами не затрагиваем
  const hard = known // S1/S2: ошибка у урока-слова, предупреждение, пока заголовок неизвестен
  const flag = hard ? err : warn
  const first = scenes[0], last = scenes[scenes.length - 1]

  // S1
  if (!isPitCircle(first)) out.push(flag(first.ref, 'R-scene-open', 'S1: первая сцена урока — кружок Пита (mode "circle", один кот a без b)'))
  if (!isPitCircle(last)) out.push(flag(last.ref, 'R-scene-open', 'S1: последняя сцена урока — кружок Пита (mode "circle", один кот a без b)'))
  for (const n of new Set([first, last])) {
    const nm = n.data?.scene?.characters?.a?.name
    if (isPitCircle(n) && nm && nm !== PIT.name) out.push(warn(n.ref, 'R-scene-open', `S1: кот в кружке — «${PIT.name}», а не «${nm}»`))
  }

  // S2
  if (scenes.length < 2 || scenes.length > 4) out.push(flag(last.ref, 'R-scene-count', `S2: в уроке-слове 2–4 сцены (открывающая и закрывающая считаются), сейчас ${scenes.length}`))
  const isScene = new Set(scenes.map(n => n.ref))
  const adjacent = new Set()
  ordered.forEach((n, i) => { if (isScene.has(n.ref) && isScene.has(ordered[i + 1]?.ref)) adjacent.add(`${n.ref}→${ordered[i + 1].ref}`) })
  for (const n of scenes) for (const t of n.triggers ?? []) if (t.then && isScene.has(t.then)) adjacent.add(`${n.ref}→${t.then}`)
  if (adjacent.size) out.push(flag([...adjacent][0].split('→')[0], 'R-scene-count', `S2: две сцены подряд (${[...adjacent].join(', ')}) — между ними нужны другие ноды`))

  for (const n of scenes) {
    const tl = linesOf(n)
    // S3
    if (word && !FUNCTION_WORDS.has(String(title).trim().toLowerCase())) {
      const all = tl.map(l => `${l?.text ?? ''} ${l?.translation ?? ''}`).join(' ')
      if (!wordInText(word, all)) out.push(warn(n.ref, 'R-scene-word', `S3: целевое слово «${title.trim()}» не звучит ни в одной реплике сцены`))
    }
    // S4
    const [min, max] = isPitCircle(n) ? [LIMITS.minLines, 2] : [LIMITS.minLines, 6]
    if (tl.length < min || tl.length > max) out.push(err(n.ref, 'R-scene-lines', `S4: реплик ${tl.length} — в ${isPitCircle(n) ? 'кружке Пита ровно 2' : 'сцене 2–6'}`))
    tl.forEach((l, i) => {
      const w = wordsIn(l?.text)
      if (w > MAX_WORDS) out.push(err(n.ref, 'R-scene-lines', `S4: реплика ${i + 1} — ${w} слов, максимум ${MAX_WORDS}`))
    })
    // S7
    if (n.data?.scene?.task) out.push(err(n.ref, 'R-scene-task', 'S7: у сцены урока нет task — плеер урока задания не играет'))
    if (n !== first && n !== last) {
      const mode = n.data?.mode ?? 'bubble'
      if (mode !== 'bubble' || isSolo(n.data?.scene)) out.push(err(n.ref, 'R-scene-middle', 'S7: сцена в середине урока — диалог двух котов (a и b) в mode "bubble"'))
    }
    // S8
    const fake = tl.filter(l => l?.audioUrl && !l.audioMeta?.hash).length
    if (fake) out.push(warn(n.ref, 'R-scene-voice', `S8: у ${fake} реплик audioUrl без audioMeta — озвучку не выдумывают, убери: её ставит сборщик`))
  }
  return out
}
