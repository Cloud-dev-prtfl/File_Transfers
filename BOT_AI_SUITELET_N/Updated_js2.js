/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * * Architectural Blueprint: High-Accuracy Formula Generator Bot (Chat UI Edition)
 * Utilizes N/llm, Retrieval-Augmented Generation (RAG), programmatic search validation,
 * dynamic SuiteQL custom field extraction, usage quota limits/display, and an asynchronous conversational frontend.
 */

define(['N/ui/serverWidget', 'N/llm', 'N/search', 'N/query'], 
function (serverWidget, llm, search, query) {

    // --- Core Backend Functions (Untouched for stability) ---

    const calculateCosineSimilarity = (vecA, vecB) => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += Math.pow(vecA[i], 2);
            normB += Math.pow(vecB[i], 2);
        }
        if (normA === 0 || normB === 0) return 0; 
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    const retrieveRelevantFormulas = (userQueryVector) => {
        const formulaLibrary = []; 
        const formulaSearch = search.create({
            type: 'customrecord_ns_formula_lib',
            columns: [
                'custrecord_formula_description', 
                'custrecord_formula_syntax', 
                'custrecord_formula_embedding'
            ]
        });

        formulaSearch.run().each(result => {
            const embeddingString = result.getValue('custrecord_formula_embedding');
            if (embeddingString) {
                const recordVector = JSON.parse(embeddingString);
                const similarity = calculateCosineSimilarity(userQueryVector, recordVector);
                formulaLibrary.push({
                    id: result.id,
                    description: result.getValue('custrecord_formula_description'),
                    syntax: result.getValue('custrecord_formula_syntax'),
                    score: similarity
                });
            }
            return true;
        });
        return formulaLibrary.sort((a, b) => b.score - a.score).slice(0, 3);
    };

    const validateFormulaSyntax = (formulaString) => {
        try {
            search.create({
                type: search.Type.CUSTOMER,
                columns: [search.createColumn({ name: 'formulatext', formula: formulaString })] 
            });
            return { isValid: true, error: null };
        } catch (e) {
            return { isValid: false, error: e.message };
        }
    };

    // --- Agentic Extraction Backend Functions ---

    const extractFieldNames = (userQuery) => {
        const extractionPrompt = `Extract potential custom field names or labels from the following request. Return ONLY a valid JSON array of strings representing the field names. Do not include markdown, formatting, or explanations. Request: "${userQuery}"`;
        
        try {
            const llmResponse = llm.generateText({
                prompt: extractionPrompt,
                modelFamily: llm.ModelFamily.COHERE_COMMAND,
                modelParameters: { temperature: 0.1 }
            });
            
            let text = llmResponse.text.trim();
            if (text.startsWith('```')) {
                text = text.replace(/```(json)?/g, '').trim();
            }
            return JSON.parse(text);
        } catch (e) {
            return []; 
        }
    };

    const lookupCustomFieldIds = (fieldNames) => {
        if (!fieldNames || fieldNames.length === 0) return {};
        const mapping = {};
        
        try {
            const placeholders = fieldNames.map(() => '?').join(', ');
            const sql = `SELECT scriptid, name FROM customfield WHERE name IN (${placeholders})`;
            
            const results = query.runSuiteQL({
                query: sql,
                params: fieldNames
            }).asMappedResults();

            results.forEach(res => {
                mapping[res.name] = res.scriptid;
            });
        } catch (e) {
            // Fail gracefully to avoid crashing the main execution loop
        }
        return mapping;
    };

    // --- UI HTML/CSS/JS Payload ---

    const generateChatbotUI = (isQuotaExhausted, genQuota, embedQuota) => {
        const botGreeting = isQuotaExhausted 
            ? 'The AI Formula Bot is currently sleeping! 😴 We have exhausted our free NetSuite AI usage for the month. Please check back on the 1st.' 
            : 'Hello! I am ready to generate and validate complex saved search formulas for you. What logic do you need help writing today?';
        
        const disableInputAttr = isQuotaExhausted ? 'disabled' : '';
        const placeholderText = isQuotaExhausted ? 'Quota exhausted. Bot unavailable.' : 'e.g., Calculate days between date created and closed...';

        return `
        <style>
            #bot-workspace { position: relative; display: flex; justify-content: center; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            .quota-badge { position: absolute; top: 20px; left: 20px; background-color: #ffffff; border: 1px solid #d3d8db; padding: 12px 16px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); max-width: 260px; }
            .quota-header { color: #4d5f7a; font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            .quota-details { font-size: 11px; color: #7f8c8d; line-height: 1.5; }
            #chat-container { width: 100%; max-width: 850px; border: 1px solid #d3d8db; border-radius: 12px; display: flex; flex-direction: column; height: 65vh; min-height: 500px; background-color: #f4f6f9; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            #chat-messages { flex-grow: 1; padding: 25px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
            .chat-message { max-width: 85%; padding: 14px 18px; border-radius: 8px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }
            .user-msg { background-color: #607799; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
            .bot-msg { background-color: white; border: 1px solid #e1e5e8; color: #333; align-self: flex-start; border-bottom-left-radius: 2px; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.02); }
            .bot-msg pre { background-color: #2b303b; color: #c0c5ce; padding: 15px; border-radius: 6px; overflow-x: auto; font-family: 'Courier New', Courier, monospace; margin: 12px 0; font-size: 13px; }
            .copy-btn { background-color: #e0e6ed; color: #333; border: 1px solid #cdd4dc; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s; }
            .copy-btn:hover { background-color: #d1d8e0; }
            #chat-input-area { display: flex; padding: 15px 20px; background-color: white; border-top: 1px solid #d3d8db; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; align-items: center; gap: 10px; }
            #chat-input { flex-grow: 1; padding: 12px 15px; border: 1px solid #cdd4dc; border-radius: 6px; font-size: 14px; outline: none; transition: border-color 0.2s; }
            #chat-input:focus { border-color: #607799; }
            #chat-input:disabled { background-color: #f0f2f5; cursor: not-allowed; }
            #send-btn { background-color: #4d5f7a; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; transition: background-color 0.2s; }
            #send-btn:hover { background-color: #3b495e; }
            #send-btn:disabled { background-color: #a0abbc; cursor: not-allowed; }
            .typing-indicator { font-style: italic; color: #7f8c8d; font-size: 13px; }
        </style>

        <div id="bot-workspace">
            <div class="quota-badge">
                <div class="quota-header">⚡ Remaining Free Usage: ${genQuota} Gen | ${embedQuota} Embed</div>
                <div class="quota-details">
                    <strong>Gen:</strong> How many more words/formulas the bot can write this month.<br>
                    <strong>Embed:</strong> How many more times the bot can search the formula library.
                </div>
            </div>
            <div id="chat-container">
                <div id="chat-messages">
                    <div class="chat-message bot-msg">
                        <strong>NetSuite AI Formula Bot</strong><br>
                        ${botGreeting}
                    </div>
                </div>
                <div id="chat-input-area">
                    <input type="text" id="chat-input" placeholder="${placeholderText}" onkeypress="if(event.key === 'Enter') sendQuery()" ${disableInputAttr} />
                    <button id="send-btn" onclick="sendQuery()" ${disableInputAttr}>Generate</button>
                </div>
            </div>
        </div>

        <script>
            async function sendQuery() {
                const inputField = document.getElementById('chat-input');
                const sendBtn = document.getElementById('send-btn');
                const query = inputField.value.trim();

                if (!query) return;

                // 1. Render User Message
                appendMessage(query, 'user-msg');
                inputField.value = '';
                inputField.disabled = true;
                sendBtn.disabled = true;

                // 2. Render Loading State
                const loadingId = 'loading-' + Date.now();
                appendMessage('Thinking, generating, and compiling formula against NetSuite search engine...', 'bot-msg typing-indicator', loadingId);

                try {
                    // 3. Send Async POST Request to this Suitelet
                    const response = await fetch(window.location.href, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: query })
                    });

                    const data = await response.json();
                    document.getElementById(loadingId).remove(); // Clear loading

                    // 4. Render Bot Response
                    if (data.success) {
                        const formulaId = 'code-' + Date.now();
                        const htmlResponse = \`
                            <strong>Validated Formula Generated:</strong>
                            <pre id="\${formulaId}">\${escapeHtml(data.formula)}</pre>
                            <button class="copy-btn" onclick="copyToClipboard('\${formulaId}', this)">
                                📋 Copy Formula
                            </button>
                        \`;
                        appendHtmlMessage(htmlResponse, 'bot-msg');
                    } else {
                        appendMessage('❌ Validation Failed: ' + data.error, 'bot-msg');
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

            // --- Helper Functions ---
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

            function copyToClipboard(elementId, btnElement) {
                const textToCopy = document.getElementById(elementId).textContent;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = btnElement.innerHTML;
                    btnElement.innerHTML = '✅ Copied!';
                    setTimeout(() => { btnElement.innerHTML = originalText; }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }

            function escapeHtml(unsafe) {
                return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            }
        </script>
        `;
    };

    /**
     * Primary Suitelet Request Handler executing the architectural flow.
     */
    const onRequest = (context) => {
        // Evaluate AI Usage Quotas
        let isQuotaExhausted = false;
        let genQuota = 'N/A';
        let embedQuota = 'N/A';
        
        try {
            genQuota = llm.getRemainingFreeUsage();
            embedQuota = llm.getRemainingFreeEmbedUsage();
            if (genQuota <= 0 || embedQuota <= 0) {
                isQuotaExhausted = true;
            }
        } catch (e) {
            // Failsafe: If the quota check errors out, assume availability to prevent false blocking
            isQuotaExhausted = false;
        }

        if (context.request.method === 'GET') {
            // Render the Chat UI wrapper
            const form = serverWidget.createForm({ title: 'AI Formula Assistant', hideNavBar: false });
            
            const htmlField = form.addField({
                id: 'custpage_chat_ui',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Chat UI'
            });
            
            htmlField.defaultValue = generateChatbotUI(isQuotaExhausted, genQuota, embedQuota);
            context.response.writePage(form);
            
        } else if (context.request.method === 'POST') {
            // Act as an API endpoint for the frontend Javascript
            let responsePayload = { success: false, formula: '', error: '' };

            if (isQuotaExhausted) {
                responsePayload.error = "The AI Formula Bot is currently sleeping! 😴 We have exhausted our free NetSuite AI usage for the month. Please check back on the 1st.";
                context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                context.response.write(JSON.stringify(responsePayload));
                return; 
            }

            try {
                const requestBody = JSON.parse(context.request.body);
                const userQuery = requestBody.query;

                let finalFormula = '';
                let validationAttempts = 0;
                const maxAttempts = 3;

                // Architectural Step 1: Vectorize the user's natural language query
                const queryEmbeddingResponse = llm.embed({
                    inputs: [userQuery],
                    embedModelFamily: llm.EmbedModelFamily.COHERE_EMBED
                });
                const userQueryVector = queryEmbeddingResponse.embeddings[0]; 

                // Architectural Step 2: RAG Retrieval
                const contextRecords = retrieveRelevantFormulas(userQueryVector);
                const ragDocuments = contextRecords.map((rec, index) => {
                    return llm.createDocument({
                        id: `doc_${index}`,
                        data: `Description: ${rec.description}\nSyntax: ${rec.syntax}`
                    });
                });

                // Architectural Step 2.5: Agentic Field Extraction
                let customFieldMappingText = "";
                try {
                    const potentialFields = extractFieldNames(userQuery);
                    if (potentialFields && potentialFields.length > 0) {
                        const fieldMapping = lookupCustomFieldIds(potentialFields);
                        if (Object.keys(fieldMapping).length > 0) {
                            customFieldMappingText = ` IMPORTANT: Use the following accurate NetSuite Script IDs for the requested custom fields: ${JSON.stringify(fieldMapping)}.`;
                        }
                    }
                } catch (extractionErr) {
                    // Fail silently here so the main generator loop still runs
                }

                // Architectural Step 3: Generation and Strict Validation Loop
                let currentPrompt = `You are a NetSuite PL/SQL expert. Write a NetSuite saved search formula for the following request: ${userQuery}.${customFieldMappingText} Return ONLY the raw formula text without markdown formatting or conversational filler.`;

                while (validationAttempts < maxAttempts) {
                    const llmResponse = llm.generateText({
                        prompt: currentPrompt,
                        documents: ragDocuments, 
                        modelFamily: llm.ModelFamily.COHERE_COMMAND, 
                        modelParameters: { temperature: 0.1, maxTokens: 1000 }
                    });

                    const generatedText = llmResponse.text.trim();
                    const validation = validateFormulaSyntax(generatedText);
                    
                    if (validation.isValid) {
                        finalFormula = generatedText;
                        break; 
                    } else {
                        validationAttempts++;
                        currentPrompt = `You previously generated this formula: ${generatedText}. It resulted in the following NetSuite compilation error: ${validation.error}. Please fix the syntax, resolve the error, and return ONLY the corrected raw formula text.`;
                    }
                }

                // Prepare API Response
                if (finalFormula) {
                    responsePayload.success = true;
                    responsePayload.formula = finalFormula;
                } else {
                    responsePayload.error = "Unable to generate a syntactically valid formula after 3 iterative attempts. Please refine the input prompt.";
                }

            } catch (err) {
                responsePayload.error = "System Error: " + err.message;
            }

            // Return JSON back to the Chat UI
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(responsePayload));
        }
    };

    return { onRequest };
});
