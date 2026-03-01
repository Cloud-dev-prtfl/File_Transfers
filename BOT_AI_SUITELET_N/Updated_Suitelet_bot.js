/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/llm', 'N/log'], (serverWidget, llm, log) => {

    /**
     * Creates a NetSuite Chatbot form specialized for generating Saved Searches.
     */
    function onRequest(context) {
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

        const SYSTEM_PROMPT = `
            You are an expert NetSuite Developer specializing in SuiteScript 2.1 and the N/search module.
            Your goal is to help the user create NetSuite Saved Searches.
            Generate valid SuiteScript 2.1 code using 'search.create'.
            Include comments explaining the filters and columns.
        `;

        if (context.request.method === 'POST') {
            const userPrompt = context.request.parameters.custpage_text;
            const chatHistory = [];

            // 1. Rebuild History Safely
            // Only loop if there is actually history to rebuild
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

                        // Add to LLM history array
                        chatHistory.push({ 
                            role: (i % 2 === 0) ? llm.ChatRole.USER : llm.ChatRole.CHATBOT, 
                            text: histValue 
                        });
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
            promptDisplay.defaultValue = userPrompt;
            promptDisplay.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

            // Hidden field to carry prompt to next turn
            const promptHidden = form.addField({
                id: 'custpage_hist' + currentPromptIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Hidden Prompt',
                container: 'fieldgroupid'
            });
            promptHidden.defaultValue = userPrompt;
            promptHidden.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // 3. Generate and Display AI Response
            const resultField = form.addField({
                id: 'custpage_hist_display' + currentRespIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Search Bot',
                container: 'fieldgroupid'
            });

            // Hidden field to carry response to next turn
            const resultHidden = form.addField({
                id: 'custpage_hist' + currentRespIndex,
                type: serverWidget.FieldType.TEXTAREA,
                label: 'Hidden Resp',
                container: 'fieldgroupid'
            });

            try {
                const aiResponse = llm.generateText({
                    prompt: SYSTEM_PROMPT + "\n\nUser Request: " + userPrompt,
                    chatHistory: chatHistory
                });

                resultField.defaultValue = aiResponse.text;
                resultHidden.defaultValue = aiResponse.text;
                numChats.defaultValue = historySize + 2;

            } catch (e) {
                log.error('LLM Error', e);
                resultField.defaultValue = "Error: " + e.message;
                numChats.defaultValue = historySize; // Don't increment on failure
            }

            resultField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
            resultHidden.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        } else {
            // Initial Load
            numChats.defaultValue = 0;
            form.addField({
                id: 'custpage_intro',
                type: serverWidget.FieldType.HELP,
                label: 'Welcome',
                container: 'fieldgroupid'
            }).label = "Describe the Saved Search you want to create.";
        }

        form.addField({
            id: 'custpage_text',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'New Message',
            container: 'fieldgroupid'
        });

        form.addSubmitButton({ label: 'Send' });
        context.response.writePage(form);
    }

    return { onRequest: onRequest };
});
