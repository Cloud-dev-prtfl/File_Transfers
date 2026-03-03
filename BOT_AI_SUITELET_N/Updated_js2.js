/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Project Jules: MAS with Autonomous Criteria Validation & Bulletproof Parsing
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, https, serverWidget, runtime, log, record, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';

    // ========================================================================
    // 1. TOOL DEFINITIONS
    // ========================================================================
    const TOOLS_SCHEMA = [
        {
            name: "create_saved_search",
            description: "Creates a NetSuite Saved Search. The json_config must use exact NetSuite internal IDs for filters and columns.",
            parameters: {
                type: "OBJECT",
                properties: {
                    json_config: { 
                        type: "STRING", 
                        description: "Stringified JSON object. Must include 'type', 'title', 'filters', and 'columns'." 
                    }
                },
                required: ["json_config"]
            }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL. USE THIS FIRST to find exact internal IDs, statuses (e.g., query 'transactionstatus' table), or field names if you are unsure of the exact NetSuite criteria.",
            parameters: {
                type: "OBJECT",
                properties: { query: { type: "STRING", description: "The SQL query string." } },
                required: ["query"]
            }
        }
    ];

    // ========================================================================
    // 2. MAIN REQUEST HANDLER
    // ========================================================================
    function onRequest(context) {
        if (context.request.method === 'GET') {
            renderUI(context);
        }
        else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            
            try {
                const rawApiKey = runtime.getCurrentScript().getParameter({ name: 'custscript_open_ai_api_key' });
                if (!rawApiKey) throw new Error("Missing API Key.");
                const apiKey = rawApiKey.trim();

                // Safely parse UI Request
                let requestBody;
                try {
                    requestBody = (typeof context.request.body === 'object') ? context.request.body : safeJSONExtract(context.request.body);
                } catch (e) {
                    throw new Error("Invalid request payload from UI.");
                }
                
                const userPrompt = requestBody.prompt;

                // --- START MULTI-AGENT PIPELINE ---
                let analysis = runAgent1_Analysis(userPrompt, apiKey);
                let executionResult = runAgent2_Execution(analysis, apiKey);
                
                let audit = runAgent3_Audit(userPrompt, executionResult, apiKey);
                if (!audit.satisfied) {
                    let retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                }

                let formattedHtml = runAgent4_Format(executionResult, apiKey);
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed - ReAct Loop Active"
                }));

            } catch (e) {
                log.error('Pipeline Error', e.message);
                // The frontend expects valid JSON here, no matter what crashed
                context.response.write(JSON.stringify({ error: "Pipeline Error: " + e.message }));
            }
        }
    }

    // ========================================================================
    // 3. BULLETPROOF JSON EXTRACTOR
    // ========================================================================
    /**
     * Finds and parses JSON even if it is surrounded by conversational text or markdown.
     */
    function safeJSONExtract(rawText) {
        if (typeof rawText === 'object' && rawText !== null) return rawText;
        if (!rawText) return {};

        let text = String(rawText).trim();
        
        // Strip markdown backticks if present
        text = text.replace(/```json/gi, "").replace(/```/g, "").trim();

        try {
            return JSON.parse(text);
        } catch (initialError) {
            // If direct parse fails, use Regex to hunt for the JSON object { ... } or array [ ... ]
            const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (regexError) {
                    throw new Error("Found JSON brackets, but content was invalid.");
                }
            }
            throw new Error("No JSON structure could be extracted from the text.");
        }
    }

    // ========================================================================
    // 4. THE 5 AGENTS
    // ========================================================================
    function runAgent1_Analysis(prompt, key) {
        const systemPrompt = "You are Agent 1 (Analyst). Identify the user's core intent. If they want a search involving specific statuses (like 'open invoices'), explicitly instruct the next agent to look up the exact NetSuite status codes first via SuiteQL.";
        return callGemini(systemPrompt + "\n\nUser Request: " + prompt, key);
    }

    function runAgent2_Execution(planFromAgent1, key) {
        const systemPrompt = "You are Agent 2 (Execution). You have access to tools.\n" +
                             "CRITICAL RULE: If asked to filter by status (e.g., 'Open Invoices'), you MUST first use the 'run_suiteql' tool to query the 'transactionstatus' table to find the exact ID (e.g. CustInvc:A).\n" +
                             "Once you have the exact IDs, use the 'create_saved_search' tool. If a tool returns an error, adjust your query/json and try again.";
        
        let conversationPrompt = "Plan: " + planFromAgent1;
        let step = 0;
        let maxSteps = 4;

        while (step < maxSteps) {
            step++;
            log.debug('Agent 2 Loop', 'Step ' + step);
            
            let decision = callGemini(systemPrompt + "\n\n" + conversationPrompt, key, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                let fn = decision.functionCall;
                let observation = "";
                
                try {
                    if (fn.name === 'create_saved_search') observation = executeCreateSearch(fn.args.json_config || fn.args);
                    else if (fn.name === 'run_suiteql') observation = executeSuiteQL(fn.args.query);
                    else observation = "Error: Unknown Tool " + fn.name;
                } catch (e) {
                    observation = "Execution Error: " + e.message;
                }
                
                conversationPrompt += "\n\nAction taken: " + fn.name + "\nObservation: " + observation;
                conversationPrompt += "\nBased on the observation, determine your next step or final text response.";

                if (fn.name === 'create_saved_search' && observation.indexOf("Success") > -1) {
                    return observation; 
                }
            } else {
                return decision.text || conversationPrompt;
            }
        }
        return conversationPrompt; 
    }

    function runAgent3_Audit(originalPrompt, resultData, key) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare Request with Result. Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }";
        const content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        const responseText = callGemini(systemPrompt + "\n\n" + content, key);
        
        try {
