import React, { useState, useEffect } from 'react';
import api from '../services/api';

const FundsManager = ({ sourceAddress, balance }) => {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [depositAddress, setDepositAddress] = useState(sourceAddress || '');

  useEffect(() => { setDepositAddress(sourceAddress || ''); }, [sourceAddress]);

  const loadDeposit = async () => {
    try {
      const { data } = await api.get('/wallets/deposit-address'); // ensures it exists
      setDepositAddress(data.sourceAddress);
    } catch {
      alert('Error fetching deposit address');
    }
  };

  const rotateDeposit = async () => {
    try {
      const { data } = await api.post('/wallets/deposit-new');
      setDepositAddress(data.sourceAddress);
      alert('New deposit address generated');
    } catch {
      alert('Error generating new deposit address');
    }
  };

  const handleWithdraw = async () => {
    try {
      const finalAmount = amount === 'MAX' ? amount : Number(amount);
      const { data } = await api.post('/funds/deposit-withdraw', { action: 'withdraw', amount: finalAmount, destination });
      alert(`Withdraw TXID: ${data.txid}`);
      window.location.reload();
    } catch {
      alert('Error withdrawing');
    }
  };

  const handleDistribute = async () => {
    try {
      const { data } = await api.post('/funds/distribute', { amountPerWallet: Number(distributeAmount) });
      alert(`Distribute TXID: ${data.txid}`);
      window.location.reload();
    } catch {
      alert('Error distributing');
    }
  };

  const handleConsolidate = async () => {
    try {
      const { data } = await api.post('/funds/consolidate');
      alert(`Consolidate TXID: ${data.txid || 'nothing to do'}`);
      window.location.reload();
    } catch {
      alert('Error consolidating');
    }
  };

  const handleSellAll = async () => {
    try {
      await api.post('/funds/sell-all');
      alert('All tokens sold');
      window.location.reload();
    } catch {
      alert('Error selling tokens');
    }
  };

  const handleCloseAccounts = async () => {
    try {
      await api.post('/funds/close-accounts');
      alert('Token accounts closed');
      window.location.reload();
    } catch {
      alert('Error closing accounts');
    }
  };

  return (
    <div style={{ margin: '20px 0', border:'1px solid #7B68EE', borderRadius:8, padding:12 }}>
      <h2>Funds Management</h2>
      <div>
        <p>Source (Deposit) Address: <span style={{ fontFamily:'monospace' }}>{depositAddress || '—'}</span></p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={loadDeposit}>Get Deposit Address</button>
          <button onClick={() => navigator.clipboard.writeText(depositAddress)} disabled={!depositAddress}>Copy</button>
          <button onClick={rotateDeposit}>Generate New Deposit Address</button>
        </div>
        <p>Balance: {balance} SOL</p>
      </div>

      <div style={{ marginTop:12 }}>
        <label>Withdraw Amount (SOL): </label>
        <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount or MAX" />
        <button onClick={() => setAmount('MAX')}>MAX</button>
      </div>
      <div>
        <label>Destination Address: </label>
        <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination address" />
        <button onClick={handleWithdraw}>Withdraw</button>
      </div>

      <div style={{ marginTop:12 }}>
        <label>Distribute Amount per Wallet (SOL): </label>
        <input type="number" value={distributeAmount} onChange={(e) => setDistributeAmount(e.target.value)} placeholder="Amount per wallet" />
        <button onClick={handleDistribute}>Distribute</button>
      </div>

      <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={handleConsolidate}>Consolidate</button>
        <button onClick={handleSellAll}>Sell All Tokens to SOL</button>
        <button onClick={handleCloseAccounts}>Close Token Accounts</button>
      </div>
    </div>
  );
};

export default FundsManager;
