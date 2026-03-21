import fs from 'node:fs'
import path from 'node:path'
import { analyzeImpact } from './impactAnalysis.js'
import { generateAiTestPlan } from './geminiPlan.js'
import { runPlaywright } from './playwrightRunner.js'

const SPEC_MAP = {
  auth: 'tests/auth.spec.ts',
  wallet: 'tests/wallet.spec.ts',
  watchlist: 'tests/watchlist.spec.ts',
  portfolio: 'tests/portfolio.spec.ts',
}

async function detectFrontendBaseUrl() {
  const candidates = ['5174', '5173']
  for (const p of candidates) {
    const url = `http://127.0.0.1:${p}/api/health`
    try {
      const r = await fetch(url)
      if (r.ok) return `http://127.0.0.1:${p}`
    } catch {
      // try next
    }
  }
  return null
}

function uniq(arr) {
  return Array.from(new Set(arr))
}

function buildHeuristicPlan(impact) {
  const steps = []

  const impactedSuites = Array.isArray(impact?.impactedSuites) ? impact.impactedSuites : []
  const has = (k) => impactedSuites.includes(k)

  // Always assert dashboard navigation is available after seeded login.
  steps.push({ type: 'expectVisible', testId: 'nav-market' })

  if (has('wallet')) {
    steps.push({ type: 'depositToWallet', amount: 5000 })
    steps.push({ type: 'expectVisible', testId: 'wallet-balance' })
  }

  if (has('watchlist')) {
    steps.push({ type: 'toggleWatchlist', symbol: 'RELIANCE' })
  }

  if (has('portfolio')) {
    steps.push({ type: 'selectStockInMarket', symbol: 'RELIANCE' })
    steps.push({ type: 'buySelectedStock', qty: 1 })
    steps.push({ type: 'nav', testId: 'nav-portfolio' })
    steps.push({ type: 'expectVisible', testId: 'portfolio-holdings-table' })
    steps.push({ type: 'expectVisible', testId: 'holding-row-RELIANCE' })
  }

  return { steps }
}

export async function runAiRegression({ changedFiles, trigger = 'watcher' }) {
  const runId = `ai_run_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const runDir = path.join(process.cwd(), 'server', 'data', 'ai-runs', runId)
  fs.mkdirSync(runDir, { recursive: true })

  const report = {
    id: runId,
    createdAt: new Date().toISOString(),
    trigger,
    changedFiles: changedFiles ?? [],
    impact: null,
    aiPlan: null,
    phases: [],
    status: 'RUNNING',
  }

  const frontendBaseUrl = await detectFrontendBaseUrl()
  report.environment = { frontendBaseUrl }

  // Impact analysis (heuristic; Gemini can refine plan too).
  const impact = analyzeImpact(changedFiles ?? [])
  report.impact = impact

  const heuristicPlan = buildHeuristicPlan(impact)

  // Generate plan via Gemini if configured.
  let chosenPlan = heuristicPlan
  let aiPlanSource = 'heuristic'
  let geminiReason = null
  try {
    const { plan, reason } = await generateAiTestPlan({
      changedFiles: uniq(changedFiles ?? []),
      impactSummary: impact.summary,
    })

    if (plan) {
      chosenPlan = plan
      aiPlanSource = 'gemini'
      geminiReason = null
    } else {
      aiPlanSource = 'heuristic'
      geminiReason = reason || 'Gemini not enabled.'
    }
  } catch (err) {
    aiPlanSource = 'heuristic'
    geminiReason = err instanceof Error ? err.message : String(err)
  }

  report.aiPlan = { source: aiPlanSource, reason: geminiReason ?? undefined, plan: chosenPlan }
  const aiPlanPath = path.join(runDir, 'ai-plan.json')
  fs.writeFileSync(aiPlanPath, JSON.stringify(chosenPlan, null, 2))

  const impactedSuites = impact.impactedSuites
  const specFiles = impactedSuites.map((s) => SPEC_MAP[s]).filter(Boolean)

  // Always run baseline impacted suites.
  if (!frontendBaseUrl) {
    report.status = 'FAILED'
    report.error = 'Frontend dev server not reachable. Start it (stockboard) before running AI regression.'
  } else {
    const env = {
      E2E_BASE_URL: frontendBaseUrl,
    }

    try {
      const baselineRes = await runPlaywright({
        runDir: path.join(runDir, 'baseline'),
        specFiles,
        env,
      })
      report.phases.push({ name: 'baseline', ...baselineRes })
    } catch (err) {
      report.phases.push({
        name: 'baseline',
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Run AI plan if available.
    try {
      const aiRes = await runPlaywright({
        runDir: path.join(runDir, 'ai'),
        specFiles: ['tests/aiPlanRunner.spec.ts'],
        env: {
          ...env,
          AI_PLAN_PATH: aiPlanPath,
        },
      })
      report.phases.push({ name: 'ai', ...aiRes })
    } catch (err) {
      report.phases.push({
        name: 'ai',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Decide final status.
  const baselineSummary = report.phases.find((p) => p.name === 'baseline')?.summary
  const aiSummary = report.phases.find((p) => p.name === 'ai')?.summary
  const failedCount = (baselineSummary?.failed ?? 0) + (aiSummary?.failed ?? 0)
  report.status = failedCount > 0 ? 'FAILED' : report.status === 'RUNNING' ? 'PASSED' : report.status

  fs.writeFileSync(path.join(process.cwd(), 'server', 'data', 'ai-latest.json'), JSON.stringify(report, null, 2))
  return report
}

