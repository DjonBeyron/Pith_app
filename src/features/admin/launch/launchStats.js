import { buildDecks } from '../../review/reviewDecks.js'
import { buildDeckReport } from '../deckReport.js'
import { wordLessonsOf } from '../../../shared/lib/memory/wordLessons.js'
import { THRESHOLDS as T, MIN_DIFFICULTY_VOTES, REQUIRED_PUSH } from './launchThresholds.js'
import { countRow, percentRow, boolRow, infoRow, noDataRow } from './launchRows.js'
import { gameMaterial } from './launchGames.js'

// Подсчёт вкладки «Запуск»: хватает ли наполнения, чтобы приложение жило для новичка.
// Чистый модуль (без React и supabase) — его зовут и вкладка админки, и scripts/launch-stats.mjs.
//
// buildLaunchStats({ curricula, lessonCards, wordAudio, pushTemplates, scenes, reasons }) → { rows, summary }
//   curricula     — строки curricula (loadCurricula) | null (не прочитались)
//   lessonCards   — [{ id, title, cards }] (listLessonCards) | null
//   wordAudio     — Map ключ → строка word_audio | массив строк { key, url } | null
//   pushTemplates — [{ trigger_kind, enabled }] | null (читает только админ)
//   scenes        — [{ id, status }] | null
//   reasons       — { curricula, lessonCards, ... } → почему источник не прочитался (в строку «нет данных»)
// Строка отчёта: { id, title, kind: 'count'|'percent'|'bool', have, need, missing, ok, status, why, items: [{ id, title, note? }], itemsLabel, hint, note }
// Сводка: { passed, total, unknown, ready, text }

const isLive = r => !!r.published && !r.preview_only && !r.is_pro // то, что видит новичок в ленте
const isFree = r => !!r.published && !r.is_pro // из таких модулей строятся колоды игр, повторения и памяти
const phraseItem = (r, note) => ({ id: r.id, title: r.title || r.id, ...(note && { note }) })

// Эффективная сложность — как в приложении: голоса при >= 5, иначе оценка админа (difficulty_admin), иначе неизвестна
const level = v => (v === 1 || v === 2 || v === 3 ? v : null)
export function launchDifficulty(r) {
  if (Number(r.difficulty_votes ?? 0) >= MIN_DIFFICULTY_VOTES && level(Number(r.difficulty))) return Number(r.difficulty)
  return level(Number(r.difficulty_admin ?? null)) // колонки может не быть — тогда null
}

// Строки, которым нужны фразы (и уроки): ключ порога → [id строки, вид]
const FEED_ROWS = [['feed', 'feed', 'count'], ['easy', 'diff_easy', 'count'], ['mid', 'diff_mid', 'count'], ['hard', 'diff_hard', 'count'],
  ['unset', 'diff_unset', 'count'], ['media', 'media', 'percent'], ['translations', 'translations', 'percent'], ['wordLessons', 'word_lessons', 'percent']]
const WORD_ROWS = [['decks', 'decks', 'count'], ['choose', 'game_choose', 'count'], ['fill', 'game_fill', 'count'],
  ['picture', 'game_picture', 'count'], ['audio', 'word_audio', 'percent']]
const noData = (defs, why) => defs.map(([k, id, kind]) => noDataRow(T[k], id, kind, why))

const hasTranslations = r => Array.isArray(r.word_translations) && r.word_translations.some(e => e?.w && String(e?.t ?? '').trim())

function audioKeys(wordAudio) {
  if (!wordAudio) return new Set()
  const rows = wordAudio instanceof Map ? [...wordAudio.values()] : wordAudio
  return new Set(rows.filter(x => x?.url).map(x => x.key))
}

