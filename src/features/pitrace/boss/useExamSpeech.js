import { useEffect, useState } from 'react'
import { pLog } from '../../../shared/lib/debug.js'
import { scenePush } from '../../../shared/lib/sceneTrace.js'
import { audioPulse } from '../../../shared/lib/gameAudioPulse.js'
import { gameMicHold } from '../../../shared/lib/gameMicHold.js'
import { peekGameCtx } from '../../../shared/lib/gameAudioCtx.js'
import { createMiaProbe } from '../mia/miaProbe.js'
import { playWordSlot, hasWordSlot, wordBufferMs, wordProfile } from '../../player/modules/rotate-phone/wordLaneClips.js'
import { createMiaSpeech, miaGap } from '../mia/miaSpeech.js'
import { DEMO_START, DEMO_IDS, demoPlan, revealAtMs } from './bossScale.js'
import { byeAtMs } from './lineWordAt.js'

// Речь эпизода «Мия» для директора гонки (useRaceActs): очередь реплик (mia/miaSpeech.js) и то, что экран рисует по РЕАЛЬНОМУ началу и концу её звука:
//  • miaTalk — реплика, которую Мия говорит сейчас (рот, мигание зон шкалы); у реплики «…шкала покажет…» в ней же revealMs — когда показать шкалу (bossScale.revealAtMs: по таймингам слов записи);
//  • miaDemo — пример-пилюля на объяснении шкалы: план пути по длительностям реплик (bossScale.demoPlan, пауза очереди — настройка mia.gap), а mark — сверка часов примера с настоящим началом
//    каждой следующей реплики (зелёная / жёлтая / красная / условие): заменённая озвучка другой длины пример не рассинхронит;
//  • miaCap — подпись неозвученной реплики; captionOn() — она сейчас на экране (конец экзамена не уводит к итогу, пока её читают);
//  • onLineEnd(fn) — подписка: fn(id), когда реплика Мии реально доиграла (конец звука, а не расчёт): по нему экзамен начинает уход Мии с коробкой (boss/bossMia.examBye). Сброс очереди (пауза, выход) концом не считается.
//    У прощания «Коробка мне ещё пригодится, пока» тот же fn(id) зовётся РАНЬШ�E конца — на слове «пока» (lineWordAt.byeAtMs: по таймингам слов записи, от реального начала звука; владелец 2026-11-25:
//    «когда Мия говорит пока, она уже должна начать прыжок за экран»); конец реплики зовёт fn ещё раз — машина Мии второй раз не уходит (ожидание ухода m.bye уже снято).
export function useExamSpeech(lines, onTalk = null) { // onTalk(c) — Мия начала реплику (или null — сброс): директор сверяет по ней прыжок «Допроса» (mia/miaCircleEnd.syncJump)
  const [miaTalk, setMiaTalk] = useState(null)
  const [miaDemo, setMiaDemo] = useState(null)
  const [miaCap, setMiaCap] = useState(null)
  const [api] = useState(() => {
    const src = { lines: null, onEnd: null, onTalk: null, cap: false, word: 0 } // свежие реплики и обработчик конца кладёт use() (из эффектов); cap — подпись неозвученной реплики сейчас на экране
    const sp = createMiaSpeech({ play: playWordSlot, has: hasWordSlot, bufferMs: wordBufferMs, hold: gameMicHold, snap: audioPulse, onCaption: c => { src.cap = !!c; setMiaCap(c) }, log: pLog, probe: createMiaProbe({ enabled: () => true, profileOf: wordProfile, ctxTime: () => peekGameCtx()?.currentTime ?? null, log: pLog }),
      trace: (k, d) => { scenePush(k, d); if (k === 'line-end' && d?.who === 'mia' && !d.why) { try { src.onEnd?.(d.id) } catch (e) { pLog(`[mia] конец реплики ${d.id}: сбой обработчика (${e?.message ?? e})`) } } },
      onSpeak: c => {
        src.onTalk?.(c)
        clearTimeout(src.word); src.word = 0 // срок «на слове» живёт одну реплику: новая реплика и сброс очереди (пауза, выход) его снимают
        const bye = c ? byeAtMs(c.id, src.lines?.[c.id] ?? { text: c.text }, c.ms) : null
        if (bye != null) src.word = setTimeout(() => { src.word = 0; pLog(`[mia] ${c.id}: слово ухода на ${bye} мс из ${Math.round(c.ms)} — Мия уходит`); try { src.onEnd?.(c.id) } catch (e) { pLog(`[mia] слово реплики ${c.id}: сбой обработчика (${e?.message ?? e})`) } }, bye)
        setMiaTalk(c && c.id === DEMO_START ? { ...c, revealMs: revealAtMs(src.lines?.[c.id] ?? { text: c.text }, c.ms) } : c)
        if (!c) setMiaDemo(null)
        else if (c.id === DEMO_START) setMiaDemo({ key: c.key, plan: demoPlan(Object.fromEntries(DEMO_IDS.map(id => [id.replace('boss_mia_', ''), sp.msOf(id)])), miaGap()), mark: null })
        else if (DEMO_IDS.includes(c.id)) setMiaDemo(d => (d ? { ...d, mark: { k: c.id.replace('boss_mia_', ''), n: c.key } } : d))
      } })
    return { sp, use: o => Object.assign(src, o), captionOn: () => src.cap, word: () => src.word }
  })
  useEffect(() => { api.use({ lines, onTalk }) })
  useEffect(() => () => clearTimeout(api.word()), [api])
  return { mspeech: api.sp, miaTalk, miaDemo, miaCap, onLineEnd: fn => api.use({ onEnd: fn }), captionOn: api.captionOn }
}
