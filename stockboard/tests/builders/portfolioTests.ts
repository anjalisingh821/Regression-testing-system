import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { E2E_PASSWORD, loginViaApiAndSeedSession, depositToWallet, selectStockInMarket, buySelectedStock } from '../playbook'

const uniqueEmail = () => `port_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`

export function definePortfolioTests(test: any) {
  test('portfolio holdings are visible after buying', async ({ page, request }: any) => {
    const email = uniqueEmail()
    const name = 'Portfolio E2E'

    await loginViaApiAndSeedSession({
      page,
      request,
      email,
      name,
      password: E2E_PASSWORD,
    })

    await expect(page.getByTestId('wallet-balance')).toBeVisible()

    // Ensure we have enough wallet balance for at least 1 share.
    await depositToWallet(page, 10000)

    await selectStockInMarket(page, 'RELIANCE')
    // Order ticket is on the right panel already visible for market view.
    await buySelectedStock(page, 1)

    await expect(page.getByTestId('toast-message')).toContainText('Bought')
    await expect(page.getByTestId('toast-message')).toContainText('RELIANCE')

    await page.getByTestId('nav-portfolio').click()
    await expect(page.getByTestId('portfolio-holdings-table')).toBeVisible()
    await expect(page.getByTestId('holding-row-RELIANCE')).toBeVisible()
  })
}

