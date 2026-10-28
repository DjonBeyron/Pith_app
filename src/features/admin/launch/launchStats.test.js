import { describe, it, expect } from 'vitest'
import { buildLaunchStats, launchDifficulty } from './launchStats.js'
import { formatLaunchReport } from './launchReportMd.js'
import { MIN_DIFFICULTY_VOTES } from './launchThresholds.js'
import { MIN_DIFFICULTY_VOTES as APP_MIN_VOTES } from '../../../shared/lib/level/effectiveDifficulty.js'

// Синтетическое наполнение: 40 фраз-«cat»-подобных слов (похожие слова — двойники для «Дополни реплику»)
const STEMS = ['b', 'c', 'h', 'm', 'r', 's', 'f', 'p', 'v', 'j', 'l', 'n', 'd', 'g', 't', 'w', 'z', 'k', 'q', 'x', 'y', 'bl', 'cl', 'fl', 'gl', 'pl', 'sl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr', 'sc', 'sk', 'sm', 'sn', 'sp', 'st']
const wordOf = i => `${STEMS[i]}at`
const tr = i => [{ w: wordOf(i), t: `перевод ${i}` }]
const node = (type, typeData) => ({ type, typeData: { [type]: typeData } })

function cardsOf(word) {
  const line = node('audio', { text: `I can see the ${word} now`, r2Url: 'https://x/a.mp3', wordTimings: [{ w: word, t: 1.2, e: 1.6 }] })
  const photo = node('photo_choice', {
    photos: [1, 2, 3].map(n => ({ id: `p${n}`, photoUrl: `https://x/${n}.jpg` })), correctIndexes: [0],
  })
  const choice = node('word_choice', { options: [{ text: word, isCorrect: true }, { text: 'xx' }] })
  return [
    { id: `${word}-1`, nodes: [line, choice] }, { id: `${word}-2`, nodes: [photo] }, { id: `${word}-3`, nodes: [line] },
  ]
}

// level(i): 1 для первых 14, 2 для следующих 14, 3 для последних 12
const levelOf = i => (i < 14 ? 1 : i < 28 ? 2 : 3)
function fixture(over = {}) {
  const curricula = []
  const lessonCards = []
  for (let i = 0; i < 40; i++) {
    const w = wordOf(i)
    curricula.push({
      id: `m${i}`, title: `Фраза ${i}`, published: true, preview_only: false, is_pro: false, video_url: 'https://x/v.mp4', scene_id: null,
      lesson_ids: [`s${i}`, `w${i}`, `f${i}`], difficulty: levelOf(i), difficulty_votes: 7, word_translations: tr(i),
    })
    lessonCards.push({ id: `s${i}`, title: 'Старт', cards: [] }, { id: `w${i}`, title: w, cards: cardsOf(w) }, { id: `f${i}`, title: 'Финал', cards: [] })
  }
  const wordAudio = new Map(Array.from({ length: 40 }, (_, i) => [wordOf(i), { key: wordOf(i), url: 'https://x/w.mp3' }]))
  const pushTemplates = ['remind_word', 'review_due', 'inactive_today'].map(k => ({ trigger_kind: k, enabled: true }))
  return { curricula, lessonCards, wordAudio, pushTemplates, scenes: [{ id: 's1', status: 'published' }], ...over }
}
const row = (res, id) => res.rows.find(r => r.id === id)

