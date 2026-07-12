# GreatAegis GPU Droplet Installation Guide

Deploy the full GreatAegis AI Gateway stack on a DigitalOcean GPU Droplet with AMD Instinct MI300X acceleration, vLLM inference, and ROCm telemetry.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  DigitalOcean GPU Droplet                    │
│                                                             │
│  ┌──────────────┐    ┌──────────────────┐                   │
│  │  GreatAegis   │    │  vLLM Inference   │                   │
│  │  Gateway      │◄──►│  Server           │                   │
│  │  (FastAPI)    │    │  (port 8000)      │                   │
│  │  (port 8060)  │    │                   │                   │
│  └──────┬───────┘    └──────────────────┘                   │
│         │              ┌──────────────────┐                   │
│         │              │  ROCm Metrics    │                   │
│         └──────────────►  Server          │                   │
│                        │  (port 8001)     │                   │
│                        └──────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│   Frontend       │
│   (Vercel /      │
│    localhost:3060)│
└──────────────────┘
```

## Prerequisites

- **DigitalOcean account** with GPU Droplet access (request quota if needed)
- **SSH key** added to your DigitalOcean account
- **Fireworks AI API key** ([get one free](https://fireworks.ai/account/api-keys))
- **Docker** installed on your local machine (for the gateway)
- **At least 200 GB** of available droplet storage for model weights

## Step 1: Create the GPU Droplet

Create a GPU Droplet with the following specification:

| Setting | Value |
|---------|-------|
| **Image** | GPU (ROCm) — `ubuntu-22-04-amd64` with ROCm 6.x |
| **GPU Type** | AMD Instinct MI300X (1 GPU minimum) |
| **vCPUs** | 8 (or more for larger models) |
| **Memory** | 64 GB RAM |
| **Storage** | 300 GB (or larger, depending on model) |
| **Region** | Closest to your users (e.g., NYC / SFO / AMS) |

**Via DO Control Panel:**
1. Click **Create → Droplets**
2. Choose **GPU** tab → **AMD Instinct MI300X**
3. Select **GPU (ROCm)** image
4. Choose plan size (start with 1 GPU / 8 vCPUs / 64 GB)
5. Add your SSH key
6. Paste the [cloud-init.yaml](../cloud-init.yaml) into the **Startup scripts** section
7. Click **Create Droplet**

**Via doctl (CLI):**

```bash
doctl compute droplet create greataegis-gpu \
  --region nyc1 \
  --image gpu-rocm \
  --size gpu-mi300x-1x \
  --ssh-keys <your-ssh-key-id> \
  --user-data-file ./cloud-init.yaml \
  --enable-monitoring
```

> **Note:** For gated models (Mixtral, Llama, etc.), edit `cloud-init.yaml` and set `HF_TOKEN` before creating the droplet.

## Step 2: Wait for Cloud-Init to Finish

> **Forgot the startup script?** If you created the droplet without pasting `cloud-init.yaml` into the Startup scripts section, the droplet boots as a bare OS — no packages, no model weights, no vLLM. Skip to [Recovery: Manual Setup](#recovery-manual-setup) below.

### Normal cloud-init flow

SSH into the droplet and monitor progress:

```bash
ssh root@<droplet-ip>

# Watch cloud-init logs
tail -f /var/log/cloud-init-output.log
```

Cloud-init will:
1. Install system packages
2. Download model weights from Hugging Face (**10-30 minutes**)
3. Start the vLLM inference server (systemd: `vllm`)
4. Start the ROCm metrics server (systemd: `rocm-metrics`)

Verify services are running:

```bash
systemctl status vllm
systemctl status rocm-metrics

# Check vLLM health
curl http://localhost:8000/health

# Check GPU telemetry
curl http://localhost:8001/gpu | jq .
```

Expected vLLM health response:
```json
{"status": "ok", "model": "mistralai/Mixtral-8x7B-Instruct-v0.1", "gpu_count": 1}
```

### Recovery: Manual Setup

If you created the droplet **without** the `cloud-init.yaml` startup script, the droplet runs bare Ubuntu GPU — no model weights, no vLLM, no telemetry. You can either **destroy and recreate** the droplet (fastest), or run these steps manually:

**1. SSH in and create the environment file:**

```bash
ssh root@<droplet-ip>

