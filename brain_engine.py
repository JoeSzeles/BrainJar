"""
BrainJar FastAPI Engine - Persistent Drosophila Brain Simulation

This module provides a RESTful API to interact with a Brian2-based Drosophila
central brain model. It manages a persistent neural network with dynamic stimulus
injection and real-time spike monitoring.

Key features:
- Persistent network (loaded once on /boot)
- Hybrid stepped simulation (100ms steps via /stimulate)
- Dynamic Poisson input modulation
- Real-time firing rate observation
"""

import sys
from pathlib import Path
import asyncio
from time import time as get_time
import importlib.util

import pandas as pd
import numpy as np
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import Brian2 model components
print("=== brain_engine.py START ===")
import traceback
import sys

try:
  print("Loading Drosophila path...")
  drosophila_path = Path(__file__).parent / 'Drosophila_brain_model-main'
  print("Drosophila:", drosophila_path)
  sys.path.insert(0, str(drosophila_path))
  
  print("Dynamic import model.py...")
  model_spec = importlib.util.spec_from_file_location("model", str(drosophila_path / "model.py"))
  model = importlib.util.module_from_spec(model_spec)
  model_spec.loader.exec_module(model)
  print("model.py OK")
  
  print("Dynamic import utils.py...")
  utils_spec = importlib.util.spec_from_file_location("utils", str(drosophila_path / "utils.py"))
  utils = importlib.util.module_from_spec(utils_spec)
  utils_spec.loader.exec_module(utils)
  print("utils.py OK")
  
  # Globals
  create_model = model.create_model
  poi = model.poi
  silence = model.silence
  get_spk_trn = model.get_spk_trn
  default_params = model.default_params
  get_rate = utils.get_rate
  print("Globals OK")
  
except Exception as e:
  print("IMPORT CRASH:")
  traceback.print_exc()
  sys.exit(1)

# Use the loaded modules
create_model = model.create_model
poi = model.poi
silence = model.silence
get_spk_trn = model.get_spk_trn
default_params = model.default_params
get_rate = utils.get_rate

from brian2 import Network, ms, Hz

# ===========================
# FastAPI App & Models
# ===========================

app = FastAPI(
    title="BrainJar Neural Engine",
    description="Persistent Drosophila brain simulator with reactive stimulus injection",
    version="0.1.0"
)

# Enable CORS for dashboard/Node.js clients
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
        
        # Network objects
        self.neu = None
        self.syn = None
        self.spk_mon = None
        self.net = None
        self.pois = []
        
        # Metadata
        self.flyid2i = {}
        self.i2flyid = {}
        self.params = None
        self.last_stimulus_desc = None
        self.motor_neuron_ids = []
        
        # Control
        self.lock = asyncio.Lock()


brain_state = BrainState()


# ===========================
# Endpoints
# ===========================

@app.post("/boot", response_model=StatusResponse)
async def boot_brain(config: BootModel = BootModel()):
    """
    Boot the neural network.
    
    - Loads connectome data
    - Creates neuron & synapse groups
    - Builds persistent Network object
    - Ready for /stimulate calls
    """
    async with brain_state.lock:
        if brain_state.loaded:
            return StatusResponse(
                loaded=True,
                boot_time_ms=brain_state.boot_time_ms,
                step_count=brain_state.step_count,
                neurons_count=len(brain_state.neu) if brain_state.neu else 0,
                synapses_count=len(brain_state.syn) if brain_state.syn else 0,
            )
        
        try:
            boot_start = get_time()
            
            # Resolve paths
            base_dir = Path(__file__).parent
            path_comp = base_dir / config.path_comp
            path_con = base_dir / config.path_con
            
            if not path_comp.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Completeness file not found: {path_comp}"
                )
            if not path_con.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"Connectivity file not found: {path_con}"
                )
            
            # Use default params (can be extended)
            brain_state.params = default_params.copy()
            
            # Load neuron-ID mappings
            df_comp = pd.read_csv(path_comp, index_col=0)
            brain_state.flyid2i = {j: i for i, j in enumerate(df_comp.index)}
            brain_state.i2flyid = {j: i for i, j in brain_state.flyid2i.items()}
            
            # Create model
            brain_state.neu, brain_state.syn, brain_state.spk_mon = create_model(
                str(path_comp), str(path_con), brain_state.params
            )
            
            # Set motor neurons for observation (default: MN9)
            if config.motor_neurons:
                brain_state.motor_neuron_ids = [
                    brain_state.flyid2i[fid] for fid in config.motor_neurons
                    if fid in brain_state.flyid2i
                ]
            else:
                # Default motor neurons
                default_motors = [720575940660219265]  # MN9
                brain_state.motor_neuron_ids = [
                    brain_state.flyid2i[fid] for fid in default_motors
                    if fid in brain_state.flyid2i
                ]
            
            # Create initial (empty) Network; Poisson inputs added per stimulus
            brain_state.pois = []
            brain_state.net = Network(
                brain_state.neu,
                brain_state.syn,
                brain_state.spk_mon,
                *brain_state.pois  # Initially empty
            )
            
            brain_state.loaded = True
            brain_state.boot_time_ms = (get_time() - boot_start) * 1000
            
            return StatusResponse(
                loaded=True,
                boot_time_ms=brain_state.boot_time_ms,
                step_count=0,
                neurons_count=len(brain_state.neu),
                synapses_count=len(brain_state.syn),
            )
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Boot failed: {str(e)}")


