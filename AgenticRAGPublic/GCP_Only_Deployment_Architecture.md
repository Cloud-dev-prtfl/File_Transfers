# Deployment Architecture: 100% Google Cloud Platform (GCP)

This document outlines the deployment strategy when hosting the entire AI Sales Assistant (Frontend, Backend, Database, and Workers) exclusively on GCP.

## Core GCP Components Utilized

*   **Cloud Run:** For hosting the stateless web applications (FastAPI & Django UI). It scales automatically from zero to handle massive inbound traffic spikes.
*   **Google Kubernetes Engine (GKE) or Compute Engine (GCE):** For hosting long-running Celery Background Workers. (Cloud Run is not ideal for long-running Celery tasks).
*   **Cloud SQL (PostgreSQL):** Fully managed relational database for core application data.
*   **Memorystore (Redis):** Fully managed Redis instance acting as the Celery message broker and cache.
*   **Cloud Storage (GCS):** For hosting static assets (CSS/JS) and uploaded files.
*   **Cloud Logging / Error Reporting:** Centralized viewing of the Global Activity Logger.

---

## Deployment Mapping Tree

```text
ai_sales_assistant_project/
│
├── [GCP Cloud Run - Service 1: Ingestion API]
│   ├── Component: fastapi_app/ (High-Speed Ingestion)
│   ├── Function: Receives all inbound webhooks concurrently.
│   └── Scaling: Auto-scales from 0 to 100+ instances based on traffic.
│
├── [GCP Cloud Run - Service 2: Dashboard UI]
│   ├── Component: django_core/ & dashboard_ui/
│   ├── Function: Serves the Management Dashboard to human admins.
│   └── Integration: Connects to Cloud Storage (GCS) for static HTML/CSS/JS assets.
│
├── [GCP Compute Engine (VMs) OR GKE (Kubernetes)]
│   ├── Component: workers/ & ai_agentic_core/ (Celery Workers)
│   ├── Function: Always-on background processing. 
│   ├── Sub-Roles:
│   │   ├── Worker A: Runs Validation & Enrichment Tasks.
│   │   ├── Worker B: Runs Native AI Orchestrator (Agents 1-5).
│   │   └── Worker C: Runs Action Execution & Cadence timers.
│   └── Note: Cloud Run has a 60-minute timeout limit, making VMs/GKE safer for Celery.
│
├── [GCP Cloud SQL (PostgreSQL Instance)]
│   ├── Component: leads/ models (Django ORM)
│   ├── Function: Persistent storage for leads, campaign rules, and 100% audit logs.
│   └── Networking: Private IP VPC peering to Cloud Run and Celery Workers.
│
├── [GCP Memorystore (Redis Instance)]
│   ├── Component: Celery Broker & Task Queue
│   ├── Function: Manages task distribution between FastAPI/Django and the Celery Workers.
│   └── Networking: Private IP VPC peering.
│
└── [Third-Party Cloud (Pinecone/Milvus)]
    ├── Component: vector_rag/
    └── Function: Vector Database for semantic search (GCP does offer Vertex AI Vector Search if strict 100% GCP is required).
```

## CI/CD Pipeline Flow (Cloud Build)
1. Developer pushes code to GitHub.
2. **Google Cloud Build** triggers automatically.
3. Builds the unified Docker image using `uv` environment.
4. Pushes the image to **Google Artifact Registry**.
5. Automatically deploys updates to Cloud Run instances and restarts Celery VMs.
