// Речь эпизода «Мия» (прототип): очередь реплик Мии и Пита, без React. Реплики приходят из машины (raceMia.js) пачкой с задержками от события (delay, мс) и звучат ПО ОЧЕРЕДИ:
// следующая — не раньше своего срока, когда предыдущая доиграла (по настоящей длине звука) и Пит не занят (cat.busyLeft): Мия не перебивает его слова и перевод, а пока она
// говорит, Пит «занят» (cat.holdBusy) — следующая пилюля ждёт, как за обычной репликой. Мелкие колкости (mia_ok / mia_miss / mia_streak2) в очередь не встают, если Мия уже говорит.
// Озвученная реплика Мии играет из слота звука (line:<id>, готовится в тапе «Начать» вместе с остальными репликами кота), микрофон на её время «не слушает» (эхо динамика);
// неозвученная — подпись над Мией (как неозвученные реплики Пита). Реплика Пита (pit_*) идёт через его sayLine (рот и звуковые линии из коробки живут по его озвучке).
// onSpeak({ key, id, text, ms }) — Мия начала реплику (рот анимируется), onSpeak(null) — сброс. Всё внешнее приходит аргументами (тесты): часы, таймеры, кот, слушатель, слоты звука.
import { miaLine, isChatter } from './miaLines.js'
import { lineKey, lineMs } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { scenePush } from '../../../shared/lib/sceneTrace.js'
import { pauseMs } from '../../../shared/lib/scenePauses.js'
import { sceneKnob } from '../../../shared/lib/scenePauseTrace.js'

export const GAP_MS = 350        // пауза между репликами — значение по умолчанию настройки mia.gap (shared/lib/scenePauses.js); действующее — miaGap()
export const miaGap = () => pauseMs('mia.gap')
export const CAPTION_TAIL_MS = 400
export const POLL_MS = 120       // как часто смотрим, не освободился ли Пит
export const MIN_CAPTION_MS = 1600
export const MIC_MUTE_PAD_MS = 600
export const WORD_MS = 1300      // запас на слово, которое Пит говорит следом за репликой (cue.word: экзамен, «это значит» + верное слово)
export const MAX_PIT_TRIES = 40     // сколько раз пробуем реплику Пита (шаг 300 мс ≈ 12 с), пока он занят переводами и репликами игры: дальше пропускаем, очередь не стоит

