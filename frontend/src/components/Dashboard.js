// frontend/src/components/Dashboard.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import WalletManager from './WalletManager';
import FundsManager from './FundsManager';
import BotControls from './BotControls';
import Referral from './Referral';
import Tier from './Tier';
import Activity from './Activity';
import theme from '../theme';

const Tabs = ({ tab, setTab }) => {
  const tabs = [
    { id: 'volume', label: 'Volume Panel' },
    { id: 'funds', label: 'Funds' },
    { id: 'wallets', label: 'Wallets' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px',
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${active ? theme.colors.borderPrimary : theme.colors.borderInput}`,
                background: active ? theme.colors.bgSelected : theme.colors.bgPanel,
                color: theme.colors.text,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                transition: 'all 0.2s ease',
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
      background: theme.colors.bgPanel,
      border: `1px solid ${theme.colors.borderInput}`,
      borderRadius: theme.borderRadius.lg,
      padding: 20,
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
      padding: '6px 12px',
      borderRadius: theme.borderRadius.full,
      background: ok ? 'rgba(183,163,255,0.15)' : 'rgba(255,107,129,0.15)',
      border: `1px solid ${ok ? 'rgba(183,163,255,0.4)' : 'rgba(255,107,129,0.4)'}`,
      color: ok ? theme.colors.success : theme.colors.warning,
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
        background: ok ? theme.colors.success : theme.colors.warning,
        boxShadow: `0 0 6px ${ok ? theme.colors.success : theme.colors.warning}`,
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
    if (tab === 'wallets') loadPortfolio(false);
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
    if (tab === 'wallets') loadPortfolio(true);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: theme.colors.text }}>
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ color: theme.colors.error, textAlign: 'center', padding: '24px' }}>
        {infoError || 'Dashboard unavailable.'}
      </div>
    );
  }

  return (
    <div className="dashboard" style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{
        textAlign: 'center',
        color: theme.colors.textHeading,
        fontSize: 32,
        marginBottom: 24,
        textShadow: `0 0 20px ${theme.colors.purple}40`
      }}>
        Volume Terminal
      </h1>
      {infoError && (
        <div style={{
          color: theme.colors.error,
          textAlign: 'center',
          marginBottom: 16,
          padding: 12,
          background: 'rgba(255,107,129,0.1)',
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.warning}40`
        }}>
          {infoError}
        </div>
      )}

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'volume' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <Card>
            <h2 style={{ margin: 0, marginBottom: 16, color: theme.colors.textHeading }}>Bot Overview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: theme.colors.textHint, marginBottom: 6 }}>Status</div>
                <StatusPill ok={Boolean(info.running)} label={info.running ? 'Running' : 'Idle'} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.colors.textHint, marginBottom: 6 }}>Active Wallets</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.text }}>{info.activeWallets || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.colors.textHint, marginBottom: 6 }}>Total Wallets</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.text }}>{info.subWallets || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: theme.colors.textHint, marginBottom: 6 }}>Deposit SOL</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: theme.colors.success }}>{Number(info.sourceBalance || 0).toFixed(4)}</div>
              </div>
            </div>
          </Card>

          <BotControls running={Boolean(info.running)} onStatusChange={handleBotStatusChange} />
        </div>
      )}

      {tab === 'funds' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <FundsManager
            sourceAddress={info.sourceAddress || ''}
            balance={info.sourceBalance || 0}
            onChanged={handleFundsChanged}
          />
        </div>
      )}

      {tab === 'wallets' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <WalletManager
            numWallets={info.subWallets || 0}
            activeCount={info.activeWallets || 0}
            refreshToken={walletRefreshKey}
            onChanged={handleWalletsChanged}
            portfolioData={portfolio}
            portfolioSummary={portfolioSummary}
            portfolioLoading={pLoading}
            portfolioError={pErr}
            onRefreshPortfolio={loadPortfolio}
            sourceAddress={info.sourceAddress || ''}
          />
        </div>
      )}

      {tab === 'rewards' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <Tier tier={info.tier ?? 'unranked'} volume={info.volume ?? 0} />
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
