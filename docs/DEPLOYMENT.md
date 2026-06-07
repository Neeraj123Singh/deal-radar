# Deployment Guide

## Local Development

See [README.md](../README.md) for `docker compose up` instructions.

## Production Deployment Options

### Option A: Docker Compose on a Single VM (Simplest)

Suitable for demos, staging, or low-traffic internal tools.

```bash
# On your VM (Ubuntu 22.04+)
git clone <repo-url> && cd deal-radar
cp .env.example .env
# Edit .env with production values

docker compose up -d --build
```

**Recommended VM:** 2 vCPU, 4GB RAM (e.g., AWS t3.medium, DigitalOcean $24/mo droplet)

**Add a reverse proxy for HTTPS:**

```nginx
# /etc/nginx/sites-available/deal-radar
server {
    listen 443 ssl;
    server_name deal-radar.example.com;

    ssl_certificate /etc/letsencrypt/live/deal-radar.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deal-radar.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
    }

    location /webhook/ {
        proxy_pass http://localhost:3001;
    }

    location /admin/ {
        proxy_pass http://localhost:3001;
        # Restrict to internal IPs in production
        allow 10.0.0.0/8;
        deny all;
    }

    location /api/stream {
        proxy_pass http://localhost:3001;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

**Critical for SSE:** The `/api/stream` location must disable buffering (`proxy_buffering off`) or events won't reach the client in real time.

---

### Option B: Cloud Platform (Railway / Render / Fly.io)

#### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy backend
cd backend
railway init
railway add --plugin postgresql
railway add --plugin redis
railway up

# Deploy frontend
cd ../frontend
railway init
railway up
```

Set environment variables in Railway dashboard:
- `DATABASE_URL` (auto from Postgres plugin)
- `REDIS_URL` (auto from Redis plugin)
- `OPENAI_API_KEY`
- `CORS_ORIGIN=https://your-frontend.railway.app`
- `NEXT_PUBLIC_API_URL=https://your-backend.railway.app`

#### Render

Create a `render.yaml`:

```yaml
services:
  - type: web
    name: deal-radar-backend
    runtime: docker
    dockerfilePath: ./backend/Dockerfile
    dockerContext: ./backend
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: deal-radar-db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: deal-radar-redis
          type: redis
          property: connectionString
      - key: OPENAI_API_KEY
        sync: false

  - type: web
    name: deal-radar-frontend
    runtime: docker
    dockerfilePath: ./frontend/Dockerfile
    dockerContext: ./frontend
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://deal-radar-backend.onrender.com

  - type: redis
    name: deal-radar-redis

databases:
  - name: deal-radar-db
    plan: starter
```

---

### Option C: Kubernetes (Production Scale)

For teams already on K8s. Outline only — not implemented in this repo.

```
deal-radar/
├── k8s/
│   ├── namespace.yaml
│   ├── backend-deployment.yaml    (2+ replicas)
│   ├── frontend-deployment.yaml   (2+ replicas)
│   ├── worker-deployment.yaml     (separate from API — scale independently)
│   ├── postgres-statefulset.yaml    (or use RDS/Cloud SQL)
│   ├── redis-deployment.yaml      (or use ElastiCache/Memorystore)
│   ├── ingress.yaml               (TLS + SSE config)
│   └── secrets.yaml               (OPENAI_API_KEY, DATABASE_URL)
```

**Key K8s considerations:**
- Run the BullMQ worker as a **separate deployment** from the API server (different scaling profiles)
- SSE requires `proxy-read-timeout` annotation on Ingress (nginx: `86400s`)
- Use managed Postgres and Redis (don't run databases in K8s pods for production)

---

### Option D: AWS (Full Production)

```
                    ┌─────────────┐
    Internet ──────▶│  ALB (HTTPS)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ ECS/Fargate│ │ ECS/Fargate│ │ ECS/Fargate│
        │ Frontend  │ │ Backend  │ │ Worker   │
        └──────────┘ └─────┬────┘ └─────┬────┘
                           │            │
                    ┌──────┴────────────┴──────┐
                    ▼                          ▼
              ┌──────────┐            ┌──────────┐
              │ RDS      │            │ ElastiCache│
              │ Postgres │            │ Redis     │
              └──────────┘            └──────────┘
```

**Services:**
- **Frontend:** ECS Fargate (or Amplify for Next.js SSR)
- **Backend API:** ECS Fargate, auto-scale on CPU
- **Worker:** ECS Fargate, auto-scale on BullMQ queue depth
- **Database:** RDS PostgreSQL (db.t3.micro for dev, db.r6g.large for prod)
- **Queue:** ElastiCache Redis (cache.t3.micro for dev)
- **Secrets:** AWS Secrets Manager for `OPENAI_API_KEY`
- **Monitoring:** CloudWatch + Bull Board (internal only)

---

## Environment Variables (Production)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `OPENAI_API_KEY` | No | Enables LLM scoring; rule-based fallback without it |
| `PORT` | No | Backend port (default 3001) |
| `CORS_ORIGIN` | Yes | Frontend URL for CORS |
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL for frontend API calls |
| `NODE_ENV` | No | `production` in prod |

---

## Health Checks

| Service | Endpoint | Expected |
|---------|----------|----------|
| Backend | `GET /health` | `{ "status": "ok" }` |
| Frontend | `GET /` | 200 HTML |
| Postgres | `pg_isready` | accepting connections |
| Redis | `redis-cli ping` | PONG |

Docker Compose includes health checks for all services. Backend won't start until Postgres and Redis are healthy.

---

## Monitoring Checklist (Production)

- [ ] Queue depth alert (BullMQ waiting jobs > 1000)
- [ ] Dead-letter queue growth alert
- [ ] SSE connection count (via `/api/stats`)
- [ ] Event processing latency (p95 < 500ms)
- [ ] Error rate on `/webhook/events` (< 1%)
- [ ] OpenAI API latency and error rate
- [ ] Postgres connection pool utilization
- [ ] Redis memory usage

---

## Security Checklist (Production)

- [ ] HTTPS everywhere (TLS termination at load balancer)
- [ ] Webhook authentication (API key or HMAC signature)
- [ ] Bull Board restricted to internal network
- [ ] Database credentials in secrets manager (not env files)
- [ ] CORS locked to frontend domain
- [ ] Rate limiting on webhook endpoint
- [ ] No `OPENAI_API_KEY` in frontend bundle

---

## Scaling Guidelines

| Load | Backend Replicas | Workers | Postgres | Redis |
|------|-----------------|---------|----------|-------|
| Demo (< 10 events/s) | 1 | 1 (built-in) | Single instance | Single instance |
| Small team (50 events/s) | 2 | 2 | db.t3.small | cache.t3.small |
| Enterprise (500 events/s) | 4+ | 8+ | db.r6g.large + read replica | cache.r6g.large |

The worker is the bottleneck, not the API. Scale workers based on BullMQ queue depth, not request rate.
