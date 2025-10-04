import React from 'react';
import theme from '../theme';

// Show only the DISCOUNT now; base fee is handled on the backend.
// Keeping original discount steps: Bronze 10%, Silver 20%, Gold 30%, Diamond 50%.
const Tier = ({ tier, volume = 0 }) => {
  const discountByTier = {
    unranked: 0,
    bronze:   10,
    silver:   20,
    gold:     30,
    diamond:  50,
  };

  const tierThresholds = {
    bronze: 100,
    silver: 250,
    gold: 500,
    diamond: 1000,
  };

  const tierOrder = ['unranked', 'bronze', 'silver', 'gold', 'diamond'];

  const safeTier = (tier ?? 'unranked').toString().toLowerCase();
  const pretty = safeTier.charAt(0).toUpperCase() + safeTier.slice(1);
  const discount = discountByTier[safeTier] ?? 0;

  // Calculate progress to next tier
  const currentIndex = tierOrder.indexOf(safeTier);
  const nextTier = currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;
  const nextThreshold = nextTier ? tierThresholds[nextTier] : null;
  const currentThreshold = safeTier !== 'unranked' ? tierThresholds[safeTier] : 0;

  let progress = 0;
  let progressText = '';

  if (nextThreshold) {
    progress = ((volume - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    progress = Math.max(0, Math.min(100, progress));
    const remaining = Math.max(0, nextThreshold - volume);
    progressText = `${remaining.toFixed(2)} SOL to ${nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}`;
  } else {
    progress = 100;
    progressText = 'Max tier achieved!';
  }

  const tierColors = {
    unranked: '#808080',
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    diamond: '#b9f2ff',
  };

  const tierColor = tierColors[safeTier] || '#808080';

  return (
    <div style={{
      background: theme.colors.bgPanel,
      border: `1px solid ${theme.colors.borderInput}`,
      borderRadius: theme.borderRadius.lg,
      padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: tierColor, textShadow: `0 0 12px ${tierColor}50`, fontSize: 24 }}>
          {pretty} Tier
        </h2>
        <span style={{
          fontSize: 14,
          color: tierColor,
          background: `${tierColor}15`,
          border: `1px solid ${tierColor}40`,
          padding: '6px 12px',
          borderRadius: theme.borderRadius.full,
          fontWeight: 600
        }}>
          {discount.toFixed(0)}% discount
        </span>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: theme.colors.textLabel, fontWeight: 600 }}>
            Volume: {volume.toFixed(2)} SOL
          </span>
          <span style={{ fontSize: 12, color: theme.colors.textHint }}>
            {progressText}
          </span>
        </div>

        <div style={{
          width: '100%',
          height: 10,
          background: theme.colors.bgInput,
          borderRadius: theme.borderRadius.full,
          overflow: 'hidden',
          border: `1px solid ${theme.colors.borderInput}`
        }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${tierColor}70, ${tierColor})`,
            borderRadius: theme.borderRadius.full,
            transition: 'width 0.3s ease',
            boxShadow: `0 0 10px ${tierColor}70`
          }} />
        </div>
      </div>
    </div>
  );
};

export default Tier;
