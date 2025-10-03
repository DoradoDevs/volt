import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const FundsManager = ({ sourceAddress, balance, onChanged }) => {
  const [depositAddress, setDepositAddress] = useState(sourceAddress || '');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [loadingAction, setLoadingAction] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setDepositAddress(sourceAddress || '');
  }, [sourceAddress]);

  const formattedBalance = useMemo(() => Number(balance || 0).toFixed(4), [balance]);

  const setMessage = (type, message) => setStatus({ type, message });

  const loadDeposit = async () => {
    try {
      const { data } = await api.get('/wallets/deposit-address');
      setDepositAddress(data.sourceAddress);
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error fetching deposit address');
    }
  };

  const rotateDeposit = async () => {
    try {
      const { data } = await api.post('/wallets/deposit-new');
      setDepositAddress(data.sourceAddress);
      setMessage('success', 'New deposit address generated');
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error generating new deposit address');
    }
  };

  const handleWithdraw = async () => {
    if (!destination.trim()) {
      setMessage('error', 'Destination address required');
      return;
    }
    const payloadAmount = withdrawAmount === 'MAX' ? 'MAX' : Number(withdrawAmount);
    if (payloadAmount !== 'MAX' && (!Number.isFinite(payloadAmount) || payloadAmount <= 0)) {
      setMessage('error', 'Enter a valid amount');
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
      const msg = [`Withdraw TX: ${data.txid}`];
      if (data.feeTxid) msg.push(`Fee TX: ${data.feeTxid}`);
      setMessage('success', msg.join(' | '));
      setWithdrawAmount('');
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error withdrawing');
    } finally {
      setLoadingAction('');
    }
  };

  const handleDistribute = async () => {
    const perWallet = Number(distributeAmount);
    if (!Number.isFinite(perWallet) || perWallet <= 0) {
      setMessage('error', 'Enter a valid amount per wallet');
      return;
    }
    setLoadingAction('distribute');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/distribute', { amountPerWallet: perWallet });
      const msg = [`Distribute TX: ${data.txid}`];
      if (data.feeTxid) msg.push(`Fee TX: ${data.feeTxid}`);
      setMessage('success', msg.join(' | '));
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error distributing');
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
        setMessage('success', data.message || 'Nothing to consolidate');
      } else {
        const msg = [`Moved from ${data.txids.length} wallet(s)`];
        if (typeof data.totalSol === 'number') {
          msg.push(`Total SOL: ${data.totalSol.toFixed(4)}`);
        }
        msg.push(`Primary TX: ${data.txid}`);
        if (data.feeTxid) msg.push(`Fee TX: ${data.feeTxid}`);
        setMessage('success', msg.join(' | '));
      }
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error consolidating');
    } finally {
      setLoadingAction('');
    }
  };

  const handleSellAll = async () => {
    setLoadingAction('sell');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/sell-all');
      const successCount = Array.isArray(data.results)
        ? data.results.filter((r) => r.txid).length
        : 0;
      setMessage('success', `Sell-all triggered (${successCount} wallet(s) queued)`);
      onChanged?.();
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error selling tokens');
    } finally {
      setLoadingAction('');
    }
  };

  const handleCloseAccounts = async () => {
    setLoadingAction('close');
    setStatus(null);
    try {
      const { data } = await api.post('/funds/close-accounts');
      setMessage('success', `Closed ${data.closed || 0} token account(s)`);
    } catch (e) {
      setMessage('error', e.response?.data?.error || 'Error closing accounts');
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <div style={{ border: '1px solid #7B68EE', borderRadius: 10, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Funds Management</h2>
      <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
        Deposit Address: {depositAddress || '—'}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>Deposit Balance: {formattedBalance} SOL</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button onClick={loadDeposit}>Ensure Deposit Address</button>
        <button onClick={() => navigator.clipboard.writeText(depositAddress)} disabled={!depositAddress}>
          Copy
        </button>
        <button onClick={rotateDeposit}>Rotate Address</button>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Withdraw Amount (SOL)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount or MAX"
              style={{ flex: 1 }}
            />
            <button onClick={() => setWithdrawAmount('MAX')}>MAX</button>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Destination Address</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destination address"
            style={{ width: '100%' }}
          />
        </div>
        <button
          onClick={handleWithdraw}
          disabled={loadingAction === 'withdraw'}
          style={{ width: 'fit-content' }}
        >
          {loadingAction === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Distribute Amount per Wallet (SOL)</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number"
            value={distributeAmount}
            onChange={(e) => setDistributeAmount(e.target.value)}
            placeholder="Amount per wallet"
            style={{ flex: 1 }}
          />
          <button onClick={handleDistribute} disabled={loadingAction === 'distribute'}>
            {loadingAction === 'distribute' ? 'Distributing…' : 'Distribute'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleConsolidate} disabled={loadingAction === 'consolidate'}>
          {loadingAction === 'consolidate' ? 'Consolidating…' : 'Consolidate to Deposit'}
        </button>
        <button onClick={handleSellAll} disabled={loadingAction === 'sell'}>
          {loadingAction === 'sell' ? 'Selling…' : 'Sell All Tokens to SOL'}
        </button>
        <button onClick={handleCloseAccounts} disabled={loadingAction === 'close'}>
          {loadingAction === 'close' ? 'Closing…' : 'Close Token Accounts'}
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 14,
            padding: 10,
            borderRadius: 8,
            background: status.type === 'error' ? 'rgba(255,99,132,0.15)' : 'rgba(123,104,238,0.15)',
            color: status.type === 'error' ? '#ff6b81' : '#E6E6FA',
            fontSize: 13,
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
};

export default FundsManager;
