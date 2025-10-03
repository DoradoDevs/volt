import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const containerStyle = {
  border: '1px solid #7B68EE',
  borderRadius: 12,
  padding: 16,
  background: 'rgba(255,255,255,0.04)',
};

const summaryCardStyle = {
  flex: '1 1 180px',
  minWidth: 160,
  borderRadius: 10,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(230,230,250,0.18)',
};

const walletCardStyle = {
  border: '1px solid rgba(230,230,250,0.2)',
  borderRadius: 10,
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.05)',
  display: 'grid',
  gap: 6,
};

const badgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.2,
};

const actionPanelStyle = {
  border: '1px solid rgba(123,104,238,0.45)',
  borderRadius: 12,
  padding: 16,
  background: 'rgba(255,255,255,0.05)',
  display: 'grid',
  gap: 12,
  justifyItems: 'center',
};

const holdingsBlock = (holdings = []) => {
  if (!holdings.length) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>No token balances.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {holdings.map((h, idx) => (
        <div
          key={idx}
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 12 }}
        >
          <span style={{ fontFamily: 'monospace' }}>{h.mint}</span>
          <span>{Number(h.uiAmount ?? h.amount ?? 0).toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
};

const WalletRow = ({ wallet, canRemove = false, onRemove = () => {} }) => {
  const handleCopy = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
    } catch (err) {
      console.warn('Copy failed', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px solid rgba(123,104,238,0.6)',
        borderRadius: 8,
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.05)',
      }}
    >
      <div>
        <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{wallet.address}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {Number(wallet.balanceSOL || 0).toFixed(4)} SOL {wallet.type === 'source' ? '(deposit)' : '(bot)'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleCopy}>Copy</button>
        {canRemove && (
          <button
            onClick={() => onRemove(wallet.address)}
            style={{ background: '#b34d6e', color: '#fff' }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

const WalletManager = ({
  numWallets,
  activeCount = 0,
  refreshToken,
  onChanged,
  portfolioData = [],
  portfolioSummary = { totalSol: 0, tokens: [] },
  portfolioLoading = false,
  portfolioError = '',
  onRefreshPortfolio,
  sourceAddress = '',
}) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [distributeLoading, setDistributeLoading] = useState(false);
  const [distributeStatus, setDistributeStatus] = useState(null);

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/wallets/list');
      setList(res.data.wallets || []);
    } catch (e) {
      console.error('Failed to load wallets', e);
      setError(e.response?.data?.error || 'Failed to fetch wallets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [refreshToken]);

  const metaByAddress = useMemo(() => {
    const map = new Map();
    list.forEach((wallet) => {
      map.set(wallet.address, {
        ...wallet,
        balanceSOL: Number(wallet.balanceSOL || 0),
      });
    });
    return map;
  }, [list]);

  const portfolioByAddress = useMemo(() => {
    const map = new Map();
    (portfolioData || []).forEach((entry) => {
      map.set(entry.wallet, entry);
    });
    return map;
  }, [portfolioData]);

  const depositAddress = useMemo(() => {
    if (sourceAddress) return sourceAddress;
    for (const wallet of list) if (wallet.type === 'source') return wallet.address;
    return '';
  }, [list, sourceAddress]);

  const depositDetails = useMemo(() => {
    if (!depositAddress) return null;
    const fromPortfolio = portfolioByAddress.get(depositAddress) || {};
    const fromMeta = metaByAddress.get(depositAddress) || {};
    return {
      address: depositAddress,
      sol: Number(fromPortfolio.solBalance ?? fromMeta.balanceSOL ?? 0),
      holdings: fromPortfolio.holdings || [],
    };
  }, [depositAddress, portfolioByAddress, metaByAddress]);

  const botWallets = useMemo(() => list.filter((w) => w.type === 'sub'), [list]);

  const botDisplay = useMemo(() => {
    const combined = [];
    const seen = new Set();
    botWallets.forEach((wallet) => {
      seen.add(wallet.address);
      const fromPortfolio = portfolioByAddress.get(wallet.address) || {};
      combined.push({
        address: wallet.address,
        sol: Number(fromPortfolio.solBalance ?? wallet.balanceSOL ?? 0),
        holdings: fromPortfolio.holdings || [],
      });
    });
    (portfolioData || []).forEach((entry) => {
      if (entry.wallet === depositAddress) return;
      if (!seen.has(entry.wallet)) {
        combined.push({
          address: entry.wallet,
          sol: Number(entry.solBalance || 0),
          holdings: entry.holdings || [],
        });
      }
    });
    return combined;
  }, [botWallets, portfolioByAddress, portfolioData, depositAddress]);

  const totalWallets = list.length;
  const totalBotWallets = botWallets.length;
  const selectedBotWallets = numWallets ?? totalBotWallets;

  const addOne = async () => {
    try {
      await api.post('/wallets/add-one', {});
      await refresh();
      await onRefreshPortfolio?.(true);
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Error adding wallet');
    }
  };

  const removeOne = async (address) => {
    if (confirmText !== 'confirm') {
      setError('Type "confirm" in the box below to enable removal.');
      return;
    }
    try {
      await api.post('/wallets/remove-one', { address, confirm: 'confirm' });
      setConfirmText('');
      await refresh();
      await onRefreshPortfolio?.(true);
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Error removing wallet');
    }
  };

  const refreshAll = async () => {
    await refresh();
    await onRefreshPortfolio?.(true);
  };

  const handleDistribute = async () => {
    const amount = Number(distributeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setDistributeStatus({ type: 'error', message: 'Enter a valid amount per wallet.' });
      return;
    }
    setDistributeLoading(true);
    setDistributeStatus(null);
    try {
      const { data } = await api.post('/funds/distribute', { amountPerWallet: amount });
      const parts = ['Distribute TX: ' + data.txid];
      if (data.feeTxid) parts.push('Fee TX: ' + data.feeTxid);
      setDistributeStatus({ type: 'success', message: parts.join(' | ') });
      setDistributeAmount('');
      await onRefreshPortfolio?.(true);
      onChanged?.();
    } catch (e) {
      setDistributeStatus({ type: 'error', message: e.response?.data?.error || 'Error distributing funds' });
    } finally {
      setDistributeLoading(false);
    }
  };

  const fmtSol = (value) => Number(value || 0).toFixed(4);

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          textAlign: 'center',
          gap: 16,
        }}
      >
        <div style={{ maxWidth: 620 }}>
          <h2 style={{ margin: '0 0 6px' }}>Wallets</h2>
          <p style={{ margin: 0 }}>
            Manage every wallet linked to your account. Use these for deposits and the trading bot.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button title="Add wallet" onClick={addOne} style={{ fontWeight: 700 }}>
            + Add wallet
          </button>
          <button onClick={refreshAll} disabled={portfolioLoading || loading}>
            {portfolioLoading || loading ? 'Refreshing...' : 'Refresh balances'}
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'center',
            fontSize: 13,
          }}
        >
          <span>Total wallets: {totalWallets}</span>
          <span>Bot wallets: {totalBotWallets}</span>
          <span>Active wallets: {activeCount || selectedBotWallets}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, justifyContent: 'center' }}>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='type "confirm" to allow deletes'
          style={{ width: 220 }}
        />
        <span style={{ fontSize: 12, opacity: 0.7, alignSelf: 'center' }}>
          Required before removing a bot wallet.
        </span>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={actionPanelStyle}>
          <h3 style={{ margin: 0 }}>Distribute SOL</h3>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
            Evenly fund each bot wallet from your deposit wallet.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <input
              type="number"
              value={distributeAmount}
              onChange={(e) => setDistributeAmount(e.target.value)}
              placeholder="Amount per wallet"
              style={{ width: 180 }}
            />
            <button onClick={handleDistribute} disabled={distributeLoading}>
              {distributeLoading ? 'Distributing...' : 'Distribute'}
            </button>
          </div>
          {distributeStatus && (
            <div
              style={{
                fontSize: 12,
                color: distributeStatus.type === 'error' ? 'salmon' : '#b7a3ff',
                textAlign: 'center',
              }}
            >
              {distributeStatus.message}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0' }}>
        <div style={{ ...summaryCardStyle, background: 'rgba(123,104,238,0.12)' }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total SOL</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{portfolioSummary.totalSol.toFixed(4)}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Wallets Tracked</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{portfolioData.length}</div>
        </div>
      </div>

      {error && (
        <div style={{ color: 'salmon', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        <div style={walletCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Deposit Wallet</h3>
            {depositAddress && (
              <span
                style={{
                  ...badgeStyle,
                  background: 'rgba(123,104,238,0.18)',
                  border: '1px solid rgba(123,104,238,0.35)',
                  color: '#b7a3ff',
                }}
              >
                Primary
              </span>
            )}
          </div>
          {!depositAddress ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Deposit wallet not generated yet. Visit the Funds tab to create one.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{depositAddress}</div>
              <div style={{ fontSize: 13 }}>SOL: {fmtSol(depositDetails?.sol)}</div>
              {portfolioLoading ? (
                <div style={{ fontSize: 12, opacity: 0.7 }}>Updating balances...</div>
              ) : (
                holdingsBlock(depositDetails?.holdings)
              )}
            </>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Bot Wallets</h3>
            <span style={{ fontSize: 12, opacity: 0.7 }}>These wallets rotate activity across the volume bot.</span>
          </div>

          {portfolioError && (
            <div style={{ color: 'salmon', fontSize: 13, marginBottom: 8 }}>{portfolioError}</div>
          )}

          {portfolioLoading && !botDisplay.length ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Loading bot wallets...</div>
          ) : botDisplay.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>No bot wallets yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {botDisplay.map((wallet) => (
                <div key={wallet.address} style={walletCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{wallet.address}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => navigator.clipboard.writeText(wallet.address)}>Copy</button>
                      <button
                        onClick={() => removeOne(wallet.address)}
                        style={{ background: '#b34d6e', color: '#fff' }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13 }}>SOL: {fmtSol(wallet.sol)}</div>
                  {portfolioLoading ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Updating balances...</div>
                  ) : (
                    holdingsBlock(wallet.holdings)
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletManager;
