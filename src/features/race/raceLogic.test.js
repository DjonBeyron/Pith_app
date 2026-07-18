import { describe, it, expect } from 'vitest'
import { weekKey, racePhase, RACE_UNLOCK_SHARE } from './useRaceState.js'

describe('weekKey — ключ недели (понедельник — начало)', () => {
  it('понедельник даёт сам себя', () => {
    expect(weekKey(new Date('2026-07-13T10:00:00'))).toBe('2026-7-13')
  })

  it('вся неделя (ср, вс) сворачивается в тот же понедельник', () => {
    expect(weekKey(new Date('2026-07-15T23:59:59'))).toBe('2026-7-13')
    expect(weekKey(new Date('2026-07-19T00:00:01'))).toBe('2026-7-13')
  })

  it('следующий понедельник — новый ключ', () => {
    expect(weekKey(new Date('2026-07-20T00:00:00'))).toBe('2026-7-20')
  })

  it('граница года: четверг 1 января → понедельник прошлого года', () => {
    expect(weekKey(new Date('2026-01-01T12:00:00'))).toBe('2025-12-29')
  })
})

describe('racePhase — фаза гонки по серверным датам', () => {
  const race = {
    starts_at: '2026-07-18T09:00:00Z',
    ends_at:   '2026-07-19T21:00:00Z',
  }
  const t = iso => new Date(iso).getTime()

  it('нет гонки или дат → none', () => {
    expect(racePhase(null)).toBe('none')
    expect(racePhase({})).toBe('none')
    expect(racePhase({ starts_at: race.starts_at })).toBe('none')
  })

  it('до старта → upcoming', () => {
    expect(racePhase(race, t('2026-07-18T08:59:59Z'))).toBe('upcoming')
  })

  it('ровно в момент старта → running', () => {
    expect(racePhase(race, t('2026-07-18T09:00:00Z'))).toBe('running')
  })

  it('во время гонки и ровно в момент конца → running', () => {
    expect(racePhase(race, t('2026-07-19T00:00:00Z'))).toBe('running')
    expect(racePhase(race, t('2026-07-19T21:00:00Z'))).toBe('running')
  })

  it('после конца → ended', () => {
    expect(racePhase(race, t('2026-07-19T21:00:01Z'))).toBe('ended')
  })
})

describe('порог открытия гонки', () => {
  it('доля — ровно 80%', () => {
    expect(RACE_UNLOCK_SHARE).toBe(0.8)
  })

  it('порог считается как ceil(total × 0.8) — как в useRaceState', () => {
    // Дробный порог округляется вверх: 341 XP → 273, а не 272
    expect(Math.ceil(340 * RACE_UNLOCK_SHARE)).toBe(272)
    expect(Math.ceil(341 * RACE_UNLOCK_SHARE)).toBe(273)
    expect(Math.ceil(0 * RACE_UNLOCK_SHARE)).toBe(0)
  })
})
