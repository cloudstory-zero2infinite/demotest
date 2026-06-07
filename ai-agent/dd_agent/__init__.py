"""Due Diligence & TPRM agent.

Stateless helpers that ground answers in an org's GRC data (control_registry,
assets, policies, vulnerabilities, capabilities). Used by two endpoints:

    POST /dd/answer-questionnaire — auto-answer an uploaded questionnaire
    POST /dd/ask                  — short Q&A chat about the org's posture

Nothing is persisted — every call reads Supabase and returns a response.
"""