// Статус ленточных строк по фразам (1–5)
function feedRows(rows, live, scenes, lessonCards, reasons) {
  const out = []
  const outside = rows.filter(r => !isLive(r))
  out.push(countRow(T.feed, 'feed', live.length, {
    hint: outside.length ? `Ещё ${outside.length} фраз лежат вне ленты (превью, черновики, Pro) — см. нижнюю строку «Не в ленте новичка».` : '',
  }))

  const byLevel = { 1: [], 2: [], 3: [], 0: [] }
  for (const r of live) byLevel[launchDifficulty(r) ?? 0].push(r)
  const unsetHint = byLevel[0].length ? `Проставьте сложность у ${byLevel[0].length} фраз без оценки — они пойдут в нужные ярусы.` : ''
  out.push(countRow(T.easy, 'diff_easy', byLevel[1].length, { hint: unsetHint }))
  out.push(countRow(T.mid, 'diff_mid', byLevel[2].length, { hint: unsetHint }))
  out.push(countRow(T.hard, 'diff_hard', byLevel[3].length, { hint: unsetHint }))
  out.push(countRow(T.unset, 'diff_unset', byLevel[0].length, {
    limit: 'max', itemsLabel: 'Проставьте сложность', items: byLevel[0].map(r => phraseItem(r, `голосов: ${r.difficulty_votes ?? 0}`)),
  }))

  const sceneStatus = scenes ? new Map(scenes.map(s => [s.id, s.status])) : null
  const mediaBad = live.filter(r => {
    if (r.video_url) return false
    if (!r.scene_id) return true
    return sceneStatus ? sceneStatus.get(r.scene_id) !== 'published' : false
  })
  out.push(percentRow(T.media, 'media', live.length - mediaBad.length, live.length, {
    itemsLabel: 'Нет видео и опубликованной сцены',
    items: mediaBad.map(r => phraseItem(r, r.scene_id ? 'сцена не опубликована или удалена' : 'ни видео, ни сцены')),
    note: scenes ? '' : `Сцены не прочитались${reasons.scenes ? ` (${reasons.scenes})` : ''}: фраза с scene_id считается готовой.`,
  }))

  const noTr = live.filter(r => !hasTranslations(r))
  out.push(percentRow(T.translations, 'translations', live.length - noTr.length, live.length, {
    itemsLabel: 'Без перевода слов', items: noTr.map(r => phraseItem(r)),
  }))

  if (lessonCards) {
    const withWord = new Set([...wordLessonsOf(live, lessonCards).values()].flatMap(list => list.map(x => x.module.id)))
    const noWord = live.filter(r => !withWord.has(r.id))
    out.push(percentRow(T.wordLessons, 'word_lessons', live.length - noWord.length, live.length, {
      itemsLabel: 'Нет урока-слова между Стартом и Финалом', items: noWord.map(r => phraseItem(r)),
    }))
  } else {
    out.push(...noData(FEED_ROWS.slice(-1), reasons.lessonCards || 'уроки не прочитались'))
  }
  return out
}

// Строки по словам и играм (6–8): колоды, материал игр, озвучка
function wordRows(free, lessonCards, wordAudio, reasons) {
  if (!lessonCards) return noData(WORD_ROWS, reasons.lessonCards || 'уроки не прочитались')
  const report = buildDeckReport(free, lessonCards)
  const decks = buildDecks(free, lessonCards)
  const phraseOf = w => report.find(x => x.word === w)?.lessons[0]?.moduleTitle ?? decks.get(w)?.phrase ?? ''
  const wordItem = (w, note) => {
    const text = [phraseOf(w) && `фраза «${phraseOf(w)}»`, note].filter(Boolean).join(' · ')
    return { id: w, title: w, ...(text && { note: text }) }
  }
  const out = []

  const okWords = report.filter(x => x.status === 'ok')
  out.push(countRow(T.decks, 'decks', okWords.length, {
    itemsLabel: 'Слова без полной колоды',
    items: report.filter(x => x.status !== 'ok').map(x => wordItem(x.word, x.status === 'none' ? 'колоды нет' : `мало карточек: ${x.cards}`)),
    note: `Всего слов-уроков: ${report.length}.`,
  }))

  const g = gameMaterial(decks)
  const lack = set => [...decks.keys()].filter(w => !set.has(w)).map(w => wordItem(w))
  out.push(countRow(T.choose, 'game_choose', g.choose.size, { itemsLabel: 'Слова без годной карточки', items: lack(g.choose) }))
  out.push(countRow(T.fill, 'game_fill', g.fill.voiced.size, {
    itemsLabel: 'Слова без озвученной реплики', items: lack(g.fill.voiced),
    note: `Озвученных реплик: ${g.fill.lines}; слов с репликой без звука/тайминга: ${g.fill.text.size - g.fill.voiced.size}.`,
  }))
  out.push(countRow(T.picture, 'game_picture', g.picture.size, { itemsLabel: 'Слова без карточки с картинками', items: lack(g.picture) }))

  if (wordAudio === null) {
    out.push(noDataRow(T.audio, 'word_audio', 'percent', reasons.wordAudio || 'озвучка не прочиталась'))
  } else {
    const have = audioKeys(wordAudio)
    const words = report.map(x => x.word)
    const missing = words.filter(w => !have.has(w))
    out.push(percentRow(T.audio, 'word_audio', words.length - missing.length, words.length, {
      itemsLabel: 'Слова без озвучки', items: missing.map(w => wordItem(w)),
    }))
  }
  return out
}

