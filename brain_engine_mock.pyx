"""
Simplified BrainJar FastAPI Engine - Mock/Stub Version
For demonstration and Node.js integration testing.

Real Brian2 simulation deferred; swap in when NumPy/Brian2 compatibility is resolved.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from time import time as get_time
import uvicorn

app = FastAPI(
    title="BrainJar Neural Engine",
    description="Persistent Drosophila brain simulator with reactive stimulus injection",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===========================
# Pydantic Models
# ===========================

class StimulusModel(BaseModel):
    """Stimulus injection parameters."""
    neuron_ids: List[int] = Field(..., description="FlyWire neuron IDs to stimulate")
    intensity: float = Field(default=100.0, description="Poisson rate intensity (Hz)")


class ConfigModel(BaseModel):
    """Network parameter updates."""
    w_syn: Optional[float] = Field(None, description="Synaptic weight (mV)")
    r_poi: Optional[float] = Field(None, description="Poisson rate (Hz)")
    tau: Optional[float] = Field(None, description="Time constant (ms)")
    rebuild: bool = Field(False, description="Rebuild network after config change")


class BootModel(BaseModel):
    """Boot configuration."""
    path_comp: str = Field(
        default="Drosophila_brain_model-main/2023_03_23_completeness_630_final.csv",
        description="Path to completeness CSV"
    )
    path_con: str = Field(
        default="Drosophila_brain_model-main/2023_03_23_connectivity_630_final.parquet",
        description="Path to connectivity parquet"
    )
    motor_neurons: Optional[List[int]] = Field(
        default=None,
        description="FlyWire IDs of motor neurons to observe"
    )


class ObservationResponse(BaseModel):
    """Observation response with firing rates."""
    timestamp: float = Field(..., description="Observation timestamp")
    step_count: int = Field(..., description="Current simulation step")
    motor_rates: Dict[int, float] = Field(default_factory=dict, description="Motor neuron firing rates (Hz)")
    all_rates: Dict[int, float] = Field(default_factory=dict, description="All neuron firing rates (Hz)")
    last_stimulus: Optional[str] = Field(None, description="Last stimulus applied")


class StatusResponse(BaseModel):
    """Engine status."""
    loaded: bool = Field(..., description="Network loaded")
    boot_time_ms: Optional[float] = Field(None, description="Boot duration (ms)")
    step_count: int = Field(..., description="Steps executed")
    last_stimulus_time: Optional[float] = Field(None, description="Last stimulus timestamp")
    neurons_count: Optional[int] = Field(None, description="Total neurons")
    synapses_count: Optional[int] = Field(None, description="Total synapses")


# ===========================
# Global State
# ===========================

class BrainState:
    """Manages persistent network state."""
    def __init__(self):
        self.loaded = False
        self.boot_time_ms = None
        self.step_count = 0
        self.last_stimulus_time = None
        self.last_stimulus_desc = None
        self.motor_neuron_ids = [720575940660219265]  # Default MN9


brain_state = BrainState()


# ===========================
# Endpoints
# ===========================

@app.post("/boot", response_model=StatusResponse)
async def boot_brain(config: BootModel = BootModel()):
    """
    Boot the neural network.
    """
    if brain_state.loaded:
        return StatusResponse(
            loaded=True,
            boot_time_ms=brain_state.boot_time_ms,
            step_count=brain_state.step_count,
            neurons_count=630,
            synapses_count=50000000,
        )
    
    boot_start = get_time()
    brain_state.loaded = True
    brain_state.boot_time_ms = (get_time() - boot_start) * 1000
    
    return StatusResponse(
        loaded=True,
        boot_time_ms=brain_state.boot_time_ms,
        step_count=0,
        neurons_count=630,
        synapses_count=50000000,
    )


@app.post("/stimulate", response_model=ObservationResponse)
async def stimulate(stimulus: StimulusModel):
    """
    Inject stimulus and run one 100ms simulation step.
    """
    if not brain_state.loaded:
        raise HTTPException(
            status_code=400,
            detail="Brain not booted. Call /boot first."
        )
    
    brain_state.step_count += 1
    brain_state.last_stimulus_time = get_time()
    brain_state.last_stimulus_desc = f"{len(stimulus.neuron_ids)} neurons @ {stimulus.intensity}Hz"
    
    # Mock firing rates
    mock_rates = {
        int(nid): 10.0 + (stimulus.intensity / 10.0) 
        for nid in stimulus.neuron_ids
    }
    motor_rates = {720575940660219265: 25.0}
    
    return ObservationResponse(
        timestamp=get_time(),
        step_count=brain_state.step_count,
        motor_rates=motor_rates,
        all_rates=mock_rates,
        last_stimulus=brain_state.last_stimulus_desc,
    )


@app.get("/observe", response_model=ObservationResponse)
async def observe():
    """
    Observe current neural activity without stimulus.
    """
    if not brain_state.loaded:
        raise HTTPException(
            status_code=400,
            detail="Brain not booted. Call /boot first."
        )
    
    return ObservationResponse(
        timestamp=get_time(),
        step_count=brain_state.step_count,
        motor_rates={720575940660219265: 5.0},
        all_rates={},
        last_stimulus=brain_state.last_stimulus_desc,
    )


@app.post("/config", response_model=StatusResponse)
async def update_config(config: ConfigModel):
    """
    Update network parameters.
    """
    if not brain_state.loaded:
        raise HTTPException(status_code=400, detail="Brain not booted.")
    
    return StatusResponse(
        loaded=True,
        boot_time_ms=brain_state.boot_time_ms,
        step_count=brain_state.step_count,
        neurons_count=630,
        synapses_count=50000000,
    )


@app.get("/status", response_model=StatusResponse)
async def status():
    """Get engine status."""
    return StatusResponse(
        loaded=brain_state.loaded,
        boot_time_ms=brain_state.boot_time_ms,
        step_count=brain_state.step_count,
        last_stimulus_time=brain_state.last_stimulus_time,
        neurons_count=630 if brain_state.loaded else None,
        synapses_count=50000000 if brain_state.loaded else None,
    )


@app.get("/")
async def root():
    """Health check & docs redirect."""
    return {
        "message": "BrainJar FastAPI Engine running",
        "docs": "/docs",
        "endpoints": {
            "boot": "POST /boot - Load and initialize network",
            "stimulate": "POST /stimulate - Inject stimulus and step",
            "observe": "GET /observe - Get current rates",
            "config": "POST /config - Update parameters",
            "status": "GET /status - Engine status",
        }
    }


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=False,
        log_level="info",
    )
