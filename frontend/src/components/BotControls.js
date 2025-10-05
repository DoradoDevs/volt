import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import theme from '../theme';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Use centralized theme
const palette = {
  panelBg: theme.colors.pink,
  panelBorder: theme.colors.borderPanel,
  inputBg: theme.colors.bgInput,
  inputBorder: theme.colors.borderInput,
  text: theme.colors.text,
  hint: theme.colors.textHint,
  label: theme.colors.textLabel,
  focusShadow: theme.shadows.focus,
};

const Panel = ({ children, style }) => (
  <div
    style={{
      background: palette.panelBg,
      border: `1px solid ${palette.panelBorder}`,
      borderRadius: 14,
      padding: 16,
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

const Row = ({ label, children, hint, error }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <label style={{ fontSize: 12, fontWeight: 600, color: palette.label }}>{label}</label>
    {children}
    {hint && !error && <div style={{ fontSize: 12, color: palette.hint }}>{hint}</div>}
    {error && <div style={{ fontSize: 12, color: 'salmon' }}>{error}</div>}
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
  boxSizing: 'border-box',
};

const Input = ({ style, onFocus, onBlur, ...props }) => (
  <input
    {...props}
    style={{ ...baseInput, ...style }}
    onFocus={(e) => {
      e.currentTarget.style.boxShadow = palette.focusShadow;
      if (typeof onFocus === 'function') onFocus(e);
    }}
    onBlur={(e) => {
      e.currentTarget.style.boxShadow = 'none';
      if (typeof onBlur === 'function') onBlur(e);
    }}
  />
);

const Button = ({ tone = 'primary', style, disabled, children, ...props }) => {
  const tones = {
    primary: { background: '#7B68EE', border: '#7B68EE', color: '#fff' },
    neutral: { background: 'transparent', border: '#7B68EE', color: palette.text },
    danger: { background: '#c65b7c', border: '#c65b7c', color: '#fff' },
  };
  const theme = tones[tone] || tones.primary;
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        background: theme.background,
        color: theme.color,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: '0 14px',
        height: 36,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        fontWeight: 600,
        fontSize: 14,
        ...style,
      }}
    >
      {children}
    </button>
  );
};

