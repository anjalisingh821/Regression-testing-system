import { test } from '@playwright/test'

import { defineAuthTests } from './builders/authTests'
import { defineWalletTests } from './builders/walletTests'
import { defineWatchlistTests } from './builders/watchlistTests'
import { definePortfolioTests } from './builders/portfolioTests'

defineAuthTests(test)
defineWalletTests(test)
defineWatchlistTests(test)
definePortfolioTests(test)

