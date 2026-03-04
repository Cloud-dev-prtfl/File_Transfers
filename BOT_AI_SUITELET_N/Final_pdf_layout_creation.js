/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @Description NetSuite AI Assistance - PDF Generator (BFO XML) via Multi-Agent System
 */
define(['N/query', 'N/https', 'N/ui/serverWidget', 'N/runtime', 'N/log', 'N/render', 'N/file', 'N/search'], 
function(query, https, serverWidget, runtime, log, render, file, search) {

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const MAX_PIPELINE_RETRIES = 2; // Allows 3 total attempts to fix XML parsing errors

    // ========================================================================
    // 1. TOOL DEFINITIONS (PDF Generation Focused)
    // ========================================================================
    
    const ANALYST_TOOLS_SCHEMA = [
        {
            name: "get_bfo_xml_reference",
            description: "Acts as the NetSuite Help Center guide for valid BFO (Big Faceless Organization) XML rules. MUST use this to understand the strict XML layout constraints before planning the PDF structure.",
            parameters: { type: "OBJECT", properties: {} }
        }
    ];

    const TOOLS_SCHEMA = [
        {
            name: "get_bfo_xml_reference",
            description: "Returns the NetSuite strict rules for BFO XML formatting. Use to prevent SAX Parsing errors.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "run_suiteql",
            description: "Executes SuiteQL to fetch raw data. Use this if the user asks to populate the PDF with actual data from NetSuite (e.g., fetching a specific Invoice or Customer).",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
        },
        {
            name: "create_pdf_document",
            description: "Compiles the BFO XML string into a PDF file in NetSuite and saves it to the File Cabinet.",
            parameters: {
                type: "OBJECT",
                properties: {
                    file_name: { type: "STRING", description: "The name of the PDF file (e.g., 'Monthly_Report.pdf')." },
                    bfo_xml_content: { 
                        type: "STRING", 
                        description: "The COMPLETE, strictly valid XML string. Must begin with <?xml version=\"1.0\"?> and the root tag must be <pdf>. All HTML tags must be properly closed." 
                    }
                },
                required: ["file_name", "bfo_xml_content"]
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

                // --- 3-ATTEMPT RETRY LOOP (Crucial for fixing XML syntax errors) ---
                let retryCount = 0;
                while (!audit.satisfied && retryCount < MAX_PIPELINE_RETRIES) {
                    retryCount++;
                    log.audit('Pipeline Retry ' + retryCount, 'Reason: ' + audit.reason);
                    
                    let retryPrompt = "Attempt " + retryCount + " failed. Auditor Reason: " + audit.reason + "\n" +
                                      "CRITICAL INSTRUCTION: Read the auditor reason carefully. If the error was a SAXParseException, your XML is invalid. You MUST fix unclosed tags (like <img>, <br>, or <hr>), escape ampersands (&amp;), and ensure you are strictly following the BFO XML standard.";
                                      
                    executionResult = runAgent2_Execution(retryPrompt, apiKey); 
                    audit = runAgent3_Audit(userPrompt, executionResult, apiKey);
                }

                log.debug('Pipeline', 'Starting Agent 4 (Format)...');
                let formattedHtml = runAgent4_Format(executionResult, apiKey);

                log.debug('Pipeline', 'Starting Agent 5 (Review)...');
                let finalOutput = runAgent5_Review(userPrompt, formattedHtml, apiKey);

                context.response.write(JSON.stringify({ 
                    answer: finalOutput,
                    pipelineStats: "PDF Generation Pipeline Executed (Retries: " + retryCount + ")"
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
        const maxSteps = 3; 
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 1 (Analyst). Analyze the user's PDF layout request. \n" +
                                 "CRITICAL RULE: You MUST call 'get_bfo_xml_reference' FIRST to understand NetSuite's strict PDF generation constraints.\n" +
                                 "Once you understand the layout rules, write a plain-text instruction manual for Agent 2 detailing exactly how to structure the XML/HTML elements to achieve the user's design. Do NOT output the raw XML yourself.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, ANALYST_TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                try {
                    if (fn.name === 'get_bfo_xml_reference') {
                        let toolResult = executeGetBfoReference();
                        conversationHistory += "\n\nTool 'get_bfo_xml_reference' executed. Rules:\n" + toolResult;
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
        const maxSteps = 4; 
        
        for (let i = 0; i < maxSteps; i++) {
            const systemPrompt = "You are Agent 2 (Executor). Use the tools to generate the requested PDF. \n" +
                                 "CRITICAL RULE 1: You MUST invoke 'create_pdf_document' to actually create the file. Do not just output the XML code as text.\n" +
                                 "CRITICAL RULE 2: If the plan requires dynamic data, use 'run_suiteql' to fetch it first.\n" +
                                 "CRITICAL RULE 3: Your XML must be flawless. Ensure all tags are closed (e.g., <br/> instead of <br>) to avoid SAX parse errors.";
            
            const decision = callGemini(systemPrompt + "\n\nCurrent Context:\n" + conversationHistory, key, TOOLS_SCHEMA);
            
            if (decision.functionCall) {
                const fn = decision.functionCall;
                let toolResult = "";
                
                try {
                    if (fn.name === 'get_bfo_xml_reference') {
                        toolResult = executeGetBfoReference();
                        conversationHistory += "\n\nTool 'get_bfo_xml_reference' executed. Rules:\n" + toolResult;
                    }
                    else if (fn.name === 'create_pdf_document') {
                        return executeCreatePdf(fn.args.file_name, fn.args.bfo_xml_content); 
                    } 
                    else if (fn.name === 'run_suiteql') {
                        toolResult = executeSuiteQL(fn.args.query); 
                        conversationHistory += "\n\nTool 'run_suiteql' executed. Data:\n" + toolResult;
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
                    conversationHistory += "\n\nAI Output: " + outputText + "\nSystem Instruction: You MUST invoke the 'create_pdf_document' tool to compile the XML into a PDF.";
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
                             "1. If the Execution Result does NOT contain 'status: Success', return satisfied: false.\n" +
                             "2. If the Execution Result contains 'SAXParseException' or 'XML parsing failed', return satisfied: false and explicitly output the exact error message so Agent 2 can fix its XML syntax.\n" +
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
                             "If the raw data contains a success message and a NetSuite relative link, create a large, prominent active HTML <a> tag button for downloading the PDF. \n" +
                             "If it is an error message, format it clearly.\n" +
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

        // --- NEW SAFETY CHECK ADDED HERE ---
        if (!resBody.candidates || !resBody.candidates[0]) {
            throw new Error("Invalid API Response: Missing candidates block. Full response: " + response.body);
        }

        let candidate = resBody.candidates[0];

        // Sometimes the Gemini API trips a safety filter (especially with emails/names from SuiteQL)
        // When this happens, it omits the "content" entirely and just sends a finishReason.
        if (!candidate.content || !candidate.content.parts) {
            throw new Error("Gemini API omitted content parts. Finish Reason: " + (candidate.finishReason || 'Unknown'));
        }

        let parts = candidate.content.parts;
        // ------------------------------------

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

    function executeGetBfoReference() {
        return `
        NETSUITE BFO XML STRICT REFERENCE GUIDE:
        
        1. STRUCTURE: The document MUST begin with exactly: <?xml version="1.0"?>
           The root tag MUST be <pdf>. Inside <pdf>, you MUST have <head> and <body>.
           Example: 
           <?xml version="1.0"?>
           <pdf>
             <head>
               <style> body { font-family: Helvetica; font-size: 10pt; } th { font-weight: bold; } </style>
             </head>
             <body>
               <h1>Report</h1>
             </body>
           </pdf>
           
        2. STRICT HTML RULES (SAX Parsing):
           - ALL tags must be explicitly closed. <br> will cause a crash. You MUST use <br/>.
           - <img> must be <img />. <hr> must be <hr/>.
           - Ampersands must be escaped as &amp;.
           
        3. LAYOUT RESTRICTIONS:
           - CSS Flexbox (display: flex) and Grid (display: grid) DO NOT WORK in BFO. 
           - To create multi-column layouts, you MUST use HTML <table>, <tr>, and <td> tags.
           - CSS properties like 'float' are highly unreliable. Use Tables for alignment.
        `;
    }

    function executeSuiteQL(q) {
        try {
            let cleanQuery = q.replace(/```sql/gi,'').replace(/```/g,'').trim();
            let res = query.runSuiteQL({ query: cleanQuery });
            let rows = res.asMappedResults().slice(0, 50); // Cap at 50 to prevent token limits
            return rows.length ? JSON.stringify(rows) : "No records found.";
        } catch(e) {
            return "SuiteQL Error: " + e.message;
        }
    }

    function executeCreatePdf(fileName, xmlContent) {
        let fileId = null;
        try {
            // Clean up common AI markdown hallucinations
            let cleanXml = xmlContent.replace(/```xml/gi, "").replace(/```html/gi, "").replace(/```/g, "").trim();
            
            // Safety enforcement: Ensure basic XML structure exists
            if (!cleanXml.startsWith('<?xml')) {
                cleanXml = '<?xml version="1.0"?>\n' + cleanXml;
            }
            if (!cleanXml.includes('<pdf>')) {
                cleanXml = cleanXml.replace('<body>', '<pdf>\n<body>').replace('</body>', '</body>\n</pdf>');
            }

            log.debug('MAS PDF Generation', 'Executing render.xmlToPdf...');
            
            let pdfFile = render.xmlToPdf({ xmlString: cleanXml });
            pdfFile.name = fileName.endsWith('.pdf') ? fileName : fileName + '.pdf';
            
            // Locate a safe top-level folder to store the PDF (Fallback to root if none found)
            let folderSearch = search.create({
                type: 'folder',
                filters: [['istoplevel', 'is', 'T'], 'AND', ['isinactive', 'is', 'F']],
                columns: ['internalid']
            }).run().getRange({ start: 0, end: 1 });

            if (folderSearch && folderSearch.length > 0) {
                pdfFile.folder = folderSearch[0].id;
            }

            fileId = pdfFile.save();
            let savedFile = file.load({ id: fileId });

            return JSON.stringify({
                status: "Success",
                message: "Created PDF Document: " + pdfFile.name,
                internalId: fileId,
                link: savedFile.url
            });

        } catch (e) {
            log.error('PDF Generation Rejected', e.message + " | Payload Preview: " + xmlContent.substring(0, 500));
            return "Execution Error: XML parsing failed. NetSuite rejected the layout. Details: " + e.message;
        }
    }

    // ========================================================================
    // 6. UI RENDERER 
    // ========================================================================
    function renderUI(context) {
        const form = serverWidget.createForm({ title: 'NetSuite AI Assistance: PDF Layout Generator' });
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
                a { color: #1a73e8; text-decoration: none; font-weight: 600; padding: 8px 15px; border: 1px solid #1a73e8; border-radius: 6px; display: inline-block; margin-top: 5px; }
                a:hover { background-color: #f1f8ff; }
            </style>
            <div id="chat-box">
                <div class="ai-msg">I am NetSuite AI. My Multi-Agent Pipeline is now configured for BFO PDF Generation. Describe the layout you need!</div>
            </div>
            <div class="input-area">
                <input type="text" id="user-input" placeholder="Example: Create a Monthly Expense PDF with a table showing Date, Item, and Amount..." onkeydown="if(event.key === 'Enter') sendMessage()">
                <button id="send-btn" onclick="sendMessage()">Generate PDF</button>
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
                    box.innerHTML += '<div id="' + loadingId + '" class="loader">Executing Pipeline: Analysis -> Layout Generation -> PDF Compilation -> Syntax Audit -> Format...</div>';
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
