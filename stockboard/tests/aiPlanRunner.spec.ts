import fs from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  E2E_PASSWORD,
  loginViaApiAndSeedSession,
  buySelectedStock,
  depositToWallet,
  parseMoney,
  selectStockInMarket,
  withdrawFromWallet,
} from './playbook'

type Seed = {
  email?: string
  name?: string
  password?: string
}

type Step =
  | { type: 'seed'; seed?: Seed }
  | { type: 'nav'; testId: string }
  | { type: 'goto'; url: string }
  | { type: 'click'; testId: string }
  | { type: 'fill'; testId: string; value: string }
  | { type: 'expectVisible'; testId: string }
  | { type: 'expectTextContains'; testId: string; text: string }
  | { type: 'toggleWatchlist'; symbol: string }
  | { type: 'selectStockInMarket'; symbol: string }
  | { type: 'buySelectedStock'; qty: number }
  | { type: 'depositToWallet'; amount: number }
  | { type: 'withdrawFromWallet'; amount: number }

type AiPlan = {
  seed?: Seed
  steps: Step[]
  meta?: Record<string, any>
}

function loadPlan(): AiPlan {
  const planPath = process.env.AI_PLAN_PATH
  if (!planPath) throw new Error('AI_PLAN_PATH is not set.')
  const raw = fs.readFileSync(planPath, 'utf-8')
  return JSON.parse(raw) as AiPlan
}

async function runStep(step: Step, page: Page) {
  switch (step.type) {
    case 'nav':
      await page.getByTestId(step.testId).click()
      return
    case 'goto':
      await page.goto(step.url)
      return
    case 'click':
      await page.getByTestId(step.testId).click()
      return
    case 'fill':
      await page.getByTestId(step.testId).fill(step.value)
      return
    case 'expectVisible': {
      const el = page.getByTestId(step.testId)
      await expect(el).toBeVisible()
      return
    }
    case 'expectTextContains': {
      const el = page.getByTestId(step.testId)
      await expect(el).toContainText(step.text)
      return
    }
    case 'toggleWatchlist':
      await page.getByTestId(`watch-toggle-${step.symbol}`).click()
      return
    case 'selectStockInMarket':
      await selectStockInMarket(page, step.symbol)
      return
    case 'buySelectedStock':
      await buySelectedStock(page, step.qty)
      return
    case 'depositToWallet':
      await depositToWallet(page, step.amount)
      return
    case 'withdrawFromWallet':
      await withdrawFromWallet(page, step.amount)
      return
    default: {
      // Exhaustiveness.
      const _exhaustive: never = step
      return _exhaustive
    }
  }
}

test('ai plan runner executes generated steps', async ({ page, request }) => {
  const plan = loadPlan()

  const seed: Seed = {
    email: plan.seed?.email ?? `ai_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`,
    name: plan.seed?.name ?? 'AI Runner User',
    password: plan.seed?.password ?? E2E_PASSWORD,
  }

  // Seed login state so subsequent UI checks are deterministic.
  await loginViaApiAndSeedSession({
    page,
    request,
    email: seed.email!,
    name: seed.name!,
    password: seed.password!,
  })

  for (const step of plan.steps) {
    await runStep(step, page)
  }
})

