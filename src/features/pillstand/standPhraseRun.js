// Широкая пилюля фразы на стенде пилюль (CONCEPT_PILLSTAND.md): НАСТОЯЩАЯ сцена круга «Скажи» (racePhraseScene.js — маска-кирпичики, подсказка, порядок и откат, рывок на неверное слово, заливка
// слева направо, glide прохода 2, ранние итоги, правило зачёта) с настоящим слушателем фраз (racePhraseListen.js → wordLaneListen.js → Vosk). Ход один: target.mode 'words' — проход 1 «по словам»,
// 'fast' — проход 2 «быстро». Без Пита (fx.pre только в трассу), без демо, без ленты: пилюля стоит на месте (standPool.js — до края не доедет, «не успел» не бывает), язык слушателя — target.lang
// (русская фраза — русская модель; сравнение слов — racePhraseForms.normForms с латиницей). Всё, что слышит Vosk, слова, итоги, строки журнала сцены и кадр заливки — в трассу. → { stop(), api }.
import { runPhraseScene } from '../pitrace/racePhraseScene.js'
import { phraseListen } from '../pitrace/racePhraseListener.js'
import { SAY_SPEED, gapMs } from '../pitrace/raceStagesPhrases.js'
import { createWordListener } from '../player/modules/rotate-phone/wordLaneListen.js'
import { pLog } from '../../shared/lib/debug.js'
import { tapListen } from './standVoiceTap.js'

const dbgData = data => (data && typeof data === 'object' ? data : { v: data })

/** Ход круга «Скажи» из цели стенда: один кандидат — сама фраза */
export function standTurn(target) {
  const key = target.say // ключ кандидата — сама фраза (её видно в журнале слушателя «лучший «…»»)
  return { idx: 0, pass: target.mode === 'fast' ? 2 : 1, target: { key, text: target.say, ru: target.other ?? '' }, cands: [{ key, cap: target.say, right: true, text: target.say }] }
}

/** Слушатель фраз игры с прослушкой: те же колбэки сцене, копия — в трассу */
export const standListen = ({ trace, lang, log, factory = phraseListen }) => o => factory({
  ...o, lang, log,
  onWord: e => { trace.push('word', e); o.onWord?.(e) },
  onPhrase: e => { trace.push('phrase', e); o.onPhrase?.(e) },
  onEar: e => { trace.push('ear', e); o.onEar?.(e) },
  onError: e => { trace.push('listen-error', { error: String(e?.message ?? e) }); o.onError?.(e) },
  create: o2 => createWordListener({ ...o2, listen: tapListen(trace), onDebug: (kind, data) => { if (kind !== 'level' && kind !== 'partial-same') trace.push('wl', { kind, ...dbgData(data) }); o2.onDebug?.(kind, data) } }),
})

export function runStandPhrase({ pool, root, target, trace, probe = {}, onResult = () => {}, factory, run = runPhraseScene }) {
  const turn = standTurn(target)
  const log = s => { pLog(s); trace.line(s) }
  let done = false, lastFill = ''
  const result = r => { if (done) return; done = true; onResult(r) }
  const fxRef = { current: {
    pre: e => trace.push('pre', { text: e?.rep?.text ?? '', pass: e?.rep?.pass ?? null }),
    win: (_o, _rect, r) => { trace.push('pill', { type: 'win', res: r?.res ?? null }); result({ ok: true, ratio: r?.res?.ratio ?? 1, clean: !!r?.res?.clean, late: !!r?.res?.late, smooth: r?.res?.smooth ?? null }) },
    miss: e => trace.push('pill', { type: 'miss', res: e?.rep?.res ?? null }),
    fail: e => { trace.push('pill', { type: 'fail', res: e?.rep?.res ?? null }); result({ ok: false, ratio: e?.rep?.res?.ratio ?? 0, clean: false }) },
    finished: () => trace.push('pill', { type: 'finished' }),
  } }
  const scene = { kind: 'student', step: { phrases: { round: 2, mode: 'say', voice: true, speed: SAY_SPEED, gap: gapMs(SAY_SPEED), turns: [turn] } }, from: 0 }
  trace.push('target-run', { mode: target.mode, pass: turn.pass, key: turn.target.key, lang: target.lang })
  const onFrame = (t, goal, shown) => {
    const k = pool.held?.()[0]
    Object.assign(probe, { k, el: k != null ? pool.el(k) : null, goal, shown })
    const key = `${goal.toFixed(4)}|${shown.toFixed(4)}`
    if (key !== lastFill) { lastFill = key; trace.push('fill', { goal: +goal.toFixed(4), shown: +shown.toFixed(4) }) }
  }
  const r = run({ pool, root, scene, fxRef, listen: standListen({ trace, lang: target.lang, log, ...(factory ? { factory } : {}) }), log, debugBar: false, onFrame })
  return { stop() { r.stop(); pool.giveAll() }, api: r.api }
}
