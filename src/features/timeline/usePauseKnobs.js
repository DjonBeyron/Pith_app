import { useCallback, useEffect, useMemo, useState } from 'react'
import { collectKnobs, gapKnobs, gapKnobMark, knobUsage, shorterBy } from './timelineKnobs.js'
import { effective, draftValue, sourceName, setDraft, changes, dPush, dUndo, dRedo, loadPauseDraft, savePauseDraft, applyDevice, applyServer } from './pauseDraft.js'
import { safeStore } from './montage/montageHistory.js'

// Настройки пауз на экране таймлайна — одно место для карточки зазора, стола монтажа, вкладки «Паузы» и панели «⚙ Настройки пауз»: что дала какая настройка в ВЫБРАННОЙ игре (timelineKnobs.js),
// что действует сейчас (сервер, поверх — это устройство), черновик значений с отменой (pauseDraft.js; хранится в localStorage) и два применения — на этом устройстве и для всех игроков.
// api — { readServer, saveServer, readDevice, saveDevice } (боевой — TimelineOpenButton: shared/api/scenePausesApi.js и shared/lib/scenePauses.js; стенд и тесты подставляют свой); null — правки нет, только показ.
// run — выбранное прохождение; store — хранилище черновика (тесты).
/** Что сейчас на сервере и на этом устройстве (не бросает) */
const readState = api => Promise.resolve().then(() => api.readServer()).then(r => r, e => ({ ok: false, error: String(e?.message ?? e) }))
  .then(r => ({ srv: r?.ok ? { status: 'ready', pauses: r.value?.pauses ?? {}, error: '' } : { status: 'error', pauses: {}, error: r?.error || 'нет ответа' }, dev: api.readDevice?.()?.pauses ?? {} }))

export function usePauseKnobs({ run, api = null, store = null }) {
  const [box] = useState(() => store ?? safeStore())
  const [h, setH] = useState(() => loadPauseDraft(box))
  const [srv, setSrv] = useState({ status: api ? 'loading' : 'off', pauses: {}, error: '' })
  const [dev, setDev] = useState(() => api?.readDevice?.()?.pauses ?? {})
  const [ui, setUi] = useState({ open: false, focus: null, busy: '', note: '', error: '' })

  const reload = useCallback(() => (api ? readState(api).then(r => { setSrv(r.srv); setDev(r.dev) }) : Promise.resolve()), [api])
  useEffect(() => {
    if (!api) return undefined
    let live = true
    readState(api).then(r => { if (live) { setSrv(r.srv); setDev(r.dev) } })
    return () => { live = false }
  }, [api])

  const k = useMemo(() => collectKnobs(run?.events ?? [], run?.meta ?? {}), [run])
  const usage = useMemo(() => knobUsage(k), [k])
  const eff = useMemo(() => effective(srv.pauses, dev), [srv.pauses, dev])
  const step = useCallback(fn => setH(cur => { const next = fn(cur); if (next !== cur) savePauseDraft(box, next); return next }), [box])

  return useMemo(() => {
    const draft = h.now, list = changes(draft ?? eff.overrides, eff.overrides)
    const act = async (busy, run2) => { setUi(u => ({ ...u, busy, note: '', error: '' })); const r = await run2(); setUi(u => ({ ...u, busy: '', note: r.ok ? r.text : '', error: r.ok ? '' : r.text })); await reload(); return r.ok }
    return {
      k, usage, eff, draft, srv, can: !!api, changes: list, dirty: list.length > 0, overrides: k.overrides,
      serverChanges: changes(draft ?? eff.overrides, srv.pauses), // что изменится на сервере, если применить для всех
      deviceCount: Object.keys(dev).length, serverCount: Object.keys(srv.pauses ?? {}).length,
      value: key => draftValue(draft, eff, key), source: key => sourceName(draft, eff, key),
      /** Поставить значение: '' — принято, иначе причина отказа словами */
      set: (key, ms) => { const r = setDraft(draft, eff, key, ms); if (r.error) return r.error; step(cur => dPush(cur, r.draft)); return '' },
      undo: () => step(dUndo), redo: () => step(dRedo), canUndo: h.past.length > 0, canRedo: h.future.length > 0,
      /** Бросить черновик: на экране снова то, что действует */
      discard: () => step(cur => dPush(cur, null)),
      /** Все настройки черновика — к умолчаниям (ещё не применено) */
      allDefault: () => step(cur => dPush(cur, {})),
      of: span => gapKnobs(span, k), mark: span => gapKnobMark(gapKnobs(span, k)), shorter: (key, to) => shorterBy(k, key, to),
      applyDevice: () => act('device', async () => applyDevice(api, draft ?? eff.overrides, srv.pauses)),
      clearDevice: () => act('device', async () => { const r = api.saveDevice({}); return { ok: !!r?.ok, text: r?.ok ? '📱 Свои значения этого устройства сняты: здесь действует то же, что у всех.' : '✗ Не получилось: хранилище браузера недоступно.' } }),
      applyServer: () => act('server', () => applyServer(api, draft ?? eff.overrides)),
      resetServer: () => act('server', () => applyServer(api, {})),
      reload, ...ui,
      show: (focus = null) => setUi(u => ({ ...u, open: true, focus })), hide: () => setUi(u => ({ ...u, open: false, focus: null })),
    }
  }, [h, eff, k, usage, srv, dev, ui, api, step, reload])
}
