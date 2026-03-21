export function analyzeImpact(changedFiles) {
  const files = changedFiles.map((f) => f.toLowerCase())

  const impacted = new Set()

  for (const f of files) {
    if (f.includes('src/app.tsx') || f.includes('src/app') || f.includes('signup') || f.includes('login')) {
      impacted.add('auth')
    }
    if (f.includes('src/stockapp.tsx') || f.includes('src/app.css') || f.includes('wallet') || f.includes('watchlist')) {
      impacted.add('wallet')
      impacted.add('watchlist')
      impacted.add('portfolio')
    }
    if (f.includes('tests/') || f.includes('playbook.ts') || f.includes('playwright.config.ts')) {
      // Test infra changed: safest is to rerun everything.
      impacted.add('auth')
      impacted.add('wallet')
      impacted.add('watchlist')
      impacted.add('portfolio')
    }
  }

  if (impacted.size === 0) {
    impacted.add('auth')
    impacted.add('wallet')
    impacted.add('watchlist')
    impacted.add('portfolio')
  }

  return {
    impactedSuites: Array.from(impacted),
    summary: `Heuristic impact analysis based on changed files: ${changedFiles.slice(0, 6).join(', ')}${changedFiles.length > 6 ? '...' : ''}`,
  }
}

