// «Пробник» доступов и звука для отладки «Повтори за диктором»: когда отладка включена, на время жизни страницы ставит ТОЛЬКО записывающие обёртки (поведение вызовов не меняется) и копит события —
// игра подтягивает их в свой журнал (useWordLaneDebug): и то, что было ДО её запуска (запрос микрофона при старте урока, тап «Начать»), и то, что идёт во время игры.
// Ловит: getUserMedia (кто звал — стек и догадка по constraints, что запросили, чем кончилось, сколько мс, сколько потоков живых, mute/unmute/ended дорожек), HTMLMediaElement.play (src, readyState,
// muted, volume, исход: ok или NotAllowedError…, userActivation, события playing/error и момент первого зазвучавшего звука), speechSynthesis.speak (текст, start/end/error), AudioContext
// (создание, state и его смены; старт AudioBufferSource), visibilitychange / fullscreenchange / pagehide / pageshow, navigator.permissions «microphone» (в начале, при смене, в конце).
// Событие: { at (эпоха, мс), kind, ...данные }. Ставится из ShellV2 (wordLaneDebugBoot.js) при включённой отладке, а при её включении позже — при старте журнала игры. Выключенная отладка — ничего не ставится.
export const PROBE_KEEP = 3000

const cut = (s, n = 80) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)
const safe = fn => { try { return fn() } catch { return null } }

/** Куда указывает src: blob/data — коротко, остальное — хвост адреса */
export function shortSrc(src) {
  const s = String(src ?? '')
  if (!s) return ''
  if (s.startsWith('data:')) return `data:${s.slice(5, 20)}…`
  if (s.startsWith('blob:')) return `blob:…${s.slice(-8)}`
  return s.length > 60 ? `…${s.slice(-58)}` : s
}

/** Первые кадры стека без самого пробника: по ним видно, кто позвал getUserMedia (в боевой сборке имена сжаты — тогда смотри догадку guess) */
export function callerOf(stack) {
  return String(stack ?? '').split('\n').slice(1).filter(l => l.trim() && !/wordLaneDebugProbe/.test(l)).slice(0, 4).map(l => cut(l.trim().replace(/^at\s+/, ''), 110))
}

/** Кто, судя по constraints, просил микрофон: ensureMicAccess ({audio:true}), openGameMic (есть autoGainControl), распознаватель voskEngine (эхо/шумодав без autoGainControl) */
export function guessCaller(constraints) {
  const a = constraints?.audio
  if (a === true) return 'ensureMicAccess / проба доступа (audio: true)'
  if (a && typeof a === 'object') {
    if ('autoGainControl' in a) return 'openGameMic (игровой поток)'
    if (a.echoCancellation === true) return 'распознаватель voskEngine (свой поток)'
  }
  return 'другой'
}

