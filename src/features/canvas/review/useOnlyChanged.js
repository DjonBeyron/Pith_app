import { useState } from 'react'

const KEY = 'pithy-review-onlychanged'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** «Только изменённые» в ленте: запоминается; true, только если кнопка «Изменения» включена */
export function useOnlyChanged() {
  const [on, setOn] = useState(read)
  const set = v => { setOn(v); try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* нет хранилища */ } }
  return [on, set]
}

