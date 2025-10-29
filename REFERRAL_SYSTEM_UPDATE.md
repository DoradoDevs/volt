# Referral System Updates - October 2025

## Summary of Changes

This document outlines the major improvements made to the Volt volume bot's referral and security systems.

---

## 🔒 Security Fixes

### MongoDB Port Exposure (CRITICAL)
**Status**: ✅ Fixed

**Issue**: MongoDB was exposed on port 27017 to the public internet, allowing unauthorized access.

**Solution**: Removed port mapping from docker-compose.yml. MongoDB now only accessible within the Docker network.

**Files Modified**:
- `docker-compose.yml:16` - Removed `ports: - "27017:27017"`

**Deployment**:
1. Pull latest code
2. Run `docker-compose down`
3. Run `docker-compose up -d --build`
4. Verify with: `telnet YOUR_IP 27017` (should fail/timeout)

---

## 🔗 Referral Links

### Convert Codes to Shareable Links
**Status**: ✅ Implemented

**Before**: Users had to manually copy their 6-character referral code (e.g., `abc123`) and send it to friends who then manually entered it during signup.

**After**: Users get a full referral link (e.g., `https://yourdomain.com/signup?ref=abc123`) that auto-fills the referral code when clicked.

**Features**:
- Auto-fill referral code from URL parameter
- One-click copy of full referral link
- Better user experience for referrers and referees

**Files Modified**:
- `frontend/src/components/Signup.js:1-20` - Added URL parameter parsing
- `frontend/src/components/Referral.js:17,97-126` - Updated UI to show and copy links

**Example**:
```
User's referral link: https://volt.example.com/signup?ref=a1b2c3
When clicked → Signup page auto-fills "a1b2c3" in referral code field
```

---

## 💰 Tier-Based Referral Fee Discounts

### Referrer Tier Bonus Discounts
**Status**: ✅ Implemented

**Feature**: Users referred by higher-tier members now receive additional fee discounts based on their referrer's tier.

**Discount Structure**:
| Referrer Tier | Additional Discount for Referees |
|---------------|----------------------------------|
| Unranked      | 0%                              |
| Bronze        | 2.5%                            |
| Silver        | 5%                              |
| Gold          | 7.5%                            |
| Diamond       | 10%                             |

**How It Works**:
1. User's own tier discount is applied first (0%, 10%, 20%, 30%, 50%)
2. If they have a referrer, an additional discount is applied based on referrer's tier
3. This incentivizes high-tier users to recruit more people

**Example**:
```
Bronze user (10% discount) trades 100 SOL
Base fee: 100 * 0.001 = 0.1 SOL
After user tier discount: 0.1 * (1 - 0.10) = 0.09 SOL

If referred by Diamond user:
Referrer bonus: 0.09 * 0.10 = 0.009 SOL discount
Final fee: 0.09 - 0.009 = 0.081 SOL

Savings: 0.019 SOL (19% total discount)
```

**Files Modified**:
- `backend/src/services/solana.js:99-106,291-309` - Added referrer bonus discount logic

---

## 🎯 Multi-Level Referral Commission System

### 4-Level Deep Referral Rewards
**Status**: ✅ Implemented

**Before**: Only direct referrers earned commission (10-25% based on their tier).

**After**: Up to 4 levels of referrers earn commission from each transaction.

**Commission Structure**:
| Level | Relationship                  | Commission Rate              |
|-------|-------------------------------|------------------------------|
| 1     | Direct referrer               | 10-25% (tier-based)         |
| 2     | Referrer's referrer           | 10% of fee                  |
| 3     | 2 levels up                   | 5% of fee                   |
| 4     | 3 levels up                   | 2.5% of fee                 |

**Example Scenario**:
```
Alice (Diamond) refers Bob
Bob (Silver) refers Charlie
Charlie (Bronze) refers David
David (Unranked) refers Emma

When Emma trades 100 SOL:
- Base fee: 0.1 SOL
- After Emma's own discount (0%): 0.1 SOL
- After referrer bonus (Bronze = 0%): 0.1 SOL

Fee distribution:
- David (Level 1, Unranked): 0.1 * 0.10 = 0.01 SOL
- Charlie (Level 2): 0.1 * 0.10 = 0.01 SOL
- Bob (Level 3): 0.1 * 0.05 = 0.005 SOL
- Alice (Level 4): 0.1 * 0.025 = 0.0025 SOL
- App: 0.1 - 0.0275 = 0.0725 SOL

Total referral earnings: 0.0275 SOL (27.5% of fee)
```

