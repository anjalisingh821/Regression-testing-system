import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

function spawnPromise(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options)
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('close', (code) => {
      if (code === 0) resolve({ code, stdout, stderr })
      else reject(Object.assign(new Error(`Command failed with exit code ${code}`), { stdout, stderr, code }))
    })
  })
}

function parsePlaywrightJsonResults(raw) {
  const data = JSON.parse(raw)

  const failures = []
  let passed = 0
  let failed = 0

  for (const suite of data.suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = Array.isArray(test.results) ? test.results : []
        const anyFailed = results.some((r) => r?.status && r.status !== 'passed')
        const anyPassed = results.some((r) => r?.status === 'passed')

        // Playwright JSON reporter: pass/fail lives under each `results[]` entry.
        if (anyPassed && !anyFailed) {
          passed += 1
        } else {
          failed += 1
          const allErrors = results.flatMap((r) => (Array.isArray(r?.errors) ? r.errors : []))
          failures.push({
            title: test.title ?? spec.title,
            status: results.find((r) => r?.status && r.status !== 'passed')?.status ?? 'failed',
            errors: allErrors,
          })
        }
      }
    }
  }

  return { passed, failed, failures }
}

export async function runPlaywright({ runDir, specFiles, env }) {
  fs.mkdirSync(runDir, { recursive: true })

  const resultsFile = path.join(runDir, 'results.json')
  const out = path.join(runDir, 'output.txt')

  const pwEnv = {
    ...process.env,
    ...env,
    PW_JSON_OUTPUT_FILE: resultsFile,
  }

  const args = ['playwright', 'test', ...specFiles]

  // Use npx to ensure the local playwright version is used.
  const started = Date.now()
  const result = await spawnPromise('npx', args, {
    cwd: path.join(process.cwd(), '.'),
    env: pwEnv,
    shell: true,
  }).catch((e) => {
    fs.writeFileSync(out, `${e.stdout ?? ''}\n\n${e.stderr ?? ''}`)
    throw e
  })

  fs.writeFileSync(out, `${result.stdout ?? ''}\n\n${result.stderr ?? ''}`)

  const raw = fs.readFileSync(resultsFile, 'utf-8')
  const parsed = parsePlaywrightJsonResults(raw)

  return {
    runMs: Date.now() - started,
    resultsFile,
    summary: parsed,
  }
}

