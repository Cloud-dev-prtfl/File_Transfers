/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Multi-Agent System (MAS) for NetSuite - Integrated with Robust Search Creation
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, https, serverWidget, runtime, log, record, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const MAX_RETRIES = 1;

    // ========================================================================
    // 1. TOOL DEFINITIONS (Available to Agent 2)
    // ========================================================================
    const TOOLS_SCHEMA = [
        {
            name: "create_saved_search",
            description: "Creates a NetSuite Saved Search. Used when the user asks to save, build, or create a search.",
            parameters: {
                type: "OBJECT",
                properties: {
                    json_config: { 
                        type: "STRING", 
                        description: "A stringified JSON object containing the exact configuration for NetSuite search.create(). Must include 'type' (string), 'title' (string), 'filters' (array), and 'columns' (array of strings)." 
                    }
                },
                required: ["json_config"]
            }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL to fetch raw data. Use to answer questions about existing records.",
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
                const scriptObj = runtime.getCurrentScript();
                const rawApiKey = scriptObj.getParameter({ name: 'custscript_open_ai_api_key' });
                if (!rawApiKey) throw new Error("Missing API Key (custscript_open_ai_api_key) in script parameters.");
                const apiKey = rawApiKey.trim();

                const requestBody = (typeof context.request.body === 'object') ? context.request.body : JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                // --- START MULTI-AGENT PIPELINE ---
                
                // 1. Agent 1: Analysis & Intent
                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                let analysis = runAgent1_Analysis(userPrompt, apiKey);
                
                // 2. Agent 2: Execution (The "Main" Agent)
                log.debug('Pipeline', 'Starting Agent 2 (Execution)...');
                let executionResult = runAgent2_Execution(analysis, apiKey);
                
                // 3. Agent 3: Accuracy Check (The "Auditor")
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                let audit = runAgent3_Audit(userPrompt, executionResult, apiKey);

                // RETRY LOOP: If Agent 3 is not satisfied
                if (!audit.satisfied) {
                    log.audit('Pipeline Retry', 'Agent 3 failed content. Reason: ' + audit.reason);
                    let retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                }

                // 4. Agent 4: Formatting (The "Designer")
                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                let formattedHtml = runAgent4_Format(executionResult, apiKey);

                // 5. Agent 5: Final Review (The "Gatekeeper")
                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed Successfully"
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
        const systemPrompt = "You are Agent 1 (Analyst). Analyze the user request. \n" +
                             "Identify the user's core intent. If they want a saved search, explicitly state they need a saved search created. \n" +
                             "Do NOT execute tools. Just explain strictly WHAT needs to be done for the next agent.";
        return callGemini(systemPrompt + "\n\nUser Request: " + prompt, key);
    }

    function runAgent2_Execution(planFromAgent1, key) {
        const systemPrompt = "You are Agent 2 (Executor). Use the provided tools to fulfill the plan. \n" +
                             "If creating a search, format the 'json_config' parameter as a strict, valid JSON string compatible with NetSuite search.create(). \n" +
                             "Plan to execute:\n" + planFromAgent1;
        
        const decision = callGemini(systemPrompt, key, TOOLS_SCHEMA);
        
        if (decision.functionCall) {
            const fn = decision.functionCall;
            try {
                if (fn.name === 'create_saved_search') return executeCreateSearch(fn.args.json_config);
                if (fn.name === 'run_suiteql') return executeSuiteQL(fn.args.query);
                return "Error: Unknown Tool " + fn.name;
            } catch (e) {
                return "Execution Error: " + e.message;
            }
        } else {
            return decision.text || "Agent 2 determined no action was required.";
        }
    }

    function runAgent3_Audit(originalPrompt, resultData, key) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare the User Request with the Execution Result. \n" +
                             "Check for errors or if the tool failed. \n" +
                             "Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }. No markdown formatting.";
        
        const content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        const responseText = callGemini(systemPrompt + "\n\n" + content, key);
        
        try {
            // Robust parsing mirroring File 1 logic
            let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            return JSON.parse(cleanJson);
        } catch (e) {
            log.error('Agent 3 JSON Parse Fail', responseText);
            return { satisfied: true, reason: "Auditor parse failure, bypassing." }; 
        }
    }

    function runAgent4_Format(rawData, key) {
        const systemPrompt = "You are Agent 4 (Designer). Convert this raw execution text into professional HTML. \n" +
                             "If the raw data contains a success message and a NetSuite relative link (e.g., /app/common/search...), YOU MUST create an active HTML <a> tag for it. \n" +
                             "Use <b> for key data. Do not alter core values.";
        return callGemini(systemPrompt + "\n\nRaw Data: " + rawData, key);
    }

    function runAgent5_Review(originalPrompt, htmlContent, key) {
        const systemPrompt = "You are Agent 5 (Reviewer). Review this HTML response. \n" +
                             "If it correctly addresses the prompt and contains valid HTML, return the HTML exactly as is. \n" +
                             "If it is broken or harmful, return a simple polite error message.";
        return callGemini(systemPrompt + "\n\nProposed HTML:\n" + htmlContent, key);
    }

    // ========================================================================
    // 4. ROBUST API CALLER (Combines File 1 Reliability with File 2 Features)
    // ========================================================================

    function callGemini(prompt, key, tools = null) {
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + key;
        
        let payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1 }
        };

        if (tools) {
            payload.tools = [{ function_declarations: tools }];
            payload.tool_config = { function_calling_config: { mode: "AUTO" } };
        }

        const response = https.post({
            url: url,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.code !== 200) {
            log.error('Gemini API Error', response.body);
            throw new Error("Gemini API Error (" + response.code + ")");
        }

        let resBody = JSON.parse(response.body);
        let candidate = resBody.candidates[0].content.parts[0];

        // If tools were provided, check if the model invoked one
        if (tools) {
            return candidate.functionCall ? { functionCall: candidate.functionCall } : { text: candidate.text };
        } 
        
        // Otherwise, return pure text
        return candidate.text;
    }

    // ========================================================================
    // 5. NATIVE NETSUITE EXECUTION (The Hands)
    // ========================================================================

    /** * Uses the robust Timestamp collision avoidance from File 1
     */
    function executeCreateSearch(jsonConfigString) {
        try {
            // Ensure valid JSON from the LLM
            let cleanConfig = jsonConfigString.replace(/```json/g, "").replace(/```/g, "").trim();
            let searchConfig = JSON.parse(cleanConfig);

            // File 1 Magic: Append timestamp to guarantee unique title & ID
            const timestamp = new Date().getTime();
            searchConfig.title = (searchConfig.title || "AI Generated") + " (" + timestamp + ")";
            searchConfig.id = 'customsearch_ai_' + timestamp;

            const newSearch = search.create(searchConfig);
            const searchId = newSearch.save();

            const relativePath = '/app/common/search/searchresults.nl?searchid=' + searchId;

            return JSON.stringify({
                status: "Success",
                message: "Created Search: " + searchConfig.title,
                internalId: searchId,
                link: relativePath
            });

        } catch (e) {
            log.error('Search Creation Error', e.message);
            throw new Error("NetSuite rejected the search criteria: " + e.message);
        }
    }

    function executeSuiteQL(q) {
        try {
            let cleanQuery = q.replace(/```sql/g,'').replace(/```/g,'').trim();
            let res = query.runSuiteQL({ query: cleanQuery });
            let rows = res.asMappedResults().slice(0, 50);
            return rows.length ? JSON.stringify(rows) : "No records found.";
        } catch(e) {
            return "SuiteQL Error: " + e.message;
        }
    }

    // ========================================================================
    // 6. UI RENDERER (Merging File 1 CSS with File 2 Status Updates)
    // ========================================================================
    function renderUI(context) {
        const form = serverWidget.createForm({ title: 'NetSuite AI  MAS: Search Auto-Creator' });
        const htmlField = form.addField({ id: 'custpage_html', type: 'inlinehtml', label: 'HTML' });
        
        htmlField.defaultValue = `
            <style>
                body { font-family: -apple-system, sans-serif; padding: 20px; background-color: #f8f9fa; }
                #chat-box { border: 1px solid #dee2e6; height: 450px; overflow-y: auto; padding: 15px; margin-bottom: 15px; background: #fff; border-radius: 10px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); }
                .user-msg { color: #fff; background-color: #1a73e8; margin: 10px 0 10px auto; padding: 10px 15px; border-radius: 15px 15px 0 15px; max-width: 75%; width: fit-content; clear: both; float: right; }
                .ai-msg { color: #333; margin: 10px auto 10px 0; background: #f1f3f4; padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 80%; width: fit-content; clear: both; float: left; border: 1px solid #e8eaed; line-height: 1.5; }
                .error-msg { color: #d93025; background-color: #feefee; border: 1px solid #fad2cf; padding: 12px; border-radius: 8px; margin: 10px 0; clear: both; font-family: monospace; font-size: 12px; }
                .loader { font-style: italic; color: #5f6368; margin: 10px 0; clear: both; }
                .input-area { display: flex; gap: 10px; clear: both; }
                input[type="text"] { flex-grow: 1; padding: 12px; border: 1px solid #dadce0; border-radius: 24px; outline: none; padding-left: 20px; }
                button { padding: 12px 25px; cursor: pointer; background: #1a73e8; color: white; border: none; border-radius: 24px; font-weight: bold; transition: background 0.2s; }
                button:hover { background: #1557b0; }
                a { color: #1a73e8; text-decoration: underline; font-weight: 600; }
            </style>
            <div id="chat-box">
                <div class="ai-msg">I am NetSuite AI . My multi-agent pipeline is active. How can I help you today?</div>
            </div>
            <div class="input-area">
                <input type="text" id="user-input" placeholder="Example: Create a saved search for customers in California..." onkeydown="if(event.key === 'Enter') sendMessage()">
                <button id="send-btn" onclick="sendMessage()">Send to MAS</button>
            </div>
            <script>
                async function sendMessage() {
                    var input = document.getElementById('user-input');
                    var box = document.getElementById('chat-box');
                    var btn = document.getElementById('send-btn');
                    var msg = input.value.trim();
                    if(!msg) return;

                    box.innerHTML += '<div class="user-msg">' + msg.replace(/</g, "&lt;") + '</div>';
                    input.value = '';
                    input.disabled = true; btn.disabled = true;
                    
                    var loadingId = 'loading-' + Date.now();
                    box.innerHTML += '<div id="' + loadingId + '" class="loader">Executing Pipeline: Analysis -> Execution -> Audit -> Format -> Review...</div>';
                    box.scrollTop = box.scrollHeight;

                    try {
                        const response = await fetch(window.location.href, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: msg })
                        });
                        
                        const data = await response.json();
                        document.getElementById(loadingId).remove();
                        
                        if (data.error) {
                            box.innerHTML += '<div class="error-msg"><b>Pipeline Error:</b> ' + data.error + '</div>';
                        } else {
                            box.innerHTML += '<div class="ai-msg">' + data.answer + '</div>';
                        }
                    } catch (e) {
                        if(document.getElementById(loadingId)) document.getElementById(loadingId).remove();
                        box.innerHTML += '<div class="error-msg"><b>Connection Error:</b> ' + e.message + '</div>';
                    }
                    input.disabled = false; btn.disabled = false;
                    input.focus();
                    box.scrollTop = box.scrollHeight;
                }
            </script>
        `;
        context.response.writePage(form);
    }

    return { onRequest: onRequest };
});
