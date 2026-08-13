# Monthly Cost Estimate: Hybrid (Render/Railway + GCP)

This document outlines the costs for splitting the stateless web applications (FastAPI/Django) onto PaaS providers like Render or Railway, while keeping the data and background workers on GCP.

**Volume Assumption:** 100 complete lead cycles per day (~3,000 per month).

## 1. Deployment (Upfront) Costs
*   **Domain Name:** ~$12 - $15 / year.
*   **Infrastructure:** $0 (Pay-as-you-go model).

---

## 2. Post-Deployment (Monthly Recurring) Costs

### A. AI Agentic Core (OpenAI / Gemini API)
*   **Estimated Cost:** **$10.00 - $15.00 / month** *(Identical to 100% GCP approach. Accounts for 3,000 monthly cycles utilizing GPT-4o-mini or Gemini 1.5 Flash, including Gatekeeper retries).*

### B. Hybrid Infrastructure
Render and Railway have excellent developer experiences but charge fixed monthly fees per active web service, bypassing the generous serverless free tiers found on GCP Cloud Run.

| Component | Platform / Service | Estimated Tier / Usage | Est. Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Ingestion API (FastAPI)** | Render / Railway | 1x Basic Web Service | ~$5.00 |
| **Dashboard UI (Django)** | Render / Railway | 1x Basic Web Service | ~$5.00 |
| **Background Celery Workers** | GCP Compute Engine | 1x `e2-small` VM (Always-on) | ~$13.00 |
| **Relational Database** | GCP Cloud SQL (PostgreSQL) | `db-f1-micro` (10GB storage) | ~$10.00 |
| **Task Broker & Cache** | GCP Memorystore (Redis) | Basic Tier (1GB capacity) | ~$35.00 |
| **Vector DB (RAG)** | Pinecone / Milvus | Serverless Free Tier | $0.00 |
| **Networking / Egress** | GCP & PaaS | Egress charges (GCP data sent to Render) | ~$2.00 |
| **Total Infra Cost** | | | **~$70.00** |

---
### **Total Estimated Monthly Cost (Hybrid + AI): ~$85.00 / month**

*Note on Hybrid Inefficiencies:* While the cost difference is negligible (~$10), the Hybrid approach requires you to expose your GCP database and Redis instances to the public internet so Render can access them. This creates security overhead (managing SSL certs and IP whitelists) that does not exist in the 100% GCP model.
