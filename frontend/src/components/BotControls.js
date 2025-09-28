// frontend/src/components/BotControls.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** --- Compact dark UI --- */
const palette = {
  panelBg: 'rgba(255,192,203,0.08)',   // very soft pink tint
  panelBorder: 'rgba(255,192,203,0.25)',
  inputBg: 'rgba(255,255,255,0.06)',
  inputBorder: 'rgba(230,230,250,0.25)',
  inputFocus: '0 0 0 3px rgba(123,104,238,0.25)',
  label: 'rgba(230,230,250,0.9)',
  hint: 'rgba(230,230,250,0.7)',
  text: '#E6E6FA',
};

const Panel = ({ children }) => (
  <div
    style={{
      background: palette.panelBg,
      border: `1px solid ${palette.panelBorder}`,
      borderRadius: 14,
      padding: 14,
      maxWidth: 860,
      margin: '0 auto',
      overflow: 'visible',
      boxSizing: 'border-box',
      position: 'relative',
    }}
  >
    {children}
  </div>
);

const Row = ({ label, children, hint, error }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <label style={{ fontSize: 12, color: palette.label, fontWeight: 600 }}>{label}</label>
    {children}
    {hint && !error && <div style={{ fontSize: 12, color: palette.hint }}>{hint}</div>}
    {error && <div style={{ color: 'salmon', fontSize: 12 }}>{error}</div>}
  </div>
);

const baseInput = {
  height: 38,
  padding: '8px 10px',
  borderRadius: 10,
  border: `1px solid ${palette.inputBorder}`,
  background: palette.inputBg,
  color: palette.text,
  outline: 'none',
  width: '100%',
  fontSize: 14,
  transition: 'box-shadow 120ms ease, border-color 120ms ease',
  boxSizing: 'border-box',
};

const Input = (props) => (
  <input
    {...props}
    style={{ ...baseInput, ...props.style }}
    onFocus={(e) => (e.currentTarget.style.boxShadow = palette.inputFocus)}
    onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
  />
);

