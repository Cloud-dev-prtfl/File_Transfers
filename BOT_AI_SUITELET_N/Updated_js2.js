/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description NetSuite AI Assistance - Transaction Creator (Manually Fed / OCR Text)
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, https, serverWidget, runtime, log, record, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const MAX_PIPELINE_RETRIES = 2; // Allows 3 total attempts to fix missing fields or invalid IDs

    // Helper: Formats today's date for AI context
    function getTodayString() {
        const d = new Date();
        return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
    }

    // ========================================================================
    // 1. TOOL DEFINITIONS (Transaction Creation Focused)
    // ========================================================================
    
    const ANALYST_TOOLS_SCHEMA = [
        {
            name: "get_record_fields",
            description: "Fetches valid NetSuite internal body AND sublist field IDs for a given record type.",
            parameters: {
                type: "OBJECT",
                properties: {
                    record_type: { type: "STRING", description: "The internal ID of the NetSuite record (e.g., 'salesorder', 'vendorbill', 'journalentry')." }
                },
                required: ["record_type"]
            }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL queries. MUST use this to verify if Entities (Customers/Vendors) or Items exist and to find their internal IDs.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
        }
    ];

    const TOOLS_SCHEMA = [
        {
            name: "get_record_fields",
            description: "Fetches valid NetSuite internal body AND sublist field IDs for a given record type.",
            parameters: { type: "OBJECT", properties: { record_type: { type: "STRING" } }, required: ["record_type"] }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL to fetch Internal IDs. NetSuite records CANNOT be created using names; you MUST look up internal IDs for entities, items, terms, etc.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
        },
        {
            name: "create_transaction_record",
            description: "Creates a NetSuite Transaction record dynamically.",
            parameters: {
                type: "OBJECT",
                properties: {
                    json_config: { 
                        type: "STRING", 
                        description: "A stringified JSON object. Structure MUST be: { \"recordType\": \"salesorder\", \"bodyFields\": { \"entity\": 1234, \"trandate\": \"03/04/2026\" }, \"sublists\": { \"item\": [ { \"item\": 5678, \"quantity\": 2, \"rate\": 100 } ] } }. ALWAYS use internal IDs (numbers) for select fields, never text names." 
                    }
                },
                required: ["json_config"]
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

                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                let analysis = runAgent1_Analysis(userPrompt, apiKey);
                
                log.debug('Pipeline', 'Starting Agent 2 (Execution)...');
                let executionResult = runAgent2_Execution(analysis, apiKey);
                
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                let audit = runAgent3_Audit(userPrompt, executionResult, apiKey);

                // --- 3-ATTEMPT RETRY LOOP (Crucial for missing required fields & invalid IDs) ---
                let retryCount = 0;
                while (!audit.satisfied && retryCount < MAX_PIPELINE_RETRIES) {
                    retryCount++;
                    log.audit('Pipeline Retry ' + retryCount, 'Reason: ' + audit.reason);
                    
                    let retryPrompt = "Attempt " + retryCount + " failed. Auditor Reason: " + audit.reason + "\n" +
                                      "CRITICAL INSTRUCTION: Read the error carefully. If you missed a required field, use 'get_record_fields' to find its ID and add it. If you used an invalid reference (like a text string instead of an Internal ID), use 'run_suiteql' to search for the correct numeric internal ID.";
                                      
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                    audit = runAgent3_Audit(userPrompt, executionResult, apiKey);
                }

                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                let formattedHtml = runAgent4_Format(executionResult, apiKey);

                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "Transaction Creation Pipeline Executed (Retries: " + retryCount + ")"
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
        let conversationHistory = "Raw Data/Prompt:\n" + prompt;
        const maxSteps = 3; 
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 1 (Data Analyst). Extract transaction details from the user's raw text/OCR data. \n" +
                                 "Today's Date is: " + getTodayString() + ". \n" +
                                 "CRITICAL RULES:\n" +
                                 "1. Identify the Record Type (e.g., salesorder, vendorbill, journalentry).\n" +
                                 "2. Extract Entity names (Customers/Vendors) and Item names. NetSuite strictly requires their numeric INTERNAL IDs to create records.\n" +
                                 "3. You MUST instruct Agent 2 to use the 'run_suiteql' tool to look up the Internal IDs for these names (e.g., 'SELECT id FROM customer WHERE companyname LIKE...').\n" +
                                 "Write a plain-text instruction manual for Agent 2 detailing what internal IDs to lookup and the exact JSON structure to build. Do NOT execute JSON yourself.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, ANALYST_TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                try {
                    if (fn.name === 'get_record_fields') {
                        let toolResult = executeGetRecordSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'get_record_fields' executed. Schema:\n" + toolResult;
                    } else if (fn.name === 'run_suiteql') {
                        let toolResult = executeSuiteQL(fn.args.query);
                        conversationHistory += "\n\nTool 'run_suiteql' executed. Result:\n" + toolResult;
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
            const systemPrompt = "You are Agent 2 (Executor). Follow Agent 1's plan to create a transaction. \n" +
                                 "CRITICAL RULE 1: NEVER guess Internal IDs. Use 'run_suiteql' to search for Entities, Items, Locations, or Terms if you don't know their exact numeric ID.\n" +
                                 "CRITICAL RULE 2: Date fields MUST be formatted as 'MM/DD/YYYY'.\n" +
                                 "CRITICAL RULE 3: Once you have ALL the correct Internal IDs, invoke 'create_transaction_record' to push the data into NetSuite.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                let toolResult = "";
                
                try {
                    if (fn.name === 'get_record_fields') {
                        toolResult = executeGetRecordSchema(fn.args.record_type);
                        conversationHistory += "\n\nTool 'get_record_fields' executed. Schema:\n" + toolResult;
                    } 
                    else if (fn.name === 'run_suiteql') {
                        toolResult = executeSuiteQL(fn.args.query); 
                        conversationHistory += "\n\nTool 'run_suiteql' executed. Data:\n" + toolResult;
                        log.debug('Agent 2 Lookups', 'Executed QL: ' + fn.args.query);
                    } 
                    else if (fn.name === 'create_transaction_record') {
                        let jsonConfigStr = typeof fn.args.json_config === 'string' ? fn.args.json_config : JSON.stringify(fn.args.json_config);
                        return executeCreateTransaction(jsonConfigStr); 
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
                    conversationHistory += "\n\nAI Output: " + outputText + "\nSystem Instruction: You MUST invoke the 'create_transaction_record' tool to finalize the creation.";
                    continue;
                } else {
                    return outputText || "Agent 2 failed to execute a tool.";
                }
            }
        }
        
        return "Execution Error: Agent 2 hit maximum loop steps. Context: " + conversationHistory;
    }

    function runAgent3_Audit(originalPrompt, resultData, key) {
        const systemPrompt = "You are Agent 3 (Auditor). Compare the Execution Result with NetSuite's strict API rules. \n" +
                             "1. If the Execution Result does NOT contain 'status: Success', return satisfied: false.\n" +
                             "2. If the Execution Result contains errors like 'Please enter value(s) for', return satisfied: false and instruct Agent 2 to add the missing required fields.\n" +
                             "3. If the Execution Result contains 'Invalid reference' or 'Invalid internal ID', return satisfied: false and explicitly tell Agent 2 it MUST use 'run_suiteql' to look up the correct numeric ID instead of using a text string.\n" +
                             "Return ONLY raw JSON: { \"satisfied\": boolean, \"reason\": string }.";
        
        const content = "Execution Result: " + resultData;
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
                             "If the transaction was created successfully, extract the Internal ID from the raw data and display a bright success message.\n" +
                             "If it is an error message, format it clearly so the user understands what data was missing or invalid.\n" +
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

        if (!resBody.candidates || !resBody.candidates[0]) {
            throw new Error("Invalid API Response: Missing candidates block.");
        }

        let candidate = resBody.candidates[0];

        if (!candidate.content || !candidate.content.parts) {
            throw new Error("Gemini API omitted content parts. Finish Reason: " + (candidate.finishReason || 'Unknown'));
        }

        let parts = candidate.content.parts;
        
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

    function executeGetRecordSchema(recordType) {
        try {
            let dummyRec = record.create({ type: recordType, isDynamic: true });
            let bodyFields = dummyRec.getFields();
            let availableSublists = dummyRec.getSublists();
            
            let schema = { 
                status: "Success", 
                recordType: recordType, 
                bodyFields: bodyFields, 
                sublists: {} 
            };
            
            // To prevent massive token payloads, we only expose the most common transaction sublists to the AI
            ['item', 'expense', 'line'].forEach(sub => {
                if (availableSublists.includes(sub)) {
                    schema.sublists[sub] = dummyRec.getSublistFields({ sublistId: sub });
                }
            });

            return JSON.stringify(schema);
        } catch (e) {
            return JSON.stringify({ status: "Error", message: "Failed to load schema for " + recordType + ". Error: " + e.message });
        }
    }

    function executeSuiteQL(q) {
        try {
            let cleanQuery = q.replace(/```sql/gi,'').replace(/```/g,'').trim();
            let res = query.runSuiteQL({ query: cleanQuery });
            let rows = res.asMappedResults().slice(0, 50); 
            return rows.length ? JSON.stringify(rows) : "No records found matching your query.";
        } catch(e) {
            return "SuiteQL Error: " + e.message;
        }
    }

    function executeCreateTransaction(jsonConfigString) {
        let config;
        try {
            let extracted = extractJSON(jsonConfigString);
            config = JSON.parse(extracted);
        } catch (e) {
            return "Execution Error: AI provided invalid JSON format for the transaction config.";
        }

        try {
            log.debug('MAS Transaction Creation', 'Attempting creation for: ' + config.recordType);
            
            // Initialize the dynamic record
            let rec = record.create({ type: config.recordType, isDynamic: true });

            // 1. Set Body Fields
            if (config.bodyFields && typeof config.bodyFields === 'object') {
                for (let fieldId in config.bodyFields) {
                    try {
                        let val = config.bodyFields[fieldId];
                        
                        // NetSuite is strict about Date objects vs Strings.
                        // If the AI passes a string like "03/04/2026", we use setText to let NetSuite parse it safely.
                        if (typeof val === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
                            rec.setText({ fieldId: fieldId, text: val });
                        } else {
                            rec.setValue({ fieldId: fieldId, value: val });
                        }
                    } catch (e) {
                        log.error('MAS Set Field Error', 'Failed on Body Field [' + fieldId + ']: ' + e.message);
                    }
                }
            }

            // 2. Set Sublists (Items, Expenses, Journal Lines, etc.)
            if (config.sublists && typeof config.sublists === 'object') {
                for (let sublistId in config.sublists) {
                    let lines = config.sublists[sublistId];
                    if (Array.isArray(lines)) {
                        for (let i = 0; i < lines.length; i++) {
                            rec.selectNewLine({ sublistId: sublistId });
                            
                            for (let lineFieldId in lines[i]) {
                                try {
                                    let val = lines[i][lineFieldId];
                                    if (typeof val === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
                                        rec.setCurrentSublistText({ sublistId: sublistId, fieldId: lineFieldId, text: val });
                                    } else {
                                        rec.setCurrentSublistValue({ sublistId: sublistId, fieldId: lineFieldId, value: val });
                                    }
                                } catch (e) {
                                    log.error('MAS Set Sublist Error', 'Failed on Line Field [' + lineFieldId + ']: ' + e.message);
                                }
                            }
                            rec.commitLine({ sublistId: sublistId });
                        }
                    }
                }
            }

            // 3. Save the Record
            let savedId = rec.save();

            // Provide a generic NetSuite URL redirect string so the user can easily view it
            const genericUrl = '/app/accounting/transactions/transaction.nl?id=' + savedId;

            return JSON.stringify({
                status: "Success",
                message: "Created " + config.recordType.toUpperCase() + " successfully.",
                internalId: savedId,
                link: genericUrl
            });

        } catch (e) {
            log.error('Transaction Creation Rejected', e.message + " | Payload: " + JSON.stringify(config));
            return "Execution Error: NetSuite rejected the transaction. Details: " + e.message;
        }
    }

    // ========================================================================
    // 6. UI RENDERER 
    // ========================================================================
    function renderUI(context) {
        const form = serverWidget.createForm({ title: 'NetSuite AI Assistance: Transaction Auto-Creator' });
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
                textarea { flex-grow: 1; padding: 12px; border: 1px solid #dadce0; border-radius: 12px; outline: none; resize: vertical; min-height: 50px; }
                button { padding: 12px 25px; cursor: pointer; background: #1a73e8; color: white; border: none; border-radius: 24px; font-weight: bold; transition: background 0.2s; align-self: flex-end; margin-bottom: 5px; }
                button:hover { background: #1557b0; }
                a { color: #1a73e8; text-decoration: none; font-weight: 600; padding: 8px 15px; border: 1px solid #1a73e8; border-radius: 6px; display: inline-block; margin-top: 5px; }
                a:hover { background-color: #f1f8ff; }
            </style>
            <div id="chat-box">
                <div class="ai-msg">I am NetSuite AI. My Multi-Agent Pipeline is now configured to create Transactions. You can paste raw OCR text, email bodies, or type out the transaction details!</div>
            </div>
            <div class="input-area">
                <textarea id="user-input" placeholder="Example: Create a Sales Order for customer 'Aethna Corp'. Add 2 'Apple iPads' at $500 each and set the memo to 'Rush Order'." onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }"></textarea>
                <button id="send-btn" onclick="sendMessage()">Create Transaction</button>
            </div>
            <script>
                async function sendMessage() {
                    var input = document.getElementById('user-input');
                    var box = document.getElementById('chat-box');
                    var btn = document.getElementById('send-btn');
                    var msg = input.value.trim();
                    if(!msg) return;

                    box.innerHTML += '<div class="user-msg">' + msg.replace(/</g, "&lt;").replace(/\\n/g, "<br>") + '</div>';
                    input.value = '';
                    input.disabled = true; btn.disabled = true;
                    
                    var loadingId = 'loading-' + Date.now();
                    box.innerHTML += '<div id="' + loadingId + '" class="loader">Executing Pipeline: Parsing Data -> SQL ID Lookups -> Compiling JSON -> NetSuite Execution...</div>';
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
