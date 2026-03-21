import type { Page } from '@playwright/test'

import { expect } from '@playwright/test'

import { E2E_PASSWORD, loginViaApiAndSeedSession, depositToWallet, withdrawFromWallet, expectWalletMessage, parseMoney } from '../playbook'

const uniqueEmail = () => `wallet_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`

export function defineWalletTests(test: any) {
  test('wallet add and withdraw constraint', async ({ page, request }: any) => {
    const email = uniqueEmail()
    const name = 'Wallet E2E'

    await loginViaApiAndSeedSession({
      page,
      request,
      email,
      name,
      password: E2E_PASSWORD,
    })
    await expect(page.getByTestId('wallet-balance')).toBeVisible()

    const depositAmount = 500
    await depositToWallet(page, depositAmount)

    const balanceNowText = (await page.getByTestId('wallet-balance').textContent()) || ''
    const balanceNow = parseMoney(balanceNowText)
    expect(balanceNow).toBeGreaterThanOrEqual(depositAmount)

    // Withdrawal must be strictly less than balance.
    await page.getByTestId('wallet-amount').fill(String(balanceNow))
    await page.getByTestId('wallet-withdraw-btn').click()
    await expectWalletMessage(page, 'less than available balance')

    // Withdraw balance - 1 should succeed.
    const withdrawAmount = Math.max(1, balanceNow - 1)
    await withdrawFromWallet(page, withdrawAmount)

    // Balance should decrease.
    await page.waitForFunction(
      (min) =>
        parseFloat(document.querySelector('[data-testid="wallet-balance"]')?.textContent?.replace(/[^\d.]/g, '') || '0') <= min,
      balanceNow - withdrawAmount + 0.0001,
    )
  })
}

