/** The run's generated secrets, read from the env file outside the repository (goal-brief, red line 5). */

import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function stackEnv(): Record<string, string> {
  const path = process.env.ACME_IDP_ENV_FILE ?? join(tmpdir(), 'acme-idp-demo.env')
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 1)
  }
  return out
}
