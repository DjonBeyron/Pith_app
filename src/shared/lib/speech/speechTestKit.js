// Общие заглушки для тестов speechController: поддельный SpeechRecognition и сборка контроллера с записью view/журнала.
import { vi } from 'vitest'
import { createSpeechController } from './speechController.js'

export class FakeRec {
  static all = []
  constructor() { this.started = false; this.aborted = 0; this.stopped = 0; this.startError = null; FakeRec.all.push(this) }
  start() { if (this.startError) throw this.startError; this.started = true }
  stop() { this.stopped++ }
  abort() { this.aborted++ }
}
export const alt = (text, confidence = 0.9) => Object.assign([{ transcript: text, confidence }], { isFinal: true })
export const interimRes = text => Object.assign([{ transcript: text, confidence: 0 }], { isFinal: false })

export function setup(extra = {}) {
  FakeRec.all = []
  const views = []
  const entries = []
  const ctrl = createSpeechController({
    createRecognition: () => new FakeRec(),
    queryPerm: async () => 'granted',
    onView: v => views.push(v),
    onEntry: e => entries.push(e),
    ...extra,
  })
  const last = () => views[views.length - 1]
  const rec = i => FakeRec.all[i]
  const tap = (reference = 'I am here', lang = 'en-US') => ctrl.start({ reference, lang })
  const tick = ms => vi.advanceTimersByTimeAsync(ms)
  return { ctrl, views, entries, last, rec, tap, tick }
}

