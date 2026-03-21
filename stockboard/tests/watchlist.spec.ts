import { test } from '@playwright/test'
import { defineWatchlistTests } from './builders/watchlistTests'

defineWatchlistTests(test)

