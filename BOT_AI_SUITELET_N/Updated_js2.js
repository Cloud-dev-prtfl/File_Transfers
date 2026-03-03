/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Project Jules: MAS with Autonomous Criteria Validation Loop
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

                const requestBody = (typeof context.request.body === 'object') ? context.request.body : JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                // --- START MULTI-AGENT PIPELINE ---
                
                // Agent 1: Analysis
                let analysis = runAgent1_Analysis(userPrompt, apiKey);
                
                // Agent 2: Execution (Now upgraded with a ReAct Loop for Criteria Validation)
                let executionResult = runAgent2_Execution(analysis, apiKey);
                
                // Agent 3: Audit
                let audit = runAgent3_Audit(userPrompt, executionResult, apiKey);
                if (!audit.satisfied) {
                    let retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                }

                // Agent 4: Formatting (Now strips Markdown)
                let formattedHtml = runAgent4_Format(executionResult, apiKey);

                // Agent 5: Review (Final Markdown wipe and safety check)
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed - ReAct Loop Active"
                }));

            } catch (e) {
                log.error('Pipeline Error', e.message);
                context.response.write(JSON.stringify({ error: "Pipeline Error: " + e.message }));
            }
        }
    }

    // ========================================================================
    // 3. THE 5 AGENTS
    // ========================================================================

    function runAgent1_Analysis(prompt, key) {
        const systemPrompt = "You are Agent 1 (Analyst). Identify the user's core intent. If they want a search involving specific statuses (like 'open invoices'), explicitly instruct the next agent to look up the exact NetSuite status codes first.";
        return callGemini(systemPrompt + "\n\nUser Request: " + prompt, key);
    }

    /**
     * UPGRADE: ReAct (Reason + Act) Loop.
     * Allows the Agent to call SuiteQL to fetch criteria, read the result, and THEN build the search.
     */
    function runAgent2_Execution(planFromAgent1, key) {
        const systemPrompt = "You are Agent 2 (Execution). You have access to tools.\n" +
                             "CRITICAL RULE: If you are asked to filter by a specific status (e.g., 'Open Invoices'), you MUST first use the 'run_suiteql' tool to query the 'transactionstatus' table to find the exact ID (e.g. CustInvc:A).\n" +
                             "Once you have the exact IDs, use the 'create_saved_search' tool. If a tool returns an error, adjust your query/json and try again.";
        
        let conversationPrompt = "Plan: " + planFromAgent1;
        let step = 0;
        let maxSteps = 4; // Max tool calls before forcing an exit

        while (step < maxSteps) {
            step++;
            log.debug('Agent 2 Loop', 'Step ' + step + '\nPrompt: ' + conversationPrompt);
            
            let decision = callGemini(systemPrompt + "\n\n" + conversationPrompt, key, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                let fn = decision.functionCall;
                let observation = "";
                
                try {
                    if (fn.name === 'create_saved_search') observation = executeCreateSearch(fn.args.json_config);
                    else if (fn.name === 'run_suiteql') observation = executeSuiteQL(fn.args.query);
                    else observation = "Error: Unknown Tool " + fn.name;
                } catch (e) {
                    observation = "Execution Error: " + e.message;
                }
                
                // Append the action and result to the conversation for the next loop iteration
                conversationPrompt += "\n\nAction taken: " + fn.name + " with args: " + JSON.stringify(fn.args);
                conversationPrompt += "\nObservation: " + observation;
                conversationPrompt += "\nBased on the observation, determine your next step or final text response.";

                // If search was created successfully, break loop and return
                if (fn.name === 'create_saved_search' && observation.indexOf("Success") > -1) {
                    return observation; 
                }
            } else {
                // Agent decided to just reply with text
                return decision.text || conversationPrompt;
            }
        }
        return conversationPrompt; // Return log if it times out
    }

    function runAgent3_Audit(originalPrompt, resultData, key) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare Request with Result. Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }";
        const content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        const responseText = callGemini(systemPrompt + "\n\n" + content, key);
        try {
            let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            return { satisfied: true, reason: "Parse bypass." }; 
        }
    }

    function runAgent4_Format(rawData, key) {
        const systemPrompt = "You are Agent 4 (Designer). Convert raw text into professional HTML. Use <b> for key data. DO NOT output markdown code blocks.";
        let htmlResponse = callGemini(systemPrompt + "\n\nRaw Data: " + rawData, key);
        
        // FIX: Strip markdown formatting block that was causing UI display issues
        return htmlResponse.replace(/```html/gi, '').replace(/```/g, '').trim();
    }

    function runAgent5_Review(originalPrompt, htmlContent, key) {
        const systemPrompt = "You are Agent 5 (Reviewer). Ensure this HTML directly answers the prompt. DO NOT output markdown code blocks.";
        let reviewResponse = callGemini(systemPrompt + "\n\nProposed HTML:\n" + htmlContent, key);
        
        // FIX: Final sanitization pass
        return reviewResponse.replace(/```html/gi, '').replace(/```/g, '').trim();
    }

    // ========================================================================
    // 4. API CALLER
    // ========================================================================
    function callGemini(prompt, key, tools = null) {
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + key;
        let payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } };

        if (tools) {
            payload.tools = [{ function_declarations: tools }];
            payload.tool_config = { function_calling_config: { mode: "AUTO" } };
        }

        const response = https.post({ url: url, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.code !== 200) throw new Error("API Error: " + response.body);

        let candidate = JSON.parse(response.body).candidates[0].content.parts[0];
        return (tools && candidate.functionCall) ? { functionCall: candidate.functionCall } : { text: candidate.text };
    }

    // ========================================================================
    // 5. NATIVE EXECUTORS
    // ========================================================================
    function executeCreateSearch(jsonConfigString) {
        try {
            let cleanConfig = jsonConfigString.replace(/```json/g, "").replace(/```/g, "").trim();
            let searchConfig = JSON.parse(cleanConfig);

            const timestamp = new Date().getTime();
            searchConfig.title = (searchConfig.title || "AI Search") + " (" + timestamp + ")";
            searchConfig.id = 'customsearch_ai_' + timestamp;

            const newSearch = search.create(searchConfig);
            const searchId = newSearch.save();
            return "Success! Created Search: " + searchConfig.title + ". Link: <a href='/app/common/search/searchresults.nl?searchid=" + searchId + "'>View Search</a>";

        } catch (e) {
            return "Execution Error: " + e.message; // Caught by the loop as an "Observation"
        }
    }

    function executeSuiteQL(q) {
        try {
            let cleanQuery = q.replace(/```sql/g,'').replace(/```/g,'').trim();
            let res = query.runSuiteQL({ query: cleanQuery });
            let rows = res.asMappedResults().slice(0, 15);
            return rows.length ? JSON.stringify(rows) : "No records found matching query.";
        } catch(e) {
            return "SuiteQL Error: " + e.message; // Caught by the loop
        }
    }

    // ========================================================================
    // 6. UI
    // ========================================================================
    function renderUI(context) {
        const form = serverWidget.createForm({ title: 'MAS: Auto-Creator & Validator' });
        const htmlField = form.addField({ id: 'html', type: 'inlinehtml', label: 'HTML' });
        htmlField.defaultValue = `
            <style>
                body { font-family: -apple-system, sans-serif; padding: 20px; background-color: #f8f9fa; }
                #chat-box { border: 1px solid #dee2e6; height: 450px; overflow-y: auto; padding: 15px; margin-bottom: 15px; background: #fff; border-radius: 10px; }
                .user-msg { color: #fff; background-color: #1a73e8; margin: 10px 0 10px auto; padding: 10px 15px; border-radius: 15px 15px 0 15px; max-width: 75%; float: right; clear: both; }
                .ai-msg { color: #333; margin: 10px auto 10px 0; background: #f1f3f4; padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 80%; float: left; clear: both; line-height: 1.5; }
                .error-msg { color: #d93025; background-color: #feefee; padding: 12px; border-radius: 8px; margin: 10px 0; clear: both; font-size: 12px; }
                .loader { font-style: italic; color: #5f6368; margin: 10px 0; clear: both; }
                input[type="text"] { width: 75%; padding: 12px; border: 1px solid #dadce0; border-radius: 24px; outline: none; padding-left: 20px; }
                button { padding: 12px 25px; cursor: pointer; background: #1a73e8; color: white; border: none; border-radius: 24px; font-weight: bold; }
                a { color: #1a73e8; font-weight: 600; }
            </style>
            <div id="chat-box"><div class="ai-msg">I am online. My validation loops are active.</div></div>
            <div>
                <input type="text" id="user-input" placeholder="Example: Create a search for Open Invoices..." onkeydown="if(event.key === 'Enter') sendMessage()">
                <button onclick="sendMessage()">Deploy Pipeline</button>
            </div>
            <script>
                async function sendMessage() {
                    var input = document.getElementById('user-input');
                    var box = document.getElementById('chat-box');
                    var msg = input.value.trim();
                    if(!msg) return;

                    box.innerHTML += '<div class="user-msg">' + msg + '</div>';
                    input.value = '';
                    
                    var loadId = 'load-' + Date.now();
                    box.innerHTML += '<div id="' + loadId + '" class="loader">Agents are validating criteria via SuiteQL before execution...</div>';
                    box.scrollTop = box.scrollHeight;

                    try {
                        let res = await fetch(window.location.href, { method: 'POST', body: JSON.stringify({ prompt: msg }) });
                        let data = await res.json();
                        document.getElementById(loadId).remove();
                        box.innerHTML += data.error ? '<div class="error-msg">' + data.error + '</div>' : '<div class="ai-msg">' + data.answer + '</div>';
                    } catch (e) {
                        document.getElementById(loadId).remove();
                        box.innerHTML += '<div class="error-msg">Connection Error</div>';
                    }
                    box.scrollTop = box.scrollHeight;
                }
            </script>
        `;
        context.response.writePage(form);
    }

    return { onRequest: onRequest };
});
