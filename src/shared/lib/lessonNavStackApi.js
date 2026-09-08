import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// Стек паузы/возврата: переход по ноде lesson_ref на другой урок/модуль
// ставит текущий урок «на паузу» (id уходит в стек), выход из целевого —
// снимает верхний id и возвращает туда. Одна строка на пользователя
// (lesson_nav_stack.stack — jsonb-массив id уроков, top = конец массива).
// Гость — тот же массив в localStorage.
const LS_KEY = 'pithy_lesson_nav_stack_v1'

async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') }
  catch { return [] }
}
function writeLocal(stack) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(stack)) } catch { /* недоступен */ }
}

export async function getNavStack() {
  const user = await currentUser()
  if (!user) return readLocal()
  const { data, error } = await supabase.from('lesson_nav_stack').select('stack').maybeSingle()
  if (error) { dbg('[DB ERROR] lesson_nav_stack get', error.message); return [] }
  return data?.stack ?? []
}

async function writeStack(user, stack) {
  const { error } = await supabase.from('lesson_nav_stack').upsert(
    { user_id: user.id, stack, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) dbg('[DB ERROR] lesson_nav_stack write', error.message)
}

export async function pushNavStack(lessonId) {
  const user = await currentUser()
  if (!user) { const s = readLocal(); s.push(lessonId); writeLocal(s); return s }
  const s = await getNavStack()
  s.push(lessonId)
  await writeStack(user, s)
  return s
}

// Снимает и возвращает верхний id стека (null, если стек пуст)
export async function popNavStack() {
  const user = await currentUser()
  if (!user) { const s = readLocal(); const top = s.pop() ?? null; writeLocal(s); return top }
  const s = await getNavStack()
  const top = s.pop() ?? null
  await writeStack(user, s)
  return top
}
