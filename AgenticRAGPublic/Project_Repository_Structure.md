# Complete Repository Structure: AI Sales Lead & Onboarding Assistant

This structure represents the final, production-ready monorepo after running initialization commands (like `uv init` and `django-admin startproject`) and building out the full 7-Tier architecture. 

It organizes FastAPI, Django, Celery, the Native AI Agents, and External Integrations into a clean, modular structure.

```text
ai_sales_assistant/
├── pyproject.toml               # uv configuration, Python dependencies, and project metadata
├── uv.lock                      # Locked dependency versions for exact, fast reproducibility
├── .env                         # Environment variables (OpenAI Keys, DB credentials, API keys)
├── docker-compose.yml           # Local orchestration for PostgreSQL, Redis, and Celery workers
├── README.md                    # Project documentation, architecture overview, and setup steps
├── manage.py                    # Native Django command-line utility for DB migrations & running servers
│
├── fastapi_app/                 # [TIER 2] FastAPI High-Speed Ingestion Layer
│   ├── __init__.py
│   ├── main.py                  # FastAPI app instance; handles high-concurrency inbound requests
│   ├── routers.py               # Endpoints for Inbound Webhooks (web forms) & Email Reply Webhooks
│   └── schemas.py               # Pydantic models for instant, strict JSON payload validation
│
├── django_core/                 # [TIER 6] Core Django Settings & Configuration
│   ├── __init__.py
│   ├── settings.py              # Main project settings (Installed Apps, DB connections, Celery config)
│   ├── urls.py                  # Global URL routing (Mounts FastAPI alongside Django Dashboard)
│   ├── asgi.py                  # ASGI config for running FastAPI and Django async under Uvicorn
│   └── celery_app.py            # Celery instance configuration mapped to the Redis broker
│
├── leads/                       # [TIER 6] Django App: Core Data Models
│   ├── __init__.py
│   ├── models.py                # PostgreSQL schema (Lead profiles, ActionStates, Campaign Rules)
│   └── admin.py                 # Django admin registration for manual database overrides
│
├── ai_agentic_core/             # [TIER 4] Native Python AI Orchestration (OpenAI SDK)
│   ├── __init__.py
│   ├── orchestrator.py          # Central State Manager; loops logic between Agents and handles handoffs
│   ├── prompts.py               # Centralized repository of System Prompts for all 5 Agents
│   └── agents/                  # The 5-Agent Micro-Architecture
│       ├── __init__.py
│       ├── agent1_triage.py     # Parses text to extract intent, sentiment, and key facts
│       ├── agent2_strategist.py # Evaluates rules and triage data to route Next Best Action
│       ├── agent3_copywriter.py # Drafts highly personalized, context-aware emails or chat replies
│       ├── agent4_scheduler.py  # Negotiates calendar availability via external API tool calls
│       └── agent5_gatekeeper.py # The Validator: Evaluates Agents 1-4 for 100% accuracy before passing
│
├── workers/                     # [TIER 3 & 5] Celery Background Tasks
│   ├── __init__.py
│   ├── tasks_preprocessing.py   # Tier 3: Validation (Check CRM/DB) and Enrichment triggering
│   ├── tasks_orchestrator.py    # Tier 4 triggers: Pushes sufficient leads into the AI Agentic Core loop
│   ├── tasks_execution.py       # Tier 5: Executes physical actions (SendGrid email, Push to Zoho CRM)
│   └── tasks_cadence.py         # Tier 5: Manages wait delays, timeouts, and drip sequence scheduling
│
├── integrations/                # [TIER 7] External API Services & Tools
│   ├── __init__.py
│   ├── zoho_crm.py              # Two-way sync functions (Create/Update/Check leads in Zoho)
│   ├── lusha_linkedin.py        # Lead enrichment API wrappers (Fetching missing contact data)
│   ├── sendgrid_email.py        # Outbound email transmission formatting and dispatch
│   └── calendar_sync.py         # Google/Outlook calendar slot verification and booking logic
│
├── vector_rag/                  # [TIER 6] Knowledge Base Integration
│   ├── __init__.py
│   ├── vector_client.py         # Connection wrapper for Pinecone/Milvus Vector DB
│   └── embeddings.py            # Logic to convert product PDFs/Docs into searchable vector context
│
├── dashboard_ui/                # [TIER 6] Django App: Management UI & Analytics
│   ├── __init__.py
│   ├── views.py                 # Backend logic for rendering analytics, action logs, and rule-setting pages
│   ├── urls.py                  # Dashboard-specific routing
│   ├── templates/               # HTML templates for the custom UI (Tailwind/Bootstrap)
│   └── static/                  # CSS, JS, and image assets for the frontend UI
│
└── utils/                       # Shared Utilities
    ├── __init__.py
    ├── global_logger.py         # The centralized audit tool capturing 100% of micro-actions to DB
    └── exceptions.py            # Custom project-wide error handling for API timeouts and Agent failures
```
