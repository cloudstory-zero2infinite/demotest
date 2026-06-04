"""Fw-ControlRegistry Agent.

Deterministic (no LLM) recomputer that rebuilds an org's `control_registry`
rows for ctl_type='standard' from the SCF reference tables, driven by the
org's framework selection in `organizations.needed_framework`.

Mounted under /fwcr on the main FastAPI app.
"""
