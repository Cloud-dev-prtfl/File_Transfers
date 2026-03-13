/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * * Architectural Blueprint: High-Accuracy Formula Generator Bot
 */

define(['N/ui/serverWidget', 'N/llm', 'N/search'], 
function (serverWidget, llm, search) {

    const calculateCosineSimilarity = (vecA, vecB) => {
        let dotProduct = 0, normA = 0, normB = 0;
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
        try {
            const formulaSearch = search.create({
                type: 'customrecord_ns_formula_lib',
                columns: ['custrecord_formula_description', 'custrecord_formula_syntax', 'custrecord_formula_embedding']
            });

            // Added getRange to prevent infinite loops / governance limit breaches
            // if the custom record library grows too large.
            const results = formulaSearch.run().getRange({ start: 0, end: 1000 });
            
            results.forEach(result => {
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
            });
        } catch (e) {
            // Fails gracefully if the custom record doesn't exist yet
            return [];
        }

        return formulaLibrary.sort((a, b) => b.score - a.score).slice(0, 3);
    };

    const validateFormulaSyntax = (formulaString) => {
        try {
            const testSearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [['internalid', 'anyof', '@NONE@']],
                columns: [ search.createColumn({ name: 'formulatext', formula: formulaString }) ] 
            });
            testSearch.run().getRange({ start: 0, end: 1 });
            return { isValid: true, error: null };
        } catch (e) {
            return { isValid: false, error: e.message };
        }
    };

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'AI Formula Assistance', hideNavBar: false });
            const htmlField = form.addField({ id: 'custpage_chat_ui', type: serverWidget.FieldType.INLINEHTML, label: 'Chat Interface' });

            htmlField.defaultValue = `
                <style>
                    #custom-chat-app { font-family: 'Inter', sans-serif; display: flex; flex-direction: column; height: 75vh; padding: 10px 20px; box-sizing: border-box; }
                    .chat-header { font-size: 22px; font-weight: 600; color: #2c3e50; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; }
                    .chat-window { flex-grow: 1; border: 1px solid #e2e8f0; border-radius: 12px; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px; }
                    .message { max-width: 75%; padding: 14px 18px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
                    .message.bot { background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 20px 20px 20px 4px; }
                    .message.user { background-color: #ffffff; align-self: flex-end; border: 1px solid #e2e8f0; border-radius: 20px 20px 4px 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                    .input-container { display: flex; gap: 12px; align-items: center; }
                    .chat-input { flex-grow: 1; padding: 16px 20px; border: 1px solid #cbd5e1; border-radius: 30px; outline: none; resize: none; overflow: hidden; font-family: inherit; }
                    .send-btn { background-color: #1d4ed8; color: white; border: none; padding: 16px 30px; border-radius: 30px; font-weight: 600; cursor: pointer; }
                    .loading-dots:after { content: '.'; animation: dots 1.5s steps(5, end) infinite; }
                    @keyframes dots { 0%, 20% { content: '.'; } 40% { content: '..'; } 60% { content: '...'; } 80%, 100% { content: ''; } }
                </style>
                <div id="custom-chat-app">
                    <div class="chat-header">AI Formula Assistance</div>
                    <div class="chat-window" id="chat-history">
                        <div class="message bot">I am Jules. My multi-agent pipeline is active. How can I help you today?</div>
                    </div>
                    <div class="input-container">
                        <textarea id="user-input" class="chat-input" rows="1" placeholder="Example: Create a saved search for customers in California..."></textarea>
                        <button type="button" id="send-btn" class="send-btn">Send to MAS</button>
                    </div>
                </div>
                <script>
                    // FORCE NetSuite's form to never submit natively
                    if (document.forms.length > 0) {
                        document.forms[0].onsubmit = function(e) { e.preventDefault(); return false; };
                    }

                    document.getElementById('send-btn').addEventListener('click', async (e) => {
                        e.preventDefault(); 
                        const inputEl = document.getElementById('user-input');
                        const text = inputEl.value.trim();
                        if (!text) return;

                        const history = document.getElementById('chat-history');
                        history.innerHTML += '<div class="message user">' + text.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</div>';
                        inputEl.value = '';

                        const loadingId = 'loading-' + Date.now();
                        history.innerHTML += '<div class="message bot" id="' + loadingId + '"><span class="loading-dots">Generating and validating formula</span></div>';
                        history.scrollTop = history.scrollHeight;

                        try {
                            const response = await fetch(window.location.href, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify({ query: text })
                            });
                            const data = await response.json();
                            const responseElement = document.getElementById(loadingId);
                            if (data.success) {
                                responseElement.innerHTML = "<strong>Validated Formula:</strong><br><br><code>" + data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
                            } else {
                                responseElement.innerHTML = "<strong>Error:</strong><br>" + data.text;
                                responseElement.style.color = "#dc2626";
                            }
                        } catch (err) {
                            document.getElementById(loadingId).innerText = 'System Error: UI could not connect to backend.';
                        }
                        history.scrollTop = history.scrollHeight;
                    });

                    // Capture Enter key manually in the textarea
                    document.getElementById('user-input').addEventListener('keydown', function (e) {
                        if (e.key === 'Enter' && !e.shiftKey) { 
                            e.preventDefault(); 
                            document.getElementById('send-btn').click(); 
                        }
                    });
                </script>`;
            
            context.response.writePage(form);
            
        } else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            
            let userQuery = '';
            try {
                if (context.request.body) {
                    const parsedBody = JSON.parse(context.request.body);
                    userQuery = parsedBody.query || '';
                }
            } catch (e) {
                return context.response.write(JSON.stringify({ success: false, text: "Error: Received malformed JSON data." }));
            }

            if (!userQuery) {
                return context.response.write(JSON.stringify({ success: false, text: "No query received." }));
            }

            try {
                // Step 1: Vectorize
                const queryEmbeddingResponse = llm.embed({ inputs: [userQuery], embedModelFamily: llm.EmbedModelFamily.COHERE_EMBED });
                const userQueryVector = queryEmbeddingResponse.embeddings[0]; 

                // Step 2: RAG Retrieval
                const contextRecords = retrieveRelevantFormulas(userQueryVector);
                const ragDocuments = contextRecords.map((rec, index) => {
                    return llm.createDocument({ id: 'doc_' + index, data: 'Description: ' + rec.description + '\\nSyntax: ' + rec.syntax });
                });

                // Step 3: Generation & Loop
                let currentPrompt = 'You are a NetSuite PL/SQL expert. Write a NetSuite saved search formula for the following request: ' + userQuery + '. Return ONLY the raw formula text without markdown formatting, code blocks, or conversational filler.';
                
                let finalFormula = '';
                let validationAttempts = 0;

                while (validationAttempts < 3) {
                    const generateParams = {
                        prompt: currentPrompt,
                        modelFamily: llm.ModelFamily.COHERE_COMMAND,
                        modelParameters: { temperature: 0.1, maxTokens: 1000 }
                    };
                    
                    if (ragDocuments.length > 0) {
                        generateParams.documents = ragDocuments;
                    }

                    const llmResponse = llm.generateText(generateParams);
                    let generatedText = llmResponse.text.trim();
                    
                    // Cleanup common LLM artifacts
                    generatedText = generatedText.replace(/^```sql\n?/i, '').replace(/^```\n?/i, '').replace(/```$/i, '').trim();

                    // Step 4: Validate
                    const validation = validateFormulaSyntax(generatedText);
                    
                    if (validation.isValid) {
                        finalFormula = generatedText;
                        break; 
                    } else {
                        validationAttempts++;
                        currentPrompt = 'You previously generated this formula: ' + generatedText + '. It resulted in the following NetSuite compilation error: ' + validation.error + '. Please fix the PL/SQL syntax, resolve the error, and return ONLY the corrected raw formula text.';
                    }
                }

                if (finalFormula) {
                    context.response.write(JSON.stringify({ success: true, text: finalFormula }));
                } else {
                    context.response.write(JSON.stringify({ success: false, text: "Failed to generate valid syntax after 3 attempts. Please refine your request." }));
                }

            } catch (err) {
                context.response.write(JSON.stringify({ 
                    success: false, 
                    text: err.message || "Unknown NetSuite LLM Error Occurred." 
                }));
            }
        }
    };

    return { onRequest };
});
