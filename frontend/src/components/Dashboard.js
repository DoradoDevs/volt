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
    { id: 'funds', label: 'Funds' },
    { id: 'wallets', label: 'Wallets' },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#E6E6FA' }}>
        <p>Loading your dashboard
</p>
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
          </Card>


          <BotControls running={Boolean(info.running)} onStatusChange={handleBotStatusChange} />
        </div>
      )}

      {tab === 'funds' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <FundsManager
            sourceAddress={info.sourceAddress || ''}
            balance={info.sourceBalance || 0}
            onChanged={handleFundsChanged}
          />
        </div>
      )}

      {tab === 'wallets' && (
        <div style={{ display: 'grid', gap: 16 }}>
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
