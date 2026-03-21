import { test } from '@playwright/test'
import { defineWalletTests } from './builders/walletTests'

defineWalletTests(test)

