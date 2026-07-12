# GreatAegis GPU Droplet Installation Guide

Deploy the full GreatAegis AI Gateway stack on a DigitalOcean GPU Droplet with AMD Instinct MI300X acceleration, vLLM inference, and ROCm telemetry.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  DigitalOcean GPU Droplet                    │
│                                                             │
│  /dev/vda1 (697G root)      /dev/vdc1 (5TB scratch)         │
│  ┌──────────────┐           ┌──────────────────────┐        │
│  │ System files  │           │ /mnt/models/          │        │
│  │ Docker        │           │   model_weights/      │        │
│  │ (data-root    │           │   docker/             │        │
│  │  → /mnt/     │           │   vllm-cache/         │        │
│  │   models/dkr) │           └──────────────────────────────────┐        │
│  └──────────────┘                    │                          │
│                                      │                          │
│  ┌──────────────────┐    ┌──────────▼──────────┐                │
│  │  vLLM Inference   │    │  ROCm Metrics       │                │
│  │  Server (Docker)  │    │  Server (docker)     │                │
│  │  (port 8000)      │    │  (port 8001)        │                │
│  └──────────────────┘    └─────────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **DigitalOcean account** with GPU Droplet access (request quota if needed)
- **SSH key** added to your DigitalOcean account
- **HuggingFace account** (for gated models like Mixtral, Llama)
- **At least 20 GB** free space on the root disk for Docker operations (the droplet ships with 697 GB root + 5 TB scratch)

> **Important:** The DO vLLM ROCm image comes **pre-configured** with ROCm drivers, Docker, and a pre-pulled `vllm/vllm-openai-rocm` image. It boots a **JupyterLab** container by default, not vLLM. The instructions below replace that with a dedicated vLLM inference container.

## Step 1: Create the GPU Droplet

| Setting | Value |
|---------|-------|
| **Image** | GPU (ROCm) — vLLM + ROCm (latest) |
| **GPU Type** | AMD Instinct MI300X (1 GPU) |
| **vCPUs** | 8 |
| **Memory** | 64 GB RAM |
| **Region** | Closest to your users (e.g., NYC / SFO / AMS) |

**Via DO Control Panel:**
1. Click **Create → Droplets**
2. Choose **GPU** tab → **AMD Instinct MI300X**
3. Select **vLLM (GPU/ROCm)** image
4. Choose plan size (1 GPU / 8 vCPUs / 64 GB)
5. Add your SSH key
6. **Leave the Startup scripts box empty** (the pre-built image handles everything)
7. Click **Create Droplet**

**Via doctl (CLI):**

```bash
doctl compute droplet create greataegis-gpu \
  --region nyc1 \
  --image gpu-rocm-vllm \
  --size gpu-mi300x-1x \
  --ssh-keys <your-ssh-key-id> \
  --enable-monitoring
```

> **Note:** Do **not** paste `cloud-init.yaml` from this repo into the startup scripts box. That file is for vanilla Ubuntu droplets and will conflict with the DO vLLM image's own startup scripts.

## Step 2: Prepare the Droplet

SSH into the droplet and verify the hardware is accessible:

```bash
ssh root@<droplet-ip>

# Verify GPU is visible
rocm-smi --showhw
```

Expected output shows an MI300X (`gfx942`).

### Mount the 5 TB Scratch Disk

The droplet ships with a 5 TB NVMe disk (`/dev/vdc1`) that is **not mounted by default**. Mount it for model storage:

```bash
# Check the disk
lsblk

# Mount it
mkdir -p /mnt/models
mount /dev/vdc1 /mnt/models

# Make permanent
echo '/dev/vdc1 /mnt/models ext4 defaults 0 0' >> /etc/fstab

# Verify
df -h /mnt/models
```

Expected: `5.0T   28K  4.8T   1% /mnt/models`

### Move Docker's Data Root to the Scratch Disk

The root partition is only 697 GB and fills up quickly with Docker overlays, images, and build cache. Move Docker's storage to the 5 TB disk:

```bash
systemctl stop docker docker.socket containerd
mkdir -p /mnt/models/docker

# Clean out the old Docker data on root
rm -rf /var/lib/docker/*

# Point Docker to the large disk
cat > /etc/docker/daemon.json << 'EOF'
{
  "data-root": "/mnt/models/docker",
  "storage-driver": "overlay2"
}
EOF

systemctl start docker

# Verify
docker info 2>/dev/null | grep "Docker Root Dir"
```

