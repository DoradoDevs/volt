import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const palette = {
  border: '1px solid rgba(123,104,238,0.55)',
  background: 'rgba(255,255,255,0.04)',
  heading: '#bda4ff',
  text: '#E6E6FA',
};

const panelStyle = {
  border: palette.border,
  borderRadius: 14,
  padding: 18,
  background: palette.background,
};

const sectionTitle = {
  margin: '0 0 10px',
  color: palette.heading,
};

const stackedLabel = {
  display: 'block',
  fontSize: 12,
  color: 'rgba(230,230,250,0.85)',
  marginBottom: 6,
  textAlign: 'left',
};

const buttonRowStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const FundsManager = ({ sourceAddress, balance, onChanged }) => {
  const [depositAddress, setDepositAddress] = useState(sourceAddress || '');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [loadingAction, setLoadingAction] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setDepositAddress(sourceAddress || '');
  }, [sourceAddress]);

  const formattedBalance = useMemo(
    () => Number(balance || 0).toFixed(4),
    [balance]
  );

  const setMessage = (type, message) => setStatus({ type, message });

  const copyDeposit = async () => {
    if (!depositAddress) return;
    if (!navigator?.clipboard?.writeText) {
      setMessage('error', 'Clipboard not available in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(depositAddress);
      setMessage('success', 'Deposit address copied.');
    } catch (err) {
      console.warn('Copy failed', err);
      setMessage('error', 'Unable to copy automatically.');
    }
  };

  const loadDeposit = async () => {
    try {
      const { data } = await api.get('/wallets/deposit-address');
      setDepositAddress(data.sourceAddress);
      setMessage('success', 'Deposit address refreshed.');
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error fetching deposit address');
    }
  };

  const rotateDeposit = async () => {
    try {
      const { data } = await api.post('/wallets/deposit-new');
      setDepositAddress(data.sourceAddress);
      setMessage('success', 'New deposit address generated.');
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error generating new deposit address');
    }
  };

  const handleWithdraw = async () => {
    if (!destination.trim()) {
      setMessage('error', 'Destination address required.');
      return;
    }
    const payloadAmount = withdrawAmount === 'MAX' ? 'MAX' : Number(withdrawAmount);
    if (
      payloadAmount !== 'MAX' &&
      (!Number.isFinite(payloadAmount) || payloadAmount <= 0)
    ) {
      setMessage('error', 'Enter a valid amount to withdraw.');
      return;
    }
    setLoadingAction('withdraw');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/deposit-withdraw', {
        action: 'withdraw',
        amount: payloadAmount,
        destination: destination.trim(),
      });
      const parts = ['Withdraw TX: ' + data.txid];
      if (data.feeTxid) parts.push('Fee TX: ' + data.feeTxid);
      setMessage('success', parts.join(' | '));
      setWithdrawAmount('');
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error withdrawing');
    } finally {
      setLoadingAction('');
    }
  };

  const handleConsolidate = async () => {
    setLoadingAction('consolidate');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/consolidate');
      if (!data.txids || data.txids.length === 0) {
        // Show details about what was skipped
        const skipped = (data.results || []).filter(r => r.status === 'skipped');
        const failed = (data.results || []).filter(r => r.status === 'failed');
        let msg = data.message || 'Nothing to consolidate.';
        if (skipped.length) {
          msg += ` (${skipped.length} wallet(s) skipped: ${skipped.map(s => s.reason).join(', ')})`;
        }
        if (failed.length) {
          msg += ` (${failed.length} failed)`;
        }
        setMessage('success', msg);
      } else {
        const parts = ['Moved from ' + data.txids.length + ' wallet(s)'];
        if (typeof data.totalSol === 'number') {
          parts.push('Total SOL: ' + data.totalSol.toFixed(4));
        }

        // Show any failures or skips
        const failed = (data.results || []).filter(r => r.status === 'failed');
        const skipped = (data.results || []).filter(r => r.status === 'skipped');
        if (skipped.length) {
          parts.push(`${skipped.length} skipped`);
        }
        if (failed.length) {
          parts.push(`${failed.length} failed`);
        }

        parts.push('Primary TX: ' + data.txid);
        if (data.feeTxid) parts.push('Fee TX: ' + data.feeTxid);
        setMessage('success', parts.join(' | '));
      }
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error consolidating');
    } finally {
      setLoadingAction('');
    }
  };

  const handleCloseAccounts = async () => {
    setLoadingAction('close');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/close-accounts');
      setMessage('success', 'Closed ' + (data.closed || 0) + ' token account(s).');
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error closing token accounts');
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ ...panelStyle, display: 'grid', gap: 18 }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
          <h3 style={sectionTitle}>Deposit &amp; Withdraw</h3>
          <div style={{ fontSize: 14 }}>
            Deposit balance: <strong>{formattedBalance} SOL</strong>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Deposit address</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                background: 'rgba(255,255,255,0.05)',
                padding: '6px 10px',
                borderRadius: 8,
              }}
            >
              {depositAddress || '-'}
            </span>
            <div style={buttonRowStyle}>
              <button onClick={copyDeposit} disabled={!depositAddress}>Copy</button>
              <button onClick={loadDeposit}>Refresh</button>
              <button onClick={rotateDeposit}>Rotate</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div style={{ width: 160 }}>
              <span style={stackedLabel}>Withdraw (SOL)</span>
              <input
                type="text"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.50"
              />
            </div>
            <div style={{ width: 280 }}>
              <span style={stackedLabel}>Destination</span>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination address"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => setWithdrawAmount('MAX')}>MAX</button>
              <button onClick={handleWithdraw} disabled={loadingAction === 'withdraw'}>
                {loadingAction === 'withdraw' ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
        <h3 style={sectionTitle}>Housekeeping</h3>
        <div style={buttonRowStyle}>
          <button onClick={handleConsolidate} disabled={loadingAction === 'consolidate'}>
            {loadingAction === 'consolidate' ? 'Consolidating...' : 'Consolidate to Deposit'}
          </button>
          <button onClick={handleCloseAccounts} disabled={loadingAction === 'close'}>
            {loadingAction === 'close' ? 'Closing...' : 'Close Token Accounts'}
          </button>
        </div>
      </div>

      {status && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background:
              status.type === 'error'
                ? 'rgba(255,99,132,0.15)'
                : 'rgba(123,104,238,0.2)',
            color: status.type === 'error' ? '#ff6b81' : palette.text,
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
};

export default FundsManager;