describe('buildLaunchStats', () => {
  it('пустая база: ничего не падает, все условия не выполнены', () => {
    const res = buildLaunchStats({ curricula: [], lessonCards: [], wordAudio: new Map(), pushTemplates: [], scenes: [] })
    expect(res.summary.ready).toBe(false)
    expect(res.summary.passed).toBeLessThan(res.summary.total)
    expect(row(res, 'feed')).toMatchObject({ have: 0, need: 40, missing: 40, ok: false })
    expect(row(res, 'push').items.map(i => i.id)).toEqual(['remind_word', 'review_due', 'inactive_today'])
  })

  it('источники не прочитались: строки «нет данных», сводка без падения', () => {
    const res = buildLaunchStats({ reasons: { curricula: 'нет сети' } })
    expect(row(res, 'feed').status).toBe('nodata')
    expect(row(res, 'feed').note).toBe('нет сети')
    expect(res.summary.total).toBe(0)
    expect(res.summary.ready).toBe(false)
  })

  it('всё хорошо: все условия выполнены', () => {
    const res = buildLaunchStats(fixture())
    expect(res.rows.filter(r => r.status === 'fail').map(r => `${r.id}:${r.have}`)).toEqual([])
    expect(res.summary).toMatchObject({ ready: true, unknown: 0 })
    expect(res.summary.text).toBe(`Готово к запуску: ${res.summary.total} из ${res.summary.total} условий`)
    expect(row(res, 'diff_easy').have).toBe(14)
    expect(row(res, 'diff_hard').have).toBe(12)
    expect(row(res, 'game_fill').have).toBeGreaterThanOrEqual(10)
  })

  it('сложность не задана: фразы без голосов и без оценки админа — в списке', () => {
    const f = fixture()
    f.curricula[0] = { ...f.curricula[0], difficulty: 1, difficulty_votes: 2 } // мало голосов
    f.curricula[1] = { ...f.curricula[1], difficulty: 3, difficulty_votes: 2, difficulty_admin: 2 } // оценка админа
    f.curricula[2] = { ...f.curricula[2], difficulty: 3, difficulty_votes: 9, difficulty_admin: 1 } // голоса сильнее
    const res = buildLaunchStats(f)
    const unset = row(res, 'diff_unset')
    expect(unset).toMatchObject({ have: 1, ok: false, missing: 1 })
    expect(unset.items).toEqual([{ id: 'm0', title: 'Фраза 0', note: 'голосов: 2' }])
    expect(row(res, 'diff_mid').have).toBe(15) // 14 + m1 по оценке админа
    expect(row(res, 'diff_easy').have).toBe(11) // 14 − m0 (нет оценки) − m1 − m2
    expect(row(res, 'diff_hard').have).toBe(13) // m2 по голосам
    expect(res.summary.ready).toBe(false)
  })

  it('колонки difficulty_admin нет: считается как отсутствующая', () => {
    expect(launchDifficulty({ difficulty: 2, difficulty_votes: 1 })).toBeNull()
    expect(launchDifficulty({ difficulty: 2, difficulty_votes: MIN_DIFFICULTY_VOTES })).toBe(2)
    expect(launchDifficulty({ difficulty: 2, difficulty_votes: 0, difficulty_admin: 3 })).toBe(3)
    expect(launchDifficulty({ difficulty: 9, difficulty_votes: 9 })).toBeNull()
    expect(() => buildLaunchStats(fixture())).not.toThrow()
  })

  it('шаблон пуша выключен или отсутствует: строка падает и называет шаблоны', () => {
    const f = fixture({ pushTemplates: [{ trigger_kind: 'remind_word', enabled: false }, { trigger_kind: 'review_due', enabled: true }] })
    const p = row(buildLaunchStats(f), 'push')
    expect(p).toMatchObject({ ok: false, have: false, missing: 2 })
    expect(p.items).toEqual([
      { id: 'remind_word', title: expect.any(String), note: 'шаблон выключен' },
      { id: 'inactive_today', title: expect.any(String), note: 'шаблона нет' },
    ])
  })

  it('пуши не прочитались (нет прав): «нет данных», остальное считается', () => {
    const res = buildLaunchStats(fixture({ pushTemplates: null, reasons: { pushTemplates: 'только в админке' } }))
    expect(row(res, 'push')).toMatchObject({ status: 'nodata', note: 'только в админке' })
    expect(res.summary).toMatchObject({ unknown: 1, ready: false })
  })

  it('видео нет, сцена в черновике: фраза не готова; опубликованная сцена спасает', () => {
    const f = fixture({ scenes: [{ id: 'sc-draft', status: 'draft' }, { id: 'sc-pub', status: 'published' }] })
    f.curricula[0] = { ...f.curricula[0], video_url: null, scene_id: 'sc-draft' }
    f.curricula[1] = { ...f.curricula[1], video_url: null, scene_id: 'sc-pub' }
    const media = row(buildLaunchStats(f), 'media')
    expect(media.items.map(i => i.id)).toEqual(['m0'])
    expect(media).toMatchObject({ ok: false, count: 39, total: 40 })
  })

  it('превью, Pro и черновики не считаются лентой и попадают в справочную строку', () => {
    const f = fixture()
    f.curricula[0].published = false
    f.curricula[1].preview_only = true
    f.curricula[2].is_pro = true
    const res = buildLaunchStats(f)
    expect(row(res, 'feed').have).toBe(37)
    expect(row(res, 'outside').items.map(i => i.note)).toEqual(['черновик', 'превью', 'Pro'])
  })

  it('слова без озвучки и колоды попадают в списки', () => {
    const f = fixture()
    f.wordAudio.delete('bat')
    f.lessonCards[1] = { ...f.lessonCards[1], cards: [] }
    const res = buildLaunchStats(f)
    expect(row(res, 'word_audio').items.map(i => i.id)).toContain('bat')
    expect(row(res, 'decks').items.find(i => i.id === 'bat')).toMatchObject({ note: expect.stringContaining('колоды нет') })
  })
})

describe('вспомогательное', () => {
  it('порог голосов — тот же, что у effectiveDifficulty приложения', () => {
    expect(MIN_DIFFICULTY_VOTES).toBe(APP_MIN_VOTES)
  })

  it('markdown-отчёт содержит сводку и списки нехватки', () => {
    const f = fixture({ pushTemplates: [] })
    const md = formatLaunchReport(buildLaunchStats(f))
    expect(md).toContain('# Готово к запуску:')
    expect(md).toContain('Включите шаблон (3)')
  })
})