**Technical Implementation**:
- Referral chain is built dynamically by traversing the `referrer` field
- Maximum 4 levels deep to prevent excessive database queries
- Each referrer's `earnedRewards` field is updated after successful transactions
- All fees still sent to centralized wallets (FEE_WALLET and REWARDS_WALLET)

**Files Modified**:
- `backend/src/services/solana.js:116-122` - Added multi-level share configuration
- `backend/src/services/solana.js:277-399` - Rewrote fee calculation logic
- `backend/src/services/solana.js:401-496` - Updated fee collection and distribution

**Key Functions**:
1. `computeFeeParts(amountSol, user)` - Calculates fee distribution across all levels
2. `buildReferralChain(user, maxLevels)` - Builds referral chain up to 4 levels
3. `collectPlatformFee(...)` - Collects fees and updates all referrers' rewards

---

## 📊 Complete Fee Calculation Flow

### New Fee Processing Pipeline

```
1. Calculate Base Fee
   └─> amountSol × 0.001 (0.1%)

2. Apply User's Tier Discount
   └─> baseFee × (1 - userTierDiscount)

3. Apply Referrer Bonus Discount
   └─> If user has referrer: effectiveFee × (1 - referrerTierBonus)

4. Build Referral Chain
   └─> Traverse up to 4 levels of referrers

5. Calculate Commission for Each Level
   ├─> Level 1: effectiveFee × referrerTierShare
   ├─> Level 2: effectiveFee × 10%
   ├─> Level 3: effectiveFee × 5%
   └─> Level 4: effectiveFee × 2.5%

6. Calculate App Fee
   └─> effectiveFee - totalReferralCommissions

7. Execute Transfers
   ├─> Send totalReferralCommissions to REWARDS_WALLET
   └─> Send appFee to FEE_WALLET

8. Update Database
   └─> Increment earnedRewards for each referrer
```

---

## 🚀 Deployment Instructions

### Prerequisites
- Docker and docker-compose installed
- `.env` file configured with all required variables
- SSH access to DigitalOcean droplet

### Step-by-Step Deployment

1. **Backup Database** (Important!)
   ```bash
   docker exec volt-mongodb mongodump --out /backup
   docker cp volt-mongodb:/backup ./mongo-backup-$(date +%Y%m%d)
   ```

2. **Pull Latest Code**
   ```bash
   cd /path/to/volt
   git pull origin main
   ```

3. **Verify Environment Variables**
   ```bash
   cat .env
   # Ensure MONGO_ROOT_USER, MONGO_ROOT_PASSWORD, JWT_SECRET are set
   ```

4. **Rebuild and Restart Containers**
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

5. **Verify Services**
   ```bash
   docker-compose ps
   # All services should be "Up"

   docker logs volt-backend --tail 50
   # Check for any startup errors
   ```

6. **Verify MongoDB Security**
   ```bash
   # This should fail/timeout (port closed)
   telnet YOUR_DROPLET_IP 27017

   # This should work (MongoDB accessible from backend container)
   docker exec volt-backend nc -zv mongodb 27017
   ```

7. **Test Referral Features**
   - Log in to dashboard
   - Copy referral link
   - Open in incognito/private browser
   - Verify code is auto-filled
   - Perform a test swap
   - Check backend logs for multi-level fee distribution

8. **Monitor Logs**
   ```bash
   docker logs -f volt-backend | grep "\[fee\]"
   # Should see multi-level distribution logs
   ```

### Rollback Plan (If Issues Occur)

```bash
# Stop containers
docker-compose down

# Checkout previous commit
git log --oneline -10
git checkout PREVIOUS_COMMIT_HASH

# Restore old docker-compose
git checkout PREVIOUS_COMMIT_HASH -- docker-compose.yml

# Rebuild
docker-compose up -d --build

# Restore database backup if needed
docker cp ./mongo-backup-YYYYMMDD volt-mongodb:/backup
docker exec volt-mongodb mongorestore /backup
```

---

## 🧪 Testing Checklist

### Security Testing
- [ ] MongoDB port 27017 not accessible from internet
- [ ] Backend can still connect to MongoDB internally
- [ ] All existing functionality works

### Referral Link Testing
- [ ] Copy referral link from dashboard
- [ ] Open link in new browser
- [ ] Referral code auto-fills on signup page
- [ ] Can still manually enter/change code

### Tier Bonus Discount Testing
- [ ] Create accounts with different tier referrers
- [ ] Verify fee reduction matches expected discount
- [ ] Check logs show "Referrer bonus discount applied"

### Multi-Level Commission Testing
- [ ] Create 4-level referral chain: A → B → C → D
- [ ] User D performs swap
- [ ] Check logs show distribution to all 4 levels
- [ ] Verify earnedRewards increased for A, B, C, D
- [ ] Claim rewards successfully

