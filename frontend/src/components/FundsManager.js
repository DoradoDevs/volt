import React, { useState } from 'react';
import api from '../services/api';

const FundsManager = ({ sourceAddress, balance }) => {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');

  const handleDeposit = async () => {
    try {
      const { data } = await api.post('/funds/deposit-withdraw', { action: 'deposit' });
      alert(`Deposit to: ${data.sourceAddress}`);
    } catch (e) {
      alert('Error fetching deposit address');
    }
  };

  const handleWithdraw = async () => {
    try {
      const finalAmount = amount === 'MAX' ? amount : Number(amount);
      const { data } = await api.post('/funds/deposit-withdraw', { action: 'withdraw', amount: finalAmount, destination });
      alert(`Withdraw TXID: ${data.txid}`);
      window.location.reload();
    } catch (e) {
      alert('Error withdrawing');
    }
  };

  const handleDistribute = async () => {
    try {
      const { data } = await api.post('/funds/distribute', { amountPerWallet: Number(distributeAmount) });
      alert(`Distribute TXID: ${data.txid}`);
      window.location.reload();
    } catch (e) {
      alert('Error distributing');
    }
  };

  const handleConsolidate = async () => {
    try {
      const { data } = await api.post('/funds/consolidate');
      alert(`Consolidate TXID: ${data.txid}`);
      window.location.reload();
    } catch (e) {
      alert('Error consolidating');
    }
  };

  const handleSellAll = async () => {
    try {
      await api.post('/funds/sell-all');
      alert('All tokens sold');
      window.location.reload();
    } catch (e) {
      alert('Error selling tokens');
    }
  };

  const handleCloseAccounts = async () => {
    try {
      await api.post('/funds/close-accounts');
      alert('Token accounts closed');
      window.location.reload();
    } catch (e) {
      alert('Error closing accounts');
    }
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h2>Funds Management</h2>
      <div>
        <p>Source Address: {sourceAddress}</p>
        <p>Balance: {balance} SOL</p>
      </div>
      <div>
        <button onClick={handleDeposit}>Get Deposit Address</button>
      </div>
      <div>
        <label>Withdraw Amount (SOL): </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount or MAX"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={() => setAmount('MAX')}>MAX</button>
      </div>
      <div>
        <label>Destination Address: </label>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination address"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleWithdraw}>Withdraw</button>
      </div>
      <div>
        <label>Distribute Amount per Wallet (SOL): </label>
        <input
          type="number"
          value={distributeAmount}
          onChange={(e) => setDistributeAmount(e.target.value)}
          placeholder="Amount per wallet"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleDistribute}>Distribute</button>
      </div>
      <div>
        <button onClick={handleConsolidate}>Consolidate</button>
        <button onClick={handleSellAll}>Sell All Tokens to SOL</button>
        <button onClick={handleCloseAccounts}>Close Token Accounts</button>
      </div>
    </div>
  );
};

export default FundsManager;