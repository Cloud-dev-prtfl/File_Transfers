/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * * Architectural Blueprint: High-Accuracy Formula Generator Bot
 * Utilizes N/llm, Retrieval-Augmented Generation (RAG) architecture, 
 * and programmatic search validation via N/search.
 */

define(['N/ui/serverWidget', 'N/llm', 'N/search', 'N/query'], 
function (serverWidget, llm, search, query) {

    /**
     * Calculates the cosine similarity between two multi-dimensional vector arrays.
     */
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

    /**
     * Retrieves the top semantic matches from the Formula Library Custom Record.
     */
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

    /**
     * Performs strict deterministic validation of generated formula syntax. 
     */
    const validateFormulaSyntax = (formulaString) => {
        try {
            const testSearch = search.create({
                type: search.Type.CUSTOMER,
                columns: [
                    search.createColumn({
                        name: 'formulatext',
                        formula: formulaString
                    })
                ] 
            });
            return { isValid: true, error: null };
        } catch (e) {
            return { isValid: false, error: e.message };
        }
    };

    /**
     * Primary Suitelet Request Handler executing the architectural flow.
     */
    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            // Render the Chat UI wrapper
            const form = serverWidget.createForm({ title: 'AI formula Assistance', hideNavBar: false });
            
            const htmlField = form.addField({
                id: 'custpage_chat_ui',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Chat Interface'
            });

            // Inject the CSS and HTML/JS. 
            // FIXED: Added type="button" and preventDefault() to prevent NS page reloads.
            htmlField.defaultValue = `
                <style>
                    #custom-chat-app {
                        font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        display: flex;
                        flex-direction: column;
                        height: 75vh;
                        background-color: #ffffff;
                        padding: 10px 20px;
                        box-sizing: border-box;
                    }
                    .chat-header {
                        font-size: 22px;
                        font-weight: 600;
                        color: #2c3e50;
                        margin-bottom: 15px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .chat-window {
                        flex-grow: 1;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        background-color: #ffffff;
                        overflow-y: auto;
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 15px;
                        margin-bottom: 20px;
                    }
                    .message {
                        max-width: 75%;
                        padding: 14px 18px;
                        font-size: 14px;
                        line-height: 1.5;
                        word-wrap: break-word;
                        white-space: pre-wrap;
                    }
                    .message.bot {
                        background-color: #f8f9fa;
                        color: #334155;
                        align-self: flex-start;
                        border: 1px solid #e2e8f0;
                        border-radius: 20px 20px 20px 4px;
                    }
                    .message.user {
                        background-color: #ffffff;
                        color: #334155;
                        align-self: flex-end;
                        border: 1px solid #e2e8f0;
                        border-radius: 20px 20px 4px 20px;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    }
                    .input-container {
                        display: flex;
                        gap: 12px;
                        align-items: center;
                    }
                    .chat-input {
                        flex-grow: 1;
                        padding: 16px 20px;
                        border: 1px solid #cbd5e1;
                        border-radius: 30px;
                        font-size: 14px;
                        outline: none;
                        transition: border-color 0.2s;
                    }
                    .chat-input:focus { border-color: #1d4ed8; }
                    .send-btn {
                        background-color: #1d4ed8;
                        color: white;
                        border: none;
                        padding: 16px 30px;
                        border-radius: 30px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    .send-btn:hover { background-color: #1e40af; }
                    .loading-dots:after {
                        content: '.';
                        animation: dots 1.5s steps(5, end) infinite;
                    }
                    @keyframes dots {
                        0%, 20% { content: '.'; }
                        40% { content: '..'; }
                        60% { content: '...'; }
                        80%, 100% { content: ''; }
                    }
                </style>

                <div id="custom-chat-app">
                    <div class="chat-header">AI formula Assistance</div>
                    <div class="chat-window" id="chat-history">
                        <div class="message bot">I am Jules. My multi-agent pipeline is active. How can I help you today?</div>
                    </div>
                    <div class="input-container">
                        <input type="text" id="user-input" class="chat-input" placeholder="Example: Create a saved search for customers in California..." autocomplete="off" />
                        <button type="button" id="send-btn" class="send-btn">Send to MAS</button>
                    </div>
                </div>

                <script>
                    document.getElementById('send-btn').addEventListener('click', async (e) => {
                        e.preventDefault(); // Prevents standard NetSuite form submission
                        
                        const inputEl = document.getElementById('user-input');
                        const text = inputEl.value.trim();
                        if (!text) return;

                        const history = document.getElementById('chat-history');
                        // Escape basic HTML from user input
                        history.innerHTML += '<div class="message user">' + text.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</div>';
                        inputEl.value = '';

                        const loadingId = 'loading-' + Date.now();
                        history.innerHTML += '<div class="message bot" id="' + loadingId + '"><span class="loading-dots">Generating and validating formula</span></div>';
                        history.scrollTop = history.scrollHeight;

                        try {
                            const response = await fetch(window.location.href, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Accept': 'application/json'
                                },
                                body: JSON.stringify({ query: text })
                            });
                            
                            const responseText = await response.text();
                            let data;
                            try {
                                data = JSON.parse(responseText);
                            } catch(err) {
                                document.getElementById(loadingId).innerHTML = "<strong>System Error:</strong> Server returned invalid data.";
                                document.getElementById(loadingId).style.color = "#dc2626";
                                return;
                            }
                            
                            const responseElement = document.getElementById(loadingId);
                            
                            if (data.success) {
                                responseElement.innerHTML = "<strong>Validated Formula:</strong><br><br><code>" + data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</code>";
                            } else {
                                responseElement.innerHTML = "<strong>Error:</strong><br>" + data.text;
                                responseElement.style.color = "#dc2626";
                            }
                        } catch (e) {
                            document.getElementById(loadingId).innerText = 'System Error: Could not connect to the NetSuite backend.';
                            document.getElementById(loadingId).style.color = "#dc2626";
                        }
                        history.scrollTop = history.scrollHeight;
                    });

                    // Allow pressing Enter to send without reloading the page
                    document.getElementById('user-input').addEventListener('keypress', function (e) {
                        if (e.key === 'Enter') {
                            e.preventDefault(); // Crucial to prevent standard submission
                            document.getElementById('send-btn').click();
                        }
                    });
                </script>
            `;
            
            context.response.writePage(form);
            
        } else if (context.request.method === 'POST') {
            // Tell the browser to expect a JSON response, not a web page
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            
            let userQuery = '';
            
            try {
                if (context.request.body) {
                    const reqBody = JSON.parse(context.request.body);
                    userQuery = reqBody.query || '';
                }
            } catch (e) {
                // Failsafe parsing
            }

            // Immediately reject if empty (this prevents the Cohere 'Unexpected Error' crash)
            if (!userQuery) {
                context.response.write(JSON.stringify({ 
                    success: false, 
                    text: "No query received by the server. Please check your submission." 
                }));
                return;
            }

            let finalFormula = '';
            let validationAttempts = 0;
            const maxAttempts = 3;

            try {
                // Architectural Step 1: Vectorize
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

                // Architectural Step 3: Generation and Strict Validation Loop
                let currentPrompt = `You are a NetSuite PL/SQL expert. Write a NetSuite saved search formula for the following request: ${userQuery}. Return ONLY the raw formula text without markdown formatting or conversational filler.`;

                while (validationAttempts < maxAttempts) {
                    const llmResponse = llm.generateText({
                        prompt: currentPrompt,
                        documents: ragDocuments, 
                        modelFamily: llm.ModelFamily.COHERE_COMMAND, 
                        modelParameters: {
                            temperature: 0.1, 
                            maxTokens: 1000
                        }
                    });

                    const generatedText = llmResponse.text.trim();

                    // Architectural Step 4: Validate via compilation
                    const validation = validateFormulaSyntax(generatedText);
                    
                    if (validation.isValid) {
                        finalFormula = generatedText;
                        break; 
                    } else {
                        validationAttempts++;
                        currentPrompt = `You previously generated this formula: ${generatedText}. It resulted in the following NetSuite compilation error: ${validation.error}. Please fix the syntax, resolve the error, and return ONLY the corrected raw formula text.`;
                    }
                }

                if (finalFormula) {
                    context.response.write(JSON.stringify({ success: true, text: finalFormula }));
                } else {
                    context.response.write(JSON.stringify({ 
                        success: false, 
                        text: "Unable to generate a syntactically valid formula after 3 iterative attempts. Please refine the input prompt or update the knowledge repository." 
                    }));
                }

            } catch (err) {
                // If N/llm throws any other system errors, catch and return them cleanly to the UI
                context.response.write(JSON.stringify({ success: false, text: err.message }));
            }
        }
    };

    return { onRequest };
});
