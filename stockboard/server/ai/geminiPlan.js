import { GoogleGenerativeAI } from '@google/generative-ai'

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

export async function generateAiTestPlan({ changedFiles, impactSummary }) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!isNonEmptyString(apiKey)) {
    return { plan: null, reason: 'GEMINI_API_KEY is not set.' }
  }

  if (String(process.env.AI_ENABLE_GEMINI ?? 'true').toLowerCase() !== 'true') {
    return { plan: null, reason: 'AI_ENABLE_GEMINI is false.' }
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const model = genAI.getGenerativeModel({ model: modelName })

  const validSymbols = [
    'RELIANCE',
    'TCS',
    'INFY',
    'HDFCBANK',
    'ICICIBANK',
    'SBIN',
    'BHARTIARTL',
    'KOTAKBANK',
    'ITC',
    'AXISBANK',
    'SUNPHARMA',
    'MARUTI',
  ]

  const prompt = `
You are an expert QA engineer. Generate an AI test plan for the StockPulse web app.

CRITICAL: This app has INDIAN stocks only. Use ONLY these symbols: ${validSymbols.join(', ')}.
Never use AAPL, MSFT, GOOG, or any other symbol not in this list.

The Playwright app runner supports the following step types:
- {"type":"depositToWallet","amount":number}
- {"type":"nav","testId":"nav-market"|"nav-watchlist"|"nav-portfolio"|"nav-logout"}
- {"type":"selectStockInMarket","symbol":string}  (symbol MUST be from the list above)
- {"type":"buySelectedStock","qty":number}
- {"type":"toggleWatchlist","symbol":string}  (symbol MUST be from the list above)
- {"type":"expectVisible","testId":string}
- {"type":"expectTextContains","testId":string,"text":string}

Stable data-testids used in this app:
- nav-market, nav-watchlist, nav-portfolio
- wallet-balance, wallet-amount, wallet-add-btn, wallet-withdraw-btn, wallet-message
- ticket-side-buy, ticket-qty, ticket-submit
- watch-toggle-<SYMBOL>  (e.g. watch-toggle-RELIANCE)
- toast-message
- portfolio-holdings-table
- holding-row-<SYMBOL>  (e.g. holding-row-TCS)

Notes: (1) There is no toast for watchlist add/remove - use expectVisible for watch-toggle-<SYMBOL> instead of expectTextContains. (2) After purchase, toast contains "Bought" - use expectTextContains with "text":"Bought" for buy success. (3) Keep steps focused and relevant to the changed files.

Output ONLY valid JSON matching this schema:
{
  "steps": Step[]
}

Step must be one of the supported step objects.

Changed files:
${changedFiles.map((f) => `- ${f}`).join('\n')}

Impact analysis summary (may be heuristic):
${impactSummary}
`.trim()

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  // Try to extract JSON from the response.
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  let jsonRaw = jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text

  // Strip comment-only lines (Gemini sometimes adds // comments; full-line only to avoid breaking URLs in strings).
  jsonRaw = jsonRaw
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line) && !/^\s*\/\*/.test(line))
    .join('\n')
  jsonRaw = jsonRaw.replace(/\/\*[\s\S]*?\*\//g, '')

  const plan = JSON.parse(jsonRaw)

  // Minimal validation.
  if (!plan || !Array.isArray(plan.steps)) throw new Error('AI plan missing steps.')

  return { plan }
}

