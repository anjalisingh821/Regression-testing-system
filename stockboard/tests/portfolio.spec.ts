import { test } from '@playwright/test'
import { definePortfolioTests } from './builders/portfolioTests'

definePortfolioTests(test)

