#!/usr/bin/env python3
"""Read-only installation-candidate preflight for codex-pet-studio."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from PIL import Image


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path("/Users/m4air/总控/projects/codex-pet-studio")
PACKAGE_ROOT = PROJECT_ROOT / "outputs/package/sha-wujing"
STATE_PATH = PROJECT_ROOT / "STATE.md"
PET_PATH = PACKAGE_ROOT / "pet.json"
SPRITESHEET_PATH = PACKAGE_ROOT / "spritesheet.webp"
DRY_RUN_PATH = WORKSPACE_ROOT / "validation/m8-07-codex-pet-dry-run.json"
CANDIDATE_PATH = WORKSPACE_ROOT / "validation/m8-07-codex-pet-install-candidate.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cell_stats(image: Image.Image) -> dict[str, Any]:
    rgba = image.convert("RGBA")
    cell_width, cell_height = 192, 208
    non_empty = 0
    empty = 0
    cell_alpha_ranges: list[tuple[int, int]] = []
    for row in range(9):
        for column in range(8):
            cell = rgba.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            alpha = cell.getchannel("A")
            minimum, maximum = alpha.getextrema()
            cell_alpha_ranges.append((minimum, maximum))
            if maximum == 0:
                empty += 1
            else:
                non_empty += 1
    colors = rgba.getcolors(maxcolors=2_000_000)
    alpha_values = sorted({alpha for _, (_, _, _, alpha) in colors or []})
    return {
        "width": rgba.width,
        "height": rgba.height,
        "mode": rgba.mode,
        "effective_cells": non_empty,
        "transparent_cells": empty,
        "alpha_values": alpha_values,
        "color_count": len(colors or []),
        "cell_alpha_ranges_digest": hashlib.sha256(json.dumps(cell_alpha_ranges).encode()).hexdigest(),
    }


def main() -> None:
    files = [STATE_PATH, PET_PATH, SPRITESHEET_PATH]
    existence = {str(path.relative_to(PROJECT_ROOT)): path.is_file() for path in files}
    if not all(existence.values()):
        raise SystemExit(json.dumps({"status": "BLOCKED", "missing": [name for name, present in existence.items() if not present]}))

    with PET_PATH.open("r", encoding="utf-8") as handle:
        pet = json.load(handle)
    with Image.open(SPRITESHEET_PATH) as image:
        image_stats = cell_stats(image)
        image_format = image.format

    checks = {
        "pet_id_present": pet.get("id") == "sha-wujing",
        "pet_sprite_reference": pet.get("spritesheetPath") == "spritesheet.webp",
        "webp_format": image_format == "WEBP",
        "spritesheet_dimensions": image_stats["width"] == 1536 and image_stats["height"] == 1872,
        "effective_cells_57": image_stats["effective_cells"] == 57,
        "transparent_cells_15": image_stats["transparent_cells"] == 15,
        "alpha_binary": image_stats["alpha_values"] == [0, 255],
        "no_target_write": True,
    }
    status = "PASS_READ_ONLY_DRY_RUN" if all(checks.values()) else "PARTIAL"
    result = {
        "record_version": "m8-07.codex-pet-dry-run.v1",
        "status": status,
        "executed_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "project_root": str(PROJECT_ROOT),
        "source_files": {
            "state": str(STATE_PATH),
            "pet": {"path": str(PET_PATH), "sha256": sha256(PET_PATH), "bytes": PET_PATH.stat().st_size},
            "spritesheet": {"path": str(SPRITESHEET_PATH), "sha256": sha256(SPRITESHEET_PATH), "bytes": SPRITESHEET_PATH.stat().st_size},
        },
        "pet_manifest": pet,
        "image_stats": image_stats,
        "checks": checks,
        "target_install_path": "~/.codex/pets/sha-wujing",
        "write_performed": False,
        "approval_required_before_install": True,
        "rollback_plan": [
            "在用户批准前不写入目标目录。",
            "安装前保存目标目录原有内容清单和哈希。",
            "出现加载或视觉问题时移除本次新增文件并恢复原清单。",
        ],
        "unknowns": [
            "Codex 实际加载结果未验证。",
            "用户对正式安装和最终视觉效果的接受度未知。",
        ],
    }
    DRY_RUN_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    candidate = {
        "record_version": "m8-07.codex-pet-install-candidate.v1",
        "candidate_id": "sha-wujing",
        "status": status,
        "source_dry_run": str(DRY_RUN_PATH.relative_to(WORKSPACE_ROOT)),
        "source_package": str(PACKAGE_ROOT),
        "target_install_path": "~/.codex/pets/sha-wujing",
        "files": ["pet.json", "spritesheet.webp"],
        "write_performed": False,
        "approval_required_before_install": True,
        "next_action": "用户查看 dry-run 与回滚说明后，明确决定是否安装。",
    }
    CANDIDATE_PATH.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "checks_passed": sum(checks.values()), "checks_total": len(checks), "dry_run": str(DRY_RUN_PATH.relative_to(WORKSPACE_ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