Expected: `Docker Root Dir: /mnt/models/docker`

> **Why?** Docker overlay filesystems, pulled images, and build caches can consume 50–100+ GB. On the root disk (697 GB), this fills up fast if Docker runs alongside the system. Modeling files alone (e.g., Mixtral 8×7B at 87 GB) plus OS overhead leave very little room without moving Docker.

### Stop the Default Jupyter Container

The pre-built image starts a JupyterLab container on port 8000. Stop and remove it to free port 8000 for vLLM:

```bash
docker stop rocm 2>/dev/null
docker rm rocm 2>/dev/null
```

## Step 3: Download Model Weights

### Supported Models

| Model | Size | Gated? | Notes |
|-------|------|--------|-------|
| `bottlecapai/ThinkingCap-Qwen3.6-27B` | ~54 GB (BF16) | No | Great reasoning, token-efficient, Qwen3.5 architecture |
| `bottlecapai/ThinkingCap-Qwen3.6-27B-FP8` | ~27 GB (FP8) | No | Same model, FP8 quantized — fits even more comfortably |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | ~87 GB (BF16) | Yes (HF_TOKEN) | MoE, excellent quality |
| `Qwen/Qwen2.5-7B-Instruct` | ~14 GB | No | Lightweight, fast, good for testing |
| `Qwen/Qwen2.5-32B-Instruct` | ~65 GB | No | Strong middle-ground model |

**Recommendation:** Start with `bottlecapai/ThinkingCap-Qwen3.6-27B` — ungated, excellent reasoning quality, token-efficient, and fits well in MI300X memory.

> **Avoid** `zai-org/GLM-5.2-FP8` — even at FP8 it requires 188+ GB GPU memory and will OOM on a single MI300X (192 GB).

### Download via Docker Container

The host Python environment is externally managed (PEP 668). Use the vLLM Docker container to download models:

```bash
# For ThinkingCap (recommended, ~54 GB)
docker run --rm --entrypoint python3 \
  -v /mnt/models:/models \
  vllm/vllm-openai-rocm:v0.23.0 \
  -c "
from huggingface_hub import snapshot_download
snapshot_download('bottlecapai/ThinkingCap-Qwen3.6-27B', local_dir='/models/bottlecapai/ThinkingCap-Qwen3.6-27B', local_dir_use_symlinks=False)
"

# Or the FP8 variant (~27 GB, half the memory)
docker run --rm --entrypoint python3 \
  -v /mnt/models:/models \
  vllm/vllm-openai-rocm:v0.23.0 \
  -c "
from huggingface_hub import snapshot_download
snapshot_download('bottlecapai/ThinkingCap-Qwen3.6-27B-FP8', local_dir='/models/bottlecapai/ThinkingCap-Qwen3.6-27B-FP8', local_dir_use_symlinks=False)
"
```

For gated models, include the token:

```bash
export HF_TOKEN="hf_your_token_here"
docker run --rm --entrypoint python3 \
  -v /mnt/models:/models \
  vllm/vllm-openai-rocm:v0.23.0 \
  -c "
from huggingface_hub import snapshot_download
snapshot_download('mistralai/Mixtral-8x7B-Instruct-v0.1', local_dir='/models/mistralai/Mixtral-8x7B-Instruct-v0.1', local_dir_use_symlinks=False, token='${HF_TOKEN}')
"
```

> **Important:** Always use `--entrypoint python3` to override the default `vllm` CLI entrypoint. The vLLM entrypoint will try to start inference (and fail without GPU devices in a temp container).

## Step 4: Start the vLLM Inference Server

```bash
docker run -d \
  --device=/dev/kfd --device=/dev/dri \
  --group-add video --shm-size 16G \
  --security-opt seccomp=unconfined \
  --name vllm \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /mnt/models:/models:ro \
  vllm/vllm-openai-rocm:v0.23.0 \
  --host 0.0.0.0 --port 8000 \
  /models/bottlecapai/ThinkingCap-Qwen3.6-27B \
  --served-model-name bottlecapai/ThinkingCap-Qwen3.6-27B \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.95 \
  --enforce-eager \
  --trust-remote-code

# Watch model load (takes 2-5 minutes)
docker logs -f vllm
```

