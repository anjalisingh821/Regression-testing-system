import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import './App.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
)

type Page = 'market' | 'watchlist' | 'portfolio'

type Side = 'BUY' | 'SELL'

type Stock = {
  symbol: string
  name: string
  sector: string
  prevClose: number
  price: number
  dayHigh: number
  dayLow: number
  volume: number
  volatility: number // percent move per tick (approx)
  history: number[]
}

type Holding = {
  qty: number
  avgPrice: number
}

type Order = {
  id: string
  symbol: string
  side: Side
  qty: number
  price: number
  total: number
  ts: number
  status: 'FILLED' | 'REJECTED'
  reason?: string
}

const WATCHLIST_KEY = 'stockboard_watchlist_v1'

const formatINR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `ord_${Math.random().toString(16).slice(2)}_${Date.now()}`)

function buildSeedUniverse() {
  // Rough, mock universe. Add/remove symbols as you like.
  const seeds: Array<{
    symbol: string
    name: string
    sector: string
    prevCloseSeed: number
    volatility: number
    volumeSeed: number
  }> = [
    { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', prevCloseSeed: 2870, volatility: 0.65, volumeSeed: 2200000 },
    { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT Services', prevCloseSeed: 3850, volatility: 0.55, volumeSeed: 1400000 },
    { symbol: 'INFY', name: 'Infosys', sector: 'IT Services', prevCloseSeed: 1620, volatility: 0.6, volumeSeed: 1900000 },
    { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', prevCloseSeed: 1675, volatility: 0.55, volumeSeed: 2600000 },
    { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', prevCloseSeed: 1130, volatility: 0.6, volumeSeed: 1800000 },
    { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking', prevCloseSeed: 815, volatility: 0.75, volumeSeed: 2900000 },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', prevCloseSeed: 1290, volatility: 0.9, volumeSeed: 2100000 },
    { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', prevCloseSeed: 1775, volatility: 0.55, volumeSeed: 850000 },
    { symbol: 'ITC', name: 'ITC Ltd.', sector: 'FMCG', prevCloseSeed: 452, volatility: 0.95, volumeSeed: 3400000 },
    { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', prevCloseSeed: 1125, volatility: 0.7, volumeSeed: 1600000 },
    { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', prevCloseSeed: 1520, volatility: 0.6, volumeSeed: 1200000 },
    { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Automobile', prevCloseSeed: 10900, volatility: 0.45, volumeSeed: 520000 },
  ]

  return seeds
}

function initHistory(prevClose: number, volatility: number, points: number) {
  const history: number[] = [prevClose]
  let hi = prevClose
  let lo = prevClose

  for (let i = 1; i < points; i++) {
    const last = history[i - 1]
    // Random walk: movePct ~ U(-volatility/2, +volatility/2)
    const movePct = (Math.random() - 0.5) * volatility
    const next = clamp(last * (1 + movePct / 100), 1, 1_000_000_000)
    history.push(next)
    hi = Math.max(hi, next)
    lo = Math.min(lo, next)
  }

  return { history, dayHigh: hi, dayLow: lo }
}

function createInitialStocks(): Stock[] {
  const seeds = buildSeedUniverse()
  const points = 36
  return seeds.map((s) => {
    const { history, dayHigh, dayLow } = initHistory(s.prevCloseSeed, s.volatility, points)
    const price = history[history.length - 1]
    const volume = Math.round(s.volumeSeed * (0.85 + Math.random() * 0.3))
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      prevClose: s.prevCloseSeed,
      price,
      dayHigh,
      dayLow,
      volume,
      volatility: s.volatility,
      history,
    }
  })
}

function simulateNext(stocks: Stock[]) {
  // One "tick" update for the full watchable universe.
  return stocks.map((s) => {
    const last = s.history[s.history.length - 1]
    const movePct = (Math.random() - 0.5) * s.volatility
    const next = clamp(last * (1 + movePct / 100), 1, 1_000_000_000)
    const nextHistory = [...s.history.slice(1), next]

    // Keep intraday range "sticky" for this demo.
    const dayHigh = Math.max(s.dayHigh, next)
    const dayLow = Math.min(s.dayLow, next)

    // Volume fluctuates with volatility.
    const volume = Math.round(s.volume * (0.93 + Math.random() * 0.18))

    return {
      ...s,
      price: next,
      dayHigh,
      dayLow,
      volume,
      history: nextHistory,
    }
  })
}

function pctChange(price: number, prevClose: number) {
  return prevClose === 0 ? 0 : ((price - prevClose) / prevClose) * 100
}

type StockAppProps = {
  onLogout?: () => void
  userEmail?: string
  userName?: string
}

type WalletTx = {
  id: number
  type: 'ADD' | 'WITHDRAW'
  amount: number
  balance_after: number
  created_at: string
}

// Use Vite's built-in `/api` proxy by default (avoids CORS issues).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export default function StockApp({ onLogout, userEmail, userName }: StockAppProps) {
  const [page, setPage] = useState<Page>('market')
  const [stocks, setStocks] = useState<Stock[]>(() => createInitialStocks())
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => createInitialStocks()[0]?.symbol ?? 'RELIANCE')

  const selectedStock = useMemo(
    () => stocks.find((s) => s.symbol === selectedSymbol) ?? stocks[0],
    [stocks, selectedSymbol],
  )

  const [search, setSearch] = useState('')
  const [watchlistPick, setWatchlistPick] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY)
      if (!raw) return ['RELIANCE', 'TCS', 'HDFCBANK']
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string')
      return ['RELIANCE', 'TCS', 'HDFCBANK']
    } catch {
      return ['RELIANCE', 'TCS', 'HDFCBANK']
    }
  })

  const [cash, setCash] = useState(0)
  const [holdings, setHoldings] = useState<Record<string, Holding>>({
    RELIANCE: { qty: 2, avgPrice: 2860 },
    TCS: { qty: 1, avgPrice: 3800 },
  })

  const [orders, setOrders] = useState<Order[]>([])
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const toastTimer = useRef<number | null>(null)
  const [walletAmount, setWalletAmount] = useState<number>(1000)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletTransactions, setWalletTransactions] = useState<WalletTx[]>([])
  const [walletMessage, setWalletMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // Fix for selectedSymbol initialization: ensure it exists in the universe.
  useEffect(() => {
    if (!stocks.some((s) => s.symbol === selectedSymbol) && stocks[0]) setSelectedSymbol(stocks[0].symbol)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks])

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist))
    } catch {
      // ignore storage failures
    }
  }, [watchlist])

  useEffect(() => {
    const t = window.setInterval(() => {
      setStocks((prev) => simulateNext(prev))
    }, 1200)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!toast) return
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200) as unknown as number
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [toast])

  useEffect(() => {
    if (!userEmail) return
    const loadWallet = async () => {
      setWalletLoading(true)
      try {
        const response = await fetch(`${API_BASE_URL}/api/wallet/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: userEmail }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.message || 'Failed to load wallet.')
        setCash(Number(payload.balance ?? 0))
        setWalletTransactions(Array.isArray(payload.transactions) ? (payload.transactions as WalletTx[]) : [])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load wallet.'
        setWalletMessage({
          kind: 'error',
          text:
            msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch')
              ? `Wallet API is not reachable at ${API_BASE_URL}. Start it with \`npm run api\`.`
              : `Failed to load wallet. ${msg}`,
        })
      } finally {
        setWalletLoading(false)
      }
    }
    void loadWallet()
  }, [userEmail])

  const submitWalletAction = async (action: 'add' | 'withdraw') => {
    if (!userEmail) return
    const amount = Number(walletAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletMessage({ kind: 'error', text: 'Enter a valid amount.' })
      return
    }
    if (action === 'withdraw' && amount >= cash) {
      setWalletMessage({ kind: 'error', text: 'Withdrawal amount must be less than available balance.' })
      return
    }
    setWalletBusy(true)
    setWalletMessage(null)
    try {
      const endpoint = action === 'add' ? '/api/wallet/add' : '/api/wallet/withdraw'
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, amount }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Wallet request failed.')
      setCash(Number(payload.balance ?? 0))
      setWalletMessage({
        kind: 'success',
        text: action === 'add' ? 'Funds added successfully.' : 'Funds withdrawn successfully.',
      })

      // Refresh wallet transaction history.
      const txRes = await fetch(`${API_BASE_URL}/api/wallet/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      })
      const txPayload = await txRes.json().catch(() => ({}))
      if (txRes.ok && Array.isArray(txPayload.transactions)) {
        setWalletTransactions(txPayload.transactions as WalletTx[])
      }
    } catch (err) {
      setWalletMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Wallet request failed.' })
    } finally {
      setWalletBusy(false)
    }
  }

  const isInWatchlist = (symbol: string) => watchlist.includes(symbol)

  const toggleWatchlist = (symbol: string) => {
    setWatchlist((prev) => {
      const set = new Set(prev)
      if (set.has(symbol)) set.delete(symbol)
      else set.add(symbol)
      return Array.from(set)
    })
  }

  const visibleStocks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stocks
    return stocks.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
  }, [search, stocks])

  const watchlistStocks = useMemo(() => {
    const set = new Set(watchlist)
    return stocks.filter((s) => set.has(s.symbol))
  }, [stocks, watchlist])

  const addableWatchlistStocks = useMemo(() => {
    const set = new Set(watchlist)
    return stocks.filter((s) => !set.has(s.symbol))
  }, [stocks, watchlist])

  useEffect(() => {
    if (addableWatchlistStocks.length === 0) {
      setWatchlistPick('')
      return
    }
    if (!watchlistPick || !addableWatchlistStocks.some((s) => s.symbol === watchlistPick)) {
      setWatchlistPick(addableWatchlistStocks[0].symbol)
    }
  }, [addableWatchlistStocks, watchlistPick])

  const portfolioValue = useMemo(() => {
    const holdingsValue = Object.entries(holdings).reduce((acc, [symbol, h]) => {
      const live = stocks.find((s) => s.symbol === symbol)
      const px = live?.price ?? h.avgPrice
      return acc + h.qty * px
    }, 0)
    return cash + holdingsValue
  }, [cash, holdings, stocks])

  const portfolioValueByHoldings = useMemo(() => {
    return Object.entries(holdings)
      .map(([symbol, h]) => {
        const live = stocks.find((s) => s.symbol === symbol)
        const px = live?.price ?? h.avgPrice
        const value = h.qty * px
        const pnl = (px - h.avgPrice) * h.qty
        return { symbol, qty: h.qty, avgPrice: h.avgPrice, price: px, value, pnl }
      })
      .sort((a, b) => b.value - a.value)
  }, [holdings, stocks])

  // Trading ticket state
  const [ticketSide, setTicketSide] = useState<Side>('BUY')
  const [ticketQty, setTicketQty] = useState<number>(1)
  const [ticketBusy, setTicketBusy] = useState(false)

  useEffect(() => {
    // Reset qty when switching instruments for a calmer UX.
    setTicketQty(1)
    setTicketSide('BUY')
  }, [selectedSymbol])

  const canTrade = useMemo(() => {
    if (!selectedStock) return { ok: false, reason: 'No instrument selected' }
    const qty = Math.floor(ticketQty)
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Enter a valid quantity' }
    const price = selectedStock.price
    if (ticketSide === 'BUY') {
      const total = qty * price
      if (total > cash) return { ok: false, reason: 'Insufficient cash for this order' }
    } else {
      const holding = holdings[selectedStock.symbol]
      const have = holding?.qty ?? 0
      if (qty > have) return { ok: false, reason: 'Insufficient holdings for this order' }
    }
    return { ok: true, reason: '' }
  }, [cash, holdings, selectedStock, ticketQty, ticketSide])

  const submitOrder = () => {
    if (!selectedStock) return
    const qty = Math.floor(ticketQty)
    if (!Number.isFinite(qty) || qty <= 0) return
    if (!canTrade.ok) {
      setToast({ kind: 'error', message: canTrade.reason })
      return
    }

    setTicketBusy(true)
    // Small delay for demo feel.
    window.setTimeout(() => {
      const price = selectedStock.price
      const total = qty * price
      if (ticketSide === 'BUY') {
        setCash((c) => c - total)
        setHoldings((prev) => {
          const current = prev[selectedStock.symbol]
          const prevQty = current?.qty ?? 0
          const prevAvg = current?.avgPrice ?? 0
          const nextQty = prevQty + qty
          const nextAvg =
            prevQty === 0 ? price : (prevAvg * prevQty + price * qty) / (nextQty === 0 ? 1 : nextQty)
          return { ...prev, [selectedStock.symbol]: { qty: nextQty, avgPrice: nextAvg } }
        })
      } else {
        setCash((c) => c + total)
        setHoldings((prev) => {
          const current = prev[selectedStock.symbol]
          const prevQty = current?.qty ?? 0
          const nextQty = prevQty - qty
          if (nextQty <= 0) {
            const { [selectedStock.symbol]: _, ...rest } = prev
            return rest
          }
          return { ...prev, [selectedStock.symbol]: { qty: nextQty, avgPrice: current!.avgPrice } }
        })
      }

      const newOrder: Order = {
        id: uid(),
        symbol: selectedStock.symbol,
        side: ticketSide,
        qty,
        price,
        total,
        ts: Date.now(),
        status: 'FILLED',
      }
      setOrders((prev) => [newOrder, ...prev].slice(0, 12))
      setToast({
        kind: 'success',
        message: `${ticketSide === 'BUY' ? 'Bought' : 'Sold'} ${qty} ${selectedStock.symbol} @ ${formatINR.format(price)}`,
      })
      setTicketBusy(false)
    }, 420)
  }

  const chartDirection = selectedStock ? selectedStock.price - selectedStock.prevClose : 0
  const chartColor = chartDirection >= 0 ? '#22c55e' : '#ef4444'
  const chartFill = chartDirection >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'

  const chartData = useMemo(() => {
    if (!selectedStock) return null
    return {
      labels: selectedStock.history.map((_, i) => `${i + 1}`),
      datasets: [
        {
          label: `${selectedStock.symbol} price`,
          data: selectedStock.history,
          borderColor: chartColor,
          backgroundColor: chartFill,
          pointRadius: 0,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
      ],
    }
  }, [chartColor, chartFill, selectedStock])

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.95)',
          borderColor: 'rgba(255,255,255,0.10)',
          borderWidth: 1,
          titleColor: '#e5e7eb',
          bodyColor: '#e5e7eb',
          callbacks: {
            label: (ctx: any) => `${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            color: 'rgba(229,231,235,0.75)',
            maxTicksLimit: 4,
          },
        },
      },
    }),
    [],
  )

  return (
    <div className="appRoot">
      <div className="topbar">
        <div className="brand">
          <span className="brandDot" />
          <span>StockPulse</span>
        </div>

        <div className="nav">
          <button
            className={`navBtn ${page === 'market' ? 'navBtnActive' : ''}`}
            onClick={() => setPage('market')}
            type="button"
            data-testid="nav-market"
          >
            Market
          </button>
          <button
            className={`navBtn ${page === 'watchlist' ? 'navBtnActive' : ''}`}
            onClick={() => setPage('watchlist')}
            type="button"
            data-testid="nav-watchlist"
          >
            Watchlist <span className="navPill">{watchlist.length}</span>
          </button>
          <button
            className={`navBtn ${page === 'portfolio' ? 'navBtnActive' : ''}`}
            onClick={() => setPage('portfolio')}
            type="button"
            data-testid="nav-portfolio"
          >
            Portfolio
          </button>
        </div>

        <div className="search">
          <span className="searchIcon">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or company..."
          />
          <span className="searchHint">demo</span>
        </div>

        <div className="topStats">
          {userName ? (
            <div className="stat">
              <div className="statLabel">User</div>
              <div className="statValue">{userName}</div>
            </div>
          ) : null}
          <div className="stat">
            <div className="statLabel">Cash</div>
            <div className="statValue">{formatINR.format(cash)}</div>
          </div>
          <div className="stat">
            <div className="statLabel">Equity</div>
            <div className="statValue">{formatINR.format(portfolioValue)}</div>
          </div>
        </div>

        <Link to="/ai-regression" className="navBtn" data-testid="nav-ai-regression">
          AI Regression
        </Link>

        {onLogout ? (
          <button type="button" className="logoutBtn" onClick={onLogout} data-testid="nav-logout">
            Logout
          </button>
        ) : null}
      </div>

      <div className="layout">
        <aside className="sidebar">
          <div className="sideSection">
            <div className="sideTitle">Quick Actions</div>
            <div className="sideGrid">
              <button
                className="sideCard"
                type="button"
                onClick={() => {
                  setPage('market')
                  if (stocks[0]) setSelectedSymbol(stocks[0].symbol)
                }}
              >
                <div className="sideCardTitle">Top Gainers</div>
                <div className="sideCardValue green">
                  {(() => {
                    const best = [...stocks]
                      .map((s) => ({ s, pct: pctChange(s.price, s.prevClose) }))
                      .sort((a, b) => b.pct - a.pct)[0]
                    if (!best) return '--'
                    return `${best.s.symbol} ${best.pct.toFixed(2)}%`
                  })()}
                </div>
              </button>
              <button
                className="sideCard"
                type="button"
                onClick={() => {
                  setPage('market')
                  const worst = [...stocks]
                    .map((s) => ({ s, pct: pctChange(s.price, s.prevClose) }))
                    .sort((a, b) => a.pct - b.pct)[0]
                  if (worst?.s) setSelectedSymbol(worst.s.symbol)
                }}
              >
                <div className="sideCardTitle">Top Losers</div>
                <div className="sideCardValue red">
                  {(() => {
                    const worst = [...stocks]
                      .map((s) => ({ s, pct: pctChange(s.price, s.prevClose) }))
                      .sort((a, b) => a.pct - b.pct)[0]
                    if (!worst) return '--'
                    return `${worst.s.symbol} ${worst.pct.toFixed(2)}%`
                  })()}
                </div>
              </button>
            </div>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Wallet</div>
            <div className="walletCard">
              <div className="walletBalanceLabel">Available Balance</div>
              <div className="walletBalanceValue" data-testid="wallet-balance">
                {formatINR.format(cash)}
              </div>

              <label className="walletInputWrap">
                <span className="walletInputLabel">Amount</span>
                <input
                  className="walletInput"
                  type="number"
                  min={0.01}
                  step="any"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(Number(e.target.value))}
                  data-testid="wallet-amount"
                />
                <span className="walletInputHint">Withdraw amount must be less than current balance.</span>
              </label>

              <div className="walletActions">
                <button
                  type="button"
                  className="walletBtn walletBtnAdd"
                  disabled={walletBusy || walletLoading}
                  onClick={() => void submitWalletAction('add')}
                  data-testid="wallet-add-btn"
                >
                  {walletBusy ? 'Processing...' : 'Add Funds'}
                </button>
                <button
                  type="button"
                  className="walletBtn walletBtnWithdraw"
                  disabled={walletBusy || walletLoading}
                  onClick={() => void submitWalletAction('withdraw')}
                  data-testid="wallet-withdraw-btn"
                >
                  {walletBusy ? 'Processing...' : 'Withdraw'}
                </button>
              </div>

              {walletMessage ? (
                <div
                  className={`walletMsg ${walletMessage.kind === 'success' ? 'walletMsgSuccess' : 'walletMsgError'}`}
                  data-testid="wallet-message"
                >
                  {walletMessage.text}
                </div>
              ) : null}

              <div className="walletTxTitle">Recent Wallet Activity</div>
              <div className="walletTxList">
                {walletTransactions.length === 0 ? (
                  <div className="muted small">No wallet transactions yet.</div>
                ) : (
                  walletTransactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="walletTxRow">
                      <span className={`walletTxType ${tx.type === 'ADD' ? 'green' : 'red'}`}>{tx.type}</span>
                      <span className="walletTxAmount">{formatINR.format(tx.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Watchlist</div>
            <div className="watchListMini">
              {watchlistStocks.length === 0 ? (
                <div className="muted">No items yet</div>
              ) : (
                watchlistStocks.slice(0, 8).map((s) => {
                  const ch = pctChange(s.price, s.prevClose)
                  return (
                    <button
                      key={s.symbol}
                      type="button"
                      className={`miniRow ${selectedSymbol === s.symbol ? 'miniRowActive' : ''}`}
                      onClick={() => {
                        setSelectedSymbol(s.symbol)
                        setPage('market')
                      }}
                    >
                      <div className="miniSym">{s.symbol}</div>
                      <div className={`miniCh ${ch >= 0 ? 'green' : 'red'}`}>{ch >= 0 ? '+' : ''}{ch.toFixed(2)}%</div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="sideSection">
            <div className="sideTitle">Order Feed</div>
            <div className="orderFeed">
              {orders.length === 0 ? (
                <div className="muted">Place an order to see activity</div>
              ) : (
                orders.slice(0, 6).map((o) => (
                  <div key={o.id} className={`feedRow ${o.status === 'FILLED' ? '' : 'feedRowRejected'}`}>
                    <div className="feedLeft">
                      <span className={`sideBadge ${o.side === 'BUY' ? 'sideBadgeBuy' : 'sideBadgeSell'}`}>
                        {o.side}
                      </span>
                      <span className="feedSym">{o.symbol}</span>
                    </div>
                    <div className="feedRight">
                      <span className="feedQty">{o.qty}</span>
                      <span className="feedPx">{formatINR.format(o.price)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="content">
          {page === 'market' && (
            <>
              <div className="contentHeader">
                <div>
                  <div className="contentTitle">Market Quotes</div>
                  <div className="muted">Click a symbol to view chart & trade ticket</div>
                </div>
                <div className="contentMeta">
                  <div className="metaChip">{visibleStocks.length} instruments</div>
                  <div className="metaChip">Simulated live</div>
                </div>
              </div>

              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th className="num">Price</th>
                      <th className="num">Change</th>
                      <th className="num">Volume</th>
                      <th className="num">Day High</th>
                      <th className="num">Day Low</th>
                      <th className="center">Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStocks.map((s) => {
                      const ch = pctChange(s.price, s.prevClose)
                      const selected = selectedSymbol === s.symbol
                      return (
                        <tr
                          key={s.symbol}
                          className={`row ${selected ? 'rowSelected' : ''}`}
                          onClick={() => setSelectedSymbol(s.symbol)}
                        >
                          <td>
                            <div className="symCell">
                              <span className="sym">{s.symbol}</span>
                              {selected ? <span className="selectedTag">Live</span> : null}
                            </div>
                          </td>
                          <td>
                            <div className="nameCell">{s.name}</div>
                          </td>
                          <td className="num">{formatINR.format(s.price)}</td>
                          <td className={`num ${ch >= 0 ? 'green' : 'red'}`}>
                            {ch >= 0 ? '+' : ''}
                            {ch.toFixed(2)}%
                          </td>
                          <td className="num">{s.volume.toLocaleString('en-IN')}</td>
                          <td className="num">{formatINR.format(s.dayHigh)}</td>
                          <td className="num">{formatINR.format(s.dayLow)}</td>
                          <td className="center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={`watchBtn ${isInWatchlist(s.symbol) ? 'watchBtnOn' : ''}`}
                              onClick={() => toggleWatchlist(s.symbol)}
                              aria-label={isInWatchlist(s.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                              data-testid={`watch-toggle-${s.symbol}`}
                            >
                              {isInWatchlist(s.symbol) ? '★' : '☆'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {page === 'watchlist' && (
            <>
              <div className="contentHeader">
                <div>
                  <div className="contentTitle">Your Watchlist</div>
                  <div className="muted">Starred symbols appear here and can be traded from the ticket</div>
                </div>
                <div className="contentMeta">
                  <div className="metaChip">{watchlistStocks.length} live</div>
                </div>
              </div>

              <div className="watchlistAdder">
                <select
                  className="watchlistSelect"
                  value={watchlistPick}
                  onChange={(e) => setWatchlistPick(e.target.value)}
                  disabled={addableWatchlistStocks.length === 0}
                  data-testid="watchlist-add-select"
                >
                  {addableWatchlistStocks.length === 0 ? (
                    <option value="">All stocks are already in watchlist</option>
                  ) : (
                    addableWatchlistStocks.map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.symbol} - {s.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="watchlistAddBtn"
                  disabled={!watchlistPick}
                  onClick={() => {
                    if (!watchlistPick) return
                    toggleWatchlist(watchlistPick)
                    setSelectedSymbol(watchlistPick)
                  }}
                  data-testid="watchlist-add-btn"
                >
                  Add Stock
                </button>
              </div>

              <div className="cardsGrid">
                {watchlistStocks.map((s) => {
                  const ch = pctChange(s.price, s.prevClose)
                  return (
                    <div
                      key={s.symbol}
                      role="button"
                      tabIndex={0}
                      className={`stockCard ${selectedSymbol === s.symbol ? 'stockCardSelected' : ''}`}
                      onClick={() => {
                        setSelectedSymbol(s.symbol)
                        setPage('market')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedSymbol(s.symbol)
                          setPage('market')
                        }
                      }}
                    >
                      <div className="stockCardTop">
                        <div className="stockCardSymbol">{s.symbol}</div>
                        <div className={`stockCardCh ${ch >= 0 ? 'green' : 'red'}`}>
                          {ch >= 0 ? '+' : ''}
                          {ch.toFixed(2)}%
                        </div>
                      </div>
                      <div className="stockCardName">{s.name}</div>
                      <div className="stockCardBottom">
                        <div className="stockCardPrice">{formatINR.format(s.price)}</div>
                        <div className="stockCardSmall">
                          <span className="dim">Vol:</span> {s.volume.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="stockCardActions">
                        <button
                          type="button"
                          className={`watchBtn watchBtnOn`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleWatchlist(s.symbol)
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
                {watchlistStocks.length === 0 ? <div className="muted">No starred stocks. Add from Market.</div> : null}
              </div>
            </>
          )}

          {page === 'portfolio' && (
            <>
              <div className="contentHeader">
                <div>
                  <div className="contentTitle">Portfolio</div>
                  <div className="muted">Your stock holdings and P&L from live simulated prices</div>
                </div>
                <div className="contentMeta">
                  <div className="metaChip">Equity: {formatINR.format(portfolioValue)}</div>
                </div>
              </div>

              <div className="summaryRow">
                <div className="summaryCard">
                  <div className="summaryLabel">Cash</div>
                  <div className="summaryValue">{formatINR.format(cash)}</div>
                </div>
                <div className="summaryCard">
                  <div className="summaryLabel">Invested</div>
                  <div className="summaryValue">{formatINR.format(portfolioValue - cash)}</div>
                </div>
                <div className="summaryCard">
                  <div className="summaryLabel">Positions</div>
                  <div className="summaryValue">{Object.keys(holdings).length}</div>
                </div>
              </div>

              <div className="tableWrap">
                <div className="holdingsTitle">Your Holdings</div>
                <table className="table" data-testid="portfolio-holdings-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="num">Qty</th>
                      <th className="num">Avg Price</th>
                      <th className="num">Live Price</th>
                      <th className="num">Value</th>
                      <th className="num">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioValueByHoldings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No holdings. Use the ticket to buy.
                        </td>
                      </tr>
                    ) : (
                      portfolioValueByHoldings.map((h) => {
                        const pnl = h.pnl
                        return (
                          <tr
                            key={h.symbol}
                            className="row"
                            data-testid={`holding-row-${h.symbol}`}
                            onClick={() => {
                              setSelectedSymbol(h.symbol)
                              setPage('market')
                            }}
                          >
                            <td>
                              <span className="sym">{h.symbol}</span>
                            </td>
                            <td className="num">{h.qty}</td>
                            <td className="num">{formatINR.format(h.avgPrice)}</td>
                            <td className="num">{formatINR.format(h.price)}</td>
                            <td className="num">{formatINR.format(h.value)}</td>
                            <td className={`num ${pnl >= 0 ? 'green' : 'red'}`}>
                              {pnl >= 0 ? '+' : ''}
                              {formatINR.format(pnl)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}


        </main>

        <aside className="rightPanel">
          {selectedStock ? (
            <>
              <div className="panelCard">
                <div className="panelTop">
                  <div>
                    <div className="panelSymbol">{selectedStock.symbol}</div>
                    <div className="panelName">
                      {selectedStock.name} · <span className="dim">{selectedStock.sector}</span>
                    </div>
                  </div>

                  <div className="panelRight">
                    <div className="panelPrice">{formatINR.format(selectedStock.price)}</div>
                    <div className={`panelCh ${selectedStock.price >= selectedStock.prevClose ? 'green' : 'red'}`}>
                      {pctChange(selectedStock.price, selectedStock.prevClose) >= 0 ? '+' : ''}
                      {pctChange(selectedStock.price, selectedStock.prevClose).toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="rangeRow">
                  <div className="rangeItem">
                    <div className="rangeLabel">Day High</div>
                    <div className="rangeValue">{formatINR.format(selectedStock.dayHigh)}</div>
                  </div>
                  <div className="rangeItem">
                    <div className="rangeLabel">Day Low</div>
                    <div className="rangeValue">{formatINR.format(selectedStock.dayLow)}</div>
                  </div>
                </div>

                <div className="chartWrap">
                  {chartData ? <Line data={chartData} options={chartOptions as any} /> : null}
                </div>

                <div className="watchRow">
                  <button
                    type="button"
                    className={`watchBtnBig ${isInWatchlist(selectedStock.symbol) ? 'watchBtnBigOn' : ''}`}
                    onClick={() => toggleWatchlist(selectedStock.symbol)}
                  >
                    {isInWatchlist(selectedStock.symbol) ? 'In Watchlist ★' : 'Add to Watchlist ☆'}
                  </button>
                  <div className="muted small">
                    Prev close: {formatINR.format(selectedStock.prevClose)} · Vol: {selectedStock.volume.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div className="panelCard panelTicket">
                <div className="ticketHeader">
                  <div className="ticketTitle">Trade Ticket</div>
                  <div className="dim small">Market orders only (demo)</div>
                </div>

                <div className="ticketGrid">
                  <div className="field">
                    <div className="fieldLabel">Side</div>
                    <div className="segmented">
                      <button
                        type="button"
                        className={`segBtn ${ticketSide === 'BUY' ? 'segBtnOnBuy' : ''}`}
                        onClick={() => setTicketSide('BUY')}
                        data-testid="ticket-side-buy"
                      >
                        BUY
                      </button>
                      <button
                        type="button"
                        className={`segBtn ${ticketSide === 'SELL' ? 'segBtnOnSell' : ''}`}
                        onClick={() => setTicketSide('SELL')}
                        data-testid="ticket-side-sell"
                      >
                        SELL
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <div className="fieldLabel">Order Type</div>
                    <div className="inputLike">MARKET</div>
                  </div>

                  <div className="field">
                    <div className="fieldLabel">Quantity</div>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      step={1}
                      value={ticketQty}
                      onChange={(e) => setTicketQty(Number(e.target.value))}
                      data-testid="ticket-qty"
                    />
                  </div>

                  <div className="field">
                    <div className="fieldLabel">At</div>
                    <div className="inputLike">{formatINR.format(selectedStock.price)}</div>
                  </div>

                  <div className="field full">
                    <div className="estRow">
                      <div className="estLeft">
                        <div className="estLabel">Estimated Total</div>
                        <div className="estValue">
                          {formatINR.format(Math.floor(ticketQty || 0) * selectedStock.price)}
                        </div>
                      </div>
                      <div className="estRight">
                        <div className="estMiniLabel">Cash Impact</div>
                        <div className={`estMini ${ticketSide === 'BUY' ? 'green' : 'red'}`}>
                          {ticketSide === 'BUY' ? '-' : '+'}{formatINR.format(Math.floor(ticketQty || 0) * selectedStock.price)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="field full">
                    {!canTrade.ok ? <div className="errorBox">{canTrade.reason}</div> : null}
                    {toast ? (
                      <div
                        className={`toastBox ${toast.kind === 'success' ? 'toastSuccess' : 'toastError'}`}
                        data-testid="toast-message"
                      >
                        {toast.message}
                      </div>
                    ) : null}
                  </div>

                  <div className="field full">
                    <button
                      className={`primaryBtn ${ticketBusy ? 'primaryBtnDisabled' : ''}`}
                      type="button"
                      onClick={submitOrder}
                      disabled={ticketBusy || !canTrade.ok}
                      data-testid="ticket-submit"
                    >
                      {ticketBusy ? 'Submitting...' : ticketSide === 'BUY' ? 'Place BUY' : 'Place SELL'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="panelCard panelOrders">
                <div className="ticketHeader">
                  <div className="ticketTitle">Recent Orders</div>
                  <div className="dim small">{orders.length > 0 ? 'Latest first' : ''}</div>
                </div>

                <div className="ordersList">
                  {orders.length === 0 ? (
                    <div className="muted">No orders yet</div>
                  ) : (
                    orders.slice(0, 8).map((o) => (
                      <div key={o.id} className="orderRow">
                        <div className="orderLeft">
                          <span className={`sideBadge ${o.side === 'BUY' ? 'sideBadgeBuy' : 'sideBadgeSell'}`}>
                            {o.side}
                          </span>
                          <span className="orderSym">{o.symbol}</span>
                        </div>
                        <div className="orderMid">
                          <span className="orderQty">{o.qty}</span>
                          <span className="dim">@</span>
                          <span className="orderPrice">{formatINR.format(o.price)}</span>
                        </div>
                        <div className={`orderRight ${o.side === 'BUY' ? 'green' : 'red'}`}>{formatINR.format(o.total)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="muted">Loading instrument...</div>
          )}
        </aside>
      </div>
    </div>
  )
}

