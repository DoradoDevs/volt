import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const WalletRow = ({ w, canRemove, onRemove }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      border: '1px solid #7B68EE',
      borderRadius: 8,
      padding: '8px 12px',
      marginBottom: 8,
      background: 'rgba(255,255,255,0.04)'
    }}
  >
    <div>
      <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{w.address}</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        {w.balanceSOL} SOL {w.type === 'source' ? '(deposit)' : '(sub)'}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => navigator.clipboard.writeText(w.address)}>Copy</button>
      {canRemove && (
        <button
          title="Remove this wallet"
          onClick={() => onRemove(w.address)}
          style={{ background: '#b34d6e', color: '#fff' }}
        >
          Remove
        </button>
      )}
    </div>
  </div>
);

const WalletManager = ({ numWallets, refreshToken, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');

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

  const totalSubWallets = useMemo(() => list.filter((w) => w.type === 'sub').length, [list]);
  const displayCount = numWallets ?? totalSubWallets;

  const addOne = async () => {
    try {
      await api.post('/wallets/add-one', {});
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Error adding wallet');
    }
  };

  const removeOne = async (address) => {
    if (confirmText !== 'confirm') {
      setError('Type "confirm" to enable removal');
      return;
    }
    try {
      await api.post('/wallets/remove-one', { address, confirm: 'confirm' });
      setConfirmText('');
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Error removing wallet');
    }
  };

  return (
    <div style={{ border: '1px solid #7B68EE', borderRadius: 10, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Wallet Management</h2>
      <p style={{ marginBottom: 12 }}>Current Sub-Wallets: {displayCount}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button title="Add wallet" onClick={addOne} style={{ fontWeight: 700 }}>＋ Add one</button>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='type "confirm" to enable delete'
          style={{ width: 220 }}
        />
      </div>

      {error && (
        <div style={{ color: 'salmon', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div>
        <h3 style={{ marginTop: 0 }}>Generated Wallets</h3>
        {loading ? (
          <em>Loading…</em>
        ) : list.length === 0 ? (
          <p>No wallets yet.</p>
        ) : (
          list.map((w) => (
            <WalletRow
              key={w.address}
              w={w}
              canRemove={w.type === 'sub'}
              onRemove={removeOne}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default WalletManager;