Wait until you see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Then test:

```bash
curl -s http://localhost:8000/health
```

Expected:

```json
{"status": "ok", "model": "/models/bottlecapai/ThinkingCap-Qwen3.6-27B"}
```

### Key Flags Explained

| Flag | Purpose |
|------|---------|
| `--device=/dev/kfd --device=/dev/dri` | Grant container access to AMD GPU |
| `--group-add video --shm-size 16G` | Required for ROCm shared memory |
| `--security-opt seccomp=unconfined` | Allow ROCm kernel operations |
| `--enforce-eager` | Disable CUDA graphs for faster first token on AMD |
| `--gpu-memory-utilization 0.95` | Use 95% of GPU memory (leave room for KV cache overhead) |
| `--trust-remote-code` | Required for custom architectures (Qwen3.5, etc.) |
| `-v /mnt/models:/models:ro` | Mount model weights read-only |

> **Do NOT run `pip install --upgrade vllm` inside the container.** The pre-built image contains ROCm-optimized vLLM binaries. Upgrading via pip replaces them with the standard NVIDIA vLLM build, which will fail with `libcuda.so.1` errors.

## Step 5: Start the ROCm Metrics Server

Create and run the telemetry server for GPU monitoring:

```bash
cat > /usr/local/bin/rocm_metrics_server.py << 'PYEOF'
#!/usr/bin/env python3
import json, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health": self._respond(200, {"status": "ok"})
        elif self.path == "/gpu":
            r = subprocess.run(["rocm-smi","-a","--json"], capture_output=True, text=True, timeout=10)
            if r.returncode == 0: self._respond(200, json.loads(r.stdout))
            else: self._respond(503, {"error": r.stderr.strip()})
        else: self._respond(404, {"error": "not found"})
    def _respond(self, c, p):
        b = json.dumps(p).encode()
        self.send_response(c)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", 8001), H).serve_forever()
PYEOF
chmod +x /usr/local/bin/rocm_metrics_server.py

# Run in background (survives session, but NOT reboot)
nohup python3 /usr/local/bin/rocm_metrics_server.py > /var/log/rocm-metrics.log 2>&1 &

# For production: use the systemd service below in Troubleshooting → "Persisting the Metrics Server"
```

Test:

```bash
curl -s http://localhost:8001/gpu | jq .
```

## Step 6: Deploy the GreatAegis Gateway

On your gateway host (can be a separate VM or your local machine), deploy the GreatAegis backend.

### Option A — Docker Compose (Recommended)

```bash
git clone https://github.com/your-org/GreatAegis.git
cd GreatAegis
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```ini
APP_MODE=production
FIREWORKS_API_KEY=fw_xxxxxxxxxxx
VLLM_ENDPOINT=http://<droplet-ip>:8000/v1/chat/completions
VLLM_MODEL_NAME=bottlecapai/ThinkingCap-Qwen3.6-27B
ROCM_SMI_URL=http://<droplet-ip>:8001/gpu
```

Then start:

```bash
docker-compose up --build -d
```

### Option B — Manual Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Option C — Frontend (Local Dev)

```bash
cd frontend
npm install
npm run dev
```

## Step 7: Configure Firewall

On the GPU droplet, restrict ports 8000/8001 to your gateway host:

```bash
ufw allow from <gateway-ip> to any port 8000 proto tcp
ufw allow from <gateway-ip> to any port 8001 proto tcp
ufw enable
```

For testing, temporarily allow from anywhere:

```bash
ufw allow 8000/tcp
ufw allow 8001/tcp
```

## Step 8: Verify the Full Stack

```bash
# Gateway health
curl http://<gateway-ip>:8060/api/v1/gateway/health

# GPU telemetry
curl http://<gateway-ip>:8060/api/v1/gateway/telemetry

# Direct inference test
curl -X POST http://<gateway-ip>:8060/api/v1/gateway/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what can you do?"}'
```

Access the dashboard at **http://localhost:3060** (local) or your deployed frontend URL.

## Switching Models

To change the model on a running droplet:

```bash
# Stop current vLLM
docker stop vllm; docker rm vllm

