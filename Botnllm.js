/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description Project Jules: Multi-Agent System using native N/llm
 */
define(['N/query', 'N/llm', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/record', 'N/search'], 
function(query, llm, serverWidget, runtime, log, record, search) {

    // Maximum retries if Agent 3 finds an error
    const MAX_RETRIES = 1; 

    // ========================================================================
    // 1. MAIN REQUEST HANDLER
    // ========================================================================
    function onRequest(context) {
        if (context.request.method === 'GET') {
            renderUI(context);
        }
        else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            
            try {
                var body = JSON.parse(context.request.body);
                var userPrompt = body.prompt;

                // --- START MULTI-AGENT PIPELINE ---
                
                // 1. Agent 1: Analysis & Intent
                log.debug('Pipeline', 'Starting Agent 1 (Analysis)...');
                var analysis = runAgent1_Analysis(userPrompt);
                
                // 2. Agent 2: Execution (The "Main" Agent)
                log.debug('Pipeline', 'Starting Agent 2 (Execution)...');
                var executionResult = runAgent2_Execution(analysis);
                
                // 3. Agent 3: Accuracy Check (The "Auditor")
                log.debug('Pipeline', 'Starting Agent 3 (Audit)...');
                var audit = runAgent3_Audit(userPrompt, executionResult);

                // RETRY LOOP: If Agent 3 is not satisfied, we try Agent 2 again once
                if (!audit.satisfied) {
                    log.audit('Pipeline Retry', 'Agent 3 failed content. Reason: ' + audit.reason);
                    var retryPrompt = "Previous attempt failed. Auditor Reason: " + audit.reason + ". \nOriginal Request: " + analysis;
                    executionResult = runAgent2_Execution(retryPrompt); 
                }

                // 4. Agent 4: Formatting (The "Designer")
                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                var formattedHtml = runAgent4_Format(executionResult);

                // 5. Agent 5: Final Review (The "Gatekeeper")
                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                var finalOutput = runAgent5_Review(userPrompt, formattedHtml);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "5 Agents Executed via N/llm"
                }));

            } catch (e) {
                log.error('Pipeline Error', e.message);
                context.response.write(JSON.stringify({ error: "Pipeline Error: " + e.message }));
            }
        }
    }

    // ========================================================================
    // 2. THE 5 AGENTS
    // ========================================================================

    /** AGENT 1: ANALYST - Understands User Intent */
    function runAgent1_Analysis(prompt) {
        var systemPrompt = "You are Agent 1 (Analyst). Analyze the user request. \n" +
                           "Identify the user's core intent and extract specific entities (names, dates, IDs). \n" +
                           "Do NOT execute tools. Just explain strictly WHAT needs to be done for the next agent.";
        
        return callLLMGeneric(systemPrompt + "\nUser Request: " + prompt);
    }

    /** AGENT 2: EXECUTOR - Uses Prompt-Based JSON Tool Calling */
    function runAgent2_Execution(planFromAgent1) {
        var systemPrompt = "You are Agent 2 (Executor). You have access to specific NetSuite tools. \n" +
            "Based on the analysis provided, you MUST return a valid JSON object specifying which tool to run. \n\n" +
            "AVAILABLE TOOLS:\n" +
            "1. {\"toolName\": \"run_suiteql\", \"arguments\": {\"query\": \"SELECT ...\"}}\n" +
            "2. {\"toolName\": \"create_record\", \"arguments\": {\"recordType\": \"customer\", \"fieldData\": {\"companyname\": \"Test\"}}}\n" +
            "3. {\"toolName\": \"analyze_saved_search\", \"arguments\": {\"searchId\": \"customsearch123\"}}\n" +
            "4. {\"toolName\": \"create_saved_search\", \"arguments\": {\"type\": \"customer\", \"title\": \"New Search\", \"columns\": [\"entityid\"]}}\n" +
            "5. {\"toolName\": \"none\", \"message\": \"Your text response if no tool is needed\"}\n\n" +
            "Return ONLY the JSON object. Do not wrap in markdown or backticks.";

        var rawDecision = callLLMGeneric(systemPrompt + "\nAnalysis Data:\n" + planFromAgent1);
        
        try {
            // Strip markdown block formatting that models sometimes include
            var cleanJson = rawDecision.replace(/```json/g, '').replace(/```/g, '').trim();
            var decision = JSON.parse(cleanJson);

            if (decision.toolName && decision.toolName !== 'none') {
                log.debug('Agent 2 Executing Tool', decision.toolName);
                if (decision.toolName === 'run_suiteql') return executeSuiteQL(decision.arguments.query);
                if (decision.toolName === 'create_record') return executeCreateRecord(decision.arguments.recordType, decision.arguments.fieldData);
                if (decision.toolName === 'analyze_saved_search') return executeSavedSearchAnalysis(decision.arguments.searchId);
                if (decision.toolName === 'create_saved_search') return executeCreateSearch(decision.arguments.type, decision.arguments.title, decision.arguments.columns);
                return "Error: Unknown Tool " + decision.toolName;
            } else {
                return decision.message || rawDecision;
            }
        } catch (e) {
            log.error('Agent 2 JSON Parse Error', e.message + ' | Raw Output: ' + rawDecision);
            return "Execution Failed. The model did not return valid JSON. Raw output: " + rawDecision;
        }
    }

    /** AGENT 3: AUDITOR - Checks Accuracy (Returns JSON) */
    function runAgent3_Audit(originalPrompt, resultData) {
        var systemPrompt = "You are Agent 3 (Auditor). Compare the User Request with the Execution Result. \n" +
                           "Check for: 1) Data accuracy (did we get what was asked?) 2) Errors. \n" +
                           "Return strictly JSON ONLY: { \"satisfied\": boolean, \"reason\": string }";
        
        var content = "User Request: " + originalPrompt + "\nExecution Result: " + resultData;
        var response = callLLMGeneric(systemPrompt + "\n" + content);
        
        try {
            var jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            log.error('Agent 3 Parse Fail', response);
            return { satisfied: true, reason: "Auditor failed to parse JSON, proceeding to avoid loop." }; 
        }
    }

    /** AGENT 4: FORMATTER - Creates HTML */
    function runAgent4_Format(rawData) {
        var systemPrompt = "You are Agent 4 (Designer). Convert this raw data/text into clean, professional HTML. \n" +
                           "Use <b> for key data, <ul> for lists, and <table> for datasets. \n" +
                           "Do NOT change the data values. Just style it.";
        return callLLMGeneric(systemPrompt + "\nRaw Data: " + rawData);
    }

    /** AGENT 5: REVIEWER - Final Safety Check */
    function runAgent5_Review(originalPrompt, htmlContent) {
        var systemPrompt = "You are Agent 5 (Reviewer). Review this HTML response for the user. \n" +
                           "Ensure it directly answers: '" + originalPrompt + "'. \n" +
                           "If it is good, return the HTML exactly as is. \n" +
                           "If it is bad/harmful, return a polite error message.";
        return callLLMGeneric(systemPrompt + "\nProposed Response: " + htmlContent);
    }

    // ========================================================================
    // 3. API HELPERS (Native N/llm)
    // ========================================================================

    function callLLMGeneric(promptText) {
        try {
            var response = llm.generateText({
                prompt: promptText
            });
            return response.text;
        } catch (e) {
            log.error('OCI GenAI API Error', e.message);
            throw new Error("Generative AI Service Error: " + e.message);
        }
    }

    // ========================================================================
    // 4. NATIVE IMPLEMENTATION (The Hands)
    // ========================================================================
    
    function executeSuiteQL(q) {
        // Strip markdown if the AI includes it in the query string
        var cleanQuery = q.replace(/```sql/g,'').replace(/```/g,'').trim();
        var res = query.runSuiteQL({ query: cleanQuery });
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
    // 5. UI RENDERER 
    // ========================================================================
    function renderUI(context) {
        var form = serverWidget.createForm({ title: 'Jules: Native NetSuite MAS' });
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
                    box.innerHTML += '<div id="load" class="ai"><i>Agents are working using Oracle GenAI (Analysis -> Execution -> Audit -> Format -> Review)...</i></div>';
                    
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
