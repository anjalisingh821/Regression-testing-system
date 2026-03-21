import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './AiRegressionPage.css'

export default function AiRegressionPage() {
  const [aiReport, setAiReport] = useState<any>(null)
  const [aiApiStatus, setAiApiStatus] = useState<any>(null)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => {
    const refresh = async () => {
      try {
        const [statusRes, latestRes] = await Promise.all([
          fetch('/api/ai/status'),
          fetch('/api/ai/latest'),
        ])
        const statusJson = await statusRes.json().catch(() => ({}))
        const latestJson = await latestRes.json().catch(() => ({}))
        setAiApiStatus(statusJson)
        setAiReport(latestJson.latest ?? null)
      } catch {
        // ignore transient failures
      }
    }

    void refresh()
    const t = window.setInterval(() => void refresh(), 4500)
    return () => window.clearInterval(t)
  }, [])

  const runAiNow = async () => {
    if (aiBusy) return
    setAiBusy(true)
    try {
      await fetch('/api/ai/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedFiles: ['manual_trigger'] }),
      })
      const [statusRes, latestRes] = await Promise.all([
        fetch('/api/ai/status'),
        fetch('/api/ai/latest'),
      ])
      setAiApiStatus(await statusRes.json().catch(() => ({})))
      const latestJson = await latestRes.json().catch(() => ({}))
      setAiReport(latestJson.latest ?? null)
    } catch {
      // ignore
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="aiRegressionPage">
      <header className="aiPageHeader">
        <Link to="/" className="aiPageBack" data-testid="ai-back-to-dashboard">
          ← Back to Dashboard
        </Link>
        <h1 className="aiPageTitle">AI Regression</h1>
        <p className="aiPageSubtitle">Runs Playwright tests after detected code changes</p>
      </header>

      <div className="aiPageContent">
        <div className="aiPageActions">
          <div className="metaChip">Status: {aiApiStatus?.state ?? 'IDLE'}</div>
          <button
            type="button"
            className="watchlistAddBtn"
            onClick={() => void runAiNow()}
            disabled={aiBusy}
            data-testid="ai-run-now"
          >
            {aiBusy ? 'Running...' : 'Run Now'}
          </button>
        </div>

        <div className="aiReportCard">
          {aiReport ? (
            <>
              <div className="aiReportTop">
                <div>
                  <div className="aiReportTitle">{aiReport.id}</div>
                  <div className="muted small">{aiReport.createdAt}</div>
                </div>
                <div className="aiReportBadge">
                  <span
                    className={`sideBadge ${
                      aiReport.status === 'PASSED' ? 'sideBadgeBuy' : 'sideBadgeSell'
                    }`}
                  >
                    {aiReport.status}
                  </span>
                </div>
              </div>

              <div className="aiReportSection">
                <div className="sideTitle">Impact Analysis</div>
                <div className="muted">{aiReport.impact?.summary ?? '—'}</div>
                <div className="muted small" style={{ marginTop: 8 }}>
                  Impacted suites: {(aiReport.impact?.impactedSuites ?? []).join(', ') || '—'}
                </div>
              </div>

              <div className="aiReportSection">
                <div className="sideTitle">Changed Files</div>
                <div className="aiFiles">
                  {(aiReport.changedFiles ?? []).slice(0, 12).map((f: string) => (
                    <div key={f} className="aiFile">
                      {f}
                    </div>
                  ))}
                  {Array.isArray(aiReport.changedFiles) && aiReport.changedFiles.length > 12 ? (
                    <div className="muted small">+{aiReport.changedFiles.length - 12} more</div>
                  ) : null}
                </div>
              </div>

              <div className="aiReportSection">
                <div className="sideTitle">Test Results</div>
                <div className="aiPhaseList">
                  {(aiReport.phases ?? []).map((p: any) => (
                    <div key={p.name} className="aiPhaseRow">
                      <div className="aiPhaseName">{p.name}</div>
                      <div className="muted small">
                        {(p.summary?.failed ?? 0)} failed · {(p.summary?.passed ?? 0)} passed
                      </div>
                      {p.error ? <div className="aiError">{p.error}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="muted">No AI report yet. Change code or click &quot;Run Now&quot;.</div>
          )}
        </div>
      </div>
    </div>
  )
}