# Download new model (if not already downloaded)
docker run --rm --entrypoint python3 \
  -v /mnt/models:/models \
  vllm/vllm-openai-rocm:v0.23.0 \
  -c "
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen2.5-32B-Instruct', local_dir='/models/Qwen/Qwen2.5-32B-Instruct', local_dir_use_symlinks=False)
"

# Start vLLM with new model
docker run -d \
  --device=/dev/kfd --device=/dev/dri \
  --group-add video --shm-size 16G \
  --security-opt seccomp=unconfined \
  --name vllm \
  --restart unless-stopped \
  -p 8000:8000 \
  -v /mnt/models:/models:ro \
  vllm/vllm-openai-rocm:v0.23.0 \
  --host 0.0.0.0 --port 8000 \
  /models/Qwen/Qwen2.5-32B-Instruct \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.95 \
  --enforce-eager

# Update gateway .env
# VLLM_MODEL_NAME=Qwen/Qwen2.5-32B-Instruct
```

## Disk Space Best Practices

### The 626 GB Trap (Hidden Files Under Mount Points)

If you ever download model files to `/mnt/models` **before** mounting the scratch disk there, those files end up on the root partition. When you later mount the 5 TB disk on `/mnt/models`, the old files become invisible (hidden under the mount) but still consume root disk space.

**To check for hidden files:**

```bash
# Unmount and peek underneath
fuser -km /mnt/models 2>/dev/null
umount -l /mnt/models
du -sh /mnt/models/*/
df -h /

# Remount after cleanup
mount /dev/vdc1 /mnt/models
```

This scenario happened during initial setup: a partial GLM download consumed **626 GB** hidden under `/mnt/models`. Unmounting and deleting it freed all that space.

### Monitoring Disk Space

```bash
# Check root partition
df -h /

# Check Docker space
docker system df

# Check scratch disk
df -h /mnt/models

# Find large directories
du -sh /mnt/models/*/ 2>/dev/null | sort -rh | head -10
```

## Production Hardening

- **HTTPS:** Place a reverse proxy (Caddy / Nginx) in front of the gateway
- **Authentication:** Set `SETTINGS_PASSWORD` in `.env` to restrict settings access
- **Persistent PQC Keys:** Set `GREATAEGIS_MLKEM_SEED` and `GREATAEGIS_MLDSA_SEED` in `.env`
- **Monitoring:** Enable DigitalOcean Monitoring for GPU metrics
- **Firewall:** Restrict ports 8000/8001 on the droplet to the gateway's IP only
- **Uptime:** Use `--restart unless-stopped` on all Docker containers
- **Docker cleanup:** Run `docker system prune -a -f` periodically when models change

### Persisting the Metrics Server Across Reboots

The `nohup` command in Step 5 only runs until the droplet reboots. To persist it, create a systemd service:

```bash
cat > /etc/systemd/system/rocm-metrics.service << 'SVC'
[Unit]
Description=GreatAegis ROCm Metrics Server
After=network-online.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /usr/local/bin/rocm_metrics_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable rocm-metrics
systemctl start rocm-metrics
systemctl status rocm-metrics --no-pager -l
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Port 8000 unreachable | Default Jupyter container using it | `docker stop rocm; docker rm rocm` |
| Frontend shows "(awaiting connection)" or `rocm-smi unavailable` | Gateway can't reach metrics server | Check `ROCM_SMI_URL` in `.env`; verify metrics server running on droplet; check firewall allows port 8001 |
| `hip out of memory` | Model too large for GPU | Use a smaller model or lower `--max-model-len` |
| `No space left on device` | Root partition full | Check hidden files under mounts, move Docker data-root |
| `df` shows 694G used but `du -shx /` shows 69G | Hidden files under mount point | Unmount `/mnt/models`, delete files underneath, remount |
| vLLM segfault at `memcpy_and_sync` | ROCm driver issue or model weight corruption | Re-download model weights; try a different model; check `dmesg \| tail -50` |
| `LLVM ERROR: IO failure on output stream` | Docker overlay filesystem out of space | Move Docker data-root to scratch disk (Step 2) |
| `libcuda.so.1 not found` | pip upgraded vLLM to NVIDIA build | Delete container, start fresh from original image |
| `Qwen3_5ForConditionalGeneration` crash | Missing `--trust-remote-code` | Add `--trust-remote-code` flag |
| `ModuleNotFoundError: huggingface_hub` | Host Python is externally managed | Use Docker container to download models |
| `externally-managed-environment` | PEP 668 blocks system pip | Use Docker container or `pip3 install --break-system-packages` |
| Downloaded model takes forever | Gated model, no `HF_TOKEN` | Set `HF_TOKEN` or use an ungated model |
| `layer does not exist` on `docker run` | Corrupted Docker storage after migration | `rm -rf /mnt/models/docker/*; systemctl restart docker` |
| Docker fills root partition despite data-root move | Old overlay mounts leaked space | `systemctl stop docker docker.socket containerd; rm -rf /var/lib/docker/*; umount -t overlay -a 2>/dev/null; systemctl start docker` |