export function createMiaSpeech({ now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, play = () => false, has = () => false, bufferMs = () => 0, hold = null, snap = () => '', onCaption = () => {}, onSpeak = () => {}, log = () => {}, probe = null, trace = scenePush } = {}) { // trace — трасса сцены («Таймлайн игры»): начало и конец реплики Мии; только запись, не бросает
  const src = { lines: null, cat: null, listener: null } // свежие реплики, кот и слушатель кладёт use() (из эффекта хука: рефы в рендере читать нельзя)
  let queue = [], timer = 0, playing = null, endAt = 0, capTimer = 0, seq = 0, playAt = 0
  const caption = (c, ms, why = '') => { clearTimer(capTimer); onCaption(c); if (c) { try { log(`[mia] подпись реплики ${c.key.split(':')[1]}${why ? ` — ${why}` : ''}: ${Math.round(ms)} мс`) } catch { /* журнал не мешает */ } } capTimer = c ? setTimer(() => onCaption(null), ms + CAPTION_TAIL_MS) : 0 } // подпись реплики над Мией; журнал — почему она появилась (владелец: «плашка с текстом за Мией, озвучивать нечего»)

  function finish(c) {
    if (playing !== c) return
    if (c.who === 'mia') trace('line-end', { who: 'mia', id: c.id })
    playing = null; endAt = now() + miaGap(); queue.shift(); if (queue.length) sceneKnob('mia.gap', { from: c.id, until: queue[0].id }); kick()
  }

  /** Длительность реплики id (мс): озвученная Мия — по настоящей длине звука, иначе по подписи; для плана примера на шкале (bossScale.demoPlan) */
  function msOf(id, who = 'mia') {
    const line = src.lines?.[id], text = line?.text || miaLine(id)?.text || '', key = lineKey(id)
    const voiced = who === 'mia' && !!line?.url && has(key)
    const real = voiced ? bufferMs(key) : 0
    return Math.max(voiced ? lineMs(real ? { ...line, duration: real / 1000 } : line) : (line?.url && who === 'pit' ? lineMs(line) : Math.max(MIN_CAPTION_MS, text.length * 65)), 400)
  }

  const cueMs = c => msOf(c.id, c.who) + (c.word ? WORD_MS : 0) // реплика очереди целиком: у «это значит» + слово — с запасом на слово

  function speak(c) {
    playing = c; playAt = now()
    const lines = src.lines, line = lines?.[c.id], text = line?.text || miaLine(c.id)?.text || '', key = lineKey(c.id)
    const cat = src.cat, who = c.who
    const voiced = who === 'mia' && !!line?.url && has(key)
    const ms = cueMs(c)
    const done = () => finish(c)
    let safety = setTimer(done, ms + 700)     // страховка: звук не сообщил о конце
    const end = () => { clearTimer(safety); done() }
    if (who === 'pit') {                       // голос Пита: рот и звуковые линии из коробки — по его озвучке; нет озвучки — подпись. «Занят» не держим заранее: sayLine сам его ставит (раньше holdBusy ДО sayLine делал Пита «занятым» для самого себя — реплика отказывала по кругу и вставала поперёк всей очереди)
      const word = () => { let on = false; src.sayText?.(c.word, { hold: true, ...(c.ru ? { ru: true } : {}), onSay: t => { on = true; clearTimer(safety); safety = setTimer(done, t + 700) }, onEnd: end }); if (!on) end() } // c.word — экзамен: «это значит» + верное слово без паузы (слово из библиотеки; не сыграло — очередь идёт дальше)
      const said = cat?.sayLine?.(c.id, null, c.word ? { onEnd: word, pause: 60 } : { onEnd: end, pause: 0 })
      if (!said) {
        clearTimer(safety); playing = null
        c.tries = (c.tries ?? 0) + 1
        if (c.tries > MAX_PIT_TRIES) { log(`[mia] реплика ${c.id} (Пит): не вышло за ${c.tries} попыток — пропущена`); queue.shift(); endAt = now() + miaGap(); kick(); return }
        c.at = now() + 300; kick(); return     // Пит занят или кулдаун: чуть позже
      }
      src.listener?.current?.mute?.(ms + MIC_MUTE_PAD_MS)
      if (!lines?.[c.id]?.url) caption({ key: `${++seq}:${c.id}`, who, text }, ms, 'реплика Пита без озвучки (нет url в настройках)')
      log(`[mia] реплика ${c.id} (Пит)`)
      return
    }
    onSpeak({ key: ++seq, id: c.id, text, ms, ...(voiced && line.words?.length ? { words: line.words } : {}) })   // рот и усы Мии — по этой реплике (useMiaLife → miaMouth.js); words — тайминги слов озвучки: рот идёт по ним и молчит в паузах между предложениями (v3.3.372)
    if (!c.free) cat?.holdBusy?.(ms + miaGap())  // c.free — «лёгкая» колкость (бонус-круг экзамена, bossMia.bonusRound): идёт поверх выезда следующей пилюли, никого не задерживает. Мия говорит: Пит «занят» (следующая пилюля ждёт, как за обычной репликой)
    src.listener?.current?.mute?.(ms + MIC_MUTE_PAD_MS)
    if (!voiced) caption({ key: `${++seq}:${c.id}`, who, text }, ms, line?.url ? 'озвучка есть, но звук не загружен (нет слота)' : 'реплики нет в настройках озвучки (нет url)')
    else try { hold?.holdFor?.(ms) } catch { /* окно речи не обязательно */ }
    log(`[mia] реплика ${c.id}: ${voiced ? `звук ${Math.round(ms)} мс` : 'без озвучки, подпись'}`)
    trace('line-start', { who: 'mia', id: c.id, text, ms: Math.round(ms), ...(voiced ? {} : { silent: true }) })
    if (voiced) {
      let started = false
      const ok = play(key, res => { if (!started && res?.play !== 'ok' && res?.play !== 'started') { caption({ key: `${++seq}:${c.id}`, who, text }, ms, `звук не стартовал (${res?.play ?? 'нет ответа'})`) } }, () => { started = true; log(`[mia] звук ${c.id} стартовал: ${snap()}`); try { probe?.({ id: c.id, key, ms }) } catch { /* диагностика не мешает звуку */ } }, end)
      if (!ok) caption({ key: `${++seq}:${c.id}`, who, text }, ms, 'слот не принял звук')
    } else timer = setTimer(done, ms)
  }

  function kick() {
    clearTimer(timer); timer = 0
    if (playing || !queue.length) return
    const c = queue[0], wait = Math.max(c.at - now(), endAt - now(), src.cat?.busyLeft?.() ?? 0, 0)
    if (c.ttl > 0 && wait > 0 && now() + wait - c.at > c.ttl) { queue.shift(); log(`[mia] реплика ${c.id}: не успела начаться за ${c.ttl} мс — пропущена`); kick(); return } // реплика «сейчас или никогда» (c.ttl): опоздавшая не звучит, очередь не копится
    if (wait > 0) { timer = setTimer(kick, Math.max(50, Math.min(wait, POLL_MS))); return }
    speak(c)
  }

  return {
    /** Свежие данные: { lines, cat, listener (ref слушателя) } — зовёт хук на каждом рендере (эффектом) */
    use(o) { Object.assign(src, o) },
    /** Длительность реплики (мс) — для плана примера */
    msOf,
    /** Поставить реплики пачкой: cues — [{ id, who, delay }], delay — от этого момента */
    enqueue(cues, at = now()) {
      for (const c of cues ?? []) { if (isChatter(c.id) && (playing || queue.length)) continue; queue.push({ ...c, at: at + (c.delay ?? 0) }) }
      kick()
    },
    /** Пауза, выход, конец игры: очередь и подпись сброшены */
    stop() { if (playing?.who === 'mia') trace('line-end', { who: 'mia', id: playing.id, why: 'stop' }); clearTimer(timer); clearTimer(capTimer); timer = 0; capTimer = 0; queue = []; playing = null; onCaption(null); onSpeak(null) },
    /** Оценка, сколько мс речи ещё впереди (очередь целиком, по длине звука или подписи; «лёгкие» реплики c.free не в счёт — их никто не ждёт): директор репетиции откладывает реплику следующей стадии на это время */
    leftMs: () => queue.reduce((a, c) => { if (c.free) return a; const l = src.lines?.[c.id], text = l?.text || miaLine(c.id)?.text || '', full = (l?.url ? lineMs(l) : Math.max(MIN_CAPTION_MS, text.length * 65)) + (c.word ? WORD_MS : 0) + miaGap(); return a + (playing === c ? Math.max(miaGap(), full - (now() - playAt)) : full) }, 0), // играющая реплика — только остаток (раньше считалась целиком: прерванная «mia_leave» держала следующую реплику Пита лишние секунды)
    pending: () => queue.length, // играющая реплика тоже стоит в голове очереди
    /** Через сколько мс очередь речи опустеет (v3.3.290): играющая реплика доигрывает, отложенные ждут своего времени, каждая идёт после предыдущей + пауза GAP_MS. 0 — речи нет */
    idleIn() {
      let t = now()
      for (const c of queue) { if (playing === c) t = Math.max(t, playAt + cueMs(c)); else t = Math.max(t, c.at) + cueMs(c) + miaGap() }
      return Math.max(0, t - now())
    },
  }
}
