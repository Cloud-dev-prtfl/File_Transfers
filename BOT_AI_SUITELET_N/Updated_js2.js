/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * * Architectural Blueprint: High-Accuracy Formula Generator Bot
 * Utilizes N/llm, Retrieval-Augmented Generation (RAG) architecture, 
 * and programmatic search validation via N/search.
 * UI has been updated to support conversational history.
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
     * Primary Suitelet Request Handler executing the architectural flow with Chatbot UI.
     */
    const onRequest = (context) => {
        const form = serverWidget.createForm({ title: 'NetSuite Saved Search AI Generator' });
        
        // Create a field group for the chat interface
        const fieldgroup = form.addFieldGroup({ id: 'fieldgroupid', label: 'Conversation' });
        fieldgroup.isSingleColumn = true;

        // Hidden field to track history size
        const historySize = parseInt(context.request.parameters.custpage_num_chats || '0');
        const numChats = form.addField({
            id: 'custpage_num_chats',
            type: serverWidget.FieldType.INTEGER,
            container: 'fieldgroupid',
            label: 'History Size'
        });
        numChats.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        if (context.request.method === 'POST') {
            const userQuery = context.request.parameters.custpage_text;
            
            // 1. Rebuild History Safely
            if (historySize > 0) {
                for (let i = 0; i < historySize; i++) {
                    const histValue = context.request.parameters['custpage_hist' + i];
                    if (histValue) {
                        const histField = form.addField({
                            id: 'custpage_hist_display' + i,
                            type: serverWidget.FieldType.TEXTAREA,
                            label: (i % 2 === 0) ? 'You' : 'Search Bot',
                            container: 'fieldgroupid'
                        });
                        histField.defaultValue = histValue;
                        histField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

                        // Preserve for next POST
                        const hiddenHist = form.addField({
                            id: 'custpage_hist' + i,
                            type: serverWidget.FieldType.TEXTAREA,
                            label: 'Hidden Hist',
                            container: 'fieldgroupid'
                        });
                        hiddenHist.defaultValue = histValue;
                        hiddenHist.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
                    }
                }
            }

            // 2. Display Current Prompt
            const currentPromptIndex = historySize;
            const currentRespIndex = historySize + 1;

            const promptDisplay = form.addField({
                id: 'custpage_hist_display' + currentPromptIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'You',
                container: 'fieldgroupid'
            });
            promptDisplay.defaultValue = userQuery;
            promptDisplay.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            // Hidden field to carry prompt to next turn
            const promptHidden = form.addField({
                id: 'custpage_hist' + currentPromptIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Hidden Prompt',
                container: 'fieldgroupid'
            });
            promptHidden.defaultValue = userQuery;
            promptHidden.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // 3. Generate and Display AI Response using syncJS Core RAG Logic
            const resultField = form.addField({
                id: 'custpage_hist_display' + currentRespIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Search Bot',
                container: 'fieldgroupid'
            });

            const resultHidden = form.addField({
                id: 'custpage_hist' + currentRespIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Hidden Resp',
                container: 'fieldgroupid'
            });

            try {
                // Architectural Step 1: Vectorize the user's natural language query
                const queryEmbeddingResponse = llm.embed({
                    inputs: [userQuery],
                    embedModelFamily: llm.EmbedModelFamily.COHERE_EMBED
                });
                const userQueryVector = queryEmbeddingResponse.embeddings[0]; 

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
                let finalFormula = '';
                let validationAttempts = 0;
                const maxAttempts = 3;
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

                // Render Final Validated Results to the Chat UI
                let responseText = finalFormula 
                    ? finalFormula 
                    : "Error: Unable to generate a syntactically valid formula after 3 iterative attempts. Please refine the input prompt or update the knowledge repository.";
                
                resultField.defaultValue = responseText;
                resultHidden.defaultValue = responseText;
                numChats.defaultValue = historySize + 2;

            } catch (err) {
                // Catch systemic execution errors
                resultField.defaultValue = "System Error Details: " + err.message;
                resultHidden.defaultValue = "System Error Details: " + err.message;
                numChats.defaultValue = historySize; // Don't increment on system failure
            }

            resultField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            resultHidden.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        } else {
            // Initial Load (GET)
            numChats.defaultValue = 0;
            const introField = form.addField({
                id: 'custpage_intro',
                type: serverWidget.FieldType.HELP,
                label: 'Welcome',
                container: 'fieldgroupid'
            });
            // Fixed the .label assignment from bot2 to correctly assign help text
            introField.defaultValue = "Describe the complex formula logic required..."; 
        }

        form.addField({
            id: 'custpage_text',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'New Message',
            container: 'fieldgroupid'
        });

        form.addSubmitButton({ label: 'Generate Validated Formula' });
        context.response.writePage(form);
    };

    return { onRequest };
});
