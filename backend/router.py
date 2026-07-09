from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
from enum import Enum

router = APIRouter()

class Provider(str, Enum):
    FIREWORKS = "fireworks"
    LOCAL_AMD = "local_amd"

class InferenceRequest(BaseModel):
    prompt: str
    provider: Provider = Provider.FIREWORKS

class InferenceResponse(BaseModel):
    response: str
    provider: Provider

@router.post("/infer", response_model=InferenceResponse)
async def hybrid_inference(request: InferenceRequest):
    try:
        if request.provider == Provider.FIREWORKS:
            response_text = await call_fireworks(request.prompt)
        else:
            response_text = await call_local_amd(request.prompt)
        
        return InferenceResponse(
            response=response_text,
            provider=request.provider
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def call_fireworks(prompt: str) -> str:
    api_key = os.getenv("FIREWORKS_API_KEY")
    if not api_key:
        raise ValueError("FIREWORKS_API_KEY not set")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.fireworks.ai/inference/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "accounts/fireworks/models/glm-5p2",
                "messages": [{"role": "user", "content": prompt}]
            }
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

async def call_local_amd(prompt: str) -> str:
    local_url = os.getenv("LOCAL_AMD_URL", "http://localhost:8080")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{local_url}/infer",
            json={"prompt": prompt}
        )
        response.raise_for_status()
        return response.json()["response"]
