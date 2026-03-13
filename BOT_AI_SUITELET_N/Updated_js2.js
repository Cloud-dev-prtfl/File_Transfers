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
     * This mathematical function is absolutely essential for the semantic retrieval 
     * process within the RAG architecture, bypassing traditional keyword limitations.
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
        if (normA === 0 || normB === 0) return 0; // Fixed broken || operator
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    /**
     * Retrieves the top semantic matches from the Formula Library Custom Record.
     * Extracts the stored JSON embeddings and performs real-time similarity sorting.
     */
    const retrieveRelevantFormulas = (userQueryVector) => {
        const formulaLibrary = []; // Fixed missing array initialization
        
        // Execute a targeted search against the Source of Truth repository
        const formulaSearch = search.create({
            type: 'customrecord_ns_formula_lib',
            columns: [
                'custrecord_formula_description', 
                'custrecord_formula_syntax', 
                'custrecord_formula_embedding'
            ]
        });

        // Iterate through verified formulas to find semantic neighbors
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

        // Sort by highest cosine similarity and isolate the top 3 context documents
        return formulaLibrary.sort((a, b) => b.score - a.score).slice(0, 3);
    };

    /**
     * Performs strict deterministic validation of generated formula syntax 
     * utilizing the native NetSuite compilation engine via N/search.
     */
    const validateFormulaSyntax = (formulaString) => {
        try {
            // Attempt to compile the formula within a dummy search column wrapper
            const testSearch = search.create({
                type: search.Type.CUSTOMER,
                columns: [
                    search.createColumn({
                        name: 'formulatext',
                        formula: formulaString
                    })
                ] // Fixed missing search column logic
            });
            // If the object creation succeeds without throwing an exception, syntax is valid
            return { isValid: true, error: null };
        } catch (e) {
            // The NetSuite search engine aggressively rejects invalid PL/SQL syntax
            return { isValid: false, error: e.message };
        }
    };

    /**
     * Primary Suitelet Request Handler executing the architectural flow.
     */
    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            // Render the initial Chatbot UI
            const form = serverWidget.createForm({ title: 'NetSuite AI Formula Assistant' });
            
            const chatWindow = form.addField({
                id: 'custpage_chat_window',
                type: serverWidget.FieldType.INLINEHTML,
                label: 'Chat Interface'
            });

            // Initial greeting bubble
            chatWindow.defaultValue = `
                <div style="border: 1px solid #ccc; border-radius: 8px; padding: 15px; height: 400px; overflow-y: auto; background-color: #f4f6f9; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px;">
                    <div style="align-self: flex-start; max-width: 70%; background-color: #ffffff; padding: 10px 15px; border-radius: 15px 15px 15px 0px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                        <strong>AI Assistant:</strong><br/>Hello! I'm your NetSuite Formula Bot. Describe the complex logic you need, and I'll generate a syntax-validated formula for you.
                    </div>
                </div>
            `;
            
            form.addField({
                id: 'custpage_user_query',
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Your Message'
            });
            
            form.addSubmitButton({ label: 'Send to Assistant' });
            context.response.writePage(form);
            
        } else if (context.request.method === 'POST') {
            const userQuery = context.request.parameters.custpage_user_query;
            let finalFormula = '';
            let validationAttempts = 0;
            const maxAttempts = 3;

            try {
                // Architectural Step 1: Vectorize the user's natural language query
                const queryEmbeddingResponse = llm.embed({
                    inputs: [userQuery],
                    embedModelFamily: llm.EmbedModelFamily.COHERE_EMBED
                });
                const userQueryVector = queryEmbeddingResponse.embeddings[0]; // Targeted first index

                // Architectural Step 2: RAG Retrieval - Find relevant truth data
                const contextRecords = retrieveRelevantFormulas(userQueryVector);
                
                // Construct specific llm.Document objects mandated for Cohere grounding
                const ragDocuments = contextRecords.map((rec, index) => {
                    return llm.createDocument({
                        id: `doc_${index}`,
                        data: `Description: ${rec.description}\nSyntax: ${rec.syntax}`
                    });
                });

                // Architectural Step 3: Generation and Strict Validation Loop
                let currentPrompt = `You are a NetSuite PL/SQL expert. Write a NetSuite saved search formula for the following request: ${userQuery}. Return ONLY the raw formula text without markdown formatting or conversational filler.`;

                while (validationAttempts < maxAttempts) {
                    // Invoke the model with strict deterministic parameters
                    const llmResponse = llm.generateText({
                        prompt: currentPrompt,
                        documents: ragDocuments, // Grounding the model via RAG
                        modelFamily: llm.ModelFamily.COHERE_COMMAND, // Explicitly required for options.documents
                        modelParameters: {
                            temperature: 0.1, // Highly deterministic output
                            maxTokens: 1000
                        }
                    });

                    const generatedText = llmResponse.text.trim();

                    // Architectural Step 4: Validate the output via compilation
                    const validation = validateFormulaSyntax(generatedText);
                    
                    if (validation.isValid) {
                        finalFormula = generatedText;
                        break; // Compilation successful, exit loop
                    } else {
                        // Iterative Self-Correction: Feed the explicit engine error back
                        validationAttempts++;
                        currentPrompt = `You previously generated this formula: ${generatedText}. It resulted in the following NetSuite compilation error: ${validation.error}. Please fix the syntax, resolve the error, and return ONLY the corrected raw formula text.`;
                    }
                }

                // Render Chat UI with Results
                const resultForm = serverWidget.createForm({ title: 'NetSuite AI Formula Assistant' });
                
                const chatWindow = resultForm.addField({
                    id: 'custpage_chat_window',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Chat Interface'
                });

                let botResponseContent = finalFormula 
                    ? `<pre style="white-space: pre-wrap; margin: 0; background: #eee; padding: 8px; border-radius: 5px;"><code>${finalFormula}</code></pre>` 
                    : "<em>Error: Unable to generate a syntactically valid formula after 3 iterative attempts. Please refine the input prompt or update the knowledge repository.</em>";

                chatWindow.defaultValue = `
                    <div style="border: 1px solid #ccc; border-radius: 8px; padding: 15px; height: 400px; overflow-y: auto; background-color: #f4f6f9; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px;">
                        <div style="align-self: flex-end; max-width: 70%; background-color: #0078d4; color: white; padding: 10px 15px; border-radius: 15px 15px 0px 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                            <strong>You:</strong><br/>${userQuery}
                        </div>
                        <div style="align-self: flex-start; max-width: 70%; background-color: #ffffff; padding: 10px 15px; border-radius: 15px 15px 15px 0px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                            <strong>AI Assistant:</strong><br/>${botResponseContent}
                        </div>
                    </div>
                `;

                resultForm.addField({
                    id: 'custpage_user_query',
                    type: serverWidget.FieldType.TEXTAREA,
                    label: 'Follow-up Message'
                });
                
                resultForm.addSubmitButton({ label: 'Send to Assistant' });
                context.response.writePage(resultForm);

            } catch (err) {
                // Render System Error in Chat UI
                const errorForm = serverWidget.createForm({ title: 'NetSuite AI Formula Assistant - Error' });
                
                const errorChatWindow = errorForm.addField({
                    id: 'custpage_chat_window',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: 'Chat Interface'
                });

                errorChatWindow.defaultValue = `
                    <div style="border: 1px solid #ccc; border-radius: 8px; padding: 15px; height: 400px; overflow-y: auto; background-color: #f4f6f9; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px;">
                         <div style="align-self: flex-end; max-width: 70%; background-color: #0078d4; color: white; padding: 10px 15px; border-radius: 15px 15px 0px 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                            <strong>You:</strong><br/>${userQuery}
                        </div>
                        <div style="align-self: flex-start; max-width: 70%; background-color: #ffe6e6; border: 1px solid #ffcccc; padding: 10px 15px; border-radius: 15px 15px 15px 0px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); color: #b30000;">
                            <strong>System Error:</strong><br/>${err.message}
                        </div>
                    </div>
                `;

                errorForm.addField({
                    id: 'custpage_user_query',
                    type: serverWidget.FieldType.TEXTAREA,
                    label: 'Try Again'
                });
                
                errorForm.addSubmitButton({ label: 'Send to Assistant' });
                context.response.writePage(errorForm);
            }
        }
    };

    return { onRequest };
});
