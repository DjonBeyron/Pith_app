// Речь эпизода «Мия» (прототип): очередь реплик Мии и Пита, без React. Реплики приходят из машины (raceMia.js) пачкой с задержками от события (delay, мс) и звучат ПО ОЧЕРЕДИ:
// следующая — не раньше своего срока, когда предыдущая доиграла (по настоящей длине звука) и Пит не занят (cat.busyLeft): Мия не перебивает его слова и перевод, а пока она
// говорит, Пит «занят» (cat.holdBusy) — следующая пилюля ждёт, как за обычной репликой. Мелкие колкости (mia_ok / mia_miss / mia_streak2) в очередь не встают, если Мия уже говорит.
// Озвученная реплика Мии играет из слота звука (line:<id>, готовится в тапе «Начать» вместе с остальными репликами кота), микрофон на её время «не слушает» (эхо динамика);
// неозвученная — подпись над Мией (как неозвученные реплики Пита). Реплика Пита (pit_*) идёт через его sayLine (рот и звуковые линии из коробки живут по его озвучке).
// Всё внешнее приходит аргументами (тесты): часы, таймеры, кот, слушатель, слоты звука.
import { miaLine, isChatter } from './miaLines.js'
import { lineKey, lineMs } from '../../player/modules/rotate-phone/wordLaneCatLines.js'

export const GAP_MS = 350        // пауза между репликами
export const CAPTION_TAIL_MS = 400
export const POLL_MS = 120       // как часто смотрим, не освободился ли Пит
export const MIN_CAPTION_MS = 1600
export const MIC_MUTE_PAD_MS = 600

export function createMiaSpeech({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, play = () => false, has = () => false, bufferMs = () => 0, hold = null, onCaption = () => {}, log = () => {} } = {}) {
  const src = { lines: null, cat: null, listener: null } // свежие реплики, кот и слушатель кладёт use() (из эффекта хука: рефы в рендере читать нельзя)
  let queue = [], timer = 0, playing = null, endAt = 0, capTimer = 0, seq = 0
  const caption = (c, ms) => { clearTimer(capTimer); onCaption(c); capTimer = c ? setTimer(() => onCaption(null), ms + CAPTION_TAIL_MS) : 0 }

  function finish(c) {
    if (playing !== c) return
    playing = null; endAt = now() + GAP_MS; queue.shift(); kick()
  }

  function speak(c) {
    playing = c
    const lines = src.lines, line = lines?.[c.id], text = line?.text || miaLine(c.id)?.text || '', key = lineKey(c.id)
    const cat = src.cat, who = c.who
    const voiced = who === 'mia' && !!line?.url && has(key)
    const real = voiced ? bufferMs(key) : 0
    const ms = Math.max(voiced ? lineMs(real ? { ...line, duration: real / 1000 } : line) : Math.max(MIN_CAPTION_MS, text.length * 65), 400)
    const done = () => finish(c)
    const safety = setTimer(done, ms + 700)   // страховка: звук не сообщил о конце
    const end = () => { clearTimer(safety); done() }
    cat?.holdBusy?.(ms + GAP_MS)
    src.listener?.current?.mute?.(ms + MIC_MUTE_PAD_MS)
    if (who === 'pit') {                       // голос Пита: рот и звуковые линии из коробки — по его озвучке; нет озвучки — подпись
      const said = cat?.sayLine?.(c.id, null, { onEnd: end, pause: 0 })
      if (!said) { clearTimer(safety); playing = null; c.at = now() + 300; kick(); return }  // Пит занят или кулдаун: чуть позже
      if (!lines?.[c.id]?.url) caption({ key: `${++seq}:${c.id}`, who, text }, ms)
      log(`[mia] реплика ${c.id} (Пит)`)
      return
    }
    if (!voiced) caption({ key: `${++seq}:${c.id}`, who, text }, ms)
    else try { hold?.holdFor?.(ms) } catch { /* окно речи не обязательно */ }
    log(`[mia] реплика ${c.id}: ${voiced ? `звук ${Math.round(ms)} мс` : 'без озвучки, подпись'}`)
    if (voiced) {
      let started = false
      const ok = play(key, res => { if (!started && res?.play !== 'ok' && res?.play !== 'started') { caption({ key: `${++seq}:${c.id}`, who, text }, ms) } }, () => { started = true }, end)
      if (!ok) caption({ key: `${++seq}:${c.id}`, who, text }, ms)
    } else timer = setTimer(done, ms)
  }

  function kick() {
    clearTimer(timer); timer = 0
    if (playing || !queue.length) return
    const c = queue[0], wait = Math.max(c.at - now(), endAt - now(), src.cat?.busyLeft?.() ?? 0, 0)
    if (wait > 0) { timer = setTimer(kick, Math.max(50, Math.min(wait, POLL_MS))); return }
    speak(c)
  }

  return {
    /** Свежие данные: { lines, cat, listener (ref слушателя) } — зовёт хук на каждом рендере (эффектом) */
    use(o) { Object.assign(src, o) },
    /** Поставить реплики пачкой: cues — [{ id, who, delay }], delay — от этого момента */
    enqueue(cues, at = now()) {
      for (const c of cues ?? []) { if (isChatter(c.id) && (playing || queue.length)) continue; queue.push({ ...c, at: at + (c.delay ?? 0) }) }
      kick()
    },
    /** Пауза, выход, конец игры: очередь и подпись сброшены */
    stop() { clearTimer(timer); clearTimer(capTimer); timer = 0; capTimer = 0; queue = []; playing = null; onCaption(null) },
    pending: () => queue.length, // играющая реплика тоже стоит в голове очереди
  }
}
