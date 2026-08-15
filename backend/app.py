from __future__ import annotations

import os
from pathlib import Path

from backend.core.legacy_loader import execute_legacy_backend


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_ROOT = PROJECT_ROOT / "data"
os.environ.setdefault("STOCK_DASHBOARD_SCREENING_DIR", str(DATA_ROOT / "screening" / "current"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_EXCEL_PATH", str(DATA_ROOT / "real-estate" / "안암해링턴 상가 관리.xlsx"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_BANK_IMPORT_DIR", str(DATA_ROOT / "real-estate" / "계좌입출금내역"))
os.environ.setdefault("STOCK_DASHBOARD_REAL_ESTATE_BUILDING_EXPORT_DIR", str(DATA_ROOT / "real-estate" / "건물 정리"))

# Preserve the last known-good runtime while the historical backend is migrated
# behind stable package boundaries.
execute_legacy_backend(globals())

# Older runtime snapshots used fixed screening paths. Override every derived
# configuration path before feature modules and requests can access them.
SCREENING_DIR = DATA_ROOT / "screening" / "current"
SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "score_formula_config.json"
US_SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "us_score_formula_config.json"
ASIA_SCORE_FORMULA_CONFIG_PATH = SCREENING_DIR / "asia_score_formula_config.json"

from backend.api.route_domains import apply_route_domains
from backend.features.portfolio import install_portfolio_manual_journal
from backend.features.themes import install_theme_rebuild_date


install_portfolio_manual_journal(sys.modules[__name__])
install_theme_rebuild_date(sys.modules[__name__])
apply_route_domains(app)
