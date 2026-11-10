"""Formato de las campañas de trazas (convenciones de AGENTS.md).

Una campaña son dos ficheros con el mismo nombre base:

- `<base>.npz` con `traces` (N×S, `float32`), `plaintexts` y `ciphertexts`
  (N×16, `uint8`) y `key` (16, `uint8`);
- `<base>.json` con los metadatos: instrumento, frecuencias, firmware, fecha,
  commit y si las trazas son simuladas.

Este módulo solo depende de numpy, así que `analisis/` puede cargar campañas
sin tener instalado el grupo `captura`.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent


@dataclass
class Campaign:
    traces: np.ndarray
    plaintexts: np.ndarray
    ciphertexts: np.ndarray
    key: np.ndarray
    metadata: dict = field(default_factory=dict)

    @property
    def simulated(self) -> bool:
        return bool(self.metadata.get("simulada", False))


def repo_commit() -> str | None:
    """Commit actual del repositorio, con `-dirty` si hay cambios sin guardar."""
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO), "describe", "--always", "--dirty", "--abbrev=12"],
            capture_output=True, text=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip()


def _base(path: Path) -> Path:
    path = Path(path)
    return path.with_suffix("") if path.suffix in {".npz", ".json"} else path


def save(path: Path, campaign: Campaign) -> tuple[Path, Path]:
    base = _base(path)
    base.parent.mkdir(parents=True, exist_ok=True)
    npz, meta = base.with_suffix(".npz"), base.with_suffix(".json")
    np.savez_compressed(
        npz,
        traces=np.asarray(campaign.traces, dtype=np.float32),
        plaintexts=np.asarray(campaign.plaintexts, dtype=np.uint8),
        ciphertexts=np.asarray(campaign.ciphertexts, dtype=np.uint8),
        key=np.asarray(campaign.key, dtype=np.uint8),
    )
    metadata = dict(campaign.metadata)
    metadata.setdefault("simulada", False)
    metadata["n_traces"], metadata["n_samples"] = map(int, campaign.traces.shape)
    meta.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    return npz, meta


def load(path: Path) -> Campaign:
    base = _base(path)
    with np.load(base.with_suffix(".npz")) as data:
        arrays = {name: data[name] for name in ("traces", "plaintexts", "ciphertexts", "key")}
    meta = base.with_suffix(".json")
    metadata = json.loads(meta.read_text()) if meta.exists() else {}
    return Campaign(metadata=metadata, **arrays)
