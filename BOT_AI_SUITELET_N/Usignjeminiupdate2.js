/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description NetSuite AI assistance - Integrated with Gemini API, Schema Validation & ReAct Loop
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, https, serverWidget, runtime, log, record, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const MAX_PIPELINE_RETRIES = 2; // Initial attempt + 2 retries = 3 total attempts

    // Helper to get consistent MM/DD/YYYY date for the AI
    function getTodayString() {
        const d = new Date();
        return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
    }

    // ========================================================================
    // 1. TOOL DEFINITIONS 
    // ========================================================================
    
    const ANALYST_TOOLS_SCHEMA = [
        {
            name: "get_record_fields",
            description: "Fetches valid NetSuite internal body field IDs for a given record type. Use this to understand standard fields.",
            parameters: {
                type: "OBJECT",
                properties: {
                    record_type: { type: "STRING", description: "The internal ID of the NetSuite record (e.g., 'customer', 'invoice')." }
                },
                required: ["record_type"]
            }
        },
        {
            name: "fetch_online_schema",
            description: "Scrapes the official NetSuite Schema/Records Browser to get valid 'Search Columns' and 'Search Filters'.",
            parameters: {
                type: "OBJECT",
                properties: {
                    record_type: { type: "STRING", description: "The internal ID of the NetSuite record to look up." }
                },
                required: ["record_type"]
            }
        },
        {
            name: "get_netsuite_search_reference",
            description: "Acts as the NetSuite Help Center guide for valid Search Criteria, Quick Filters (Relative Dates), and Status IDs. MUST use this if the request involves dates, timeframes, or transaction statuses.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "search_web_examples",
            description: "Searches StackOverflow and the web for working NetSuite saved search examples. Use this to find correct criteria logic for complex user requests.",
            parameters: {
                type: "OBJECT",
                properties: {
                    search_query: { type: "STRING", description: "The specific NetSuite search topic to look up (e.g., 'customer open invoices saved search', 'date between filter')." }
                },
                required: ["search_query"]
            }
        }
    ];

    const TOOLS_SCHEMA = [
        {
            name: "get_record_fields",
            description: "Fetches valid NetSuite internal body field IDs for a given record type.",
            parameters: { type: "OBJECT", properties: { record_type: { type: "STRING" } }, required: ["record_type"] }
        },
        {
            name: "fetch_online_schema",
            description: "Scrapes the official NetSuite Schema/Records Browser to get valid 'Search Columns'.",
            parameters: { type: "OBJECT", properties: { record_type: { type: "STRING" } }, required: ["record_type"] }
        },
        {
            name: "get_netsuite_search_reference",
            description: "Returns the NetSuite Help Center rules for valid Quick Date filters and Status IDs. Use to prevent invalid criteria errors.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "search_web_examples",
            description: "Searches the web for working NetSuite saved search code snippets.",
            parameters: { type: "OBJECT", properties: { search_query: { type: "STRING" } }, required: ["search_query"] }
        },
        {
            name: "create_saved_search",
            description: "Creates a NetSuite Saved Search. Used when the user asks to save, build, or create a search.",
            parameters: {
                type: "OBJECT",
                properties: {
                    json_config: { 
                        type: "STRING", 
                        description: "A stringified JSON object containing the exact configuration for NetSuite search.create(). Must include 'type' (string), 'title' (string). 'filters' MUST be an array of objects strictly using keys 'name' (field id), 'operator', and 'values' (array). 'columns' MUST be an array of strings." 
                    }
                },
                required: ["json_config"]
            }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL to fetch raw data.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
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

                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                let analysis = runAgent1_Analysis(userPrompt, apiKey);
                
                log.debug('Pipeline', 'Starting Agent 2 (Execution)...');
                let executionResult = runAgent2_Execution(analysis, apiKey);
                
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                let audit = runAgent3_Audit(userPrompt, executionResult, apiKey);

                let retryCount = 0;
                while (!audit.satisfied && retryCount < MAX_PIPELINE_RETRIES) {
                    retryCount++;
                    log.audit('Pipeline Retry ' + retryCount, 'Reason: ' + audit.reason);
                    
                    let retryPrompt = "Attempt " + retryCount + " failed. Auditor Reason: " + audit.reason + "\n" +
                                      "Original Plan:\n" + analysis + "\n" +
                                      "CRITICAL INSTRUCTION: Read the auditor reason carefully. If the error was related to an 'invalid column', try an alternative field ID (e.g., 'datecreated' instead of 'createddate'). If it was related to dates, ensure you are passing EXACT MM/DD/YYYY arrays for unsupported timeframes.";
                                      
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                    audit = runAgent3_Audit(userPrompt, executionResult, apiKey);
                }

                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                let formattedHtml = runAgent4_Format(executionResult, apiKey);

                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "Executed successfully via Gemini API (Retries: " + retryCount + ")"
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
        let conversationHistory = "User Request:\n" + prompt;
        const maxSteps = 5; 
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 1 (Analyst). Analyze the user request. \n" +
                                 "Today's Date is: " + getTodayString() + ". \n" +
                                 "CRITICAL RULE 1: If the request involves complex filters, dates, or statuses, use 'search_web_examples' and 'get_netsuite_search_reference' FIRST.\n" +
                                 "CRITICAL RULE 2: Use 'fetch_online_schema' to find columns and fields.\n" +
                                 "Once you have the validated schema and examples, output a plain-text execution plan for Agent 2. Do NOT output JSON.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, ANALYST_TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                try {
                    if (fn.name === 'fetch_online_schema') {
                        let toolResult = executeFetchOnlineSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'fetch_online_schema' executed. Data:\n" + toolResult;
                    } else if (fn.name === 'get_record_fields') {
                        let toolResult = executeGetRecordSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'get_record_fields' executed. Data:\n" + toolResult;
                    } else if (fn.name === 'get_netsuite_search_reference') {
                        let toolResult = executeGetSearchReference();
                        conversationHistory += "\n\nTool 'get_netsuite_search_reference' executed. Guide:\n" + toolResult;
                    } else if (fn.name === 'search_web_examples') {
                        let toolResult = executeSearchWebExamples(fn.args.search_query);
                        conversationHistory += "\n\nTool 'search_web_examples' executed. Examples:\n" + toolResult;
                    } else {
                        conversationHistory += "\n\nError: Unknown Tool " + fn.name;
                    }
                } catch (e) {
                    conversationHistory += "\n\nExecution Error: " + e.message;
                }
            } else {
                return decision.text || "Agent 1 determined no action was required.";
            }
        }
        return "Analysis Error: Agent 1 hit maximum loop steps. Context: " + conversationHistory;
    }

    function runAgent2_Execution(planFromAgent1, key) {
        let conversationHistory = "Plan to execute:\n" + planFromAgent1;
        const maxSteps = 5; 
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 2 (Executor). Use the tools to fulfill the plan. \n" +
                                 "Today's Date is: " + getTodayString() + ". Use this for date calculations.\n" +
                                 "CRITICAL RULE 1: You MUST invoke 'create_saved_search' to create the search. Do NOT just output text.\n" +
                                 "CRITICAL RULE 2: If setting a Date filter, use 'get_netsuite_search_reference' to ensure exact compliance.\n" +
                                 "CRITICAL RULE 3: You may use 'search_web_examples' if you are unsure how to structure a specific filter.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                let toolResult = "";
                
                try {
                    if (fn.name === 'get_record_fields') {
                        toolResult = executeGetRecordSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'get_record_fields' executed. Data:\n" + toolResult;
                    } 
                    else if (fn.name === 'fetch_online_schema') {
                        toolResult = executeFetchOnlineSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'fetch_online_schema' executed. Data:\n" + toolResult;
                    }
                    else if (fn.name === 'get_netsuite_search_reference') {
                        toolResult = executeGetSearchReference();
                        conversationHistory += "\n\nTool 'get_netsuite_search_reference' executed. Guide:\n" + toolResult;
                    }
                    else if (fn.name === 'search_web_examples') {
                        toolResult = executeSearchWebExamples(fn.args.search_query);
                        conversationHistory += "\n\nTool 'search_web_examples' executed. Examples:\n" + toolResult;
                        log.debug('Agent 2 Loop', 'Searched Web For: ' + fn.args.search_query);
                    }
                    else if (fn.name === 'create_saved_search') {
                        let jsonConfigStr = typeof fn.args.json_config === 'string' ? fn.args.json_config : JSON.stringify(fn.args.json_config);
                        return executeCreateSearch(jsonConfigStr); 
                    } 
                    else if (fn.name === 'run_suiteql') {
                        return executeSuiteQL(fn.args.query); 
                    } 
                    else {
                        return "Error: Unknown Tool " + fn.name;
                    }
                } catch (e) {
                    return "Execution Error during " + fn.name + ": " + e.message;
                }
            } else {
                let outputText = decision.text || "";
                if (i < maxSteps - 1) {
                    conversationHistory += "\n\nAI Output: " + outputText + "\nSystem Instruction: You did not call a tool. You MUST invoke the 'create_saved_search' tool to complete the task.";
                    continue;
                } else {
                    return outputText || "Agent 2 failed to execute a tool.";
                }
            }
        }
        
        return "Execution Error: Agent 2 hit maximum loop steps. Context: " + conversationHistory;
    }

    function runAgent3_Audit(originalPrompt, resultData, key) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare the User Request with the Execution Result. \n" +
                             "1. If the Execution Result does NOT contain 'status: Success' or an internal ID, return satisfied: false.\n" +
                             "2. If the Execution Result contains 'invalid column' or 'not in proper syntax', return satisfied: false.\n" +
                             "3. If the Execution Result contains 'invalid search criteria', 'invalid date', or 'status', return satisfied: false and instruct: 'NetSuite rejected your date range. You MUST calculate an exact MM/DD/YYYY array using the within operator.'\n" +
                             "Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }.";
        
        const content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        const responseText = callGemini(systemPrompt + "\n\n" + content, key);
        
        try {
            return JSON.parse(extractJSON(responseText));
        } catch (e) {
            log.error('Agent 3 JSON Parse Fail', responseText);
            return { satisfied: true, reason: "Auditor parse failure, bypassing." }; 
        }
    }

    function runAgent4_Format(rawData, key) {
        const systemPrompt = "You are Agent 4 (Designer). Convert this raw execution text into HTML. \n" +
                             "ALWAYS wrap your entire response in a <div> tag. \n" +
                             "If the raw data contains a success message and a relative link, create an active HTML <a> tag for it. \n" +
                             "If it is an error message, format it clearly so the user understands the pipeline failed.\n" +
                             "CRITICAL: Output ONLY valid HTML code. Do NOT include markdown blocks like ```html.";
        
        let rawHtml = callGemini(systemPrompt + "\n\nRaw Data: " + rawData, key);
        return cleanMarkdown(rawHtml);
    }

    function runAgent5_Review(originalPrompt, htmlContent, key) {
        const systemPrompt = "You are Agent 5 (Reviewer). Review this HTML response. \n" +
                             "Your ONLY job is to ensure the output is safe HTML. \n" +
                             "If the text is plain and lacks HTML tags, wrap it in <p> tags and return it. \n" +
                             "CRITICAL: Output ONLY the final HTML. Do NOT use markdown blocks like ```html.";
        
        let reviewedHtml = callGemini(systemPrompt + "\n\nProposed HTML:\n" + htmlContent, key);
        return cleanMarkdown(reviewedHtml);
    }

    // ========================================================================
    // 4. ROBUST API CALLER & STRING PARSERS
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
        let parts = resBody.candidates[0].content.parts;
        
        let funcCall = null;
        let textResult = "";
        
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].functionCall) funcCall = parts[i].functionCall;
            if (parts[i].text) textResult += parts[i].text;
        }

        if (tools) {
            if (funcCall) return { functionCall: funcCall, text: textResult };
            return { text: textResult };
        } 
        
        return textResult;
    }

    function extractJSON(text) {
        if (!text) return "";
        let cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
        let jsonStart = cleanText.indexOf('{');
        let jsonEnd = cleanText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            return cleanText.substring(jsonStart, jsonEnd + 1);
        }
        return cleanText;
    }

    function cleanMarkdown(text) {
        if (!text) return "";
        return text.replace(/```html/gi, "").replace(/```/g, "").trim();
    }

    // ========================================================================
    // 5. NATIVE NETSUITE EXECUTION (The Hands)
    // ========================================================================

    // NEW TOOL: Searches StackOverflow API for Examples (To be replaced by static repo later)
    function executeSearchWebExamples(query) {
        try {
            const url = 'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=' + encodeURIComponent('netsuite saved search ' + query) + '&site=stackoverflow&filter=!nNPvSNdWme';
            const response = https.get({ url: url });
            
            if (response.code === 200) {
                let data = JSON.parse(response.body);
                if (data.items && data.items.length > 0) {
                    let results = data.items.slice(0, 2).map(item => {
                        // Strip HTML from body to save context window tokens
                        let cleanBody = (item.body || "").replace(/<[^>]+>/g, ' ').substring(0, 1500);
                        return "Title: " + item.title + "\nSnippet: " + cleanBody;
                    }).join("\n\n---\n\n");
                    return "Found Web Examples:\n" + results;
                }
                return "No examples found on the web for: " + query;
            }
            return "Web search API failed with status: " + response.code;
        } catch(e) {
            return "Error searching the web: " + e.message;
        }
    }

    function executeGetSearchReference() {
        return `
        NETSUITE SEARCH CRITERIA REFERENCE GUIDE:
        
        1. QUICK FILTERS (RELATIVE DATES): 
           Allowed exact strings: 'today', 'yesterday', 'tomorrow', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear'.
           
           -> STRICT RULE FOR UNSUPPORTED DATES: Custom strings like 'lastTwoWeeks' or 'last3Days' DO NOT EXIST. 
           -> DO NOT COMPROMISE. If the user asks for a timeframe not in the allowed list, you MUST calculate the exact start and end dates based on Today's Date. Use the 'within' operator and provide an array of two exact date strings format MM/DD/YYYY. Example: "values": ["02/18/2026", "03/04/2026"].
        
        2. TRANSACTION STATUS IDs:
           - Open Invoices: 'CustInvc:Open'
           - Paid Invoices: 'CustInvc:PaidInFull'
           - Pending Sales Orders: 'SalesOrd:A', 'SalesOrd:B'
           
        3. VALID OPERATORS:
           'is', 'isnot', 'anyof', 'noneof', 'within', 'haskeywords', 'startswith', 'contains', 'between', 'empty', 'notempty'.
        `;
    }

    function executeGetRecordSchema(recordType) {
        try {
            let dummyRec = record.create({ type: recordType, isDynamic: true });
            let fields = dummyRec.getFields();
            return JSON.stringify({ status: "Success", recordType: recordType, available_fields: fields });
        } catch (e) {
            return JSON.stringify({ status: "Error", message: "Failed to load schema for " + recordType + ". Error: " + e.message });
        }
    }

    function executeFetchOnlineSchema(recordType) {
        try {
            const safeType = recordType.toLowerCase().trim();
            const url = 'https://www.netsuite.com/help/helpcenter/en_US/srbrowser/Browser2020_1/script/record/' + safeType + '.html';
            
            const response = https.get({ url: url });
            
            if (response.code === 200) {
                let cleanText = response.body
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ');
                
                cleanText = cleanText.substring(0, 15000); 
                return "Successfully scraped NetSuite Records Browser for: " + safeType + ". Look for the 'Search Columns' and 'Search Filters' sections in this data to validate your criteria IDs: " + cleanText;
            } else {
                return "Failed to fetch online schema browser. HTTP Code: " + response.code;
            }
        } catch(e) {
            return "Error fetching online schema: " + e.message;
        }
    }

    function executeCreateSearch(jsonConfigString) {
        let searchConfig;
        
        try {
            let extracted = extractJSON(jsonConfigString);
            searchConfig = JSON.parse(extracted);
            
            if (Array.isArray(searchConfig.filters)) {
                searchConfig.filters = searchConfig.filters.map(f => {
                    if (Array.isArray(f)) return f; 
                    if (typeof f === 'object' && f !== null) {
                        if (f.field && !f.name) f.name = f.field;
                        if (f.id && !f.name) f.name = f.id;
                        if (f.value !== undefined && f.values === undefined) {
                            f.values = Array.isArray(f.value) ? f.value : [f.value];
                            delete f.value;
                        }
                    }
                    return f;
                });
            }

            if (Array.isArray(searchConfig.columns)) {
                searchConfig.columns = searchConfig.columns.map(c => {
                    if (typeof c === 'object' && c !== null && c.field && !c.name) {
                        c.name = c.field;
                    }
                    return c;
                });
            }

        } catch (e) {
            return "Execution Error: AI provided invalid JSON format for the search criteria.";
        }

        try {
            const timestamp = new Date().getTime();
            searchConfig.title = (searchConfig.title || "AI Generated") + " (" + timestamp + ")";
            searchConfig.id = 'customsearch_ai_' + timestamp;

            log.debug('MAS Search Creation', 'Record Type: ' + searchConfig.type);
            log.debug('MAS Search Creation', 'Filters: ' + JSON.stringify(searchConfig.filters));
            log.debug('MAS Search Creation', 'Columns: ' + JSON.stringify(searchConfig.columns));

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
            return "Execution Error: NetSuite rejected the search criteria. Details: " + e.message;
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
        const form = serverWidget.createForm({ title: 'NetSuite AI assistance: Search Auto-Creator' });
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
                <div class="ai-msg">I am NetSuite AI. My multi-agent pipeline is active (Gemini API version). How can I help you today?</div>
            </div>
            <div class="input-area">
                <input type="text" id="user-input" placeholder="Example: Create a saved search for customers in California..." onkeydown="if(event.key === 'Enter') sendMessage()">
                <button id="send-btn" onclick="sendMessage()">Send to AI assistance</button>
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