export function createProbe({ win = globalThis.window, doc = globalThis.document, nav = globalThis.navigator, now = () => Date.now(), describeMic: describeIn = null } = {}) {
  let describeMic = describeIn
  const events = []
  const subs = new Set()
  const undo = []
  const streams = new Set()
  const contexts = []
  const ids = new WeakMap()
  const watched = new WeakSet()
  let installed = false
  let n = 0
  let firstSound = false

  const emit = (kind, data) => {
    const ev = { at: now(), kind, ...data }
    events.push(ev)
    if (events.length > PROBE_KEEP) events.splice(0, events.length - PROBE_KEEP + 200)
    subs.forEach(fn => safe(() => fn(ev)))
  }
  const idOf = o => { if (!ids.has(o)) ids.set(o, ++n); return ids.get(o) }
  const live = () => { let k = 0; streams.forEach(s => { if (!safe(() => s.getAudioTracks().some(t => t.readyState === 'live'))) streams.delete(s); else k++ }); return k }
  const act = () => ({ active: nav?.userActivation?.isActive ?? null, been: nav?.userActivation?.hasBeenActive ?? null })
  const env = () => ({ vis: doc?.visibilityState ?? null, fs: !!(doc?.fullscreenElement ?? doc?.webkitFullscreenElement), ua: act(), as: nav?.audioSession?.type ?? null, ctx: contexts.map(c => c.state).join(',') })
  const media = el => ({ el: idOf(el), tag: el?.tagName ?? null, src: shortSrc(el?.currentSrc || el?.src), rs: el?.readyState, muted: !!el?.muted, vol: el?.volume, paused: !!el?.paused, t: el?.currentTime })
  const on = (target, type, fn) => { if (!target?.addEventListener) return; target.addEventListener(type, fn, true); undo.push(() => target.removeEventListener(type, fn, true)) }
  const patch = (obj, key, make) => {
    const orig = obj?.[key]
    if (typeof orig !== 'function' || orig.__wlProbe) return
    const wrapped = make(orig)
    wrapped.__wlProbe = true
    obj[key] = wrapped
    undo.push(() => { if (obj[key] === wrapped) obj[key] = orig })
  }

  function watchTracks(stream, sid) {
    safe(() => stream.getAudioTracks().forEach(t => ['mute', 'unmute', 'ended'].forEach(type => t.addEventListener(type, () => emit('track', { stream: sid, event: type, readyState: t.readyState, live: live() })))))
  }
  function patchGetUserMedia() {
    const md = nav?.mediaDevices
    patch(md, 'getUserMedia', orig => function getUserMedia(...args) {
      const id = ++n
      const t = now()
      const c = args[0]
      emit('gum-call', { id, guess: guessCaller(c), constraints: safe(() => JSON.parse(JSON.stringify(c))), caller: callerOf(new Error().stack), live: live(), env: env() })
      let p
      try { p = orig.apply(md, args) } catch (e) { emit('gum-result', { id, ok: false, error: e?.name ?? 'error', ms: 0 }); throw e }
      return p.then(s => {
        streams.add(s)
        watchTracks(s, id)
        emit('gum-result', { id, ok: true, ms: now() - t, live: live(), tracks: safe(() => s.getAudioTracks().map(x => ({ label: x.label, readyState: x.readyState, muted: x.muted, settings: x.getSettings?.() }))) })
        if (describeMic) setTimeout(() => emit('game-mic', { id, mic: safe(describeMic) }), 0) // openGameMic кладёт поток после ответа: снимок — следом
        return s
      }, e => { emit('gum-result', { id, ok: false, error: e?.name ?? String(e), message: cut(e?.message, 100), ms: now() - t, live: live() }); throw e })
    })
  }
  function watchElement(el) {
    if (!el || watched.has(el)) return
    watched.add(el)
    el.addEventListener('playing', () => { emit('playing', { ...media(el), first: !firstSound }); if (!firstSound) { firstSound = true; emit('first-sound', { ...media(el) }) } })
    el.addEventListener('error', () => emit('media-error', { ...media(el), code: el.error?.code ?? null }))
  }
  function patchPlay() {
    patch(win?.HTMLMediaElement?.prototype, 'play', orig => function play(...args) {
      const id = ++n
      const t = now()
      safe(() => { watchElement(this); emit('play-call', { id, ...media(this), env: env() }) })
      let res
      try { res = orig.apply(this, args) } catch (e) { emit('play-result', { id, ok: false, error: e?.name ?? 'error', ms: 0 }); throw e }
      if (res && typeof res.then === 'function') {
        res.then(() => emit('play-result', { id, ok: true, ms: now() - t, rs: this.readyState, muted: !!this.muted }), e => emit('play-result', { id, ok: false, error: e?.name ?? String(e), message: cut(e?.message, 100), ms: now() - t, rs: this.readyState, muted: !!this.muted }))
      }
      return res
    })
  }
  function patchSpeech() {
    const s = win?.speechSynthesis
    patch(s, 'speak', orig => function speak(u) {
      const id = ++n
      safe(() => {
        emit('speech-speak', { id, text: cut(u?.text, 60), lang: u?.lang, vol: u?.volume, rate: u?.rate, speaking: s.speaking, pending: s.pending, paused: s.paused, voices: s.getVoices?.().length })
        ;['start', 'end', 'error'].forEach(type => u.addEventListener(type, ev => emit('speech-event', { id, event: type, ...(type === 'error' ? { error: ev?.error } : {}) })))
      })
      return orig.call(this, u)
    })
  }
  function patchAudioContext() {
    for (const key of ['AudioContext', 'webkitAudioContext']) {
      const Orig = win?.[key]
      if (typeof Orig !== 'function' || Orig.__wlProbe) continue
      const P = new Proxy(Orig, {
        construct(target, args, newTarget) {
          const ctx = Reflect.construct(target, args, newTarget)
          safe(() => {
            contexts.push(ctx); if (contexts.length > 20) contexts.shift()
            emit('audiocontext', { id: idOf(ctx), state: ctx.state, rate: ctx.sampleRate })
            ctx.addEventListener('statechange', () => emit('audiocontext-state', { id: idOf(ctx), state: ctx.state }))
          })
          return ctx
        },
        get: (target, prop, recv) => (prop === '__wlProbe' ? true : Reflect.get(target, prop, recv)),
      })
      win[key] = P
      undo.push(() => { if (win[key] === P) win[key] = Orig })
    }
    patch(win?.AudioBufferSourceNode?.prototype, 'start', orig => function start(...args) { safe(() => emit('webaudio-start', { ctx: this.context?.state, id: this.context ? idOf(this.context) : null })); return orig.apply(this, args) })
  }
  function queryPermission(tag) {
    return Promise.resolve().then(() => nav?.permissions?.query?.({ name: 'microphone' })).then(
      st => { emit('permission', { tag, state: st?.state ?? null }); return st },
      e => { emit('permission', { tag, state: null, error: e?.name ?? String(e) }) },
    )
  }

  return {
    get installed() { return installed },
    /** Один раз: ставит обёртки и слушатели. Повторный вызов ничего не делает */
    install() {
      if (installed) return
      installed = true
      safe(patchGetUserMedia); safe(patchPlay); safe(patchSpeech); safe(patchAudioContext)
      on(doc, 'visibilitychange', () => emit('visibility', { state: doc.visibilityState }))
      for (const t of ['fullscreenchange', 'webkitfullscreenchange']) on(doc, t, () => emit('fullscreen', { on: !!(doc.fullscreenElement ?? doc.webkitFullscreenElement) }))
      on(win, 'pagehide', () => emit('pagehide', {})); on(win, 'pageshow', () => emit('pageshow', {}))
      emit('probe-install', { env: env(), mediaDevices: !!nav?.mediaDevices, synth: !!win?.speechSynthesis })
      safe(() => nav.permissions.query({ name: 'microphone' }).then(st => { emit('permission', { tag: 'start', state: st.state }); st.addEventListener?.('change', () => emit('permission', { tag: 'change', state: st.state })) }, () => {}))
    },
    uninstall() { undo.splice(0).reverse().forEach(fn => safe(fn)); installed = false },
    queryPermission,
    setDescribeMic(fn) { describeMic = fn },
    snapshot: () => events.slice(),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  }
}

/** Общий пробник страницы (его ставят wordLaneDebugBoot и журнал игры) */
export const probe = createProbe({})
