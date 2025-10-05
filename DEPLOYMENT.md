# Volt Volume Bot - Deployment Guide

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- Domain name (optional, for production)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd volt
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Access the app**
   - Frontend: http://localhost
   - Backend API: http://localhost:5000

5. **View logs**
   ```bash
   docker-compose logs -f
   ```

6. **Stop services**
   ```bash
   docker-compose down
   ```

### Production Deployment

#### Option 1: VPS (DigitalOcean, Linode, etc.)

1. **SSH into your server**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Docker**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   apt install docker-compose
   ```

3. **Clone and setup**
   ```bash
   git clone <your-repo>
   cd volt
   cp .env.example .env
   nano .env  # Edit with production values
   ```

4. **Generate secure secrets**
   ```bash
   # Generate JWT secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Use output in .env for JWT_SECRET
   ```

5. **Start production**
   ```bash
   docker-compose up -d
   ```

6. **Setup SSL with Certbot (recommended)**
   ```bash
   apt install certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com
   ```

#### Option 2: Railway.app (Easiest)

1. Push code to GitHub
2. Go to railway.app and create new project
3. Add MongoDB from Railway marketplace
4. Deploy backend service (auto-detects Dockerfile.backend)
5. Deploy frontend service (auto-detects Dockerfile.frontend)
6. Add environment variables in Railway dashboard
7. Add custom domain

#### Option 3: AWS/Azure

Use docker-compose or deploy containers separately:
- Frontend → S3 + CloudFront or Azure Static Web Apps
- Backend → ECS or App Service
- Database → DocumentDB or Cosmos DB

### Environment Variables

**Required:**
- `MONGO_ROOT_USER` - MongoDB admin username
- `MONGO_ROOT_PASSWORD` - MongoDB admin password
- `JWT_SECRET` - Secret key for JWT tokens (use long random string)
- `SOLANA_RPC` - Solana RPC endpoint
- `EMAIL_USER` - Email for verification emails
- `EMAIL_PASS` - Email app password

**Optional:**
- `FRONTEND_URL` - Frontend URL for CORS
- `PORT` - Backend port (default: 5000)

### Monitoring

**View running containers:**
```bash
docker ps
```

**Check logs:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

**Restart services:**
```bash
docker-compose restart backend
```

**Update after code changes:**
```bash
git pull
docker-compose build
docker-compose up -d
```

### Backup MongoDB

```bash
# Backup
docker exec volt-mongodb mongodump --out /data/backup

# Restore
docker exec volt-mongodb mongorestore /data/backup
```

### Security Checklist

- [ ] Change default MongoDB passwords
- [ ] Use strong JWT_SECRET (32+ random characters)
- [ ] Enable HTTPS/SSL in production
- [ ] Set NODE_ENV=production
- [ ] Configure firewall (only ports 80, 443, 22)
- [ ] Regular backups of MongoDB
- [ ] Keep Docker images updated
- [ ] Use environment variables for secrets (never commit .env)

### Scaling

For high traffic:
- Use managed MongoDB (MongoDB Atlas)
- Add load balancer for multiple backend instances
- Use Redis for session management
- Implement rate limiting per tier
- Consider CDN for frontend assets

### Troubleshooting

**Backend won't start:**
```bash
docker-compose logs backend
# Check MongoDB connection string
# Verify environment variables
```

**Frontend shows 502:**
```bash
# Check backend is running
docker ps
# Verify nginx proxy config
docker-compose logs frontend
```

**Database connection failed:**
```bash
# Check MongoDB is running
docker-compose ps mongodb
# Verify connection string in .env
```

### Cost Estimates

**VPS (DigitalOcean/Linode):**
- $12-24/month (basic droplet)
- $10-15/month (managed MongoDB or self-hosted)
- Total: ~$25-40/month

**Railway.app:**
- ~$5-20/month (pay for usage)
- MongoDB included

**AWS:**
- Variable, typically $30-100/month depending on traffic
