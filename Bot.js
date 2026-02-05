/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Project Jules: Multi-Agent System (MAS) for NetSuite
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, https, serverWidget, runtime, log, record, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';
    // Maximum retries if Agent 3 finds an error
    const MAX_RETRIES = 1; 

    // ========================================================================
    // 1. TOOL DEFINITIONS (Available to Agent 2)
    // ========================================================================
    const TOOLS_SCHEMA = [
        {
            name: "run_suiteql",
            description: "Executes SuiteQL. Use for searching data or answering questions.",
            parameters: {
                type: "OBJECT",
                properties: { query: { type: "STRING", description: "SQL query" } },
                required: ["query"]
            }
        },
        {
            name: "create_record",
            description: "Creates a NetSuite record.",
            parameters: {
                type: "OBJECT",
                properties: {
                    recordType: { type: "STRING", description: "Record ID (e.g. customer)" },
                    fieldData: { type: "OBJECT", description: "Field ID/Value pairs" }
                },
                required: ["recordType", "fieldData"]
            }
        },
        {
            name: "analyze_saved_search",
            description: "Loads a Saved Search by ID.",
            parameters: {
                type: "OBJECT",
                properties: { searchId: { type: "STRING" } },
                required: ["searchId"]
            }
        },
        {
            name: "create_saved_search",
            description: "Creates a new Saved Search.",
            parameters: {
                type: "OBJECT",
                properties: {
                    type: { type: "STRING" },
                    title: { type: "STRING" },
                    columns: { type: "ARRAY" }
                },
                required: ["type", "title"]
            }
        },
        {
            name: "analyze_image_input",
            description: "Analyzes uploaded image context.",
            parameters: {
                type: "OBJECT",
                properties: { intent: { type: "STRING" } },
                required: ["intent"]
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
            // High timeout for multi-agent chain
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            
            try {
                var rawApiKey = runtime.getCurrentScript().getParameter({ name: 'custscript_open_ai_api_key' });
                if (!rawApiKey) throw new Error("Missing API Key.");
                var apiKey = rawApiKey.trim();

                var body = JSON.parse(context.request.body);
                var userPrompt = body.prompt;
                var imageBase64 = body.imageBase64 || null;

                // --- START MULTI-AGENT PIPELINE ---
                
                // 1. Agent 1: Analysis & Intent
                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                var analysis = runAgent1_Analysis(userPrompt, imageBase64, apiKey);
                
                // 2. Agent 2: Execution (The "Main" Agent)
                log.debug('Pipeline', 'Starting Agent 2 (Execution)...');
                var executionResult = runAgent2_Execution(analysis, apiKey);
                
                // 3. Agent 3: Accuracy Check (The "Auditor")
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                var audit = runAgent3_Audit(userPrompt, executionResult, apiKey);

                // RETRY LOOP: If Agent 3 is not satisfied, we try Agent 2 again once
                if (!audit.satisfied) {
                    log.audit('Pipeline Retry', 'Agent 3 failed content. Reason: ' + audit.reason);
                    var retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                    // We assume the retry is "good enough" to proceed to avoid infinite loops
                }

                // 4. Agent 4: Formatting (The "Designer")
                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                var formattedHtml = runAgent4_Format(executionResult, apiKey);

                // 5. Agent 5: Final Review (The "Gatekeeper")
                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                var finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed"
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

    /** AGENT 1: ANALYST - Understands User Intent */
    function runAgent1_Analysis(prompt, image, key) {
        var systemPrompt = "You are Agent 1 (Analyst). Analyze the user request. \n" +
                           "Identify the user's core intent and extract specific entities (names, dates, IDs). \n" +
                           "Do NOT execute tools. Just explain strictly WHAT needs to be done for the next agent.";
        
        // Pass image here if exists so Agent 1 can "see"
        return callGeminiGeneric(systemPrompt + "\nUser Request: " + prompt, key, image);
    }

    /** AGENT 2: EXECUTOR - Uses Tools & Runs Code */
    function runAgent2_Execution(planFromAgent1, key) {
        // This function uses the Function Calling Logic
        var decision = callGeminiDecision(planFromAgent1, key, TOOLS_SCHEMA);
        
        if (decision.functionCall) {
            var fn = decision.functionCall;
            try {
                if (fn.name === 'run_suiteql') return executeSuiteQL(fn.args.query);
                if (fn.name === 'create_record') return executeCreateRecord(fn.args.recordType, fn.args.fieldData);
                if (fn.name === 'analyze_saved_search') return executeSavedSearchAnalysis(fn.args.searchId);
                if (fn.name === 'create_saved_search') return executeCreateSearch(fn.args.type, fn.args.title, fn.args.columns);
                if (fn.name === 'analyze_image_input') return "Image analyzed. Intent confirmed: " + fn.args.intent;
                return "Error: Unknown Tool " + fn.name;
            } catch (e) {
                return "Execution Error: " + e.message;
            }
        } else {
            // Agent 2 decided no tool was needed (just chat)
            return decision.text;
        }
    }

    /** AGENT 3: AUDITOR - Checks Accuracy (Returns JSON) */
    function runAgent3_Audit(originalPrompt, resultData, key) {
        var systemPrompt = "You are Agent 3 (Auditor). Compare the User Request with the Execution Result. \n" +
                           "Check for: 1) Data accuracy (did we get what was asked?) 2) Errors. \n" +
                           "Return JSON ONLY: { \"satisfied\": boolean, \"reason\": string }";
        
        var content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        var response = callGeminiGeneric(systemPrompt + "\n" + content, key);
        
        try {
            // Clean markdown if present
            var jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            log.error('Agent 3 JSON Parse Fail', response);
            return { satisfied: true, reason: "Auditor failed to parse, proceeding." }; // Fail open
        }
    }

    /** AGENT 4: FORMATTER - Creates HTML */
    function runAgent4_Format(rawData, key) {
        var systemPrompt = "You are Agent 4 (Designer). Convert this raw data/text into clean, professional HTML. \n" +
                           "Use <b> for key data, <ul> for lists, and <table> for datasets. \n" +
                           "Do NOT change the data values. Just style it.";
        return callGeminiGeneric(systemPrompt + "\nRaw Data: " + rawData, key);
    }

    /** AGENT 5: REVIEWER - Final Safety Check */
    function runAgent5_Review(originalPrompt, htmlContent, key) {
        var systemPrompt = "You are Agent 5 (Reviewer). Review this HTML response for the user. \n" +
                           "Ensure it directly answers: '" + originalPrompt + "'. \n" +
                           "If it is good, return the HTML exactly as is. \n" +
                           "If it is bad/harmful, return a polite error message.";
        return callGeminiGeneric(systemPrompt + "\nProposed Response: " + htmlContent, key);
    }

    // ========================================================================
    // 4. API HELPERS
    // ========================================================================

    // Generic Text-Only Call (Used by Agents 1, 3, 4, 5)
    function callGeminiGeneric(prompt, key, imageBase64) {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + key;
        var parts = [{ text: prompt }];
        
        if (imageBase64) {
            parts.push({ inline_data: { mime_type: "image/jpeg", data: imageBase64 } });
        }

        var response = https.post({
            url: url,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });
        
        if (response.code !== 200) throw new Error("Agent API Error: " + response.body);
        return JSON.parse(response.body).candidates[0].content.parts[0].text;
    }

    // Function Calling Special Call (Used by Agent 2)
    function callGeminiDecision(prompt, key, tools) {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + key;
        var response = https.post({
            url: url,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ function_declarations: tools }],
                tool_config: { function_calling_config: { mode: "AUTO" } }
            })
        });
        
        if (response.code !== 200) throw new Error("Agent 2 API Error: " + response.body);
        var candidate = JSON.parse(response.body).candidates[0].content.parts[0];
        
        return candidate.functionCall ? { functionCall: candidate.functionCall } : { text: candidate.text };
    }

    // ========================================================================
    // 5. NATIVE IMPLEMENTATION (The Hands)
    // ========================================================================
    
    function executeSuiteQL(q) {
        var res = query.runSuiteQL({ query: q.replace(/```sql/g,'').trim() });
        var rows = res.asMappedResults().slice(0, 50);
        return rows.length ? JSON.stringify(rows) : "No records found.";
    }

    function executeCreateRecord(type, data) {
        var rec = record.create({ type: type, isDynamic: true });
        for (var k in data) {
            if (k.includes('date')) rec.setValue({ fieldId: k, value: new Date(data[k]) });
            else rec.setValue({ fieldId: k, value: data[k] });
        }
        return "Success: Created " + type + " ID: " + rec.save();
    }

    function executeSavedSearchAnalysis(sid) {
        var s = search.load({ id: sid });
        var res = [];
        s.run().each(function(r) {
            var row = {};
            r.columns.forEach(function(c) { row[c.name] = r.getValue(c); });
            res.push(row);
            return res.length < 20;
        });
        return JSON.stringify(res);
    }

    function executeCreateSearch(type, title, cols) {
        var s = search.create({ type: type, title: "Jules: "+title, columns: cols });
        return "Success: Created Search ID " + s.save();
    }

    // ========================================================================
    // 6. UI RENDERER (Same as before)
    // ========================================================================
    function renderUI(context) {
        var form = serverWidget.createForm({ title: 'Jules: Multi-Agent System' });
        var html = form.addField({ id: 'html', type: 'inlinehtml', label: ' ' });
        html.defaultValue = `
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f4f6f9; }
                #box { height: 500px; overflow-y: scroll; background: white; padding: 20px; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 10px; }
                .ai { background: #e8f0fe; padding: 10px; border-radius: 10px; margin: 5px 0; max-width: 80%; }
                .user { background: #007bff; color: white; padding: 10px; border-radius: 10px; margin: 5px 0; max-width: 80%; float: right; clear: both; }
                input { width: 70%; padding: 10px; }
                button { padding: 10px 20px; background: #28a745; color: white; border: none; cursor: pointer; }
            </style>
            <div id="box"></div>
            <div>
                <input type="text" id="in" placeholder="Ask Jules..." onkeydown="if(event.key==='Enter') send()">
                <button onclick="send()">Send</button>
            </div>
            <script>
                async function send() {
                    var input = document.getElementById('in');
                    var box = document.getElementById('box');
                    var txt = input.value;
                    if(!txt) return;
                    
                    box.innerHTML += '<div class="user">'+txt+'</div>';
                    input.value = '';
                    box.innerHTML += '<div id="load" class="ai"><i>Agents are working (Analysis -> Execution -> Audit -> Format -> Review)...</i></div>';
                    
                    var res = await fetch(window.location.href, { 
                        method: 'POST', 
                        body: JSON.stringify({ prompt: txt }) 
                    });
                    var data = await res.json();
                    
                    document.getElementById('load').remove();
                    if(data.error) box.innerHTML += '<div class="ai" style="color:red">'+data.error+'</div>';
                    else box.innerHTML += '<div class="ai">'+data.answer+'</div>';
                    
                    box.scrollTop = box.scrollHeight;
                }
            </script>
        `;
        context.response.writePage(form);
    }

    return { onRequest: onRequest };
});