# Preserved backend runtime

`app.cpython-312.pyc` is the last known-good Python 3.12 backend artifact. It is
kept temporarily because the historical `backend/app.py` source was already
byte-corrupted when the folder refactor started. `backend/core/legacy_loader.py`
executes it in the public `backend.app` namespace, preserving existing imports,
paths, handlers, and runtime behavior.

Do not regenerate or remove this artifact until each backend domain has been
migrated to source modules and checked against the saved OpenAPI contract.