cat > /etc/vllm.env << 'EOF'
MODEL_ID='mistralai/Mixtral-8x7B-Instruct-v0.1'
MODEL_PATH='/mnt/models/mistralai/Mixtral-8x7B-Instruct-v0.1'
HF_HOME='/mnt/models'
VLLM_PORT='8000'
# HF_TOKEN='hf_your_token_here'   # uncomment for gated models
EOF
```

**2. Download model weights (10–30 minutes):**

```bash
. /etc/vllm.env
mkdir -p /mnt/models

python3 -c "
from huggingface_hub import snapshot_download
snapshot_download('${MODEL_ID}', local_dir='${MODEL_PATH}', local_dir_use_symlinks=False)
"
```

> If the model is **gated** (Mixtral, Llama, etc.), uncomment and set `HF_TOKEN` in step 1 before running the download.

**3. Create the systemd service files and ROCm metrics server:**

Copy the `write_files` blocks from [`cloud-init.yaml`](../../cloud-init.yaml) into place:

```bash
# vLLM service
cat > /etc/systemd/system/vllm.service << 'SVC'
[Unit]
Description=GreatAegis vLLM Inference Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=/etc/vllm.env
WorkingDirectory=/tmp
ExecStartPre=/bin/sh -c '\
  if [ ! -d "$${MODEL_PATH}" ]; then \
    echo "[vllm] FATAL: model directory $${MODEL_PATH} not found"; \
    exit 1; \
  fi'
ExecStart=/bin/bash -c '\
  exec python3 -m vllm.entrypoints.openai.api_server \
    --host 0.0.0.0 \
    --port ${VLLM_PORT} \
    --model ${MODEL_PATH} \
    --enforce-eager \
    --max-num-seqs 64 \
    --max-model-len 32768 \
    --gpu-memory-utilization 0.92 \
    --disable-log-requests'
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
OOMScoreAdjust=-500
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
SVC

# ROCm metrics service
cat > /etc/systemd/system/rocm-metrics.service << 'SVC'
[Unit]
Description=GreatAegis ROCm Metrics Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/bin/rocm_metrics_server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC
```

Copy the metrics server script from [`cloud-init.yaml`](../../cloud-init.yaml) lines 36–59, or create it:

```bash
cat > /usr/local/bin/rocm_metrics_server.py << 'PY'
#!/usr/bin/env python3
import json, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
class RocmMetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        elif self.path == "/gpu":
            try:
                result = subprocess.run(["rocm-smi","-a","--json"],capture_output=True,text=True,timeout=10)
                if result.returncode != 0:
                    self._respond(503,{"error":"rocm-smi exited non-zero","stderr":result.stderr.strip()}); return
                self._respond(200, json.loads(result.stdout))
            except FileNotFoundError: self._respond(503,{"error":"rocm-smi not found"})
            except subprocess.TimeoutExpired: self._respond(504,{"error":"rocm-smi timed out"})
            except json.JSONDecodeError as e: self._respond(502,{"error":f"rocm-smi output not JSON: {e}"})
            except Exception as e: self._respond(500,{"error":str(e)})
        else: self._respond(404,{"error":"not found"})
    def _respond(self, c, p):
        b = json.dumps(p).encode(); self.send_response(c)
        self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0",8001),RocmMetricsHandler).serve_forever()
PY
chmod +x /usr/local/bin/rocm_metrics_server.py
```

**4. Enable and start both services:**

```bash
systemctl daemon-reload
systemctl enable vllm.service
systemctl start vllm.service
systemctl enable rocm-metrics.service
systemctl start rocm-metrics.service
```

**5. Verify everything works:**

```bash
systemctl status vllm rocm-metrics
curl http://localhost:8000/health
curl http://localhost:8001/gpu | jq .
```

Once both return `{"status": "ok"}`, continue to [Step 3](#step-3-deploy-the-greataegis-gateway).

## Step 3: Deploy the GreatAegis Gateway

On your local machine (or a separate VM), deploy the GreatAegis backend:

### Option A — Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/GreatAegis.git
cd GreatAegis

# Configure environment
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

```ini
APP_MODE=production
FIREWORKS_API_KEY=fw_xxxxxxxxxxx
VLLM_ENDPOINT=http://<droplet-ip>:8000/v1/chat/completions
VLLM_MODEL_NAME=mistralai/Mixtral-8x7B-Instruct-v0.1
ROCM_SMI_URL=http://<droplet-ip>:8001/gpu
```

Then start the stack:

```bash
docker-compose up --build -d
```

### Option B — Manual Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
source .venv/bin/activate # Linux / macOS
pip install -r requirements.txt
python main.py
```

