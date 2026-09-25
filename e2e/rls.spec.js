import { test, expect } from './fixtures.js'
import { assertLocalBackend } from './helpers/backend.js'
import { MODULE_ID } from './config.js'

// Права доступа на уровне БАЗЫ (RLS), без браузера: прямые запросы в REST
// Supabase от имени гостя, обычного пользователя и админа. UI может спрятать
// кнопку, но настоящая защита — политики в БД; тут проверяем именно их.
// Только локальный стек: тест создаёт и удаляет строки с правами админа.

test.beforeAll(() => assertLocalBackend())

const API  = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY

async function login(email, password) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(r.status, `вход ${email}`).toBe(200)
  const j = await r.json()
  return { token: j.access_token, uid: j.user.id }
}

// token не передан — запрос от гостя (анонимный ключ)
async function rest(path, { token = ANON, method = 'GET', body } = {}) {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body && JSON.stringify(body),
  })
  const text = await r.text()
  return { status: r.status, rows: text ? JSON.parse(text) : null }
}

const asUser  = () => login(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
const asAdmin = () => login(process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD)

test('пользователь не может выдать себе is_admin', async () => {
  const { token, uid } = await asUser()
  await rest(`user_profiles?id=eq.${uid}`, { token, method: 'PATCH', body: { is_admin: true } })
  const { rows } = await rest(`user_profiles?id=eq.${uid}&select=is_admin`, { token })
  expect(rows).toEqual([{ is_admin: false }])
})

test('пользователь не может править чужой контент', async () => {
  const { token } = await asUser()
  await rest(`curricula?id=eq.${MODULE_ID}`, { token, method: 'PATCH', body: { title: 'ВЗЛОМ' } })
  const { rows } = await rest(`curricula?id=eq.${MODULE_ID}&select=title`)
  expect(rows).toEqual([{ title: 'E2E-ТЕСТ' }])

  const ins = await rest('lessons', {
    token, method: 'POST', body: { id: crypto.randomUUID(), title: 'ВЗЛОМ' },
  })
  expect(ins.status, 'вставка урока обычным пользователем').toBeGreaterThanOrEqual(400)
})

test('черновик модуля видит только админ', async () => {
  const admin = await asAdmin()
  const user  = await asUser()
  const id = crypto.randomUUID()
  const created = await rest('curricula', {
    token: admin.token, method: 'POST', body: { id, title: 'E2E-черновик', published: false },
  })
  expect(created.status, 'админ создаёт модуль').toBe(201)
  try {
    expect((await rest(`curricula?id=eq.${id}`)).rows, 'гость').toEqual([])
    expect((await rest(`curricula?id=eq.${id}`, { token: user.token })).rows, 'пользователь').toEqual([])
    expect((await rest(`curricula?id=eq.${id}`, { token: admin.token })).rows).toHaveLength(1)
  } finally {
    await rest(`curricula?id=eq.${id}`, { token: admin.token, method: 'DELETE' })
  }
})
