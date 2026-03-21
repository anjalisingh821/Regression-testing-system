import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'
import { E2E_PASSWORD, loginViaApiAndSeedSession } from '../playbook'

const uniqueEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`

export function defineAuthTests(test: any) {
  test('login via API seed and land on dashboard', async ({ page, request }: any) => {
    const email = uniqueEmail()
    const name = 'E2E User'

    await loginViaApiAndSeedSession({
      page,
      request,
      email,
      name,
      password: E2E_PASSWORD,
    })

    await expect(page.getByTestId('nav-market')).toBeVisible()
    await expect(page.getByTestId('wallet-balance')).toBeVisible()
  })
}