### Option C — Frontend (Local Dev)

```bash
cd frontend
npm install
npm run dev
```

## Step 4: Configure Firewall (Droplet)

On the GPU droplet, allow inbound traffic from your gateway host only:

```bash
ufw allow from <gateway-ip> to any port 8000 proto tcp
ufw allow from <gateway-ip> to any port 8001 proto tcp
ufw enable
```

For testing, you may temporarily allow from anywhere:

```bash
ufw allow 8000/tcp
ufw allow 8001/tcp
```

## Step 5: Verify the Full Stack

```bash
# Gateway health (from gateway host)
curl http://localhost:8060/api/v1/gateway/health

# Gateway metrics
curl http://localhost:8060/api/v1/gateway/metrics

# GPU telemetry (via gateway)
curl http://localhost:8060/api/v1/gateway/telemetry

# Direct inference test (from gateway host)
curl -X POST http://localhost:8060/api/v1/gateway/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you do?"}'
```

Access the dashboard at **http://localhost:3060**.

## Customizing the Model

To switch models, update `cloud-init.yaml` before droplet creation:

```yaml
# cloud-init.yaml — change MODEL_ID
MODEL_ID='zai-org/GLM-5.2-FP8'
MODEL_PATH='/mnt/models/zai-org/GLM-5.2-FP8'
```

Or if the droplet is already running:

```bash
ssh root@<droplet-ip>

# Edit env
vim /etc/vllm.env

# Change MODEL_ID and MODEL_PATH, then:
systemctl daemon-reload
systemctl restart vllm
```

Also update `backend/.env` on your gateway host:

```ini
VLLM_ENDPOINT=http://<droplet-ip>:8000/v1/chat/completions
VLLM_MODEL_NAME=zai-org/GLM-5.2-FP8
```

## Production Hardening

- **HTTPS:** Place a reverse proxy (Caddy / Nginx) in front of the gateway
- **Authentication:** Set `SETTINGS_PASSWORD` in `.env` to restrict settings access
- **Persistent PQC Keys:** Set `GREATAEGIS_MLKEM_SEED` and `GREATAEGIS_MLDSA_SEED` in `.env`
- **Monitoring:** Enable DigitalOcean Monitoring for GPU metrics (`--enable-monitoring`)
- **Firewall:** Restrict ports 8000/8001 on the droplet to the gateway's IP only
- **Model storage:** Attach a DO Block Volume for persistent model weight storage

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| `vllm.service` fails | Model path not found | Check `MODEL_PATH` in `/etc/vllm.env`, verify disk mount |
| `rocm-smi` errors | ROCm drivers not loaded | `rocm-smi --showhw`; check `dmesg \| grep amdgpu` |
| Gateway returns 502 | vLLM not reachable | Verify `curl http://localhost:8000/health` on droplet |
| Out of memory | Model too large for GPU | Reduce `gpu-memory-utilization` in cloud-init or use a smaller model |
| Slow first token | Cold start / KV cache miss | Add `--enable-prefix-caching` to vLLM args |
| PQC decryption fails | Key mismatch on restart | Set persistent `GREATAEGIS_MLKEM_SEED` in `.env` |

## Reference

| Component | Port | Service | Systemd Unit |
|-----------|------|---------|-------------|
| vLLM Inference | 8000 | `vllm` | `vllm.service` |
| ROCm Metrics | 8001 | `rocm-metrics` | `rocm-metrics.service` |
| GreatAegis Gateway | 8060 | Docker | `docker-compose` |
| Frontend Dashboard | 3060 | Docker | `docker-compose` |

## Next Steps

- Deploy the frontend to **Vercel** using `vercel.json`
- Set up a **Qdrant Cloud** cluster for persistent vector storage
- Configure **Prometheus + Grafana** for GPU monitoring dashboards
- Enable **auto-scaling** with additional GPU droplets behind a load balancer
