import type { APIRequestContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const SESSION_KEY = 'stockboard_session_v1'
const BACKEND_BASE_URL = process.env.E2E_BACKEND_BASE_URL || 'http://127.0.0.1:4000'

export async function resolveFrontendBaseUrl() {
  const candidates = [
    process.env.E2E_BASE_URL,
    'http://127.0.0.1:5174',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    try {
      const url = c.endsWith('/') ? c : `${c}/`
      const r = await fetch(url)
      if (!r.ok) continue
      // We can't reliably detect React runtime markers from HTML alone.
      // Pick the first port that responds; prefer 5174.
      return c
    } catch {
      // try next
    }
  }
  throw new Error(`No reachable frontend found. Tried: ${candidates.join(', ')}`)
}

export const E2E_PASSWORD = 'Aa1!aaaa' // matches our frontend strong-password regex

export function parseMoney(text: string) {
  // "₹ 1,000.00" -> 1000.00
  const cleaned = text.replace(/[^\d.]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

export async function loginViaApiAndSeedSession(params: {
  page: Page
  request: APIRequestContext
  email: string
  name: string
  password: string
}) {
  const { page, request, email, name, password } = params

  const frontendBaseUrl = await resolveFrontendBaseUrl()

  // Signup might 409 if user already exists; that's fine.
  const signupRes = await request.post(`${BACKEND_BASE_URL}/api/signup`, {
    data: { name, email, password },
  })
  if (!signupRes.ok() && signupRes.status() !== 409) {
    throw new Error(`Signup failed: ${signupRes.status()}`)
  }

  const loginRes = await request.post(`${BACKEND_BASE_URL}/api/login`, {
    data: { email, password },
  })
  if (!loginRes.ok()) {
    const text = await loginRes.text().catch(() => '')
    throw new Error(`Login failed: ${loginRes.status()} ${text}`)
  }
  const loginJson = (await loginRes.json()) as { user: { name: string; email: string } }

  const sessionValue = { email: loginJson.user.email, name: loginJson.user.name }

  await page.addInitScript(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ session, sessionKey }) => {
      localStorage.setItem(sessionKey, JSON.stringify(session))
    },
    { session: sessionValue, sessionKey: SESSION_KEY },
  )

  await page.goto(frontendBaseUrl)
}

export async function expectLoggedIn(page: Page) {
  await expect(page.getByTestId('nav-market')).toBeVisible()
}

export async function depositToWallet(page: Page, amount: number) {
  const balanceBeforeText = await page.getByTestId('wallet-balance').textContent()
  const balanceBefore = balanceBeforeText ? parseMoney(balanceBeforeText) : 0

  await page.getByTestId('wallet-amount').fill(String(amount))
  await page.getByTestId('wallet-add-btn').click()

  // Wait until the displayed balance increases.
  await page.waitForFunction(
    (min) => {
      const el = document.querySelector('[data-testid="wallet-balance"]')
      if (!el) return false
      const text = el.textContent || ''
      const cleaned = text.replace(/[^\d.]/g, '')
      const n = Number(cleaned)
      return Number.isFinite(n) && n >= min
    },
    balanceBefore + amount,
  )
}

export async function withdrawFromWallet(page: Page, amount: number) {
  await page.getByTestId('wallet-amount').fill(String(amount))
  await page.getByTestId('wallet-withdraw-btn').click()
}

export async function expectWalletMessage(page: Page, expectedTextPart: string) {
  const msg = page.getByTestId('wallet-message')
  await expect(msg).toBeVisible()
  await expect(msg).toContainText(expectedTextPart)
}

export async function selectStockInMarket(page: Page, symbol: string) {
  // Click on the table row that contains the symbol.
  const sym = page.getByText(symbol, { exact: true })
  const row = sym.locator('xpath=ancestor::tr[1]')
  await row.click()
}

export async function buySelectedStock(page: Page, qty: number) {
  await page.getByTestId('ticket-side-buy').click()
  await page.getByTestId('ticket-qty').fill(String(qty))
  await page.getByTestId('ticket-submit').click()

  // Wait for the toast confirmation.
  await expect(page.getByTestId('toast-message')).toBeVisible()
}

