/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * * Architectural Blueprint: Autonomous Universal Record Creation Bot
 * Utilizes N/llm to analyze prompts and files, determine target record types,
 * dynamically extract NetSuite schema/fields, map JSON to record fields, 
 * perform active save() validation, and provide an asynchronous conversational frontend.
 */

define(['N/ui/serverWidget', 'N/llm', 'N/record', 'N/query', 'N/file'], 
function (serverWidget, llm, record, query, file) {

    // --- Core Data Processing Functions ---

    /**
     * Placeholder for OCR / Text Extraction.
     * Native NetSuite N/llm (Cohere) does not natively read Images/PDFs. 
     * To process images/PDFs, you would call an external API (Google Vision/AWS) here.
     */
    const extractTextFromFile = (base64Data, fileName, fileType) => {
        if (!base64Data) return "";
        
        // If it's a simple text or CSV file, we can decode the base64 and read it directly
        if (fileType.includes('text') || fileName.endsWith('.csv') || fileName.endsWith('.json')) {
            try {
                // Extract just the base64 payload part
                const base64String = base64Data.split(',')[1] || base64Data;
                // Atob equivalent in SuiteScript 
                const decodedString = encode.convert({
                    string: base64String,
                    inputEncoding: encode.Encoding.BASE_64,
                    outputEncoding: encode.Encoding.UTF_8
                });
                return `[Extracted File Content]: \n${decodedString}`;
            } catch(e) {
                // Fallback
            }
        }

        // For Images and PDFs: This is where you would do an HTTPS post to an OCR service.
        return `[System Note: A file named "${fileName}" of type "${fileType}" was attached. To read text from this image/PDF, an external OCR API integration is required here. Assume the user wants data from this file mapped to the record.]`;
    };

    // --- UI HTML/CSS/JS Payload ---

    const generateChatbotUI = (isQuotaExhausted, genQuota) => {
        const botGreeting = isQuotaExhausted 
            ? 'The AI Record Bot is currently sleeping! 😴 Usage exhausted.' 
            : 'Hello! Upload a document (Invoice, PO, etc.) or just type your request. I will determine the correct NetSuite record type, extract the schema, and build it for you.';
        
        const disableInputAttr = isQuotaExhausted ? 'disabled' : '';

        return `
        <style>
            #bot-workspace { position: relative; display: flex; justify-content: center; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            .quota-badge { position: absolute; top: 20px; left: 20px; background-color: #ffffff; border: 1px solid #d3d8db; border-radius: 8px; padding: 10px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); font-size: 13px; font-weight: bold; color: #4d5f7a; }
            
            #chat-container { width: 100%; max-width: 850px; border: 1px solid #d3d8db; border-radius: 12px; display: flex; flex-direction: column; height: 65vh; min-height: 500px; background-color: #f4f6f9; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            #chat-messages { flex-grow: 1; padding: 25px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
            .chat-message { max-width: 85%; padding: 14px 18px; border-radius: 8px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }
            .user-msg { background-color: #607799; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
            .bot-msg { background-color: white; border: 1px solid #e1e5e8; color: #333; align-self: flex-start; border-bottom-left-radius: 2px; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            .bot-msg pre { background-color: #2b303b; color: #c0c5ce; padding: 15px; border-radius: 6px; overflow-x: auto; font-family: 'Courier New', monospace; margin: 12px 0; font-size: 13px; }
            
            .action-btn { background-color: #e0e6ed; color: #333; border: 1px solid #cdd4dc; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s; }
            .action-btn:hover { background-color: #d1d8e0; }
            .action-btn.view-btn { background-color: #2e7d32; color: white; border-color: #1b5e20; }
            
            #chat-input-area { display: flex; padding: 15px 20px; background-color: white; border-top: 1px solid #d3d8db; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; align-items: center; gap: 10px; flex-wrap: wrap; }
            #chat-input { flex-grow: 1; padding: 12px 15px; border: 1px solid #cdd4dc; border-radius: 6px; font-size: 14px; outline: none; }
            #file-upload-btn { background-color: #f0f2f5; border: 1px solid #cdd4dc; border-radius: 6px; padding: 10px 15px; cursor: pointer; font-size: 16px; transition: background 0.2s; }
            #file-upload-btn:hover { background-color: #e0e6ed; }
            #send-btn { background-color: #4d5f7a; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
            
            #file-indicator { flex-basis: 100%; font-size: 12px; color: #2e7d32; display: none; margin-top: -5px; font-weight: bold;}
            .typing-indicator { font-style: italic; color: #7f8c8d; font-size: 13px; }
            .error-notice { color: #d32f2f; }
        </style>

        <div id="bot-workspace">
            <div class="quota-badge">⚡ AI Usage : ${genQuota} Gen</div>
            
            <div id="chat-container">
                <div id="chat-messages">
                    <div class="chat-message bot-msg">
                        <strong>AI Record Creation Bot</strong><br>
                        ${botGreeting}
                    </div>
                </div>
                <div id="chat-input-area">
                    <input type="file" id="file-input" style="display: none;" onchange="handleFileSelect(event)">
                    <button type="button" id="file-upload-btn" onclick="document.getElementById('file-input').click()" ${disableInputAttr}>📎</button>
                    <input type="text" id="chat-input" placeholder="e.g., Create a vendor bill from this attached invoice..." onkeypress="if(event.key === 'Enter') sendQuery()" ${disableInputAttr} />
                    <button type="button" id="send-btn" onclick="sendQuery()" ${disableInputAttr}>Create Record</button>
                    <div id="file-indicator">📄 Attached: <span id="file-name-text"></span></div>
                </div>
            </div>
        </div>

        <script>
            let currentFileData = null;
            let currentFileName = null;
            let currentFileType = null;

            function handleFileSelect(event) {
                const file = event.target.files[0];
                if (!file) return;

                currentFileName = file.name;
                currentFileType = file.type;
                document.getElementById('file-name-text').textContent = currentFileName;
                document.getElementById('file-indicator').style.display = 'block';

                const reader = new FileReader();
                reader.onload = function(e) {
                    currentFileData = e.target.result; 
                };
                reader.readAsDataURL(file);
            }

            async function sendQuery() {
                const inputField = document.getElementById('chat-input');
                const sendBtn = document.getElementById('send-btn');
                const query = inputField.value.trim();

                if (!query && !currentFileData) return;

                let userDisplayMsg = query;
                if (currentFileName) userDisplayMsg += \` [Attached: \${currentFileName}]\`;
                appendMessage(userDisplayMsg, 'user-msg');
                
                inputField.value = '';
                inputField.disabled = true;
                sendBtn.disabled = true;

                const loadingId = 'loading-' + Date.now();
                appendMessage('1️⃣ Analyzing request... 2️⃣ Extracting Schema... 3️⃣ Generating Record...', 'bot-msg typing-indicator', loadingId);

                const payload = {
                    query: query,
                    fileData: currentFileData,
                    fileName: currentFileName,
                    fileType: currentFileType
                };

                // Clear attachment after sending
                currentFileData = null;
                currentFileName = null;
                document.getElementById('file-indicator').style.display = 'none';
                document.getElementById('file-input').value = '';

                try {
                    const response = await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();
                    document.getElementById(loadingId).remove(); 

                    if (data.success) {
                        const codeId = 'code-' + Date.now();
                        const htmlResponse = \`
                            <strong>✅ Record Created Successfully!</strong><br><br>
                            Type: <strong>\${escapeHtml(data.recordType)}</strong><br>
                            Internal ID: <strong>\${escapeHtml(data.recordId)}</strong><br>
                            <em>Review the generated configuration below:</em>
                            <pre id="\${codeId}">\${escapeHtml(data.recordCode)}</pre>
                            
                            <div style="display:flex; gap:10px; margin-top:10px;">
                                <button type="button" class="action-btn view-btn" onclick="window.open('/app/common/custom/custrecordentry.nl?rectype=\${data.recordType}&id=\${data.recordId}', '_blank')">
                                    👁️ View Record
                                </button>
                            </div>
                        \`;
                        appendHtmlMessage(htmlResponse, 'bot-msg');
                    } else {
                        let errorHtml = \`<strong><span class="error-notice">❌ Creation Failed:</span></strong><br>\${escapeHtml(data.error)}\`;
                        
                        if (data.draftCode) {
                            const draftId = 'draft-' + Date.now();
                            errorHtml += \`<br><br><em>Draft Configuration (Manual Fix Required):</em>
                                <pre id="\${draftId}">\${escapeHtml(data.draftCode)}</pre>\`;
                        }
                        appendHtmlMessage(errorHtml, 'bot-msg');
                    }
                } catch (error) {
                    document.getElementById(loadingId).remove();
                    appendMessage('⚠️ System Error: ' + error.message, 'bot-msg');
                } finally {
                    inputField.disabled = false;
                    sendBtn.disabled = false;
                    inputField.focus();
                    scrollToBottom();
                }
            }

            function appendMessage(text, className, id = '') {
                const messagesArea = document.getElementById('chat-messages');
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chat-message ' + className;
                if (id) msgDiv.id = id;
                msgDiv.textContent = text;
                messagesArea.appendChild(msgDiv);
                scrollToBottom();
            }

            function appendHtmlMessage(html, className) {
                const messagesArea = document.getElementById('chat-messages');
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chat-message ' + className;
                msgDiv.innerHTML = html;
                messagesArea.appendChild(msgDiv);
                scrollToBottom();
            }

            function scrollToBottom() {
                const messagesArea = document.getElementById('chat-messages');
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }

            function escapeHtml(unsafe) {
                if (!unsafe) return '';
                return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            }
        </script>
        `;
    };

    /**
     * Primary Suitelet Request Handler
     */
    const onRequest = (context) => {
        let genQuota = 'N/A';
        let isQuotaExhausted = false;
        
        try {
            genQuota = llm.getRemainingFreeUsage();
            if (genQuota <= 0) isQuotaExhausted = true;
        } catch (e) { isQuotaExhausted = false; }

        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'AI Record Creator', hideNavBar: false });
            const htmlField = form.addField({ id: 'custpage_chat_ui', type: serverWidget.FieldType.INLINEHTML, label: 'Chat UI' });
            htmlField.defaultValue = generateChatbotUI(isQuotaExhausted, genQuota);
            context.response.writePage(form);
            
        } else if (context.request.method === 'POST') {
            let responsePayload = { success: false, recordId: '', recordType: '', recordCode: '', error: '', draftCode: '' };

            try {
                const requestBody = JSON.parse(context.request.body);
                const userQuery = requestBody.query || '';
                const fileData = requestBody.fileData;
                const fileName = requestBody.fileName;
                const fileType = requestBody.fileType;

                // Step 1: Extract Text / Handle File
                const extractedText = extractTextFromFile(fileData, fileName, fileType);

                // Step 2: Determine Target Record Type
                const typePrompt = `Analyze the following user request and file context to determine the exact NetSuite internal ID of the record they want to create (e.g., 'salesorder', 'vendorbill', 'customer', 'customrecord_xyz'). Return ONLY the lowercase string ID. Nothing else.\nRequest: "${userQuery}"\nContext: "${extractedText.substring(0, 200)}"`;
                
                const typeResponse = llm.generateText({
                    prompt: typePrompt,
                    modelFamily: llm.ModelFamily.COHERE_COMMAND,
                    modelParameters: { temperature: 0.1 }
                });
                
                const targetRecordType = typeResponse.text.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
                responsePayload.recordType = targetRecordType;

                // Step 3: Extract Live Schema from NetSuite
                let schemaContext = "";
                let sublistContext = "";
                try {
                    // Create a dummy record in memory just to read its schema
                    const dummyRec = record.create({ type: targetRecordType, isDynamic: true });
                    const fields = dummyRec.getFields();
                    const sublists = dummyRec.getSublists();
                    
                    schemaContext = `Valid Body Fields include: ${fields.slice(0, 150).join(', ')}.`;
                    sublistContext = `Valid Sublists include: ${sublists.join(', ')}.`;
                } catch (e) {
                    schemaContext = `Warning: Could not verify schema for '${targetRecordType}'. Ensure you use standard NetSuite internal field IDs.`;
                }

                // Step 4: JSON Generation & Active Save Loop
                let validationAttempts = 0;
                let lastDraftedJson = '';
                
                let currentPrompt = `You are a NetSuite SuiteScript 2.x data mapping bot.
                Create a JSON object containing the data to initialize a '${targetRecordType}' record.
                ${schemaContext}
                ${sublistContext}
                
                User Request: "${userQuery}"
                Extracted File Data: "${extractedText}"
                
                FORMAT STRICTLY AS:
                {
                    "fields": { "internalid_of_body_field": "value" },
                    "sublists": { 
                        "internalid_of_sublist": [ 
                            { "internalid_of_column": "value" } 
                        ] 
                    }
                }
                Return ONLY raw, valid JSON. No markdown, no conversational text.`;

                while (validationAttempts < 3) {
                    const llmResponse = llm.generateText({
                        prompt: currentPrompt,
                        modelFamily: llm.ModelFamily.COHERE_COMMAND, 
                        modelParameters: { temperature: 0.1, maxTokens: 1500 }
                    });

                    let generatedText = llmResponse.text.trim();
                    if (generatedText.startsWith('```')) {
                        generatedText = generatedText.replace(/^```(json)?/gi, '').replace(/```$/gi, '').trim();
                    }
                    
                    try {
                        const parsedData = JSON.parse(generatedText);
                        lastDraftedJson = JSON.stringify(parsedData, null, 4);

                        // Universal Record Builder Logic
                        const newRec = record.create({ type: targetRecordType, isDynamic: true });
                        
                        // Map Body Fields
                        if (parsedData.fields) {
                            for (let fieldId in parsedData.fields) {
                                newRec.setValue({ fieldId: fieldId, value: parsedData.fields[fieldId] });
                            }
                        }

                        // Map Sublist Lines
                        if (parsedData.sublists) {
                            for (let sublistId in parsedData.sublists) {
                                const lines = parsedData.sublists[sublistId];
                                if (Array.isArray(lines)) {
                                    lines.forEach((lineObj) => {
                                        newRec.selectNewLine({ sublistId: sublistId });
                                        for (let colId in lineObj) {
                                            newRec.setCurrentSublistValue({ sublistId: sublistId, fieldId: colId, value: lineObj[colId] });
                                        }
                                        newRec.commitLine({ sublistId: sublistId });
                                    });
                                }
                            }
                        }

                        // Attempt to save to database
                        const createdId = newRec.save();
                        
                        responsePayload.success = true;
                        responsePayload.recordId = String(createdId);
                        responsePayload.recordCode = lastDraftedJson;
                        break; 

                    } catch (e) {
                        validationAttempts++;
                        currentPrompt = `You generated this JSON: ${generatedText}. It resulted in this NetSuite compilation/save error: ${e.message}. Fix the JSON structure and valid field IDs based on the error. Return ONLY the corrected raw JSON.`;
                    }
                }

                if (!responsePayload.success) {
                    responsePayload.error = "I couldn't successfully save the record to NetSuite (likely due to a missing mandatory field or invalid internal ID). Please check the draft configuration.";
                    responsePayload.draftCode = lastDraftedJson;
                }

            } catch (err) {
                responsePayload.error = "System Error: " + err.message;
            }

            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(responsePayload));
        }
    };

    return { onRequest };
});
