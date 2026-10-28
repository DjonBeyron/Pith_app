// Подставляет хвост (tail.mjs) в позу покоя вместо заглушки <g class="tail"/> в rig.json
import { readFileSync, writeFileSync } from 'node:fs'
import { tailMarkup } from './tail.mjs'
const f = process.argv[2] + '/rig.json'
const rig = JSON.parse(readFileSync(f, 'utf8'))
const before = rig.parts.body
rig.parts.body = before.replace(/<g class="tail"\s*\/>|<g class="tail"><\/g>/, tailMarkup())
if (rig.parts.body === before) throw new Error('заглушка хвоста не найдена')
writeFileSync(f, JSON.stringify(rig))
console.log('хвост вставлен, тело:', Math.round(rig.parts.body.length / 1024) + ' КБ')
