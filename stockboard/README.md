# StockPulse

A stock market web application with login, wallet, watchlist, portfolio, and AI-augmented regression testing.

## Prerequisites

- **Node.js** (v18 or newer)
- **npm**

## Install

```bash
npm install
npx playwright install
```

## Environment

Create a `.env` file in the project root (copy from `.env.example` if available):

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
AI_ENABLE_GEMINI=true
```

- `GEMINI_API_KEY` – Required for AI-generated test plans (get one at [Google AI Studio](https://aistudio.google.com/)).
- `GEMINI_MODEL` – Optional. Defaults to `gemini-2.5-flash`.
- `AI_ENABLE_GEMINI` – Set to `false` to use heuristic test plans only.

## Run the App

**Option A – Single command (recommended)**

```bash
npm run demo
```

This starts both the API server and frontend. Open the URL Vite prints (e.g. **http://localhost:5173** or **http://localhost:5174**).

**Option B – Two terminals**

Terminal 1 – API server (port 4000):

```bash
npm run api
```

Terminal 2 – Frontend:

```bash
npm run dev
```

The frontend proxies `/api` requests to the backend automatically.

**Troubleshooting**

- **Port 4000 in use:** Stop the other process, or run `PORT=4001 npm run api` and update `vite.config.ts` proxy target to `http://127.0.0.1:4001`
- **API not reachable:** Ensure the API server is running before using the app. You should see `Auth API running on http://127.0.0.1:4000` in the terminal.

## Run Tests

**1. Start the app** (API + frontend) as above.

**2. Run Playwright tests**

```bash
npx playwright test
```

Run a specific suite:

```bash
npx playwright test tests/builders/authTests.ts
npx playwright test tests/builders/walletTests.ts
npx playwright test tests/builders/watchlistTests.ts
npx playwright test tests/builders/portfolioTests.ts
```

View the HTML report:

```bash
npx playwright show-report
```

**3. Override base URL** (if your frontend runs on a different port):

```bash
E2E_BASE_URL=http://localhost:5174 npx playwright test
```

## AI Regression Testing

The app includes an AI-augmented regression system that:

- Watches code changes
- Performs impact analysis
- Generates test plans with Gemini
- Runs Playwright tests
- Shows a feedback report in the app

**How to run it**

1. Start the **API server** and **frontend**.
2. Go to the **AI Regression** tab in the app.
3. Click **Run Now** to trigger a run manually, or change code in `src/`, `tests/`, or `playwright.config.ts` to trigger it via the file watcher.

Report and status are available on the AI Regression page.

## Scripts Reference

| Command           | Description                    |
|-------------------|--------------------------------|
| `npm run demo`    | Start API + frontend together  |
| `npm run dev`     | Start Vite dev server          |
| `npm run api`     | Start backend API server       |
| `npm run build`   | Build for production           |
| `npm run preview` | Preview production build       |
| `npm run lint`    | Run ESLint                     |
| `npx playwright test` | Run E2E tests             |
## CI/CD
GitHub Actions pipeline added
