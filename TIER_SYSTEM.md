# Tier System Documentation

## Overview

The Volt volume bot uses a tier-based system that unlocks features and increases limits based on cumulative trading volume. This incentivizes users to use the platform more and provides a clear upgrade path.

## Tier Structure

| Tier | Volume Required | Max Wallets | Max Active | Daily Volume Limit | Bot Modes | Custom RPC | Referral Rewards | Badge |
|------|----------------|-------------|------------|-------------------|-----------|------------|-----------------|-------|
| **Unranked** | 0 SOL | 5 | 3 | 10 SOL | Pure only | ❌ | ❌ | 🔓 |
| **Bronze** | 100 SOL | 15 | 10 | 100 SOL | Pure, Growth, Human | ✅ | ✅ | 🥉 |
| **Silver** | 250 SOL | 30 | 25 | 250 SOL | Pure, Growth, Moonshot, Human | ✅ | ✅ | 🥈 |
| **Gold** | 500 SOL | 50 | 40 | 500 SOL | All modes | ✅ | ✅ | 🥇 |
| **Diamond** | 1000 SOL | 100 | 100 | Unlimited | All modes | ✅ | ✅ | 💎 |

## Features by Tier

### Unranked (Starting Tier)
- **5 sub-wallets maximum**
- **3 active wallets** in bot rotation
- **10 SOL daily volume limit**
- **Pure mode only** - basic buy/sell cycles
- No custom RPC (uses shared mainnet RPC)
- Cannot earn referral rewards
- Perfect for testing and learning the platform

### Bronze (100 SOL volume)
- **15 sub-wallets** - 3x more than unranked
- **10 active wallets** - run bigger bot operations
- **100 SOL daily volume** - 10x increase
- **New modes unlocked**: Growth, Human
- **Custom RPC support** - use your own private RPC
- **Referral rewards enabled** - start earning from referrals

### Silver (250 SOL volume)
- **30 sub-wallets** - double Bronze capacity
- **25 active wallets** - scale up significantly
- **250 SOL daily volume** - professional tier limits
- **Moonshot mode unlocked** - accumulation strategy
- All Bronze benefits continue

### Gold (500 SOL volume)
- **50 sub-wallets** - near-maximum capacity
- **40 active wallets** - large-scale operations
- **500 SOL daily volume** - high-volume trading
- **Bump mode unlocked** - all bot modes available
- Premium tier status

### Diamond (1000 SOL volume)
- **100 sub-wallets** - maximum capacity
- **100 active wallets** - all wallets can be active
- **No daily volume limit** - unlimited trading
- Full platform access
- Elite tier status

## How Volume is Tracked

- Volume is cumulative and **never decreases**
- Both buys and sells count toward volume
- Volume is measured in SOL traded
- Tiers are **automatically upgraded** when thresholds are reached
- Check your current volume and tier progress in the dashboard

## Upgrading Tiers

Tiers are **automatic**:
1. Trade normally with the bot
2. Your cumulative volume increases
3. When you reach a threshold, you're automatically upgraded
4. Refresh your dashboard to see the new tier

## Tier Enforcement

Limits are enforced at these points:

### Wallet Creation
- Adding a new wallet checks `maxWallets` limit
- Returns error if limit exceeded: `"Wallet limit reached for [Tier] tier (X max). Trade more volume to upgrade!"`

### Bot Configuration
- Selecting active wallets checks `maxActiveWallets` limit
- Returns error if too many selected: `"Too many active wallets for [Tier] tier. Max X wallets can be active."`

### Bot Mode Selection
- Choosing a bot mode checks if it's available for your tier
- Returns error if unavailable: `"Mode 'moonshot' not available for Bronze tier. Available modes: pure, growth, human"`

### Custom RPC
- Setting a custom RPC checks tier permission
- Returns error if not allowed: `"Custom RPC not available for Unranked tier. Upgrade to Bronze or higher!"`

## Monetization Strategy

### Free Tier (Unranked)
- Allows users to test the platform
- Enough capacity for small-scale testing
- Creates desire to upgrade for serious use

### Paid Growth
- Users naturally upgrade by using the platform
- Platform fees generate revenue as users trade
- High-volume users pay more fees but get better limits

### Referral System
- Bronze+ users can earn rewards from referrals
- Encourages user acquisition
- Creates network effects

## Implementation Details

### Backend (`backend/src/config/tiers.js`)
```javascript
// Tier limits are defined in TIER_CONFIG
// Functions available:
- calculateTier(volume) // Returns tier name based on volume
- updateUserTier(user) // Updates user's tier in database
- canUserPerformAction(user, action, value) // Checks if action is allowed
- getTierLimits(tierName) // Gets limits for a tier
- getAllTiers() // Returns all tier configurations
```

### Enforcement Points
1. **Dashboard** (`getDashboard`) - Updates tier on each load
2. **Add Wallet** (`addOneWallet`) - Checks wallet limit
3. **Set Active Wallets** (`setActiveWallets`) - Checks active wallet limit
4. **Update Settings** (`updateSettings`) - Checks mode and RPC restrictions

### Frontend Integration
- Tier information is included in dashboard API response
- Shows current tier badge and limits
- Displays progress to next tier
- Shows which features are locked/unlocked

## Future Enhancements

### Possible Additions:
1. **Subscription Override** - Allow users to bypass volume requirements with monthly subscription
2. **Early Access** - Give higher tiers early access to new features
3. **API Access** - Diamond tier gets API access for automation
4. **Priority Support** - Higher tiers get faster support response
5. **Volume Boosts** - Temporary tier upgrades during promotions
6. **Team Plans** - Multi-user accounts for businesses

### Analytics to Track:
- Tier distribution (how many users at each tier)
- Upgrade velocity (how fast users climb tiers)
- Churned users by tier
- Revenue by tier
- Feature usage by tier

## Testing Tiers

To test tier functionality:

1. **Manually set tier in database**:
   ```javascript
   db.users.updateOne(
     { email: 'test@example.com' },
     { $set: { tier: 'diamond', volume: 1000 } }
   )
   ```

2. **Simulate volume**:
   - Run bot with small amounts
   - Volume accumulates automatically
   - Watch tier upgrade in real-time

3. **Test limits**:
   - Try adding more wallets than allowed
   - Try selecting more active wallets than allowed
   - Try using locked bot modes
   - Try setting custom RPC as unranked user

## User Communication

Make sure users understand:
- ✅ How to check their current tier
- ✅ How much volume needed for next tier
- ✅ What benefits each tier provides
- ✅ That tiers are permanent (volume never decreases)
- ✅ How to maximize volume safely
