import { describe, it, expect } from 'vitest'
import { positionToolbar } from './positionToolbar.js'

const viewport = { width: 1000, height: 800 }

describe('positionToolbar — тулбар сбоку от выделения, с клампингом', () => {
  it('без выделения — некуда вставать', () => {
    expect(positionToolbar(null, 200, 150, viewport)).toBeNull()
  })

  it('обычный случай — справа от выделения, приподнят на две строки', () => {
    const rect = { left: 400, right: 500, top: 300, bottom: 320 }
    const pos = positionToolbar(rect, 200, 150, viewport, 18)
    expect(pos.left).toBe(500 + 10)
    expect(pos.top).toBe(300 - 18 * 2)
  })

  it('у правого края — переворачивается налево', () => {
    const rect = { left: 900, right: 950, top: 300, bottom: 320 }
    const pos = positionToolbar(rect, 200, 150, viewport, 18)
    expect(pos.left).toBe(900 - 10 - 200)
  })

  it('у самого верха — верх зажат в границы окна, не уходит за экран', () => {
    const rect = { left: 400, right: 500, top: 10, bottom: 30 }
    const pos = positionToolbar(rect, 200, 150, viewport, 18)
    expect(pos.top).toBe(8)
  })

  it('у самого низа — не вылезает за нижний край', () => {
    const rect = { left: 400, right: 500, top: 780, bottom: 800 }
    const pos = positionToolbar(rect, 200, 150, viewport, 18)
    expect(pos.top).toBe(800 - 150 - 8)
  })
})
