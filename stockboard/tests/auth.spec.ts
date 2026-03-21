import { test } from '@playwright/test'
import { defineAuthTests } from './builders/authTests'

defineAuthTests(test)

