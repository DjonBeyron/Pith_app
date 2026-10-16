import { resolveSceneNode } from '../../scene/v2/sceneNode.js'
import { usesVars } from '../../scene/v2/sceneVars.js'
import { tokenizeTemplate } from '../../scene/v2/sceneVarsTokens.js'
import { isSolo } from '../../scene/v2/scenePit.js'
import { sceneVoiceStats } from '../../scene/v2/sceneVoice.js'
import { isObj } from '../../scene/v2/sceneConstants.js'
import { sceneCheck } from '../scenePickerModel.js'
import { fromCanvasNodes } from '../lesson-io/lessonLint.js'
import { checkSceneRules } from '../lesson-io/lessonLintSceneRules.js'
import { PICK_LEVELS } from '../../admin/scenes/varsOps.js'

// Чистая логика вкладки «Сцены» канваса (SceneTabPanel): список нод `scene` урока по порядку
// seq и сводка. Без React и без запросов. «Привязана к уроку» = нода type 'scene' в нодах
// канваса (typeData.scene.scene — снимок сцены). Динамичная = в сцене есть vars («Слова
// пользователя»), статичная = обычная сцена с заготовленными фразами.
// Тяжёлое (разбор + линтер сцены) считается один раз на объект typeData.scene и кэшируется
// WeakMap-ом по объекту typeData.scene ноды (любая правка ноды даёт новый объект): правка соседней ноды или сдвиг ноды по холсту не пересчитывают остальные строки.

const PICK_SHORT = { weak: 'новые', due: 'пора повторить', known: 'знакомые+' }
const PREVIEW_LINES = 2
const cache = new WeakMap() // typeData.scene (объект ноды) -> base

function linePreview(raw, l, dynamic) {
  const who = l?.who === 'b' ? 'b' : 'a'
  const name = raw.characters?.[who]?.name ?? (who === 'b' ? 'Кот Б' : 'Кот А')
  const text = typeof l?.text === 'string' ? l.text : ''
  const fb = name2 => raw.vars?.[name2]?.fallback?.text ?? ''
  const parts = dynamic
    ? tokenizeTemplate(text).map(t => (t.name ? { slot: t.name, word: fb(t.name) } : { text: t.lit ?? t.stray ?? '' }))
    : [{ text }]
  return { who, name, parts }
}

function voiceOf(raw) {
  const st = sceneVoiceStats(raw)
  const stale = st.stale + st.translation.stale
  if (!st.total) return { kind: 'none', text: 'нет озвучки', ready: 0, total: 0 }
  if (stale) return { kind: 'stale', text: 'озвучка устарела', ready: st.ready, total: st.total }
  if (!st.ready) return { kind: 'none', text: 'нет озвучки', ready: 0, total: st.total }
  return { kind: st.ready >= st.total ? 'ok' : 'part', text: `озвучено ${st.ready} из ${st.total}`, ready: st.ready, total: st.total }
}

function varsOf(raw) {
  return Object.entries(raw.vars).map(([name, v]) => ({
    name, pick: v?.pick, pickText: PICK_SHORT[v?.pick] ?? String(v?.pick ?? ''),
    levels: PICK_LEVELS[v?.pick] ?? [], fallback: v?.fallback?.text ?? '',
  }))
}

// База строки по typeData ноды: всё, что зависит только от самой сцены и настроек ноды
export function sceneBase(td) {
  const hit = isObj(td) ? cache.get(td) : null
  if (hit) return hit
  const base = computeBase(td, isObj(td?.scene) ? td.scene : null)
  if (isObj(td)) cache.set(td, base)
  return base
}

function computeBase(td, raw) {
  const mode = td?.mode === 'circle' ? 'circle' : 'bubble'
  const common = { mode, start: td?.start === 'manual' ? 'manual' : 'auto', sceneId: td?.sceneId ?? null }
  if (!raw) return { ...common, state: 'empty', kind: null, title: '', errors: [], warns: [], lines: [], lineCount: 0, vars: [], solo: false, voice: null, preview: null }
  const resolved = resolveSceneNode(td)
  const check = sceneCheck(raw)
  const dynamic = usesVars(raw)
  const tl = Array.isArray(raw.timeline) ? raw.timeline : []
  const broken = !resolved.scene
  return {
    ...common,
    state: broken ? 'broken' : 'ok',
    kind: dynamic ? 'dynamic' : 'static',
    title: (typeof raw.title === 'string' && raw.title.trim()) || 'Без названия',
    errors: broken ? [...resolved.errors, ...check.errors] : check.errors,
    warns: check.warns,
    lineCount: tl.length,
    lines: tl.slice(0, PREVIEW_LINES).filter(isObj).map(l => linePreview(raw, l, dynamic)),
    vars: dynamic ? varsOf(raw) : [],
    solo: isSolo(raw),
    voice: voiceOf(raw),
    preview: resolved.scene,
  }
}

// «[R-scene-open] <ref> (scene): ошибка — S1: …» → { level, code, ref, text }
const RULE_RE = /^\[(R-[\w-]+)\] (\S+) \(scene\): (ошибка|предупреждение) — (.*)$/s
export function parseRuleLine(s) {
  const m = RULE_RE.exec(s)
  return m ? { code: m[1], ref: m[2], level: m[3] === 'ошибка' ? 'error' : 'warn', text: m[4] } : null
}

// Нарушения правил S1–S8 по нодам урока (канвасный формат) — только для уроков-слов
// (правила сами пропускают «Старт»/«Финал»); без заголовка — мягкие предупреждения
export function sceneRuleIssues(nodes, title) {
  if (!(nodes ?? []).some(n => n.type === 'scene')) return []
  return checkSceneRules(fromCanvasNodes(nodes), { title }).map(parseRuleLine).filter(Boolean)
}

const num = n => (typeof n === 'number' ? n : 0)

// Строки вкладки + сводка. rows[i] = { id, seq, base, issues } (issues — нарушения правил для этой ноды)
export function buildSceneRows(nodes, { title } = {}) {
  const list = (Array.isArray(nodes) ? nodes : []).filter(n => n?.type === 'scene').sort((a, b) => num(a.seq) - num(b.seq))
  const seqOf = new Map(list.map(n => [n.id, n.seq]))
  const issues = sceneRuleIssues(nodes, title).map(i => ({ ...i, seq: seqOf.get(i.ref) ?? null }))
    .sort((a, b) => num(a.seq) - num(b.seq))
  const rows = list.map(n => ({
    id: n.id, seq: n.seq, base: sceneBase(n.typeData?.scene),
    issues: issues.filter(i => i.ref === n.id),
  }))
  const dynamic = rows.filter(r => r.base.kind === 'dynamic').length
  const withErr = rows.filter(r => r.base.errors.length || r.issues.some(i => i.level === 'error') || r.base.state !== 'ok').length
  const withWarn = rows.filter(r => !r.base.errors.length && (r.base.warns.length || r.issues.some(i => i.level === 'warn'))).length
  return {
    rows,
    issues,
    summary: {
      total: rows.length, dynamic, static: rows.filter(r => r.base.kind === 'static').length,
      empty: rows.filter(r => r.base.state === 'empty').length,
      withErr, withWarn,
      ruleErrors: issues.filter(i => i.level === 'error').length,
      ruleWarns: issues.filter(i => i.level === 'warn').length,
    },
  }
}

// Индикатор состояния строки: 'err' | 'warn' | 'ok'
export function rowStatus(row) {
  if (row.base.state !== 'ok' || row.base.errors.length || row.issues.some(i => i.level === 'error')) return 'err'
  return row.base.warns.length || row.issues.length ? 'warn' : 'ok'
}
