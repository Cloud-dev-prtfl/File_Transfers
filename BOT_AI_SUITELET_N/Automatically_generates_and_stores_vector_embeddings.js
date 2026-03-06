/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * Automatically generates and stores vector embeddings for the Formula Library
 * using the N/llm module just before the custom record is saved to the database.
 */
define(['N/llm', 'N/log'], function(llm, log) {

    const beforeSubmit = (context) => {
        // Only execute during creation or modification of the record
        if (context.type!== context.UserEventTypes.CREATE && 
            context.type!== context.UserEventTypes.EDIT) {
            return;
        }

        const newRecord = context.newRecord;
        
        // Extract the relevant text fields to be vectorized
        const description = newRecord.getValue({ fieldId: 'custrecord_formula_description' }) |

| '';
        const syntax = newRecord.getValue({ fieldId: 'custrecord_formula_syntax' }) |

| '';

        // Combine the context to create a rich semantic string
        const textToEmbed = `Description: ${description}\nSyntax: ${syntax}`.trim();

        if (textToEmbed.length > 13) { // Ensure there is actual content to embed
            try {
                // Call the native NetSuite embedding model
                const embedResponse = llm.embed({
                    inputs:
                });

                // The method returns an array of embeddings corresponding to the inputs
                // Since we passed one string, we target the first index
                const vectorArray = embedResponse.embeddings;

                // Serialize the floating-point vector array to a JSON string 
                // and store it in the dedicated long-text column
                newRecord.setValue({
                    fieldId: 'custrecord_formula_embedding',
                    value: JSON.stringify(vectorArray)
                });

            } catch (error) {
                // Catch embedding limit errors or OCI timeouts without crashing the save action
                log.error({
                    title: 'Vector Embedding Generation Failed',
                    details: error.message
                });
            }
        }
    };

    return {
        beforeSubmit: beforeSubmit
    };
});
