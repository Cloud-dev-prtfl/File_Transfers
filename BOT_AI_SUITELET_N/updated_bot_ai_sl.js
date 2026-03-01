/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/https', 'N/runtime', 'N/log'], (serverWidget, https, runtime, log) => {

    const GEMINI_MODEL = 'gemini-2.0-flash';

    function onRequest(context) {
        // Retrieve the API Key from Script Parameters
        // Ensure you have a parameter named 'custscript_gemini_api_key' on your script record
        const apiKey = runtime.getCurrentScript().getParameter({ name: 'custscript_gemini_api_key' });

        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'NetSuite Saved Search AI Assistant (Gemini)' });
            
            const fieldgroup = form.addFieldGroup({ id: 'chat_group', label: 'AI Conversation' });
            
            // Reusing your clean HTML/CSS Chat Interface
            const htmlField = form.addField({ 
                id: 'custpage_chat_interface', 
                type: serverWidget.FieldType.INLINEHTML, 
                label: 'Chat',
                container: 'chat_group'
            });

            htmlField.defaultValue = `
                <style>
                    body { font-family: -apple-system, sans-serif; background-color: #f4f7f9; }
                    #chat-box { border: 1px solid #d1d7dd; height: 450px; overflow-y: auto; padding: 20px; margin-bottom: 15px; background: #ffffff; border-radius: 8px; }
                    .user-msg { color: #fff; background-color: #0070d2; margin: 10px 0 10px auto; padding: 10px 15px; border-radius: 15px 15px 0 15px; max-width: 75%; clear: both; float: right; }
                    .ai-msg { color: #333; margin: 10px auto 10px 0; background: #eef1f6; padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 85%; clear: both; float: left; border: 1px solid #d8dde6; line-height: 1.6; white-space: pre-wrap; font-size: 13px; }
                    .loader { font-style: italic; color: #706e6b; margin: 10px 0; clear: both; }
                    .input-container { display: flex; gap: 10px; }
                    input#user-input { flex-grow: 1; padding: 12px; border: 1px solid #dddbda; border-radius: 4px; }
                    button#send-btn { background: #0070d2; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: 600; }
                    code { background: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
                </style>
                <div id="chat-box">
                    <div class="ai-msg">Hello! I am your NetSuite Search Expert. Describe the search you want to build (e.g., "All open Sales Orders from last month") and I will generate the SuiteScript code for you.</div>
                </div>
                <div class="input-container">
                    <input type="text" id="user-input" placeholder="Describe your Saved Search..." onkeydown="if(event.key === 'Enter') sendMessage()">
                    <button id="send-btn" onclick="sendMessage()">Generate</button>
                </div>
                <script>
                    async function sendMessage() {
                        const input = document.getElementById('user-input');
                        const box = document.getElementById('chat-box');
                        const btn = document.getElementById('send-btn');
                        const msg = input.value.trim();
                        if(!msg) return;

                        box.innerHTML += '<div class="user-msg">' + msg + '</div>';
                        input.value = '';
                        input.disabled = true;
                        btn.disabled = true;

                        const loadingId = 'load-' + Date.now();
                        box.innerHTML += '<div id="'+loadingId+'" class="loader">Gemini is writing script...</div>';
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
                                box.innerHTML += '<div class="ai-msg" style="color:red"><b>Error:</b> ' + data.error + '</div>';
                            } else {
                                // Formatting for code blocks if present
                                let formattedAnswer = data.answer.replace(/\\`\\`\\`javascript/g, '<code>').replace(/\\`\\`\\`/g, '</code>');
                                box.innerHTML += '<div class="ai-msg">' + formattedAnswer + '</div>';
                            }
                        } catch (e) {
                            document.getElementById(loadingId).remove();
                            box.innerHTML += '<div class="ai-msg">Error: Could not connect to Suitelet.</div>';
                        }
                        input.disabled = false;
                        btn.disabled = false;
                        box.scrollTop = box.scrollHeight;
                        input.focus();
                    }
                </script>
            `;
            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });

            try {
                if (!apiKey) throw new Error("Gemini API Key is missing. Please check script parameters.");

                const requestBody = (typeof context.request.body === 'object') ? context.request.body : JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                const SYSTEM_PROMPT = `
                    You are a NetSuite Developer. Translate user requests into SuiteScript 2.1 'search.create' code.
                    Explain the filters and columns used. If the request is not related to NetSuite, politely decline.
                    Format the code clearly.
                `;

                const aiResponse = callGeminiAPI(SYSTEM_PROMPT + "\n\nUser Request: " + userPrompt, apiKey);

                context.response.write(JSON.stringify({ answer: aiResponse }));

            } catch (e) {
                log.error('POST Error', e.message);
                context.response.write(JSON.stringify({ error: e.message }));
            }
        }
    }

    /**
     * Reusable Gemini API function
     */
    function callGeminiAPI(promptText, key) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

        const response = https.post({
            url: url,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.2 }
            })
        });

        if (response.code !== 200) {
            log.error('API Error', response.body);
            throw new Error("Gemini API returned status " + response.code);
        }

        const resBody = JSON.parse(response.body);
        if (resBody.candidates && resBody.candidates[0].content) {
            return resBody.candidates[0].content.parts[0].text;
        }
        throw new Error("No response content from Gemini.");
    }

    return { onRequest: onRequest };
});
