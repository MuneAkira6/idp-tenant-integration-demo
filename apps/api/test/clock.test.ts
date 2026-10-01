import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS, MAX_TIMER_DELAY_MS, manualClock, systemClock } from '../src/clock.ts'

describe('the injectable clock (research R-11, FR-032)', () => {
  it('the running system uses the real clock', () => {
    const before = Date.now()
    const now = systemClock().now().getTime()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })

  it('the real intervals are the real values, not shortened for the tests', () => {
    expect(HOUR_MS).toBe(3_600_000)
    expect(DAY_MS).toBe(86_400_000)
    expect(30 * DAY_MS).toBe(2_592_000_000)
  })

  // This test advances the injected clock instead of waiting (FR-032).
  it('advancing two hours runs an hourly timer twice', async () => {
    const clock = manualClock(new Date('2026-09-30T00:00:00.000Z'))
    const seen: string[] = []
    clock.every(HOUR_MS, () => {
      seen.push(clock.now().toISOString())
    })

    await clock.advance(HOUR_MS - 1)
    expect(seen).toEqual([])

    await clock.advance(2 * HOUR_MS)
    expect(seen).toEqual(['2026-09-30T01:00:00.000Z', '2026-09-30T02:00:00.000Z'])
    expect(clock.now().toISOString()).toBe('2026-09-30T02:59:59.999Z')
  })

  // This test advances the injected clock instead of waiting (FR-032).
  it('awaits an asynchronous timer before the next one runs', async () => {
    const clock = manualClock()
    const order: string[] = []
    clock.every(HOUR_MS, async () => {
      order.push('start')
      await Promise.resolve()
      order.push('end')
    })
    await clock.advance(2 * HOUR_MS)
    expect(order).toEqual(['start', 'end', 'start', 'end'])
  })

  it('a cancelled timer stops running and is no longer scheduled', async () => {
    const clock = manualClock()
    let runs = 0
    const cancel = clock.every(HOUR_MS, () => {
      runs += 1
    })
    await clock.advance(HOUR_MS)
    cancel()
    await clock.advance(5 * HOUR_MS)
    expect(runs).toBe(1)
    expect(clock.timers()).toEqual([])
  })

  it('reports the intervals it has scheduled, for the wiring check of FR-032', async () => {
    const clock = manualClock()
    clock.every(HOUR_MS, () => {})
    clock.every(30 * DAY_MS, () => {})
    expect(clock.timers().map((t) => t.intervalMs)).toEqual([HOUR_MS, 30 * DAY_MS])
  })
})

describe('a timer longer than Node accepts (FR-032)', () => {
  it('does not fire at once: 30 days is counted down, not handed to setInterval', async () => {
    // 30 days in milliseconds is larger than the largest delay Node accepts, and a delay that
    // overflows is clamped to 1 ms — so a naive `setInterval(fn, 30 * DAY_MS)` runs the job about a
    // thousand times a second. The expiry job of FR-032 is scheduled at exactly that interval.
    expect(30 * DAY_MS).toBeGreaterThan(MAX_TIMER_DELAY_MS)

    let runs = 0
    const cancel = systemClock().every(30 * DAY_MS, () => {
      runs += 1
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    cancel()
    expect(runs).toBe(0)
  })

  it('a short interval still fires on time', async () => {
    let runs = 0
    const cancel = systemClock().every(10, () => {
      runs += 1
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    cancel()
    expect(runs).toBeGreaterThanOrEqual(2)

    const afterCancel = runs
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(runs).toBe(afterCancel)
  })
})
