import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

import { E2E_PASSWORD, loginViaApiAndSeedSession } from '../playbook'

const uniqueEmail = () => `watch_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`

export function defineWatchlistTests(test: any) {
  test('can add a stock from market into watchlist', async ({ page, request }: any) => {
    const email = uniqueEmail()
    const name = 'Watchlist E2E'

    await loginViaApiAndSeedSession({
      page,
      request,
      email,
      name,
      password: E2E_PASSWORD,
    })
    await expect(page.getByTestId('nav-market')).toBeVisible()

    // Add RELIANCE to watchlist.
    await page.getByTestId('watch-toggle-RELIANCE').click()

    // Go to watchlist.
    await page.getByTestId('nav-watchlist').click()
    await expect(page.getByText('RELIANCE', { exact: true })).toBeVisible()
  })
}

