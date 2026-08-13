# Sales Lead Processing & Onboarding Workflow (Updated Flow 7 - Gatekeeper Agent)

This updated flowchart integrates Agent 5, the Consolidated Gatekeeper. It acts as an absolute quality control checkpoint for every other agent in the micro-architecture, ensuring 100% accuracy before any execution or handoff occurs.

```mermaid
graph TD
    %% Define styles
    classDef startEnd fill:#003366,stroke:#00ffcc,stroke-width:2px,color:#fff;
    classDef process fill:#004d4d,stroke:#00ccff,stroke-width:1px,color:#fff;
    classDef decision fill:#003366,stroke:#ff9900,stroke-width:2px,color:#fff;
    classDef database fill:#002244,stroke:#00ccff,stroke-width:1px,color:#fff;
    classDef ui fill:#003366,stroke:#00ccff,stroke-width:2px,color:#fff;
    classDef aiAgent fill:#4b0082,stroke:#cc99ff,stroke-width:2px,color:#fff;
    classDef gatekeeper fill:#800000,stroke:#ff3333,stroke-width:3px,color:#fff;

    %% Data Acquisition Layer
    Start(["<b>Start</b><br/>(Inbound Leads: Websight Traffic,<br/>Contact us, Web chatbot, Emails,<br/>Manual entries, LinkedIn posts)"]):::startEnd
    Capture["Lead Data Captured<br/>& Normalized"]:::process
    CheckExist1{"Exists in DB<br/>& Zoho CRM?"}:::decision
    PullDetails["Pull Existing Details<br/>from DB & CRM"]:::process
    DataSuff{"Data<br/>Sufficient?"}:::decision
    Enrich["Trigger Enrichment<br/>(e.g., Lusha, LinkedIn Lookup)"]:::process
    CheckExist2{"Exists in DB<br/>& Zoho CRM<br/>(Post-Enrich)?"}:::decision
    CreateZohoDB["Push Data: Create/Update<br/>Zoho CRM & App DB"]:::process

    %% Database & UI
    RAG_DB[("<b>Agentic RAG Intelligence &<br/>Comprehensive Database</b><br/>Stores contact profiles, sentiments,<br/>reply counts, push counts, transcripts.<br/><br/><b>*GLOBAL ACTIVITY LOGGER*</b><br/>Captures 100% of minor steps, agent<br/>decisions, and action states continuously.")]:::database

    UI["<b>Management UI & Dashboard</b><br/>Configures campaign rules, meeting cadences,<br/>system connections. Visualizes all<br/>step-by-step action logs & analytics."]:::ui

    %% Native Python SDK Orchestrator
    PyOrchestrator["<b>Python Orchestrator (State Manager)</b><br/>Fetches context from DB/RAG and<br/>coordinates LLM Agent handoffs natively"]:::process

    %% 5-Agent Micro-Architecture with Gatekeeper
    subgraph Multi-Agent Micro-Architecture (Native OpenAI SDK)
        
        Agent5["<b>Agent 5: Consolidated Gatekeeper</b><br/>Evaluates output, format & logic of Agents 1-4.<br/>Demands 100% accuracy threshold."]:::gatekeeper

        Agent1["<b>Agent 1: Triage Analyst</b><br/>Extracts intent, sentiment, facts<br/>(Outputs JSON)"]:::aiAgent
        Eval1{"Agent 5<br/>Pass?"}:::decision

        Agent2["<b>Agent 2: Strategist (Router)</b><br/>Reads Triage + Rules to determine<br/>Next Best Action"]:::aiAgent
        Eval2{"Agent 5<br/>Pass?"}:::decision
        ActionType{"Action Type?"}:::decision
        
        Agent3["<b>Agent 3: Copywriter</b><br/>Drafts highly converting,<br/>context-aware emails/chats"]:::aiAgent
        Eval3{"Agent 5<br/>Pass?"}:::decision

        Agent4["<b>Agent 4: Auto-Scheduler</b><br/>Checks calendar availability<br/>& negotiates time slots"]:::aiAgent
        Eval4{"Agent 5<br/>Pass?"}:::decision
    end

    %% Action Execution
    UpdateZoho1["Update Zoho CRM"]:::process
    ZohoInteg["Trigger Zoho CRM Integration<br/>(Create/Update)"]:::process
    UpdateDB_Action["Log Event & Update DB"]:::process
    
    SendEmail["Python executes SendGrid/SMTP<br/>(Sends Agent 3 Draft)"]:::process
    WaitReply{"Reply<br/>Received?"}:::decision
    LogReply["Immediately Log Client Reply<br/>(Update DB)"]:::process
    NoReply["Log Cadence Timeout<br/>(Update DB)"]:::process

    DemoBooked{"Demo<br/>Booked?"}:::decision

    LoopComplete["Loop Iteration<br/>Complete"]:::process
    LeadQual{"Lead<br/>Qualified for<br/>Onboarding?"}:::decision
    EndStatus["End Lead Status<br/>(Disqualified/<br/>Closed)"]:::process
    UpdateDB_End["Log Event & Update DB"]:::process
    EndClosed(["<b>END</b>"]):::startEnd
    InitOnboard["Initiate Customer<br/>Onboarding"]:::process
    EndOnboarded(["<b>END:</b><br/>Customer<br/>Onboarded"]):::startEnd

    %% --- Connections ---

    %% Inbound Flow
    Start --> Capture
    Capture --> CheckExist1
    CheckExist1 -- "YES" --> PullDetails
    PullDetails --> DataSuff
    CheckExist1 -- "NO" --> DataSuff
    DataSuff -- "YES" --> PyOrchestrator
    DataSuff -- "NO" --> Enrich
    Enrich --> CheckExist2
    CheckExist2 -- "YES<br/>(Nothing to do)" --> PyOrchestrator
    CheckExist2 -- "NO" --> CreateZohoDB
    CreateZohoDB --> PyOrchestrator

    %% Core Agentic Loop & Dashboard Connections
    UI -. "Push Campaign Rules" .-> Agent2
    UI -. "Push Accuracy Rules" .-> Agent5
    RAG_DB -. "Feeds Live Logs & Analytics" .-> UI
    RAG_DB <--> PyOrchestrator
    
    %% Sequence & Gatekeeper Loops
    PyOrchestrator --> Agent1
    Agent1 --> Eval1
    Eval1 -- "FAIL (Revert & Redo)" --> Agent1
    Eval1 -- "PASS" --> Agent2
    
    Agent2 --> Eval2
    Eval2 -- "FAIL (Revert & Redo)" --> Agent2
    Eval2 -- "PASS" --> ActionType

    %% Branch 1: Campaign / Outreach
    ActionType -- "Campaign/Outreach" --> Agent3
    Agent3 --> Eval3
    Eval3 -- "FAIL (Revert & Redo)" --> Agent3
    Eval3 -- "PASS" --> SendEmail
    
    SendEmail --> WaitReply
    WaitReply -- "YES" --> LogReply
    WaitReply -- "NO (Timeout)" --> NoReply
    LogReply --> PyOrchestrator
    NoReply --> PyOrchestrator

    %% Branch 2: Demo / Meeting
    ActionType -- "Demo/Meeting" --> Agent4
    Agent4 --> Eval4
    Eval4 -- "FAIL (Revert & Redo)" --> Agent4
    Eval4 -- "PASS" --> DemoBooked
    
    DemoBooked -- "NO (Not Scheduled)" --> UpdateDB_Action
    UpdateDB_Action --> PyOrchestrator
    
    DemoBooked -- "YES (Success)" --> UpdateZoho1
    UpdateZoho1 --> LoopComplete

    %% Branch 3: Qualify / CRM Update
    ActionType -- "Qualify/CRM Update" --> ZohoInteg
    ZohoInteg --> LoopComplete

    %% End States
    LoopComplete --> LeadQual
    LeadQual -- "NO" --> EndStatus
    EndStatus --> UpdateDB_End
    UpdateDB_End --> EndClosed

    LeadQual -- "YES" --> InitOnboard
    InitOnboard --> EndOnboarded

    %% Global Logging Links (Visual connection to Database)
    Agent1 -.->|Logs state| RAG_DB
    Agent2 -.->|Logs state| RAG_DB
    Agent3 -.->|Logs state| RAG_DB
    Agent4 -.->|Logs state| RAG_DB
    Agent5 -.->|Logs evaluation| RAG_DB
    LogReply -.->|Updates| RAG_DB
    NoReply -.->|Updates| RAG_DB
    UpdateDB_Action -.->|Updates| RAG_DB
    ZohoInteg -.->|Updates| RAG_DB
    UpdateZoho1 -.->|Updates| RAG_DB
```



