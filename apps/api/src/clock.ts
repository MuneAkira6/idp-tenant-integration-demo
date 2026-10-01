/**
 * The one injectable clock (research R-11, FR-032).
 *
 * The running system uses `systemClock()` and the real intervals — an hour is an hour and 30 days are
 * 30 days. Tests use `manualClock()` and advance it, and say in the test that they do.
 */

export const SECOND_MS = 1000
export const MINUTE_MS = 60 * SECOND_MS
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

/** Stops a repeating timer started with `every`. */
export type CancelTimer = () => void

export type Clock = {
  now(): Date
  /** Run `fn` every `intervalMs`, starting one interval from now. */
  every(intervalMs: number, fn: () => void | Promise<void>): CancelTimer
}

export type ScheduledTimer = { intervalMs: number; runs: number }

export type ManualClock = Clock & {
  /** Move time forward and run every timer that comes due, in order, awaiting each. */
  advance(ms: number): Promise<void>
  /** The timers currently scheduled, for the wiring test of FR-032. */
  timers(): ScheduledTimer[]
}

/**
 * The largest delay Node accepts. A longer one **overflows to 1 ms**, so `setInterval` with the 30-day
 * expiry interval of FR-032 would run the job about a thousand times a second instead of monthly.
 * Long intervals are therefore counted down in chunks.
 */
export const MAX_TIMER_DELAY_MS = 2_147_483_647

export function systemClock(): Clock {
  return {
    now: () => new Date(),
    every(intervalMs, fn) {
      let cancelled = false
      let handle: ReturnType<typeof setTimeout> | null = null

      const wait = (remaining: number): void => {
        const slice = Math.min(remaining, MAX_TIMER_DELAY_MS)
        handle = setTimeout(() => {
          if (cancelled) return
          const left = remaining - slice
          if (left > 0) {
            wait(left)
            return
          }
          void fn()
          wait(intervalMs)
        }, slice)
        // Do not hold the process open for a timer alone.
        if (typeof handle.unref === 'function') handle.unref()
      }

      wait(intervalMs)
      return () => {
        cancelled = true
        if (handle) clearTimeout(handle)
      }
    },
  }
}

type ManualTimer = {
  intervalMs: number
  nextAt: number
  fn: () => void | Promise<void>
  cancelled: boolean
  runs: number
}

/**
 * A clock a test drives by hand. `advance` runs due timers in time order, so advancing two hours runs
 * an hourly timer twice.
 */
export function manualClock(start: Date = new Date('2026-09-30T00:00:00.000Z')): ManualClock {
  let currentMs = start.getTime()
  const scheduled: ManualTimer[] = []

  return {
    now: () => new Date(currentMs),
    every(intervalMs, fn) {
      const timer: ManualTimer = {
        intervalMs,
        nextAt: currentMs + intervalMs,
        fn,
        cancelled: false,
        runs: 0,
      }
      scheduled.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    async advance(ms) {
      const target = currentMs + ms
      for (;;) {
        const due = scheduled
          .filter((timer) => !timer.cancelled && timer.nextAt <= target)
          .sort((a, b) => a.nextAt - b.nextAt)[0]
        if (!due) break
        currentMs = due.nextAt
        due.nextAt += due.intervalMs
        due.runs += 1
        await due.fn()
      }
      currentMs = target
    },
    timers() {
      return scheduled
        .filter((timer) => !timer.cancelled)
        .map((timer) => ({ intervalMs: timer.intervalMs, runs: timer.runs }))
    },
  }
}
