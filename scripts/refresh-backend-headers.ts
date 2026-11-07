/**
 * Refreshes src/features/imports/backend-headers.snapshot.json from a backend checkout:
 *
 *   BACKEND_DIR=../ai-marketplace-os pnpm gen:headers
 *
 * It records the backend commit it read, so a reviewer can see which headers.py the bulk CSV
 * columns were checked against. Commit the JSON together with any change to csv-template.ts.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HEADERS_PY_PATH, parseHeadersPy } from '../src/features/imports/headers-py.ts'

const dir = process.env.BACKEND_DIR || process.env.E2E_BACKEND_DIR
if (!dir) {
  console.error('Set BACKEND_DIR to a backend checkout, for example BACKEND_DIR=../ai-marketplace-os')
  process.exit(1)
}
const backend = resolve(dir)
const contract = parseHeadersPy(readFileSync(join(backend, HEADERS_PY_PATH), 'utf8'))
const sha = execFileSync('git', ['-C', backend, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const out = resolve(import.meta.dirname, '../src/features/imports/backend-headers.snapshot.json')
writeFileSync(out, `${JSON.stringify({ source: HEADERS_PY_PATH, backend_sha: sha, ...contract }, null, 2)}\n`)
console.log(`Wrote ${out} from ${sha.slice(0, 7)}`)