---

## 📈 Expected Impact

### User Acquisition
- **Easier sharing**: Full links vs manual codes = higher conversion
- **Incentivized recruitment**: Higher-tier users motivated to recruit
- **Viral growth**: 4-level commissions encourage building networks

### Revenue Impact
- **Short-term**: Slightly reduced (more discounts/commissions)
- **Long-term**: Increased (more users = more volume)
- **Network effect**: Deep referral chains create sticky user base

### Retention
- **Referrers stay engaged**: Earn from downstream users
- **Referees get better rates**: Tier bonus discounts
- **Community building**: Users benefit from recruiting quality referrers

---

## 🐛 Known Issues & Limitations

### Performance Considerations
- **Database queries**: Each swap requires up to 5 additional User queries (1 for bonus check + 4 for chain)
- **Optimization**: Consider caching referral chains for active users
- **Monitoring**: Watch database CPU usage after deployment

### Edge Cases Handled
- ✅ Circular referrals prevented (chain stops at first repeat)
- ✅ Invalid/deleted referrers skipped gracefully
- ✅ Missing referrers don't break transaction
- ✅ Dry-run mode works with new system

### Future Enhancements
- [ ] Add referral analytics dashboard
- [ ] Show referral tree visualization
- [ ] Add referral leaderboard
- [ ] Email notifications for referral earnings
- [ ] Referral performance metrics API

---

## 📞 Support

### Logs to Check
```bash
# Fee distribution logs
docker logs volt-backend | grep "\[fee\]"

# Referral chain building
docker logs volt-backend | grep "referral"

# Errors
docker logs volt-backend | grep -i error
```

### Common Issues

**Issue**: "Cannot connect to MongoDB"
- **Cause**: Port removed from docker-compose
- **Fix**: Containers must use internal network (mongodb:27017)

**Issue**: "Referral code not auto-filling"
- **Cause**: URL parameter not parsed correctly
- **Fix**: Ensure URL format is `?ref=CODE` not `#ref=CODE`

**Issue**: "Referrer not earning commission"
- **Cause**: earnedRewards not updating
- **Fix**: Check database write errors in logs

---

## 📝 Configuration Reference

### Fee Rate Constants (solana.js)
```javascript
FEE_RATE = 0.001                    // 0.1% base fee

TIER_DISCOUNTS = {
  unranked: 0,     bronze: 0.1,
  silver: 0.2,     gold: 0.3,
  diamond: 0.5
}

REFERRER_BONUS_DISCOUNTS = {
  unranked: 0,     bronze: 0.025,
  silver: 0.05,    gold: 0.075,
  diamond: 0.10
}

REFERRAL_SHARES = {
  unranked: 0.10,  bronze: 0.125,
  silver: 0.15,    gold: 0.20,
  diamond: 0.25
}

MULTI_LEVEL_SHARES = {
  level1: 'tier-based',
  level2: 0.10,
  level3: 0.05,
  level4: 0.025
}
```

### To Modify Fee Structure
1. Edit constants in `backend/src/services/solana.js:91-122`
2. Rebuild backend: `docker-compose up -d --build backend`
3. No database migration needed

---

## ✅ Deployment Verification

After deployment, verify these metrics:

**Backend Health**
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok"}
```

**Test Fee Calculation** (check logs)
```bash
docker logs volt-backend | tail -100 | grep "\[fee\]"
# Look for: "Distributing referral fees across X levels"
```

**Database Connectivity**
```bash
docker exec volt-backend node -e "require('./src/db.js')"
# Should connect without errors
```

**Security Verification**
```bash
# From external network (should timeout/fail)
nmap -p 27017 YOUR_DROPLET_IP

# From internal network (should succeed)
docker exec volt-backend nc -zv mongodb 27017
```

---

## 🎉 Summary

All requested features have been successfully implemented:

✅ **Security**: MongoDB no longer exposed to public internet
✅ **Referral Links**: Users can copy/share full URLs
✅ **Tier Bonuses**: Referees get discounts based on referrer's tier
✅ **Multi-Level**: Up to 4 levels of referrers earn commissions

**Total Files Modified**: 4
- docker-compose.yml
- backend/src/services/solana.js
- frontend/src/components/Signup.js
- frontend/src/components/Referral.js

**Total Lines Changed**: ~250 lines
**Estimated Impact**: 🚀 High (viral growth potential)
**Risk Level**: ⚠️ Medium (thorough testing recommended)

---

**Ready for deployment!** 🚢
