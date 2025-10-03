// frontend/src/components/Dashboard.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import FundsManager from './FundsManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';
import Activity from './Activity';

const Tabs = ({ tab, setTab }) => {
  const tabs = [
    { id: 'volume', label: 'Volume Panel' },
    { id: 'wallets', label: 'Wallets & Funds' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${active ? '#7B68EE' : 'rgba(230,230,250,0.25)'}`,
                background: active ? 'rgba(123,104,238,0.18)' : 'rgba(255,255,255,0.04)',
                color: '#E6E6FA',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const Card = ({ children, style }) => (
  <div
    style={{
      background: 'rgba(255,192,203,0.08)',
      border: '1px solid rgba(255,192,203,0.25)',
      borderRadius: 14,
      padding: 14,
      ...style,
    }}
  >
    {children}
  </div>
);

const StatusPill = ({ ok, label }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      background: ok ? 'rgba(56,189,248,0.18)' : 'rgba(251,113,133,0.18)',
      border: `1px solid ${ok ? 'rgba(56,189,248,0.35)' : 'rgba(251,113,133,0.35)'}`,
      color: ok ? '#38bdf8' : '#fb7185',
      fontSize: 12,
      fontWeight: 600,
    }}
  >
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: ok ? '#38bdf8' : '#fb7185',
      }}
    />
    {label}
  </span>
);

const Dashboard = () => {
  const [tab, setTab] = useState('volume');
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);

  const fetchInfo = async () => {
    setLoadingInfo(true);
    setInfoError('');
    try {
      const res = await api.get('/dashboard');
      setInfo(res.data || {});
    } catch (e) {
      console.error(e);
      setInfo(null);
      setInfoError(e.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const [health, setHealth] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/health');
        if (!cancelled) setHealth(res.data || null);
      } catch (e) {
        if (!cancelled) setHealth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [portfolio, setPortfolio] = useState([]);
  const [pLoading, setPLoading] = useState(false);
  const [pErr, setPErr] = useState('');
  const lastPortfolioLoad = useRef(0);

  const loadPortfolio = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPortfolioLoad.current < 30_000) return;
    setPLoading(true);
    setPErr('');
    try {
      const res = await api.get(`/portfolio${force ? '?force=1' : ''}`);
      setPortfolio(Array.isArray(res.data) ? res.data : []);
      lastPortfolioLoad.current = Date.now();
    } catch (e) {
      console.error(e);
      setPErr('Failed to load portfolio');
    } finally {
      setPLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'portfolio') loadPortfolio(false);
  }, [tab]);

  const portfolioSummary = useMemo(() => {
    if (!Array.isArray(portfolio) || !portfolio.length) {
      return { totalSol: 0, tokens: [] };
    }
    let totalSol = 0;
    const bucket = new Map();
    portfolio.forEach(({ solBalance = 0, holdings = [] }) => {
      totalSol += Number(solBalance) || 0;
      holdings.forEach(({ mint, uiAmount }) => {
        const amount = Number(uiAmount) || 0;
        if (!amount) return;
        bucket.set(mint, (bucket.get(mint) || 0) + amount);
      });
    });
    const tokens = Array.from(bucket.entries())
      .map(([mint, amount]) => ({ mint, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { totalSol, tokens };
  }, [portfolio]);

  const [walletRefreshKey, setWalletRefreshKey] = useState(0);
  const refreshWallets = () => setWalletRefreshKey((k) => k + 1);

  const handleWalletsChanged = () => {
    refreshWallets();
    fetchInfo();
    if (tab === 'portfolio') loadPortfolio(true);
  };

  const handleFundsChanged = () => {
    fetchInfo();
    refreshWallets();
    loadPortfolio(true);
  };

  const handleBotStatusChange = () => {
    fetchInfo();
  };

  if (loadingInfo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#E6E6FA' }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ color: '#ffb4c0', textAlign: 'center', padding: '24px' }}>
        {infoError || 'Dashboard unavailable.'}
      </div>
    );
  }

  const readiness = {
    ok: Boolean(info.botReady),
    issues: Array.isArray(info.botIssues) ? info.botIssues : [],
  };

  return (
    <div className="dashboard" style={{ padding: 24 }}>
      <h1 style={{ textAlign: 'center' }}>VolT Dashboard</h1>
      {infoError && (
        <div style={{ color: 'salmon', textAlign: 'center', marginBottom: 12 }}>{infoError}</div>
      )}

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'volume' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <h2 style={{ margin: 0, marginBottom: 12 }}>Bot Overview</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Status</div>
                <StatusPill ok={Boolean(info.running)} label={info.running ? 'Running' : 'Idle'} />
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Active Wallets</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{info.activeWallets || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total Wallets</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{info.subWallets || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Deposit SOL</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{Number(info.sourceBalance || 0).toFixed(4)}</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <StatusPill ok={readiness.ok} label={readiness.ok ? 'Ready to trade' : 'Action required'} />
              {!readiness.ok && readiness.issues.length > 0 && (
                <ul style={{ marginTop: 10, paddingLeft: 18, color: '#ffb4c0', fontSize: 13 }}>
                  {readiness.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {health && (
            <Card>
              <h2 style={{ margin: 0, marginBottom: 10 }}>System Health</h2>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StatusPill ok={Boolean(health.mongo)} label={health.mongo ? 'MongoDB healthy' : 'MongoDB issue'} />
                <StatusPill ok={Boolean(health.rpc)} label={health.rpc ? 'RPC reachable' : 'RPC issue'} />
                <StatusPill ok={Boolean(health.env?.EMAIL_USER && health.env?.EMAIL_PASS)} label='Email credentials' />
              </div>
            </Card>
          )}

          <BotControls running={Boolean(info.running)} onStatusChange={handleBotStatusChange} />
        </div>
      )}

      {tab === 'wallets' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <FundsManager
            sourceAddress={info.sourceAddress || ''}
            balance={info.sourceBalance || 0}
            onChanged={handleFundsChanged}
          />
          <WalletManager
            numWallets={info.subWallets || 0}
            refreshToken={walletRefreshKey}
            onChanged={handleWalletsChanged}
          />
        </div>
      )}

      {tab === 'portfolio' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Portfolio Overview</h2>
              <button onClick={() => loadPortfolio(true)}>Refresh</button>
            </div>
            {pLoading ? (
              <div style={{ padding: 12, opacity: 0.8 }}>Loading…</div>
            ) : pErr ? (
              <div style={{ padding: 12, color: 'salmon' }}>{pErr}</div>
            ) : (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <Card style={{ flex: '1 1 180px', background: 'rgba(123,104,238,0.12)' }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Total SOL</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{portfolioSummary.totalSol.toFixed(4)}</div>
                  </Card>
                  <Card style={{ flex: '1 1 180px', background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Wallets Tracked</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{portfolio.length}</div>
                  </Card>
                </div>

                {portfolioSummary.tokens.length ? (
                  <div>
                    <h3 style={{ margin: '12px 0 8px' }}>Top Token Holdings</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {portfolioSummary.tokens.slice(0, 6).map((token, idx, arr) => {
                        const max = arr[0]?.amount || 1;
                        const width = Math.max(4, Math.min(100, (token.amount / max) * 100));
                        return (
                          <div key={token.mint}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                              <span style={{ fontFamily: 'monospace' }}>{token.mint}</span>
                              <span>{token.amount.toFixed(4)}</span>
                            </div>
                            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
                              <div
                                style={{
                                  width: `${width}%`,
                                  height: '100%',
                                  borderRadius: 999,
                                  background: 'linear-gradient(90deg, #7B68EE, #FF8AD6)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>No token balances detected across wallets.</div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                  {portfolio.map((wallet) => (
                    <div
                      key={wallet.wallet}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(230,230,250,0.18)',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{wallet.wallet}</div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>SOL: {(wallet.solBalance || 0).toFixed(4)}</div>
                      {!wallet.holdings || wallet.holdings.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.6 }}>No token balances.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 4 }}>
                          {wallet.holdings.map((h, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                              <span>{h.mint}</span>
                              <span>{Number(h.uiAmount || 0).toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'rewards' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <Tier tier={info.tier ?? 'unranked'} />
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: -6 }}>
              Discounts scale with your cumulative volume.
            </div>
          </Card>
          <Card>
            <Referral
              code={info.referralCode ?? ''}
              rewards={info.earnedRewards ?? 0}
              onRewardsUpdate={fetchInfo}
            />
          </Card>
        </div>
      )}

      {tab === 'activity' && <Activity />}
    </div>
  );
};

export default Dashboard;
