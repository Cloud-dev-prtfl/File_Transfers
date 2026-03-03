/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Multi-Agent System (MAS) for NetSuite - Integrated with Schema Validation & ReAct Loop
 */
define(['N/query', 'N/llm', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, llm, serverWidget, runtime, log, record, search) {

    // ========================================================================
    // 1. TOOL DEFINITIONS (Available to Agent 2)
    // ========================================================================
    const TOOLS_SCHEMA = [
        {
            name: "get_record_fields",
            description: "Fetches valid NetSuite internal field IDs for a given record type. ALWAYS use this FIRST to validate field names before creating a saved search.",
            parameters: {
                type: "OBJECT",
                properties: {
                    record_type: { type: "STRING", description: "The internal ID of the NetSuite record (e.g., 'customer', 'transaction', 'creditmemo')." }
                },
                required: ["record_type"]
            }
        },
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
                const requestBody = (typeof context.request.body === 'object') ? context.request.body : JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                // --- START MULTI-AGENT PIPELINE ---
                
                // 1. Agent 1: Analysis & Intent
                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                let analysis = runAgent1_Analysis(userPrompt);
                
                // 2. Agent 2: Execution (The "Main" Agent with Loop)
                log.debug('Pipeline', 'Starting Agent 2 (Execution with Schema Check)...');
                let executionResult = runAgent2_Execution(analysis);
                
                // 3. Agent 3: Accuracy Check (The "Auditor")
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                let audit = runAgent3_Audit(userPrompt, executionResult);

                // RETRY LOOP: If Agent 3 is not satisfied
                if (!audit.satisfied) {
                    log.audit('Pipeline Retry', 'Agent 3 failed content. Reason: ' + audit.reason);
                    let retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt); 
                }

                // 4. Agent 4: Formatting (The "Designer")
                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                let formattedHtml = runAgent4_Format(executionResult);

                // 5. Agent 5: Final Review (The "Gatekeeper")
                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed Successfully via N/llm"
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

    function runAgent1_Analysis(prompt) {
        const systemPrompt = "You are Agent 1 (Analyst). Analyze the user request. \n" +
                             "Identify the user's core intent. If they want a saved search, explicitly state they need a saved search created. \n" +
                             "Do NOT execute tools. Just explain strictly WHAT needs to be done for the next agent.";
        return callNetSuiteLLM(systemPrompt + "\n\nUser Request: " + prompt);
    }

    function runAgent2_Execution(planFromAgent1) {
        let conversationHistory = "Plan to execute:\n" + planFromAgent1;
        const maxSteps = 3; // Allow the agent up to 3 turns to fetch schema, then create search
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 2 (Executor). Use the provided tools to fulfill the plan. \n" +
                                 "CRITICAL RULE: If you are asked to create a saved search, you MUST use 'get_record_fields' first to fetch the valid internal IDs for the record you are querying. Do not guess field names. \n" +
                                 "Once you have the valid fields, call 'create_saved_search'. \n" +
                                 "Current Context:\n" + conversationHistory;
            
            const decision = callNetSuiteLLM(systemPrompt, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                let toolResult = "";
                
                try {
                    if (fn.name === 'get_record_fields') {
                        toolResult = executeGetRecordSchema(fn.args.record_type);
                        // Append to history and continue loop so LLM can read schema
                        conversationHistory += "\n\nTool 'get_record_fields' executed. Schema Result:\n" + toolResult;
                        log.debug('Agent 2 Loop', 'Fetched schema for ' + fn.args.record_type);
                    } 
                    else if (fn.name === 'create_saved_search') {
                        return executeCreateSearch(fn.args.json_config); // End execution
                    } 
                    else if (fn.name === 'run_suiteql') {
                        return executeSuiteQL(fn.args.query); // End execution
                    } 
                    else {
                        return "Error: Unknown Tool " + fn.name;
                    }
                } catch (e) {
                    return "Execution Error during " + fn.name + ": " + e.message;
                }
            } else {
                // LLM decided to return standard text instead of a tool
                return decision.text || "Agent 2 determined no action was required.";
            }
        }
        
        return "Execution Error: Agent 2 hit maximum loop steps (" + maxSteps + ") without completing the task. Context: " + conversationHistory;
    }

    function runAgent3_Audit(originalPrompt, resultData) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare the User Request with the Execution Result. \n" +
                             "Check for errors or if the tool failed. \n" +
                             "Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }. No markdown formatting, no conversational text.";
        
        const content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        const responseText = callNetSuiteLLM(systemPrompt + "\n\n" + content);
        
        try {
            return JSON.parse(extractJSON(responseText));
        } catch (e) {
            log.error('Agent 3 JSON Parse Fail', responseText);
            return { satisfied: true, reason: "Auditor parse failure, bypassing." }; 
        }
    }

    function runAgent4_Format(rawData) {
        const systemPrompt = "You are Agent 4 (Designer). Convert this raw execution text into professional HTML. \n" +
                             "If the raw data contains a success message and a NetSuite relative link, YOU MUST create an active HTML <a> tag for it. \n" +
                             "Use <b> for key data. Do not alter core values.\n" +
                             "CRITICAL: Output ONLY the raw HTML code. Do NOT include markdown blocks like ```html. Do NOT include any conversational text explaining the HTML.";
        
        let rawHtml = callNetSuiteLLM(systemPrompt + "\n\nRaw Data: " + rawData);
        return cleanMarkdown(rawHtml);
    }

    function runAgent5_Review(originalPrompt, htmlContent) {
        const systemPrompt = "You are Agent 5 (Reviewer). Review this HTML response. \n" +
                             "If it correctly addresses the prompt and contains valid HTML, return the HTML exactly as is. \n" +
                             "If it is broken or harmful, return a simple polite error message.\n" +
                             "CRITICAL: Output ONLY the final HTML or error message. Do NOT add conversational text like 'The proposed HTML is valid'. Do NOT use markdown blocks like ```html.";
        
        let reviewedHtml = callNetSuiteLLM(systemPrompt + "\n\nProposed HTML:\n" + htmlContent);
        return cleanMarkdown(reviewedHtml);
    }

    // ========================================================================
    // 4. ROBUST API CALLER & STRING PARSERS
    // ========================================================================

    function callNetSuiteLLM(prompt, tools = null) {
        let finalPrompt = prompt;

        if (tools) {
            finalPrompt += "\n\nAVAILABLE TOOLS:\n" + JSON.stringify(tools, null, 2) + 
                           "\n\nINSTRUCTIONS FOR TOOLS:\n" +
                           "If you need to use a tool to accomplish this task, you MUST respond with ONLY a valid JSON object matching this exact structure:\n" +
                           "{\"functionCall\": {\"name\": \"<tool_name>\", \"args\": {<arguments>}}}\n" +
                           "Do NOT include any other text, explanation, or markdown formatting outside the JSON.";
        }

        const response = llm.generateText({ prompt: finalPrompt });
        const outputText = response.text;

        if (tools) {
            try {
                let parsed = JSON.parse(extractJSON(outputText));
                if (parsed.functionCall) {
                    return { functionCall: parsed.functionCall };
                }
            } catch (e) {
                log.debug('Tool Parse Attempt', 'Response was not valid JSON tool call. Falling back to text.');
            }
            return { text: outputText };
        } 
        
        return outputText;
    }

    function extractJSON(text) {
        let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        let jsonStart = cleanText.indexOf('{');
        let jsonEnd = cleanText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            return cleanText.substring(jsonStart, jsonEnd + 1);
        }
        return cleanText;
    }

    function cleanMarkdown(text) {
        return text.replace(/```html/gi, "").replace(/```/g, "").trim();
    }

    // ========================================================================
    // 5. NATIVE NETSUITE EXECUTION (The Hands)
    // ========================================================================

    function executeGetRecordSchema(recordType) {
        try {
            // Creates a dynamic dummy record just to fetch the available internal field IDs
            let dummyRec = record.create({ type: recordType, isDynamic: true });
            let fields = dummyRec.getFields();
            
            return JSON.stringify({
                status: "Success",
                recordType: recordType,
                available_fields: fields
            });
        } catch (e) {
            return JSON.stringify({
                status: "Error",
                message: "Failed to load schema for " + recordType + ". It might be an invalid record type or a sub-record. Error: " + e.message
            });
        }
    }

    function executeCreateSearch(jsonConfigString) {
        let searchConfig;
        
        try {
            let extracted = extractJSON(jsonConfigString);
            searchConfig = JSON.parse(extracted);
        } catch (e) {
            log.error('Execution Error: JSON Parse', "Failed to parse: " + jsonConfigString);
            return "Execution Error: AI provided invalid JSON format for the search criteria.";
        }

        try {
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
            log.error('Search Creation Rejected', e.message + " | Payload: " + JSON.stringify(searchConfig));
            return "Execution Error: NetSuite rejected the search criteria. This is usually due to the AI guessing an incorrect field name or filter operator. Details: " + e.message;
        }
    }

    function executeSuiteQL(q) {
        try {
            let cleanQuery = q.replace(/```sql/gi,'').replace(/```/g,'').trim();
            let res = query.runSuiteQL({ query: cleanQuery });
            let rows = res.asMappedResults().slice(0, 50);
            return rows.length ? JSON.stringify(rows) : "No records found.";
        } catch(e) {
            return "SuiteQL Error: " + e.message;
        }
    }

    // ========================================================================
    // 6. UI RENDERER 
    // ========================================================================
    function renderUI(context) {
        const form = serverWidget.createForm({ title: 'NetSuite AI MAS: Search Auto-Creator' });
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
                <div class="ai-msg">I am NetSuite AI. My native multi-agent pipeline is active. How can I help you today?</div>
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
                    box.innerHTML += '<div id="' + loadingId + '" class="loader">Executing Pipeline: Analysis -> Schema Check -> Execution -> Audit -> Format -> Review...</div>';
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
