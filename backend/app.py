from __future__ import annotations

from backend.core.legacy_loader import execute_legacy_backend


# Preserve the last known-good runtime while the historical backend is migrated
# behind stable package boundaries.
execute_legacy_backend(globals())

from backend.api.route_domains import apply_route_domains
from backend.features.portfolio import install_portfolio_manual_journal
from backend.features.themes import install_theme_rebuild_date


install_portfolio_manual_journal(sys.modules[__name__])
install_theme_rebuild_date(sys.modules[__name__])
apply_route_domains(app)
