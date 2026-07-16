// Маппер ошибок Supabase Auth (регистрация/вход) на понятный русский текст.
// Без UI — используется и в панели регистрации урока, и в форме на вкладке «Войти».
export function supabaseErrorToRu(error) {
  const msg    = (error?.message ?? '').toLowerCase()
  const code   = error?.code ?? ''
  const status = error?.status ?? 0
  if (code === 'user_already_exists' || msg.includes('already registered') || msg.includes('already exists'))
    return 'Пользователь с таким email уже существует'
  if (msg.includes('invalid email') || msg.includes('unable to validate email'))
    return 'Неверный формат email'
  if (msg.includes('password') && (msg.includes('short') || msg.includes('characters') || msg.includes('6')))
    return 'Пароль слишком короткий — минимум 6 символов'
  if (msg.includes('password') && msg.includes('weak'))
    return 'Пароль слишком простой — добавь цифры или символы'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Слишком много попыток — подожди немного'
  if (status === 500)
    return 'Ошибка сервера — попробуй позже'
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Нет соединения с сервером — проверь интернет'
  return `Ошибка: ${error?.message || 'неизвестная ошибка'}`
}
