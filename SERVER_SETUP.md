# Server Setup & Security Guide

Complete guide to set up a secure VPS for hosting VolT.

## Part 1: Get a Server

### Recommended Providers

**Budget-friendly:**
- **DigitalOcean** - $6/month droplet (easiest for beginners)
- **Linode/Akamai** - $5/month
- **Vultr** - $6/month
- **Hetzner** - €4.5/month (EU-based)

**Recommended specs:**
- 2GB RAM minimum
- 1 vCPU
- 50GB SSD
- Ubuntu 22.04 LTS

### Create Server (DigitalOcean Example)

1. Go to https://digitalocean.com
2. Create account
3. Click "Create" → "Droplets"
4. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($6/month - 2GB RAM)
   - **Datacenter:** Closest to your users
   - **Authentication:** SSH Key (recommended) or Password
5. Create Droplet
6. Note your server's IP address

## Part 2: Initial Server Access

### Connect to Your Server

**From Windows:**
```powershell
# Using PowerShell or Windows Terminal
ssh root@YOUR_SERVER_IP
```

**From Mac/Linux:**
```bash
ssh root@YOUR_SERVER_IP
```

Enter password when prompted (sent to your email).

## Part 3: Security Hardening

### Step 1: Create Non-Root User

```bash
# Create new user
adduser volt

# Add to sudo group
usermod -aG sudo volt

# Switch to new user
su - volt
```

### Step 2: Set Up SSH Key Authentication

**On your local computer (not server):**

```powershell
# Windows PowerShell
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter for default location
# Set a passphrase (recommended)

# View your public key
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

**Copy the output** (starts with `ssh-ed25519`).

**Back on server (as volt user):**

```bash
# Create SSH directory
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key
nano ~/.ssh/authorized_keys
# Paste your public key, save (Ctrl+X, Y, Enter)

# Set permissions
chmod 600 ~/.ssh/authorized_keys
```

**Test it** (from your computer):
```bash
ssh volt@YOUR_SERVER_IP
```

Should login without password!

### Step 3: Disable Root Login & Password Auth

```bash
sudo nano /etc/ssh/sshd_config
```

Find and change these lines:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Save and restart SSH:
```bash
sudo systemctl restart sshd
```

⚠️ **Don't close your current SSH session yet!** Open a new terminal and test:
```bash
ssh volt@YOUR_SERVER_IP
```

If it works, you're good!

### Step 4: Set Up Firewall

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 5: Update System

```bash
# Update package list
sudo apt update

# Upgrade packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop nano
```

### Step 6: Set Up Automatic Security Updates

```bash
# Install unattended-upgrades
sudo apt install -y unattended-upgrades

# Enable it
sudo dpkg-reconfigure -plow unattended-upgrades
# Select "Yes"
```

### Step 7: Install Fail2Ban (Blocks Brute Force)

```bash
# Install fail2ban
sudo apt install -y fail2ban

# Start and enable
sudo systemctl start fail2ban
sudo systemctl enable fail2ban

# Check status
sudo fail2ban-client status
```

### Step 8: Set Up Swap (Prevents OOM)

```bash
# Create 2GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify
free -h
```

## Part 4: Install Docker

```bash
# Update
sudo apt update

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install -y docker-compose

# Log out and back in
exit
ssh volt@YOUR_SERVER_IP

# Test Docker
docker --version
docker-compose --version
```

## Part 5: Set Up Domain

### Option A: Point Domain to Server

1. Go to your domain registrar (Namecheap, GoDaddy, etc.)
2. Find DNS settings
3. Add A record:
   - **Type:** A
   - **Name:** @ (or leave blank)
   - **Value:** YOUR_SERVER_IP
   - **TTL:** Automatic or 300
4. Wait 5-60 minutes for DNS propagation

Test:
```bash
ping yourdomain.com
# Should show your server IP
```

### Option B: Use Free Domain (Testing)

Use services like:
- **DuckDNS** - Free subdomain (e.g., yourvolt.duckdns.org)
- **FreeDNS** - Free subdomains

## Part 6: Additional Security

### Change SSH Port (Optional)

```bash
sudo nano /etc/ssh/sshd_config
```

Change:
```
Port 2222
```

Update firewall:
```bash
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp
sudo systemctl restart sshd
```

Connect with:
```bash
ssh -p 2222 volt@YOUR_SERVER_IP
```

### Set Up Monitoring (Optional)

**Install htop:**
```bash
sudo apt install -y htop
htop  # View resource usage
```

**Free monitoring services:**
- **Uptime Robot** - https://uptimerobot.com (monitors if site is down)
- **Better Stack** - https://betterstack.com (free tier)

## Part 7: Backup Setup

### Automated Database Backups

```bash
# Create backup directory
mkdir -p ~/backups

# Create backup script
nano ~/backup-db.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)
cd ~/volt
docker exec volt-mongodb mongodump --out /backup
docker cp volt-mongodb:/backup $BACKUP_DIR/mongodb-$DATE
tar -czf $BACKUP_DIR/mongodb-$DATE.tar.gz $BACKUP_DIR/mongodb-$DATE
rm -rf $BACKUP_DIR/mongodb-$DATE
# Keep only last 7 backups
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs rm -f
```

Make executable:
```bash
chmod +x ~/backup-db.sh
```

Schedule daily backups:
```bash
crontab -e
# Add this line:
0 2 * * * /home/volt/backup-db.sh
```

## Security Checklist

Before deploying:
- [ ] Non-root user created
- [ ] SSH key authentication enabled
- [ ] Password authentication disabled
- [ ] Root login disabled
- [ ] Firewall enabled (ports 22, 80, 443)
- [ ] System updated
- [ ] Fail2Ban installed
- [ ] Swap configured
- [ ] Domain pointed to server
- [ ] Docker installed
- [ ] Backups scheduled

## Useful Commands

**Check service status:**
```bash
sudo systemctl status fail2ban
sudo systemctl status sshd
docker-compose ps
```

**Monitor resources:**
```bash
htop                    # Interactive monitor
df -h                   # Disk usage
free -h                 # RAM usage
docker stats            # Docker container resources
```

**View logs:**
```bash
sudo tail -f /var/log/auth.log     # SSH attempts
sudo fail2ban-client status sshd   # Banned IPs
docker-compose logs -f             # App logs
```

**Emergency: Locked out?**
- Use your VPS provider's web console
- DigitalOcean: Droplet → Access → "Launch Console"

## Next Steps

✅ Server is now secure and ready!

Continue with [DEPLOYMENT.md](./DEPLOYMENT.md) to deploy VolT.

## Maintenance

**Weekly:**
- Check `docker-compose logs` for errors
- Monitor disk space: `df -h`

**Monthly:**
- Update system: `sudo apt update && sudo apt upgrade -y`
- Test backups: Download and verify

**As needed:**
- Restart services: `docker-compose restart`
- View banned IPs: `sudo fail2ban-client status sshd`
