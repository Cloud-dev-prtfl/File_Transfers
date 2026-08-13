# Monthly Cost Estimate: 100% Google Cloud Platform (GCP)

This document provides a detailed cost estimation for deploying and running the 5-Agent Sales Assistant entirely on GCP. 

**Volume Assumption:** 100 complete lead cycles per day (~3,000 per month).

## 1. Deployment (Upfront) Costs
In modern cloud environments, infrastructure requires **$0 in upfront capital expenditure**. The only upfront costs are domain registration and developer/DevOps labor.
*   **Domain Name:** ~$12 - $15 / year.
*   **Infrastructure:** $0 (Pay-as-you-go model).

---

## 2. Post-Deployment (Monthly Recurring) Costs

### A. AI Agentic Core (OpenAI / Gemini API)
Using highly efficient models like **GPT-4o-mini** or **Gemini 1.5 Flash**, the costs for 100 daily requests are extremely low. 
*   **Assumptions per Lead Cycle:** 
    *   Agents 1-5 read past context, rules, and generate emails.
    *   Estimated tokens per cycle: ~15,000 Input tokens / ~2,000 Output tokens.
    *   *Includes a 20% buffer for Agent 5 (Gatekeeper) retry loops.*
*   **Monthly Volume (3,000 cycles):** ~45M Input Tokens, ~6M Output Tokens.
*   **Estimated Cost:** **$10.00 - $15.00 / month**

### B. GCP Infrastructure
At 100 requests per day, this system operates at the absolute minimum baseline of cloud computing. 

| Component | GCP Service | Estimated Tier / Usage | Est. Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Ingestion API (FastAPI)** | Cloud Run | 3,000 req/mo (100% covered by 2M Free Tier) | $0.00 |
| **Dashboard UI (Django)** | Cloud Run | Very low traffic (Covered by Free Tier) | $0.00 |
| **Background Celery Workers** | Compute Engine | 1x `e2-small` VM (Always-on for task queues) | ~$13.00 |
| **Relational Database** | Cloud SQL (PostgreSQL) | `db-f1-micro` (Shared core, 10GB storage) | ~$10.00 |
| **Task Broker & Cache** | Memorystore (Redis) | Basic Tier (1GB capacity) | ~$35.00 |
| **Vector DB (RAG)** | Pinecone / Milvus | Serverless Free Tier | $0.00 |
| **Networking & Logging** | Cloud DNS, Storage, Logs | Minimal data egress | ~$2.00 |
| **Total GCP Infra Cost** | | | **~$60.00** |

---
### **Total Estimated Monthly Cost (GCP + AI): ~$75.00 / month**
