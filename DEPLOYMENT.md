# VolT Deployment Guide

Complete guide to deploy VolT to production using Docker.

## Prerequisites

- VPS/Server (Ubuntu 22.04 recommended)
  - 2GB+ RAM
  - 20GB+ storage
  - Docker & Docker Compose installed
- Domain name pointed to server IP
- Gmail account for verification emails

## Step 1: Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

## Step 2: Upload Your Code

```bash
# Clone your repo or upload files
git clone <your-repo> volt
cd volt
```

## Step 3: Configure Environment

```bash
cp .env.example .env
nano .env
```

**Edit these values:**

```env
# Strong MongoDB password
MONGO_ROOT_PASSWORD=your_secure_password_123

# Random JWT secret (32+ chars)
JWT_SECRET=random_string_at_least_32_characters_long

# Your domain
FRONTEND_URL=https://yourdomain.com

# Gmail App Password (16 chars)
EMAIL_USER=yourapp@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
```

**Get Gmail App Password:**
1. https://myaccount.google.com/security
2. Enable 2-Step Verification
3. https://myaccount.google.com/apppasswords
4. Create password for "Mail"

## Step 4: Deploy

```bash
# Build and start
docker-compose up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

## Step 5: Setup SSL (Choose One)

### Option A: Nginx Proxy Manager (Easiest)

```bash
# Stop frontend port 80
docker-compose down frontend

# Edit docker-compose.yml - change frontend port to 8080:80
nano docker-compose.yml

# Restart
docker-compose up -d

# Install Nginx Proxy Manager on port 80
mkdir ~/npm && cd ~/npm
```

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '81:81'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

```bash
docker-compose up -d

# Open http://YOUR_IP:81
# Login: admin@example.com / changeme
# Add proxy: yourdomain.com → localhost:8080
# Request SSL certificate
```

### Option B: Certbot

```bash
# Install certbot & nginx
sudo apt install certbot python3-certbot-nginx nginx -y

# Get SSL
sudo certbot --nginx -d yourdomain.com

# Proxy to Docker
sudo nano /etc/nginx/sites-available/volt
```

Add:
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/volt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Management

**View logs:**
```bash
docker-compose logs -f backend
```

**Restart:**
```bash
docker-compose restart
```

**Update:**
```bash
git pull
docker-compose up -d --build
```

**Backup database:**
```bash
docker exec volt-mongodb mongodump --out /backup
docker cp volt-mongodb:/backup ./backup-$(date +%Y%m%d)
```

## Troubleshooting

**Backend can't connect to MongoDB:**
- Check `.env` passwords match
- `docker-compose logs mongodb`

**Emails not sending:**
- Verify Gmail App Password (16 chars, no spaces)
- Enable 2FA on Gmail
- `docker-compose logs backend | grep email`

**Frontend blank:**
- `docker-compose logs frontend`
- Clear browser cache

**Solana rate limits:**
- Use custom RPC (Alchemy, Helius)
- Update `SOLANA_RPC` in `.env`
- `docker-compose restart backend`

## Security

- [ ] Changed all default passwords
- [ ] JWT_SECRET is random 32+ chars
- [ ] Using Gmail App Password
- [ ] SSL certificate installed
- [ ] Firewall: `sudo ufw allow 22,80,443/tcp`

## Done!

Your app should now be live at https://yourdomain.com
