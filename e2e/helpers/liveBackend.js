import { createClient } from '@supabase/supabase-js'

// Доступ к настоящей базе из теста (Node, не из страницы) под тестовым аккаунтом: проверить, что приложение записало (word_memory,
// user_profiles, module_likes), и привести аккаунт к нужному состоянию. Только то, что разрешено RLS самому пользователю:
//   читать свои word_memory / user_profiles / module_likes; удалять и ставить свои module_likes;
//   RPC set_remind_time, memory_seed_word. Писать в word_memory и профиль напрямую нельзя (только select, 20260924120000_word_memory.sql).
// Полный сброс памяти и профиля умеет только RPC e2e_reset_me (миграция 20261028110000_e2e_reset_me.sql, по списку app_settings.e2e_accounts):
// если её нет или аккаунт не внесён — reset возвращает { full: false } и сценарий честно пишет, что аккаунт не «новичок».

// Вход без капчи не пройдёт, если она включена на сервере: ошибка объясняет это
export async function liveClient(acc) {
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email: acc.email, password: acc.password })
  if (error) {
    const captcha = /captcha/i.test(error.message) ? ' Капча Supabase включена: см. TESTING.md → «E2E против настоящей базы».' : ''
    throw new Error(`Вход тестового аккаунта в базу не удался: ${error.message}.${captcha}`) // адрес в тексте не пишем: отчёт попадает в артефакт
  }
  const uid = data.user.id
  const one = async q => { const { data: d, error: e } = await q; if (e) throw new Error(e.message); return d }
  return {
    sb, uid,
    memoryRows: () => one(sb.from('word_memory').select('word, step, due_on').eq('user_id', uid)),
    profile: () => one(sb.from('user_profiles').select('tz, remind_at, remind_enabled, next_remind_at, ear_level, vocab_level, prompt_group').eq('id', uid).maybeSingle()),
    likes: () => one(sb.from('module_likes').select('module_id').eq('user_id', uid)),
    deleteLikes: () => one(sb.from('module_likes').delete().eq('user_id', uid).select('module_id')),
    close: () => sb.auth.signOut({ scope: 'local' }).catch(() => {}),
  }
}

// Привести аккаунт к «новичку» тем, что позволено. → { full, memory, likes, note }
//  - лайки: удаляем свои строки module_likes всегда (политика module_likes_write_own);
//  - память, профиль (напоминание, уровень, группа Пита): RPC e2e_reset_me; нет её → хотя бы выключаем напоминание set_remind_time(null, false).
//    НЕ сбрасывается без e2e_reset_me: word_memory, review_events, ear/vocab_level, prompt_group, tz, XP/серия/пройденные уроки.
export async function resetLiveAccount(acc) {
  const c = await liveClient(acc)
  try {
    const likes = (await c.deleteLikes()).length
    const { data, error } = await c.sb.rpc('e2e_reset_me')
    if (!error && data?.ok) return { full: true, memory: data.memory, likes: likes + (data.likes ?? 0), note: 'полный сброс (e2e_reset_me)' }
    const why = error ? error.message : data?.reason
    await c.sb.rpc('set_remind_time', { p_remind_at: null, p_enabled: false })
    return { full: false, memory: null, likes, note: `память и профиль не сброшены (e2e_reset_me: ${why}); выключено только напоминание` }
  } finally {
    await c.close()
  }
}

// Занести в память слова, пока их не станет хотя бы need (слова берём из переводов опубликованных модулей — так «Скажи вслух» видит перевод).
// memory_seed_word сам проверяет, что у слова есть урок-слово. → { words: [слово…] (все слова в памяти), seeded: сколько добавлено, withTranslation }
export async function ensureMemoryWords(acc, need) {
  const c = await liveClient(acc)
  try {
    const { data: mods, error } = await c.sb.from('curricula').select('word_translations').eq('published', true).limit(200)
    if (error) throw new Error(error.message)
    const cands = [...new Set((mods ?? []).flatMap(m => (Array.isArray(m.word_translations) ? m.word_translations : []))
      .filter(e => e?.w && e?.t && /^[A-Za-z]+$/.test(String(e.w).trim())).map(e => String(e.w).trim().toLowerCase()))]
    const have = new Set((await c.memoryRows()).map(r => r.word))
    const withTr = () => cands.filter(w => have.has(w)).length
    let seeded = 0
    let tries = 0
    for (const w of cands) {
      if (withTr() >= need || tries >= 40) break // 40 попыток — потолок: слова без урока сервер отвергает (not_word)
      if (have.has(w)) continue
      tries++
      const { data } = await c.sb.rpc('memory_seed_word', { p_word: w, p_module_id: null })
      if (data?.ok) { have.add(data.word ?? w); seeded++ }
    }
    const withTranslation = withTr()
    return { words: [...have], seeded, withTranslation }
  } finally {
    await c.close()
  }
}

// Выставить напоминание аккаунту (для сценария «второй день»: в настройках должно стоять «Напоминание: 20:00»)
export async function setRemind(acc, hhmm, enabled = true) {
  const c = await liveClient(acc)
  try {
    const { data, error } = await c.sb.rpc('set_remind_time', { p_remind_at: hhmm, p_enabled: enabled })
    if (error) throw new Error(error.message)
    return data
  } finally {
    await c.close()
  }
}

// Конец сценария: гасим ВСЕ сессии аккаунта (в том числе браузерную). В трассах и видео артефакта остаются токены входа и сам вход, а репозиторий
// публичный — после глобального выхода эти токены мёртвые (скрипт scripts/e2e-scrub-evidence.sh дополнительно вычищает пароли и адреса)
export async function revokeLiveSessions(acc) {
  const c = await liveClient(acc)
  await c.sb.auth.signOut({ scope: 'global' })
}
