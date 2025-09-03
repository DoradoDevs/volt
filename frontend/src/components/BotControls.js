import React, { useState } from 'react';
import api from '../services/api';

const BotControls = ({ running }) => {
  const [tokenMint, setTokenMint] = useState('');
  const [rpc, setRpc] = useState('');
  const [minBuy, setMinBuy] = useState('');
  const [maxBuy, setMaxBuy] = useState('');
  const [minDelay, setMinDelay] = useState('');
  const [maxDelay, setMaxDelay] = useState('');
  const [mode, setMode] = useState('pure');

  const handleSaveSettings = async () => {
    try {
      await api.post('/settings/update', {
        tokenMint,
        rpc,
        minBuy: Number(minBuy),
        maxBuy: Number(maxBuy),
        minDelay: Number(minDelay),
        maxDelay: Number(maxDelay),
        mode,
      });
      alert('Settings saved');
    } catch (e) {
      alert('Error saving settings');
    }
  };

  const handleStart = async () => {
    try {
      await api.post('/bot/start');
      alert('Bot started');
      window.location.reload();
    } catch (e) {
      alert('Error starting bot');
    }
  };

  const handleStop = async () => {
    try {
      await api.post('/bot/stop');
      alert('Bot stopped');
      window.location.reload();
    } catch (e) {
      alert('Error stopping bot');
    }
  };

  return (
    <div style={{ margin: '20px 0' }}>
      <h2>Bot Controls</h2>
      <div>
        <label>Token Mint Address: </label>
        <input
          type="text"
          value={tokenMint}
          onChange={(e) => setTokenMint(e.target.value)}
          placeholder="Enter token mint"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>RPC URL: </label>
        <input
          type="text"
          value={rpc}
          onChange={(e) => setRpc(e.target.value)}
          placeholder="Enter RPC URL"
          style={{ margin: '5px', padding: '5px' }}
        />
        <button onClick={handleSaveSettings}>Save</button>
      </div>
      <div>
        <label>Min Buy (SOL): </label>
        <input
          type="number"
          value={minBuy}
          onChange={(e) => setMinBuy(e.target.value)}
          placeholder="Min buy amount"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>Max Buy (SOL): </label>
        <input
          type="number"
          value={maxBuy}
          onChange={(e) => setMaxBuy(e.target.value)}
          placeholder="Max buy amount"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>Min Delay (ms): </label>
        <input
          type="number"
          value={minDelay}
          onChange={(e) => setMinDelay(e.target.value)}
          placeholder="Min delay"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>Max Delay (ms): </label>
        <input
          type="number"
          value={maxDelay}
          onChange={(e) => setMaxDelay(e.target.value)}
          placeholder="Max delay"
          style={{ margin: '5px', padding: '5px' }}
        />
      </div>
      <div>
        <label>Mode: </label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ margin: '5px', padding: '5px' }}>
          <option value="pure">Pure</option>
          <option value="growth">Growth</option>
          <option value="moonshot">Moonshot</option>
          <option value="human">Human</option>
          <option value="bump">Bump</option>
        </select>
      </div>
      <button onClick={handleSaveSettings}>Save Settings</button>
      <button onClick={handleStart} disabled={running}>Start Bot</button>
      <button onClick={handleStop} disabled={!running}>Stop Bot</button>
    </div>
  );
};

export default BotControls;