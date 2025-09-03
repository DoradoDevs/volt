import React, { useState } from 'react';
import api from '../services/api';

const WalletManager = ({ numWallets }) => {
  const [addCount, setAddCount] = useState('');
  const [removeCount, setRemoveCount] = useState('');
  const [confirm1, setConfirm1] = useState('');
  const [confirm2, setConfirm2] = useState('');

  const handleAdd = async () => {
    try {
      await api.post('/wallets/manage', { action: 'add', count: Number(addCount) });
      alert('Wallets added');
      window.location.reload();
    } catch (e) {
      alert('Error adding wallets');
    }
  };

  const handleRemove = async () => {
    if (confirm1 !== 'confirm' || confirm2 !== 'confirm') {
      alert('Please confirm deletion twice');
      return;
    }
    try {
      await api.post('/wallets/manage', { action: 'remove', count: Number(removeCount), confirm1, confirm2 });
      alert('Wallets removed');
      window.location.reload();
    } catch (e) {
      alert('Error removing wallets');
    }
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h2>Wallet Management</h2>
      <p>Current Sub-Wallets: {numWallets}</p>
      <div>
        <label>Add Wallets: </label>
        <input
          type="number"
          value={addCount}
          onChange={(e) => setAddCount(e.target.value)}
          placeholder="Number to add"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleAdd}>Add</button>
      </div>
      <div>
        <label>Remove Wallets: </label>
        <input
          type="number"
          value={removeCount}
          onChange={(e) => setRemoveCount(e.target.value)}
          placeholder="Number to remove"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>Confirm Delete: </label>
        <input
          type="text"
          value={confirm1}
          onChange={(e) => setConfirm1(e.target.value)}
          placeholder="Type 'confirm'"
          style={{ margin: '5px', padding: '5px' }}
        />
        <input
          type="text"
          value={confirm2}
          onChange={(e) => setConfirm2(e.target.value)}
          placeholder="Type 'confirm' again"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleRemove}>Remove</button>
      </div>
    </div>
  );
};

export default WalletManager;