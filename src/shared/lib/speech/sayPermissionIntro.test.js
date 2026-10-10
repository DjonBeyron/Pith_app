import { describe, it, expect } from 'vitest'
import { decideMic, micGate, pickExplainKind, createSayPermission, EXPLAINED_KEY, PRE_SHOWN_KEY, INTRO_SEEN_KEY, MIC_GRANTED_KEY } from './sayPermission.js'

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m } }
const base = { supported: true, cantSpeak: false, denied: false, perm: 'prompt', explained: false, micOk: false }

// ── Вводный попап (v3.2.19xx): на ВСЕХ платформах один раз, пока флаг pithy_say_intro_seen_v1 не поставлен кнопкой попапа ──
describe('pickExplainKind / decideMic — вводный попап: full | short | intro по платформам', () => {
  const kind = x => pickExplainKind({ perm: 'prompt', explained: false, introSeen: false, micOk: false, preShown: false, ...x })
  const decide = x => decideMic({ ...base, introSeen: false, ...x })

  it('Android Chrome, первый раз (Permissions=prompt, ничего не видели): ПОЛНЫЙ — дальше системный диалог по кнопке попапа', () => {
    expect(kind({})).toBe('full')
    expect(decide({})).toEqual({ action: 'explain', kind: 'full' })
  })

  it('Android Chrome, разрешение уже выдано (Permissions=granted), вводный не видели: INTRO — системного диалога не будет', () => {
    expect(kind({ perm: 'granted' })).toBe('intro')
    expect(kind({ perm: 'granted', explained: true })).toBe('intro')   // полное пояснение видели раньше (до вводного), строки про «не могу говорить» — нет
    expect(decide({ perm: 'granted' })).toEqual({ action: 'explain', kind: 'intro' })
    expect(micGate(decide({ perm: 'granted' }))).toBe('intro')
  })

  it('Android Chrome, пояснение видели раньше, а вводный нет (обновление приложения), перед системным запросом (prompt): ПОЛНЫЙ вместо короткого — там есть строка про «не могу говорить»', () => {
    expect(kind({ perm: 'prompt', explained: true })).toBe('full')
    expect(kind({ perm: 'unavailable', explained: true, preShown: true })).toBe('full')
  })

  it('iPhone Safari (query недоступен = unavailable): первый раз ПОЛНЫЙ; micOk в этом запуске (уже работал) без вводного — INTRO', () => {
    expect(kind({ perm: 'unavailable' })).toBe('full')
    expect(kind({ perm: 'unavailable', micOk: true })).toBe('intro')
    expect(decide({ perm: 'unavailable' })).toEqual({ action: 'explain', kind: 'full' })
  })

  it('десктоп: Chrome (prompt) — ПОЛНЫЙ; Chrome с выданным доступом (granted) — INTRO; Safari без Permissions API — ПОЛНЫЙ', () => {
    expect(kind({ perm: 'prompt' })).toBe('full')
    expect(kind({ perm: 'granted' })).toBe('intro')
    expect(kind({ perm: 'unavailable' })).toBe('full')
  })

  it('вводный УЖЕ видели: ровно прежнее поведение — granted/micOk → null (сразу слушаем), иначе full / short', () => {
    const seen = x => pickExplainKind({ perm: 'prompt', explained: false, introSeen: true, micOk: false, preShown: false, ...x })
    expect(seen({ perm: 'granted' })).toBeNull()
    expect(seen({ micOk: true })).toBeNull()
    expect(seen({})).toBe('full')
    expect(seen({ explained: true })).toBe('short')
    expect(seen({ perm: 'unavailable', explained: true })).toBe('short')
    expect(seen({ perm: 'unavailable', explained: true, preShown: true })).toBeNull()
    expect(decideMic({ ...base, perm: 'granted' })).toEqual({ action: 'listen' }) // introSeen не передан = true
  })

  it('отказ (denied) и недоступность важнее вводного: попапа нет, запасной режим', () => {
    expect(decide({ perm: 'denied' })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decide({ denied: true, perm: 'granted' })).toEqual({ action: 'fallback', reason: 'denied' })
    expect(decide({ supported: false, perm: 'granted' })).toEqual({ action: 'fallback', reason: 'unsupported' })
    expect(decide({ browserBlocked: true })).toEqual({ action: 'fallback', reason: 'browser' })
    expect(decide({ cantSpeak: true, perm: 'granted' })).toEqual({ action: 'fallback', reason: 'cant_speak' })
  })
})

describe('createSayPermission — флаг вводного попапа pithy_say_intro_seen_v1', () => {
  const make = (perm, preset = {}) => {
    const local = store(), session = store()
    for (const [k, v] of Object.entries(preset)) local.setItem(k, v)
    return { p: createSayPermission({ local, session, queryPerm: async () => perm, isSupported: () => true }), local, session }
  }

  it('Android granted: пока флага нет — INTRO; «Понятно, начать» (markIntroSeen) ставит флаг в localStorage, дальше сразу слушаем; access() отдаёт introSeen', async () => {
    const { p, local } = make('granted')
    await p.refresh()
    expect(p.access().introSeen).toBe(false)
    expect(p.decide()).toEqual({ action: 'explain', kind: 'intro' })
    p.markIntroSeen()
    expect(local.m.get(INTRO_SEEN_KEY)).toBe('1')
    expect(p.isIntroSeen()).toBe(true)
    expect(p.access().introSeen).toBe(true)
    expect(p.decide()).toEqual({ action: 'listen' })
  })

  it('«Не сейчас» / тап мимо (ничего не вызывается) флаг НЕ ставят — вводный покажем снова', async () => {
    const { p, local } = make('granted')
    await p.refresh()
    expect(p.decide().kind).toBe('intro')
    expect(local.m.has(INTRO_SEEN_KEY)).toBe(false)
    expect(p.decide().kind).toBe('intro')
  })

  it('существующий флаг доступа pithy_say_mic_granted_v1 не затронут вводным: ставится только markMicOk, вводный его не ставит и не снимает', async () => {
    const { p, local } = make('unavailable', { [MIC_GRANTED_KEY]: '1' })
    await p.refresh()
    expect(p.access()).toEqual({ permission: 'unavailable', flag: true, sessionOk: false, introSeen: false })
    p.markIntroSeen()
    expect(local.m.get(MIC_GRANTED_KEY)).toBe('1')
    p.markMicOk()
    expect(local.m.get(INTRO_SEEN_KEY)).toBe('1')
  })

  it('iPhone: полный → «Продолжить» (markExplained + markIntroSeen) → на следующем запуске (sessionStorage пуст) — КОРОТКИЙ, вводного больше нет', async () => {
    const { p, local } = make('unavailable')
    await p.refresh()
    expect(p.decide()).toEqual({ action: 'explain', kind: 'full' })
    p.markExplained(); p.markIntroSeen(); p.markPreShown()
    const next = createSayPermission({ local, session: store(), queryPerm: async () => 'unavailable', isSupported: () => true })
    await next.refresh()
    expect(next.decide()).toEqual({ action: 'explain', kind: 'short' })
  })
})