const ModePicker = ({ value, onChange, options }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const selected = options.find((opt) => opt.value === value);
  const modeDescriptions = {
    pure: 'Buy → Sell full amount. Pure volume generation.',
    growth: 'Buy → Sell 90%. Accumulates tokens while generating volume.',
    moonshot: 'Buy only, no selling. Pump price and accumulate.',
    human: 'Fully randomized patterns. Recommended delay: 5000-60000ms.',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          ...baseInput,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
        }}
      >
        <span>{selected?.label || 'Select Mode'}</span>
        <span style={{ fontSize: 12, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: theme.colors.bgDropdown,
            border: `1px solid ${theme.colors.borderPrimary}`,
            borderRadius: theme.borderRadius.md,
            overflow: 'hidden',
            zIndex: 1000,
            boxShadow: theme.shadows.dropdown,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: 'none',
                background: opt.value === value ? theme.colors.bgSelected : 'transparent',
                color: theme.colors.text,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s',
                display: 'grid',
                gap: 4,
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) {
                  e.currentTarget.style.background = theme.colors.bgHover;
                }
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: theme.colors.textHint, lineHeight: 1.4 }}>
                {modeDescriptions[opt.value] || ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const HelpDialog = ({ onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: 20,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#2c1150',
        borderRadius: 16,
        maxWidth: 480,
        width: '100%',
        padding: '28px 32px',
        color: palette.text,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        display: 'grid',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Need a refresher?</h3>
        <button
          onClick={onClose}
          style={{
            background: '#7B68EE',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gap: 14, fontSize: 14, lineHeight: 1.55 }}>
        <div>
          <strong>Run volume safely.</strong> Pick a mint, choose your mode, and set min/max buy size & delay.
          The bot alternates buys/sells across the wallets you select. Moonshot skips sells entirely.
        </div>
        <div>
          <strong>Wallet selection.</strong> Only checked wallets join the bot rotation. Update the list any time;
          changes auto-save.
        </div>
        <div>
          <strong>RPC tips.</strong> Provide a private RPC for best fills, or leave blank to use the shared mainnet RPC.
        </div>
        <div>
          <strong>Safety.</strong> Keep some SOL in the primary deposit wallet for fees. Use the Funds tab to rotate
          deposit addresses, withdraw profits, or consolidate dust.
        </div>
      </div>
    </div>
  </div>
);

const BotControls = ({ running, onStatusChange }) => {
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
  const [sellingAll, setSellingAll] = useState(false);
  const [savingRpc, setSavingRpc] = useState(false);
  const [errors, setErrors] = useState({});
  const [allWallets, setAllWallets] = useState([]);
  const [walletBalances, setWalletBalances] = useState({});
  const [activeWallets, setActiveWallets] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const [preflight, setPreflight] = useState({ ok: true, issues: [] });
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [walletSaveStatus, setWalletSaveStatus] = useState('idle');
  const [refreshingBalances, setRefreshingBalances] = useState(false);

  const loadedRef = useRef(false);
  const savedSettingsRef = useRef('');
  const savedSelectionRef = useRef('');

  const applySettings = (data = {}) => {
    setTokenMint(data.tokenMint || '');
    setRpc(data.rpc || '');
    setMinBuy(
      data.minBuy !== undefined && data.minBuy !== null
        ? String(data.minBuy)
        : ''
    );
    setMaxBuy(
      data.maxBuy !== undefined && data.maxBuy !== null
        ? String(data.maxBuy)
        : ''
    );
    setMinDelay(
      data.minDelay !== undefined && data.minDelay !== null
        ? String(data.minDelay)
        : ''
    );
    setMaxDelay(
      data.maxDelay !== undefined && data.maxDelay !== null
        ? String(data.maxDelay)
        : ''
    );
    setMode(data.mode || 'pure');
    setActiveWallets(Array.isArray(data.activeWallets) ? data.activeWallets : []);
    setAllWallets((prev) => {
      const seed = Array.isArray(prev) ? prev : [];
      const incoming = Array.isArray(data.allWallets) ? data.allWallets : [];
      return Array.from(new Set([...seed, ...incoming]));
    });
    setPreflight(data.preflight || { ok: true, issues: [] });
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/get');
        applySettings(data || {});
        const signature = JSON.stringify({
          tokenMint: (data?.tokenMint || '').trim(),
          minBuy: Number(data?.minBuy || 0),
          maxBuy: Number(data?.maxBuy || 0),
          minDelay: Number(data?.minDelay || 0),
          maxDelay: Number(data?.maxDelay || 0),
          mode: data?.mode || 'pure',
        });
        savedSettingsRef.current = signature;
        savedSelectionRef.current = JSON.stringify(
          Array.isArray(data?.activeWallets) ? [...data.activeWallets].sort() : []
        );
      } catch (err) {
        console.error('Failed to load bot settings', err);
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/wallets/list');
        const balances = {};
        const addresses = [];
        (res.data?.wallets || []).forEach((wallet) => {
          balances[wallet.address] = Number(wallet.balanceSOL || 0);
          addresses.push(wallet.address);
        });
        setWalletBalances(balances);
        setAllWallets((prev) => {
          const next = new Set([...(prev || []), ...addresses]);
          return Array.from(next);
        });
      } catch (err) {
        console.warn('Could not load wallet balances', err);
      }
    })();
  }, []);

  const parseNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const validation = useMemo(() => {
    const nextErrors = {};
    const mint = tokenMint.trim();
    if (!mint || !BASE58_RE.test(mint)) {
      nextErrors.tokenMint = 'Enter a valid Solana mint address.';
    }
    const nMinBuy = parseNum(minBuy);
    const nMaxBuy = parseNum(maxBuy);
    if (!(nMinBuy > 0)) nextErrors.minBuy = 'Minimum buy must be greater than 0.';
    if (!(nMaxBuy > 0)) nextErrors.maxBuy = 'Maximum buy must be greater than 0.';
    if (nMinBuy > 0 && nMaxBuy > 0 && nMinBuy > nMaxBuy) {
      nextErrors.maxBuy = 'Maximum buy must be at least the minimum.';
    }
    const nMinDelay = parseNum(minDelay);
    const nMaxDelay = parseNum(maxDelay);
    if (!(nMinDelay >= 0)) nextErrors.minDelay = 'Minimum delay must be zero or positive.';
    if (!(nMaxDelay > 0)) nextErrors.maxDelay = 'Maximum delay must be greater than zero.';
    if (nMinDelay >= 0 && nMaxDelay > 0 && nMinDelay > nMaxDelay) {
      nextErrors.maxDelay = 'Maximum delay must be at least the minimum.';
    }
    if (!activeWallets.length) {
      nextErrors.activeWallets = 'Select at least one wallet for the bot.';
    }
    if (rpc && !/^https?:\/\//i.test(rpc.trim())) {
      nextErrors.rpc = 'Enter a valid RPC URL or leave blank.';
    }
    return {
      isValid: Object.keys(nextErrors).length === 0,
      errors: nextErrors,
    };
  }, [tokenMint, minBuy, maxBuy, minDelay, maxDelay, activeWallets, rpc]);

  useEffect(() => {
    setErrors(validation.errors);
  }, [validation]);

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        tokenMint: tokenMint.trim(),
        minBuy: parseNum(minBuy),
        maxBuy: parseNum(maxBuy),
        minDelay: parseNum(minDelay),
        maxDelay: parseNum(maxDelay),
        mode,
      }),
    [tokenMint, minBuy, maxBuy, minDelay, maxDelay, mode]
  );

  useEffect(() => {
    if (!loadedRef.current) return;
    if (currentSignature === savedSettingsRef.current) {
      setAutoSaveStatus('idle');
      return;
    }
    if (!validation.isValid) {
      setAutoSaveStatus('blocked');
      return;
    }
    setAutoSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await api.post('/settings/update', {
          tokenMint: tokenMint.trim(),
          minBuy: parseNum(minBuy),
          maxBuy: parseNum(maxBuy),
          minDelay: parseNum(minDelay),
          maxDelay: parseNum(maxDelay),
          mode,
        });
        savedSettingsRef.current = currentSignature;
        setAutoSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed', err);
        setAutoSaveStatus('error');
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [currentSignature, validation.isValid, tokenMint, minBuy, maxBuy, minDelay, maxDelay, mode]);

  const activeSignature = useMemo(
    () => JSON.stringify([...activeWallets].sort()),
    [activeWallets]
  );

  useEffect(() => {
    if (!loadedRef.current) return;
    if (activeSignature === savedSelectionRef.current) {
      setWalletSaveStatus('idle');
      return;
    }
    if (!activeWallets.length) {
      setWalletSaveStatus('blocked');
      return;
    }
    setWalletSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const sorted = [...activeWallets].sort();
        await api.post('/wallets/active', { addresses: sorted });
        savedSelectionRef.current = JSON.stringify(sorted);
        setWalletSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save wallet selection failed', err);
        setWalletSaveStatus('error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [activeSignature, activeWallets]);

  const statusText = (status) => {
    if (status === 'saving') return 'Saving�';
    if (status === 'saved') return 'Saved';
    if (status === 'blocked') return 'Fix the highlighted fields to save';
    if (status === 'error') return 'Auto-save failed. Use Save Settings.';
    return '';
  };

  const usingServerRpc = rpc.trim() === '';
  const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00');

  const modeOptions = [
    { value: 'pure', label: 'Pure' },
    { value: 'growth', label: 'Growth' },
    { value: 'moonshot', label: 'Moonshot' },
    { value: 'human', label: 'Human' },
  ];

  const handleSaveRpc = async () => {
    setSavingRpc(true);
    try {
      await api.post('/settings/update', { rpc: rpc.trim() });
      const { data } = await api.get('/settings/get');
      applySettings(data || {});
      savedSettingsRef.current = JSON.stringify({
        tokenMint: (data?.tokenMint || '').trim(),
        minBuy: Number(data?.minBuy || 0),
        maxBuy: Number(data?.maxBuy || 0),
        minDelay: Number(data?.minDelay || 0),
        maxDelay: Number(data?.maxDelay || 0),
        mode: data?.mode || 'pure',
      });
      savedSelectionRef.current = JSON.stringify(
        Array.isArray(data?.activeWallets) ? [...data.activeWallets].sort() : []
      );
      setAutoSaveStatus('saved');
      alert('RPC URL saved');
      onStatusChange?.();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Error saving RPC URL');
    } finally {
      setSavingRpc(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!validation.isValid) {
      alert('Fix the highlighted fields first.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tokenMint: tokenMint.trim(),
        rpc: rpc.trim(),
        minBuy: parseNum(minBuy),
        maxBuy: parseNum(maxBuy),
        minDelay: parseNum(minDelay),
        maxDelay: parseNum(maxDelay),
        mode,
      };
      await api.post('/settings/update', payload);
      const sorted = [...activeWallets].sort();
      await api.post('/wallets/active', { addresses: sorted });
      const { data } = await api.get('/settings/get');
      applySettings(data || {});
      savedSettingsRef.current = JSON.stringify({
        tokenMint: (data?.tokenMint || '').trim(),
        minBuy: Number(data?.minBuy || 0),
        maxBuy: Number(data?.maxBuy || 0),
        minDelay: Number(data?.minDelay || 0),
        maxDelay: Number(data?.maxDelay || 0),
        mode: data?.mode || 'pure',
      });
      savedSelectionRef.current = JSON.stringify(
        Array.isArray(data?.activeWallets) ? [...data.activeWallets].sort() : []
      );
      setAutoSaveStatus('saved');
      setWalletSaveStatus('saved');
      alert('Settings saved');
      onStatusChange?.();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!mode || mode.trim() === '') {
      alert('Please select a bot mode before starting.');
      return;
    }
    if (!validation.isValid) {
      alert('Fix the highlighted fields first.');
      return;
    }
    setStarting(true);
    try {
      // Save current settings first to ensure mode and other values are persisted
      const payload = {
        tokenMint,
        minBuy: parseFloat(minBuy) || 0,
        maxBuy: parseFloat(maxBuy) || 0,
        minDelay: parseFloat(minDelay) || 0,
        maxDelay: parseFloat(maxDelay) || 0,
        mode,
      };
      await api.post('/settings/update', payload);

      // Now fetch to verify and run preflight checks
      const { data } = await api.get('/settings/get');
      setPreflight(data?.preflight || { ok: true, issues: [] });
      if (!data?.preflight?.ok) {
        const lines = ['Bot configuration incomplete.'];
        if (Array.isArray(data?.preflight?.issues) && data.preflight.issues.length) {
          lines.push('');
          data.preflight.issues.forEach((issue) => lines.push('- ' + issue));
        }
        alert(lines.join('\n'));
        return;
      }
      const startResp = await api.post('/bot/start');
      const startMessage = startResp?.data?.message || 'Bot start request accepted';
      alert(startMessage);
      onStatusChange?.();
    } catch (err) {
      console.error(err);
      const msg = err?.code === 'ERR_NETWORK'
        ? 'Unable to reach the backend. Make sure the server is running on http://localhost:5000.'
        : (err?.response?.data?.error || err?.message || 'Error starting bot');
      alert(msg);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const resp = await api.post('/bot/stop');
      const message = resp?.data?.message || 'Stop signal sent';
      alert(message);
      onStatusChange?.();
    } catch (err) {
      console.error(err);
      const msg = err?.code === 'ERR_NETWORK'
        ? 'Unable to reach the backend. Make sure the server is running on http://localhost:5000.'
        : (err?.response?.data?.error || err?.message || 'Error stopping bot');
      alert(msg);
    } finally {
      setStopping(false);
    }
  };

  const handleSellAll = async () => {
    setSellingAll(true);
    try {
      const { data } = await api.post('/funds/sell-all');
      const successCount = Array.isArray(data?.results)
        ? data.results.filter((entry) => entry && entry.txid).length
        : 0;
      alert('Sell-all queued for ' + successCount + ' wallet(s).');
      onStatusChange?.();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Error selling tokens');
    } finally {
      setSellingAll(false);
    }
  };

  const toggleWallet = (address) => {
    setActiveWallets((prev) =>
      prev.includes(address)
        ? prev.filter((entry) => entry !== address)
        : prev.concat(address)
    );
  };

  const handleRefreshBalances = async () => {
    setRefreshingBalances(true);
    try {
      const res = await api.get('/wallets/list');
      const balances = {};
      const addresses = [];
      (res.data?.wallets || []).forEach((wallet) => {
        balances[wallet.address] = Number(wallet.balanceSOL || 0);
        addresses.push(wallet.address);
      });
      setWalletBalances(balances);
      setAllWallets((prev) => {
        const next = new Set([...(prev || []), ...addresses]);
        return Array.from(next);
      });
    } catch (err) {
      console.error('Failed to refresh balances', err);
      alert('Failed to refresh balances. Try again.');
    } finally {
      setRefreshingBalances(false);
    }
  };

  if (loading) {
    return (
      <div style={{ margin: '16px 0' }}>
        <em>Loading bot settings�</em>
      </div>
    );
  }

  return (
    <div style={{ margin: '18px 0' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 12 }}>Volume Terminal</h2>

      <Panel>
        <div style={{ display: 'grid', gap: 14 }}>
          <Row label="Token Mint Address" error={errors.tokenMint}>
            <Input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="So1111... (token mint)"
            />
          </Row>

          <Row
            label="RPC URL"
            hint={usingServerRpc ? 'Using server mainnet RPC by default.' : undefined}
            error={errors.rpc}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Input
                type="text"
                value={rpc}
                onChange={(e) => setRpc(e.target.value)}
                placeholder="Leave blank to use the shared RPC"
                style={{ flex: '1 1 260px', minWidth: 200 }}
              />
              <Button
                tone="neutral"
                onClick={handleSaveRpc}
                disabled={savingRpc}
              >
                {savingRpc ? 'Saving�' : 'Save RPC'}
              </Button>
            </div>
          </Row>

          <Row label="Min Buy (SOL)" error={errors.minBuy}>
            <Input
              type="text"
              value={minBuy}
              onChange={(e) => setMinBuy(e.target.value)}
              placeholder="e.g. 0.05"
            />
          </Row>

          <Row label="Max Buy (SOL)" error={errors.maxBuy}>
            <Input
              type="text"
              value={maxBuy}
              onChange={(e) => setMaxBuy(e.target.value)}
              placeholder="e.g. 0.15"
            />
          </Row>

          <Row label="Min Delay (ms)" error={errors.minDelay}>
            <Input
              type="text"
              value={minDelay}
              onChange={(e) => setMinDelay(e.target.value)}
              placeholder="e.g. 4000"
            />
          </Row>

          <Row label="Max Delay (ms)" error={errors.maxDelay}>
            <Input
              type="text"
              value={maxDelay}
              onChange={(e) => setMaxDelay(e.target.value)}
              placeholder="e.g. 9000"
            />
          </Row>

          <Row label="Mode">
            <ModePicker value={mode} onChange={setMode} options={modeOptions} />
          </Row>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Button onClick={handleStart} disabled={starting || !mode}>
              {starting ? 'Starting�' : 'Start Bot'}
            </Button>
            <Button
              tone="neutral"
              onClick={handleSellAll}
              disabled={sellingAll}
            >
              {sellingAll ? 'Triggering�' : 'Sell All Tokens to SOL'}
            </Button>
            <Button
              tone="danger"
              onClick={handleStop}
              disabled={!running || stopping}
            >
              {stopping ? 'Stopping�' : 'Stop Bot'}
            </Button>
            <span style={{ fontSize: 12, color: palette.hint }}>
              {statusText(autoSaveStatus)}
            </span>
          </div>
        </div>
      </Panel>

      <div style={{ height: 14 }} />

      <Panel>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Pick Wallets for the Bot</h3>
          <Button
            tone="neutral"
            onClick={handleRefreshBalances}
            disabled={refreshingBalances}
            style={{ height: 32, padding: '0 12px', fontSize: 13 }}
          >
            {refreshingBalances ? 'Refreshing...' : '↻ Refresh Balances'}
          </Button>
        </div>
        {(!allWallets || allWallets.length === 0) ? (
          <p style={{ margin: 0 }}>No wallets yet. Create wallets from the Wallets tab.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {allWallets.map((address) => (
              <label
                key={address}
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
                  checked={activeWallets.includes(address)}
                  onChange={() => toggleWallet(address)}
                  style={{ transform: 'scale(1.1)' }}
                />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    color: palette.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {address}
                </span>
                <span style={{ fontSize: 13, color: palette.label, whiteSpace: 'nowrap' }}>
                  {fmt(walletBalances[address])} SOL
                </span>
              </label>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: errors.activeWallets ? 'salmon' : palette.hint, marginTop: 6 }}>
          {errors.activeWallets || statusText(walletSaveStatus)}
        </div>
      </Panel>

      <button
        onClick={() => setShowHelp(true)}
        title="Quick help"
        style={{
          position: 'fixed',
          bottom: 30,
          right: 30,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#7B68EE',
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: 18,
          boxShadow: '0 8px 18px rgba(0,0,0,0.45)',
          zIndex: 1500,
        }}
      >
        ?
      </button>

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
};

export default BotControls;
