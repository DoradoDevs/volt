// backend/src/config/tiers.js

/**
 * Tier limits configuration
 *
 * Tiers are based on cumulative volume (SOL traded)
 * All users have access to all features - tiers only affect wallet limits and discounts
 */

const ALL_MODES = ['pure', 'growth', 'moonshot', 'human', 'bump'];

const TIER_CONFIG = {
  unranked: {
    name: 'Unranked',
    minVolume: 0,
    maxWallets: 5,           // Max sub-wallets allowed
    maxActiveWallets: 3,     // Max wallets that can be active in bot
    dailyVolumeLimit: null,  // No daily limit
    features: {
      botModes: ALL_MODES,   // All modes available
      customRPC: true,       // Custom RPC available
      referralRewards: true, // Can earn referral rewards
    },
    badge: '🔓',
    color: '#808080'
  },
  bronze: {
    name: 'Bronze',
    minVolume: 100,          // 100 SOL total volume
    maxWallets: 15,
    maxActiveWallets: 10,
    dailyVolumeLimit: null,
    features: {
      botModes: ALL_MODES,
      customRPC: true,
      referralRewards: true,
    },
    badge: '🥉',
    color: '#CD7F32'
  },
  silver: {
    name: 'Silver',
    minVolume: 250,          // 250 SOL total volume
    maxWallets: 30,
    maxActiveWallets: 25,
    dailyVolumeLimit: null,
    features: {
      botModes: ALL_MODES,
      customRPC: true,
      referralRewards: true,
    },
    badge: '🥈',
    color: '#C0C0C0'
  },
  gold: {
    name: 'Gold',
    minVolume: 500,          // 500 SOL total volume
    maxWallets: 50,
    maxActiveWallets: 40,
    dailyVolumeLimit: null,
    features: {
      botModes: ALL_MODES,
      customRPC: true,
      referralRewards: true,
    },
    badge: '🥇',
    color: '#FFD700'
  },
  diamond: {
    name: 'Diamond',
    minVolume: 1000,         // 1000 SOL total volume
    maxWallets: 100,
    maxActiveWallets: 100,
    dailyVolumeLimit: null,
    features: {
      botModes: ALL_MODES,
      customRPC: true,
      referralRewards: true,
    },
    badge: '💎',
    color: '#B9F2FF'
  }
};

/**
 * Calculate what tier a user should be based on their volume
 */
function calculateTier(totalVolume) {
  const volume = Number(totalVolume) || 0;

  if (volume >= TIER_CONFIG.diamond.minVolume) return 'diamond';
  if (volume >= TIER_CONFIG.gold.minVolume) return 'gold';
  if (volume >= TIER_CONFIG.silver.minVolume) return 'silver';
  if (volume >= TIER_CONFIG.bronze.minVolume) return 'bronze';
  return 'unranked';
}

/**
 * Update user tier based on their current volume
 */
async function updateUserTier(user) {
  const newTier = calculateTier(user.volume);
  if (user.tier !== newTier) {
    user.tier = newTier;
    return true; // tier changed
  }
  return false; // no change
}

/**
 * Check if user can perform an action based on their tier
 */
function canUserPerformAction(user, action, value) {
  const tierConfig = TIER_CONFIG[user.tier] || TIER_CONFIG.unranked;

  switch (action) {
    case 'add_wallet':
      return user.subWalletsEncrypted.length < tierConfig.maxWallets;

    case 'set_active_wallets':
      return value.length <= tierConfig.maxActiveWallets;

    case 'use_mode':
      return tierConfig.features.botModes.includes(value);

    case 'use_custom_rpc':
      return tierConfig.features.customRPC;

    case 'earn_referrals':
      return tierConfig.features.referralRewards;

    default:
      return false;
  }
}

/**
 * Get tier limits for a user
 */
function getTierLimits(tierName) {
  return TIER_CONFIG[tierName] || TIER_CONFIG.unranked;
}

/**
 * Get all available tiers
 */
function getAllTiers() {
  return TIER_CONFIG;
}

module.exports = {
  TIER_CONFIG,
  calculateTier,
  updateUserTier,
  canUserPerformAction,
  getTierLimits,
  getAllTiers,
};
