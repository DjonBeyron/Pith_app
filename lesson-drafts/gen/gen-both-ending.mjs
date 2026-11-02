// Финал урока Both отдельным файлом (на согласование): Мия присоединяется к чату, кружки Мии и Пита, сборка фразы, про-режим с переводом.
// Запуск: node lesson-drafts/gen/gen-both-ending.mjs → lesson-drafts/both.ending.json
import { writeFileSync } from 'node:fs'

const PIT = { kind: 'cat', gender: 'male', name: 'Пит', skin: 'kit', voice: { pitch: 0.8, rate: 0.95 } }
const MIA = { kind: 'cat', gender: 'female', name: 'Мия', skin: 'mia2', voice: { pitch: 1.3, rate: 0.9 } }
const SLOTS = { table: 'table', 'wall-art': 'picture', 'table-left': 'coffee-cup', 'table-right': 'pastry-plate', window: 'window', 'wall-menu': 'menu-board', ceiling: 'pendant-lamp', counter: 'coffee-machine', 'floor-left': 'plant', 'floor-right': 'floor-lamp' }
const STEP = 560
const circle = (id, title, ch, timeline) => ({ scene: { version: 2, id, title, location: 'cafe', characters: { a: ch }, slots: SLOTS, timeline, options: { bubbles: true } }, mode: 'circle', showBubbles: false, start: 'auto', crop: { x: 0, y: 0, scale: 1 } })

const specs = [
  { type: 'system', data: { content: 'Мия присоединилась к чату' }, trig: { if: 'timer', ms: 1600 } },
  { type: 'scene', data: circle('both-end-mia', 'Кружок Мии', MIA, [
    { who: 'a', text: 'Pit. I asked for both.', emotion: 'neutral', face: 'sneer' },
    { who: 'a', text: 'Where is my tea?', emotion: 'neutral', face: 'grump' },
  ]), trig: { if: 'played' }, note: 'СЦЕНА: кружок Мии (skin mia2), высокомерная и требовательная. Озвучку записать в редакторе сцены' },
  { type: 'text', data: { content: '😡', hardWrap: false }, trig: { if: 'timer', ms: 1500 } },
  { type: 'scene', data: circle('both-end-pit', 'Кружок Пита', PIT, [
    { who: 'a', text: 'Sorry, Mia! Both are here.', emotion: 'surprised', face: 'shy' },
    { who: 'a', text: 'Coffee and tea.', emotion: 'neutral', face: 'pretend' },
  ]), trig: { if: 'played' }, note: 'СЦЕНА: кружок Пита (skin kit), виноватый. Озвучку записать в редакторе сцены' },
  { type: 'audio', data: { text: 'фух, пронесло. Тапни на её кружок и послушай ещё раз, а потом попробуй разобраться, что она мне сказала', showText: true }, trig: { if: 'played' }, needs: 'audio — озвучка реплики', note: 'ОЗВУЧКА: Пит, с облегчением и лёгким смущением; без «она у меня такая» (они не друзья, но симпатичны друг другу)' },
  { type: 'phrase_assembly', data: { words: ['I', 'asked', 'for', 'both'], distractors: [{ text: 'all' }, { text: 'we' }, { text: 'two' }], responseWrong: 'не совсем) подумай, сколько их' }, trig: { if: 'phrase_correct' }, wrong: 'phrase_wrong', wrongText: 'близко) Мия просила оба напитка, и слово про двоих {g:both} стоит в конце:\n{g:I asked for both}', variants: ['all', 'we', 'two'] },
  { type: 'reaction', data: { emoji: '👌', target: 'student' }, trig: { if: 'timer', ms: 1400 } },
  { type: 'text', data: { content: 'да, она сказала так:\n{g:I asked for both. Where is my tea?}', hardWrap: true, pro: true, proText: 'Я просила оба. Где мой чай?' }, trig: { if: 'timer', ms: 2200 }, note: 'Про-режим: кнопка перевода на пузыре' },
  { type: 'text', data: { content: 'а я ей ответил:', hardWrap: false }, trig: { if: 'timer', ms: 1500 } },
  { type: 'text', data: { content: '{g:Sorry, Mia! Both are here. Coffee and tea.}', hardWrap: false, pro: true, proText: 'Прости, Мия! Оба здесь. Кофе и чай.' }, trig: { if: 'timer', ms: 2200, then: null }, note: 'Про-режим: кнопка перевода на пузыре' },
]

const nodes = [], zones = []
let refN = 0
specs.forEach((s, i) => { s.ref = `n${++refN}`; s.pos = [i * STEP, 0] })
for (const [i, s] of specs.entries()) {
  const next = specs[i + 1]?.ref ?? null
  const triggers = [{ ...s.trig, then: s.trig.then === null ? null : next }]
  for (const v of s.variants ?? []) triggers.push({ if: 'variant', variantLabel: v, then: null })
  if (s.wrong) {
    const w = { ref: `n${++refN}`, type: 'text', data: { content: s.wrongText, hardWrap: s.wrongText.includes('\n') }, triggers: [{ if: 'timer', ms: 1500, then: specs[i + 2].ref }], pos: [s.pos[0], 480] }
    nodes.push(w)
    triggers.push({ if: s.wrong, then: w.ref })
  }
  nodes.push({ ref: s.ref, type: s.type, pos: s.pos, ...(s.note ? { note: s.note } : {}), ...(s.needs ? { needs: s.needs } : {}), data: s.data, triggers })
}
nodes.sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)))
nodes.forEach((n, i) => { n.seq = i + 1 })
zones.push({ id: 'zone-both-end', x: -150, y: -150, width: specs.length * STEP + 150, height: 960, label: 'Финал · Мия в чате', color: '#ff9f1c' })
writeFileSync(new URL('../both.ending.json', import.meta.url), JSON.stringify({ format: 'pithy-lesson', version: 1, lesson: { title: 'Both', nodeCount: nodes.length }, nodes, zones }, null, 2) + '\n')
console.log('nodes', nodes.length)