@app.post("/stimulate", response_model=ObservationResponse)
async def stimulate(stimulus: StimulusModel):
    """
    Inject stimulus and run one 100ms simulation step.
    
    - Maps FlyWire IDs to Brian indices
    - Activates Poisson inputs dynamically
    - Runs network for 100ms
    - Collects spikes
    """
    async with brain_state.lock:
        if not brain_state.loaded:
            raise HTTPException(
                status_code=400,
                detail="Brain not booted. Call /boot first."
            )
        
        try:
            # Map FlyWire IDs to Brian indices
            exc = [
                brain_state.flyid2i[fid] for fid in stimulus.neuron_ids
                if fid in brain_state.flyid2i
            ]
            
            if not exc:
                raise ValueError(f"No valid neurons in {stimulus.neuron_ids}")
            
            # Remove old Poisson inputs from network
            for p in brain_state.pois:
                brain_state.net.remove(p)
            brain_state.pois = []
            
            # Create new Poisson inputs with updated rate
            params_stim = brain_state.params.copy()
            params_stim['r_poi'] = stimulus.intensity * Hz
            
            # Add Poisson inputs
            new_pois, brain_state.neu = poi(
                brain_state.neu,
                exc,
                [],  # No second set of inputs
                params_stim
            )
            brain_state.pois = new_pois
            
            # Re-add to network
            for p in brain_state.pois:
                brain_state.net.add(p)
            
            # Run for 100ms
            brain_state.net.run(100 * ms)
            brain_state.step_count += 1
            brain_state.last_stimulus_time = get_time()
            brain_state.last_stimulus_desc = f"{len(exc)} neurons @ {stimulus.intensity}Hz"
            
            # Collect observation
            observation = _get_observation()
            
            return observation
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Stimulation failed: {str(e)}")


@app.get("/observe", response_model=ObservationResponse)
async def observe():
    """
    Observe current neural activity without stimulus.
    
    Returns firing rates of all neurons and motor subset.
    """
    async with brain_state.lock:
        if not brain_state.loaded:
            raise HTTPException(
                status_code=400,
                detail="Brain not booted. Call /boot first."
            )
        
        return _get_observation()


@app.post("/config", response_model=StatusResponse)
async def update_config(config: ConfigModel):
    """
    Update network parameters.
    
    - Modulates synaptic gain, time constants, etc.
    - Optionally rebuilds network if needed.
    """
    async with brain_state.lock:
        if not brain_state.loaded:
            raise HTTPException(
                status_code=400,
                detail="Brain not booted."
            )
        
        try:
            if config.w_syn is not None:
                brain_state.params['w_syn'] *= (config.w_syn / brain_state.params['w_syn'])
            if config.r_poi is not None:
                brain_state.params['r_poi'] = config.r_poi * Hz
            if config.tau is not None:
                brain_state.params['tau'] = config.tau * ms
            
            # TODO: Rebuild if needed
            
            return StatusResponse(
                loaded=True,
                boot_time_ms=brain_state.boot_time_ms,
                step_count=brain_state.step_count,
                neurons_count=len(brain_state.neu),
                synapses_count=len(brain_state.syn),
            )
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Config update failed: {str(e)}")


@app.get("/status", response_model=StatusResponse)
async def status():
    """Get engine status."""
    return StatusResponse(
        loaded=brain_state.loaded,
        boot_time_ms=brain_state.boot_time_ms,
        step_count=brain_state.step_count,
        last_stimulus_time=brain_state.last_stimulus_time,
        neurons_count=len(brain_state.neu) if brain_state.loaded else None,
        synapses_count=len(brain_state.syn) if brain_state.loaded else None,
    )


# ===========================
# Helpers
# ===========================

def _get_observation() -> ObservationResponse:
    """Compute firing rates from spike monitor."""
    if not brain_state.spk_mon:
        return ObservationResponse(
            timestamp=get_time(),
            step_count=brain_state.step_count,
            motor_rates={},
            all_rates={},
            last_stimulus=brain_state.last_stimulus_desc,
        )
    
    # Collect spike trains
    spk_trn = get_spk_trn(brain_state.spk_mon)
    
    # Compute rates: spikes / trial_duration_sec
    t_run_sec = float(brain_state.params['t_run'].simplified) / 1000.0  # Convert ms to s
    
    all_rates = {}
    for brian_idx, spike_times in spk_trn.items():
        rate_hz = len(spike_times) / t_run_sec
        flyid = brain_state.i2flyid.get(brian_idx, brian_idx)
        all_rates[int(flyid)] = rate_hz
    
    # Motor rates (subset)
    motor_rates = {
        int(brain_state.i2flyid.get(idx, idx)): all_rates.get(
            int(brain_state.i2flyid.get(idx, idx)), 0.0
        )
        for idx in brain_state.motor_neuron_ids
    }
    
    return ObservationResponse(
        timestamp=get_time(),
        step_count=brain_state.step_count,
        motor_rates=motor_rates,
        all_rates=all_rates,
        last_stimulus=brain_state.last_stimulus_desc,
    )


# ===========================
# Root
# ===========================

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


# ===========================
# Main
# ===========================

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
