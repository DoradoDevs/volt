import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const BotControls = ({ running }) => {
  const [tokenMint, setTokenMint] = useState('');
  const [rpc, setRpc] = useState('');
  const [minBuy, setMinBuy] = useState('');
  const [maxBuy, setMaxBuy] = useState('');
  const [minDelay, setMinDelay] = useState('');
  const [maxDelay, setMaxDelay] = useState('');
  const [mode, setMode] = useState('pure');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [errors, setErrors] = useState({});
  const [allWallets, setAllWallets] = useState([]);
  const [activeWallets, setActiveWallets] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/get');
        setTokenMint(data.tokenMint || '');
        setRpc(data.rpc || '');
        setMinBuy(data.minBuy !== undefined ? String(data.minBuy) : '');
        setMaxBuy(data.maxBuy !== undefined ? String(data.maxBuy) : '');
        setMinDelay(data.minDelay !== undefined ? String(data.minDelay) : '');
        setMaxDelay(data.maxDelay !== undefined ? String(data.maxDelay) : '');
        setMode(data.mode || 'pure');
        setAllWallets(data.allWallets || []);
        setActiveWallets(data.activeWallets || []);
      } catch (e) {
        console.error('Failed to load settings', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const validation = useMemo(() => {
    const errs = {};
    if (!tokenMint || !BASE58_RE.test(tokenMint.trim())) errs.tokenMint = 'Enter a valid Solana mint address.';
    const nMinBuy = parseFloat(minBuy);
    const nMaxBuy = parseFloat(maxBuy);
    if (!(nMinBuy > 0)) errs.minBuy = 'Must be a number > 0.';
    if (!(nMaxBuy > 0)) errs.maxBuy = 'Must be a number > 0.';
    if (nMinBuy > 0 && nMaxBuy > 0 && nMinBuy > nMaxBuy) errs.maxBuy = 'Max must be ≥ Min.';
    const nMinDelay = parseInt(minDelay, 10);
    const nMaxDelay = parseInt(maxDelay, 10);
    if (!(nMinDelay >= 0)) errs.minDelay = 'Must be ≥ 0 ms.';
    if (!(nMaxDelay > 0)) errs.maxDelay = 'Must be > 0 ms.';
    if (Number.isFinite(nMinDelay) && Number.isFinite(nMaxDelay) && nMinDelay > nMaxDelay) errs.maxDelay = 'Max must be ≥ Min.';
    if (rpc && !/^https?:\/\/.+/i.test(rpc.trim())) errs.rpc = 'Must be a valid URL (or leave blank).';
    if (!activeWallets.length) errs.activeWallets = 'Select at least one wallet for the bot.';
    return { errs, isValid: Object.keys(errs).length === 0 };
  }, [tokenMint, rpc, minBuy, maxBuy, minDelay, maxDelay, activeWallets]);

  useEffect(() => setErrors(validation.errs), [validation]);

  const saveWalletSelection = async () => {
    try {
      await api.post('/wallets/active', { addresses: activeWallets });
    } catch (e) {
      console.error(e);
      alert('Error saving wallet selection');
    }
  };

  const handleSaveSettings = async () => {
    if (!validation.isValid) return alert('Fix the errors first.');
    setSaving(true);
    try {
      await api.post('/settings/update', {
        tokenMint: tokenMint.trim(),
        rpc: rpc.trim(),
        minBuy: Number(minBuy),
        maxBuy: Number(maxBuy),
        minDelay: Number(minDelay),
        maxDelay: Number(maxDelay),
        mode,
      });
      await saveWalletSelection();
      alert('Settings saved');
    } catch (e) {
      console.error(e);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!validation.isValid) return alert('Fix the errors first.');
    setStarting(true);
    try {
      await api.post('/bot/start');
      alert('Bot started');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Error starting bot');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await api.post('/bot/stop');
      alert('Bot stopped');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Error stopping bot');
    } finally {
      setStopping(false);
    }
  };

  if (loading) return <div style={{ margin: '20px 0' }}><em>Loading bot settings…</em></div>;

  const usingServerRpc = rpc.trim() === '';
  const toggleWallet = (addr) => {
    setActiveWallets((prev) => prev.includes(addr) ? prev.filter(a => a !== addr) : prev.concat(addr));
  };

  const Input = ({ label, children, hint, error }) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontWeight: 600 }}>{label}</label>
      {children}
      {hint && !error && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{hint}</div>}
      {error && <div style={{ color: 'salmon', fontSize: 12, marginTop: 2 }}>{error}</div>}
    </div>
  );

  return (
    <div style={{ margin: '20px 0', padding: '12px', border: '1px solid #9370DB', borderRadius: 8 }}>
      <h2>Bot Controls</h2>

      <Input label="Token Mint Address" error={errors.tokenMint}>
        <input type="text" value={tokenMint} onChange={(e) => setTokenMint(e.target.value)} placeholder="So1111... (token mint)" style={{ margin: '5px', padding: '5px', width: '100%' }} />
      </Input>

      <Input label="RPC URL" hint={usingServerRpc ? 'Using server mainnet RPC (default).' : undefined} error={errors.rpc}>
        <input type="text" value={rpc} onChange={(e) => setRpc(e.target.value)} placeholder="Leave blank to use server mainnet RPC" style={{ margin: '5px', padding: '5px', width: '100%' }} />
      </Input>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Input label="Min Buy (SOL)" error={errors.minBuy}>
          <input type="number" step="0.0001" value={minBuy} onChange={(e) => setMinBuy(e.target.value)} placeholder="e.g., 0.001" style={{ margin: '5px', padding: '5px', width: '100%' }} />
        </Input>
        <Input label="Max Buy (SOL)" error={errors.maxBuy}>
          <input type="number" step="0.0001" value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} placeholder="e.g., 0.002" style={{ margin: '5px', padding: '5px', width: '100%' }} />
        </Input>

        <Input label="Min Delay (ms)" error={errors.minDelay}>
          <input type="number" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} placeholder="e.g., 500" style={{ margin: '5px', padding: '5px', width: '100%' }} />
        </Input>
        <Input label="Max Delay (ms)" error={errors.maxDelay}>
          <input type="number" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} placeholder="e.g., 1500" style={{ margin: '5px', padding: '5px', width: '100%' }} />
        </Input>
      </div>

      <Input label="Mode">
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ margin: '5px', padding: '5px' }}>
          <option value="pure">Pure</option>
          <option value="growth">Growth</option>
          <option value="moonshot">Moonshot</option>
          <option value="human">Human</option>
          <option value="bump">Bump</option>
        </select>
      </Input>

      <div style={{ marginTop:12 }}>
        <h3>Pick Wallets for the Bot</h3>
        {(!allWallets || allWallets.length === 0) ? (
          <p>No wallets yet. Go to Wallets tab to generate some.</p>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:6 }}>
            {allWallets.map((addr) => (
              <label key={addr} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" checked={activeWallets.includes(addr)} onChange={() => toggleWallet(addr)} />
                <span style={{ fontFamily:'monospace', fontSize:13 }}>{addr}</span>
              </label>
            ))}
          </div>
        )}
        {errors.activeWallets && <div style={{ color:'salmon', fontSize:12, marginTop:4 }}>{errors.activeWallets}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop:12 }}>
        <button onClick={handleSaveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        <button onClick={handleStart} disabled={running || starting || !validation.isValid} title={!validation.isValid ? 'Fix settings errors first' : undefined}>
          {starting ? 'Starting…' : 'Start Bot'}
        </button>
        <button onClick={handleStop} disabled={!running || stopping}>{stopping ? 'Stopping…' : 'Stop Bot'}</button>
      </div>
    </div>
  );
};

export default BotControls;