const Button = ({ children, tone = 'primary', ...rest }) => {
  const tones = {
    primary: { background: '#7B68EE', border: '#7B68EE', color: '#fff' },
    neutral: { background: 'transparent', border: '#7B68EE', color: palette.text },
    danger: { background: '#c65b7c', border: '#c65b7c', color: '#fff' },
  };
  const t = tones[tone] || tones.primary;
  return (
    <button
      {...rest}
      style={{
        background: t.background,
        border: `1px solid ${t.border}`,
        color: t.color,
        height: 36,
        padding: '0 14px',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
};

/** Custom dark dropdown to replace native <select> **/
const ModePicker = ({ value, onChange, options }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = options.find((o) => o.value === value)?.label || value;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((s) => !s); }
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          ...baseInput,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span>{current}</span>
        <span style={{ opacity: 0.8 }}>▾</span>
      </div>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 1000,
            left: 0,
            right: 0,
            marginTop: 6,
            borderRadius: 10,
            border: `1px solid ${palette.inputBorder}`,
            background: '#2a1a40', // solid background (no transparency)
            boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            transform: 'translateZ(0)',
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { onChange(opt.value); setOpen(false); }
                }}
                tabIndex={0}
                style={{
                  padding: '10px 12px',
                  fontSize: 14,
                  color: palette.text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: active ? '#3a006f' : 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#4B0082'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? '#3a006f' : 'transparent'; }}
              >
                <span>{opt.label}</span>
                {active && <span style={{ opacity: 0.9 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** --- Component --- */
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
  const [allWallets, setAllWallets] = useState([]);           // addresses
  const [walletBalances, setWalletBalances] = useState({});   // address -> number
  const [activeWallets, setActiveWallets] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  // Load settings
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

  // Load wallet balances
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/wallets/list');
        const balances = {};
        (res.data?.wallets || []).forEach((w) => {
          balances[w.address] = Number(w.balanceSOL || 0);
        });
        const apiAddrs = (res.data?.wallets || []).map((w) => w.address);
        setAllWallets((prev) => Array.from(new Set([...(prev || []), ...apiAddrs])));
        setWalletBalances(balances);
      } catch (e) {
        console.warn('Could not load wallet balances', e);
      }
    })();
  }, []);

  // Validation (keep inputs as text to avoid the 1-char focus bug)
  const validation = useMemo(() => {
    const errs = {};
    if (!tokenMint || !BASE58_RE.test(tokenMint.trim())) errs.tokenMint = 'Enter a valid Solana mint address.';
    const nMinBuy = Number(minBuy);
    const nMaxBuy = Number(maxBuy);
    if (!(nMinBuy > 0)) errs.minBuy = 'Must be a number > 0.';
    if (!(nMaxBuy > 0)) errs.maxBuy = 'Must be a number > 0.';
    if (nMinBuy > 0 && nMaxBuy > 0 && nMinBuy > nMaxBuy) errs.maxBuy = 'Max must be ≥ Min.';
    const nMinDelay = Number(minDelay);
    const nMaxDelay = Number(maxDelay);
    if (!(nMinDelay >= 0)) errs.minDelay = 'Must be ≥ 0 ms.';
    if (!(nMaxDelay > 0)) errs.maxDelay = 'Must be > 0 ms.';
    if (Number.isFinite(nMinDelay) && Number.isFinite(nMaxDelay) && nMinDelay > nMaxDelay) errs.maxDelay = 'Max must be ≥ Min.';
    if (rpc && !/^https?:\/\/.+/i.test(rpc.trim())) errs.rpc = 'Must be a valid URL (or leave blank).';
    if (!activeWallets.length) errs.activeWallets = 'Select at least one wallet for the bot.';
    return { errs, isValid: Object.keys(errs).length === 0 };
  }, [tokenMint, rpc, minBuy, maxBuy, minDelay, maxDelay, activeWallets]);

  useEffect(() => setErrors(validation.errs), [validation]);

  const parseNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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
        minBuy: parseNum(minBuy),
        maxBuy: parseNum(maxBuy),
        minDelay: parseNum(minDelay),
        maxDelay: parseNum(maxDelay),
        mode,
      });
      await saveWalletSelection();
      alert('Settings saved');
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Error saving settings');
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
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Error starting bot');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await api.post('/bot/stop');
      alert('Bot stopped');
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || 'Error stopping bot');
    } finally {
      setStopping(false);
    }
  };

  const toggleWallet = (addr) =>
    setActiveWallets((prev) => (prev.includes(addr) ? prev.filter((a) => a !== addr) : prev.concat(addr)));

  if (loading) return <div style={{ margin: '16px 0' }}><em>Loading bot settings…</em></div>;

  const usingServerRpc = rpc.trim() === '';
  const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00');

  const modeOptions = [
    { value: 'pure', label: 'Pure' },
    { value: 'growth', label: 'Growth' },
    { value: 'moonshot', label: 'Moonshot' },
    { value: 'human', label: 'Human' },
    { value: 'bump', label: 'Bump' },
  ];

  return (
    <div style={{ margin: '18px 0' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 12, letterSpacing: 0.3 }}>Volume Panel</h2>

      {/* Settings */}
      <Panel>
        <div style={{ display: 'grid', gap: 12 }}>
          <Row label="Token Mint Address" error={errors.tokenMint}>
            <Input type="text" value={tokenMint} onChange={(e) => setTokenMint(e.target.value)} placeholder="So1111… (token mint)" />
          </Row>

          <Row label="RPC URL" hint={usingServerRpc ? 'Using server mainnet RPC (default).' : undefined} error={errors.rpc}>
            <Input type="text" value={rpc} onChange={(e) => setRpc(e.target.value)} placeholder="Leave blank to use server mainnet RPC" />
          </Row>

          <Row label="Min Buy (SOL)" error={errors.minBuy}>
            <Input type="text" value={minBuy} onChange={(e) => setMinBuy(e.target.value)} placeholder="e.g. 0.05" />
          </Row>

          <Row label="Max Buy (SOL)" error={errors.maxBuy}>
            <Input type="text" value={maxBuy} onChange={(e) => setMaxBuy(e.target.value)} placeholder="e.g. 0.15" />
          </Row>

          <Row label="Min Delay (ms)" error={errors.minDelay}>
            <Input type="text" value={minDelay} onChange={(e) => setMinDelay(e.target.value)} placeholder="e.g. 4000" />
          </Row>

          <Row label="Max Delay (ms)" error={errors.maxDelay}>
            <Input type="text" value={maxDelay} onChange={(e) => setMaxDelay(e.target.value)} placeholder="e.g. 9000" />
          </Row>

          <Row label="Mode">
            <ModePicker value={mode} onChange={setMode} options={modeOptions} />
          </Row>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <Button onClick={handleSaveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
            <Button onClick={handleStart} disabled={running || starting || !validation.isValid} title={!validation.isValid ? 'Fix settings errors first' : undefined}>
              {starting ? 'Starting…' : 'Start Bot'}
            </Button>
            <Button tone="danger" onClick={handleStop} disabled={!running || stopping}>{stopping ? 'Stopping…' : 'Stop Bot'}</Button>
          </div>
        </div>
      </Panel>

      {/* Wallet selection */}
      <div style={{ height: 12 }} />
      <Panel>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Pick Wallets for the Bot</h3>
        {(!allWallets || allWallets.length === 0) ? (
          <p style={{ margin: 0 }}>No wallets yet. Go to Wallets tab to generate some.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {allWallets.map((addr) => (
              <label
                key={addr}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  border: `1px solid ${palette.inputBorder}`,
                  borderRadius: 10,
                  background: palette.inputBg,
                }}
              >
                <input
                  type="checkbox"
                  checked={activeWallets.includes(addr)}
                  onChange={() => toggleWallet(addr)}
                  style={{ transform: 'scale(1.1)' }}
                />
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: palette.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {addr}
                </span>
                <span style={{ fontSize: 13, color: palette.label, whiteSpace: 'nowrap', marginLeft: 8 }}>
                  {fmt(walletBalances[addr])} SOL
                </span>
              </label>
            ))}
          </div>
        )}
        {errors.activeWallets && <div style={{ color: 'salmon', fontSize: 12, marginTop: 6 }}>{errors.activeWallets}</div>}
      </Panel>

      {/* Floating help button */}
      <div
        onClick={() => setShowHelp(true)}
        title="How VolT works"
        style={{
          position: 'fixed',
          bottom: 30,
          right: 30,
          width: 42,
          height: 42,
          borderRadius: '50%',
          background: '#7B68EE',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: 18,
          boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
          zIndex: 1500,
        }}
      >
        ?
      </div>

      {/* Help modal */}
      {showHelp && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#2a1a40',
              padding: '28px 32px',
              borderRadius: 12,
              maxWidth: 640,
              width: '92%',
              color: '#E6E6FA',
              lineHeight: 1.5,
              boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>How VolT Works</h3>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  background: '#7B68EE',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <p><strong>Modes</strong></p>
            <ul>
              <li><strong>Pure:</strong> Buys then sells full amount each cycle (tight loops).</li>
              <li><strong>Growth:</strong> Buys then sells ~90% to accumulate small bags over time.</li>
              <li><strong>Moonshot:</strong> Buys only; no auto-sell.</li>
              <li><strong>Human:</strong> Randomized squads buy quickly, then staggered sells to mimic human activity.</li>
              <li><strong>Bump:</strong> Continuous buy/sell across all wallets (steady bumps).</li>
            </ul>

            <p><strong>Deposits</strong><br />
              Your account has a deposit address (primary wallet) created automatically. Send SOL there.
              You can generate new deposit addresses; older ones remain usable.
            </p>

            <p><strong>Withdrawals</strong><br />
              From the Wallets page, withdraw SOL from your deposit wallet to any address. Use “MAX” for full balance.
            </p>

            <p><strong>Tier Discounts</strong><br />
              Bronze 10%, Silver 20%, Gold 30%, Diamond 50%.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotControls;