function pushRow(pushTemplates, reasons) {
  if (!pushTemplates) return noDataRow(T.push, 'push', 'bool', reasons.pushTemplates || 'шаблоны пушей читает только админ')
  const missing = Object.entries(REQUIRED_PUSH)
    .filter(([kind]) => !pushTemplates.some(p => p.trigger_kind === kind && p.enabled))
    .map(([kind, label]) => ({
      id: kind, title: label, note: pushTemplates.some(p => p.trigger_kind === kind) ? 'шаблон выключен' : 'шаблона нет',
    }))
  return boolRow(T.push, 'push', missing.length === 0, { items: missing, itemsLabel: 'Включите шаблон' })
}

const REASON = { draft: 'черновик', pro: 'Pro', preview: 'превью' }
const OUTSIDE = { title: 'Не в ленте новичка', why: 'Справочно: черновики, превью (без кнопки «Изучить») и Pro. Новичок их не видит.' }
function infoRows(rows, scenes, reasons) {
  const outside = rows?.filter(r => !isLive(r)).map(r => phraseItem(r, !r.published ? REASON.draft : r.is_pro ? REASON.pro : REASON.preview))
  return [
    scenes
      ? infoRow(T.scenes, 'scenes', scenes.filter(s => s.status === 'published').length, { note: `Всего сцен: ${scenes.length}.` })
      : infoRow(T.scenes, 'scenes', null, { note: reasons.scenes || 'сцены не прочитались' }),
    outside
      ? infoRow(OUTSIDE, 'outside', outside.length, { itemsLabel: 'Фразы вне ленты', items: outside })
      : infoRow(OUTSIDE, 'outside', null, { note: reasons.curricula || 'фразы не прочитались' }),
  ]
}

export function summarize(rows) {
  const cond = rows.filter(r => r.status !== 'info')
  const known = cond.filter(r => r.status !== 'nodata')
  const passed = known.filter(r => r.ok).length
  const unknown = cond.length - known.length
  const text = `Готово к запуску: ${passed} из ${known.length} условий${unknown ? ` (ещё ${unknown} без данных)` : ''}`
  return { passed, total: known.length, unknown, ready: known.length > 0 && passed === known.length && unknown === 0, text }
}

export function buildLaunchStats({ curricula = null, lessonCards = null, wordAudio = null, pushTemplates = null, scenes = null, reasons = {} } = {}) {
  const all = Array.isArray(curricula) ? curricula : null
  const rows = []
  if (all) {
    const live = all.filter(isLive)
    rows.push(...feedRows(all, live, scenes, lessonCards, reasons))
    rows.push(...wordRows(all.filter(isFree), lessonCards, wordAudio, reasons))
  } else {
    rows.push(...noData([...FEED_ROWS, ...WORD_ROWS], reasons.curricula || 'фразы не прочитались'))
  }
  rows.push(pushRow(pushTemplates, reasons))
  rows.push(...infoRows(all, scenes, reasons))
  return { rows, summary: summarize(rows) }
}
