#!/usr/bin/env node
// «Таймлайн игры» из текста журнала (CONCEPT_TIMELINE.md): журнал игры, присланный в GitHub (ветка logs, pithy-journal-….txt), содержит строки «[scene] {json}» — из них собирается тот же отчёт,
// что видит админ на экране таймлайна. Запуск: node scripts/timeline-from-log.mjs <журнал.txt> [--thr 1500] [--run N]   (--run — номер прохождения с конца: 1 — последнее, по умолчанию все)
import { readFileSync } from 'node:fs'
import { parseSceneLines, splitRuns } from '../src/shared/lib/sceneTrace.js'
import { buildTimeline } from '../src/features/timeline/timelineModel.js'
import { reportText } from '../src/features/timeline/timelineReport.js'

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--'))
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : d }
if (!file) { console.error('Использование: node scripts/timeline-from-log.mjs <журнал.txt> [--thr 1500] [--run N]'); process.exit(2) }
const runs = splitRuns(parseSceneLines(readFileSync(file, 'utf8'))).filter(r => r.events.some(e => e.k === 'stage-in' || e.k === 'line-start'))
if (!runs.length) { console.log('В журнале нет событий сцены («[scene] …»): игра не запускалась, версия старше 3.3.338 или начало журнала вытеснено.'); process.exit(0) }
const pick = opt('run', 0), list = pick > 0 ? [runs[runs.length - pick]].filter(Boolean) : runs
list.forEach((r, i) => console.log(`${i ? '\n\n' : ''}${reportText(buildTimeline(r.events, r.meta), { threshold: opt('thr', 1500), title: `ТАЙМЛАЙН ИГРЫ — прохождение ${runs.indexOf(r) + 1} из ${runs.length}` })}`))
const lag = readFileSync(file, 'utf8').split('\n').filter(l => l.includes('[lag] итог')) // сводки трассера лагов (shared/lib/lagTrace.js): по строке на каждую сыгранную игру
if (lag.length) console.log(`\n== ЛАГИ (строки «[lag] итог» журнала; подробности — строки «[lag] …» рядом с моментом) ==\n${lag.map(l => l.trim()).join('\n')}`)