## Reference

| Component | Port | Runtime | Notes |
|-----------|------|---------|-------|
| vLLM Inference | 8000 | Docker (`vllm/vllm-openai-rocm:v0.23.0`) | Main inference server |
| ROCm Metrics | 8001 | Python (host, background) | GPU telemetry for gateway |
| GreatAegis Gateway | 8060 | Docker Compose / Manual | FastAPI backend |
| Frontend Dashboard | 3060 | Docker Compose / `npm run dev` | React SPA |
| Docker Data Root | — | `/mnt/models/docker` | Moved to scratch disk |
| Model Weights | — | `/mnt/models/` (5 TB scratch) | Read-only in container |

## Quick Reference: Full Setup Commands

```bash
# ── After SSH into droplet ──

# 1. Mount scratch disk
mkdir -p /mnt/models
mount /dev/vdc1 /mnt/models
echo '/dev/vdc1 /mnt/models ext4 defaults 0 0' >> /etc/fstab

# 2. Move Docker to scratch disk
systemctl stop docker docker.socket containerd
rm -rf /var/lib/docker/*
mkdir -p /mnt/models/docker
echo '{"data-root":"/mnt/models/docker","storage-driver":"overlay2"}' > /etc/docker/daemon.json
systemctl start docker

# 3. Stop default Jupyter container
docker stop rocm 2>/dev/null; docker rm rocm 2>/dev/null

# 4. Download model
docker run --rm --entrypoint python3 \
  -v /mnt/models:/models \
  vllm/vllm-openai-rocm:v0.23.0 \
  -c "
from huggingface_hub import snapshot_download
snapshot_download('bottlecapai/ThinkingCap-Qwen3.6-27B', local_dir='/models/bottlecapai/ThinkingCap-Qwen3.6-27B', local_dir_use_symlinks=False)
"

# 5. Start vLLM
docker run -d \
  --device=/dev/kfd --device=/dev/dri \
  --group-add video --shm-size 16G \
  --security-opt seccomp=unconfined \
  --name vllm --restart unless-stopped \
  -p 8000:8000 -v /mnt/models:/models:ro \
  vllm/vllm-openai-rocm:v0.23.0 \
  --host 0.0.0.0 --port 8000 \
  /models/bottlecapai/ThinkingCap-Qwen3.6-27B \
  --served-model-name bottlecapai/ThinkingCap-Qwen3.6-27B \
  --max-model-len 16384 --gpu-memory-utilization 0.95 \
  --enforce-eager --trust-remote-code

# 6. ROCm metrics
cat > /usr/local/bin/rocm_metrics_server.py << 'PYEOF'
#!/usr/bin/env python3
import json, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health": self._respond(200, {"status": "ok"})
        elif self.path == "/gpu":
            r = subprocess.run(["rocm-smi","-a","--json"], capture_output=True, text=True, timeout=10)
            self._respond(200 if r.returncode==0 else 503, json.loads(r.stdout) if r.returncode==0 else {"error": r.stderr.strip()})
        else: self._respond(404, {"error": "not found"})
    def _respond(self, c, p):
        b = json.dumps(p).encode(); self.send_response(c); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", 8001), H).serve_forever()
PYEOF
chmod +x /usr/local/bin/rocm_metrics_server.py
nohup python3 /usr/local/bin/rocm_metrics_server.py > /var/log/rocm-metrics.log 2>&1 &

# 7. Test
curl -s http://localhost:8000/health
curl -s http://localhost:8001/gpu | jq .
```
