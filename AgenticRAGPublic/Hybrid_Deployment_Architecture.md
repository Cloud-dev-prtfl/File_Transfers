# Hybrid Deployment Architecture: Render/Railway (Frontend) + GCP (Backend/Data)

This document outlines the deployment strategy when splitting the infrastructure. The stateless web services (FastAPI & Django UI) are hosted on developer-friendly PaaS platforms like Render or Railway, while the heavy data processing and database layers remain on GCP.

## Why Choose This Approach?
*   **Render/Railway:** Extremely fast, zero-configuration deployments for web applications. Excellent for serving the Django Management UI and FastAPI endpoints.
*   **GCP:** Retained for enterprise-grade data security (Cloud SQL) and dedicated background processing compute.

---

## Deployment Mapping Tree

```text
ai_sales_assistant_project/
│
├── [Render / Railway - Web Service 1: Ingestion API]
│   ├── Component: fastapi_app/ 
│   ├── Environment: Publicly accessible URL for webhooks.
│   └── Setup: Connected directly to GitHub for auto-deploy on push.
│
├── [Render / Railway - Web Service 2: Dashboard UI]
│   ├── Component: django_core/ & dashboard_ui/
│   ├── Environment: Secure URL for admin login.
│   └── Setup: Handles its own static file serving (via WhiteNoise in Django).
│
├── [Render / Railway - Background Worker (Optional Alternative)]
│   ├── Component: workers/ & ai_agentic_core/ (Celery Workers)
│   └── Setup: Render/Railway offer "Background Worker" deployment types specifically for Celery. (Replaces GCP Compute Engine).
│
│================== HYBRID NETWORK BOUNDARY ==================│
│   (Secure connections required via TLS or VPN/VPC tunnels)  │
│=============================================================│
│
├── [GCP Cloud SQL (PostgreSQL Instance)]
│   ├── Component: leads/ models (Django ORM)
│   ├── Function: Core database.
│   └── Security: Must allow external IP connections from Render/Railway, secured via SSL/TLS certificates and strict firewall IP whitelisting.
│
├── [GCP Memorystore (Redis Instance)]
│   ├── Component: Celery Broker & Task Queue
│   ├── Function: Task coordination.
│   └── Security: Similar to Cloud SQL, requires secure external connection tunneling.
│
└── [Third-Party Cloud (Pinecone/Milvus)]
    ├── Component: vector_rag/
    └── Function: Vector Database.
```

## Critical Architecture Considerations for Hybrid

1.  **Network Latency:** In the 100% GCP model, the FastAPI app talks to the PostgreSQL database in milliseconds over a private internal network. In a hybrid model, every database query from Render (e.g., US-East) to GCP (e.g., US-Central) introduces public internet transit latency.
2.  **Security Overhead:** GCP Cloud SQL and Memorystore default to private internal IP addresses for security. To connect Render/Railway, you must expose these databases to the public internet using Public IPs, secured strictly by authorized SSL certificates and IP whitelists.
3.  **Cost:** Egress data (data leaving GCP's network to go to Render/Railway) incurs higher billing charges than internal network data transfer.

## Summary Recommendation
If you choose the Hybrid route, it is highly recommended to also host the **PostgreSQL** and **Redis** databases on Render/Railway using their managed database offerings. Keeping the Web Apps on Render and the Databases on GCP introduces unnecessary latency and security complexities. 
