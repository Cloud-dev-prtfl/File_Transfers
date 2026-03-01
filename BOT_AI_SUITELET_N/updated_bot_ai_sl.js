/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/https', 'N/runtime', 'N/log'], (serverWidget, https, runtime, log) => {

    const GEMINI_MODEL = 'gemini-2.0-flash';

    function onRequest(context) {
        const scriptObj = runtime.getCurrentScript();
        const apiKey = scriptObj.getParameter({ name: 'custscript_gemini_api_key' });

        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'NetSuite AI Assistant (Gemini 2.0)' });
            const htmlField = form.addField({ 
                id: 'custpage_html', 
                type: serverWidget.FieldType.INLINEHTML, 
                label: 'HTML' 
            });

            // Using string concatenation to prevent backtick/template literal syntax errors in NS editor
            let htmlContent = '<style>';
            htmlContent += 'body { font-family: "Segoe UI", Tahoma, sans-serif; background-color: #f0f2f5; padding: 20px; }';
            htmlContent += '#chat-box { border: 1px solid #ced4da; height: 480px; overflow-y: auto; padding: 20px; margin-bottom: 15px; background: #ffffff; border-radius: 8px; display: flex; flex-direction: column; }';
            htmlContent += '.user-msg { color: #ffffff; background-color: #007bff; align-self: flex-end; margin: 8px 0; padding: 12px 18px; border-radius: 18px 18px 2px 18px; max-width: 75%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }';
            htmlContent += '.ai-msg { color: #333333; align-self: flex-start; margin: 8px 0; background: #e9ecef; padding: 12px 18px; border-radius: 18px 18px 18px 2px; max-width: 85%; border: 1px solid #dee2e6; line-height: 1.6; white-space: pre-wrap; font-size: 14px; }';
            htmlContent += '.loader { font-style: italic; color: #6c757d; margin: 10px 0; font-size: 13px; }';
            htmlContent += '.input-area { display: flex; gap: 10px; }';
            htmlContent += 'input { flex-grow: 1; padding: 14px; border: 1px solid #ced4da; border-radius: 30px; outline: none; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); }';
            htmlContent += 'button { padding: 0 25px; background: #007bff; color: white; border: none; border-radius: 30px; cursor: pointer; font-weight: bold; transition: background 0.2s; }';
            htmlContent += 'button:hover { background: #0056b3; }';
            htmlContent += '</style>';
            
            htmlContent += '<div id="chat-box"><div class="ai-msg">Hello! I am your NetSuite Search Expert. Describe the Saved Search you need, and I will write the SuiteScript 2.1 code for you.</div></div>';
            htmlContent += '<div class="input-area">';
            htmlContent += '<input type="text" id="user-input" placeholder="e.g., Show me all high-priority cases from last week..." onkeydown="if(event.key === \'Enter\') sendMessage()">';
            htmlContent += '<button id="send-btn" onclick="sendMessage()">Send</button>';
            htmlContent += '</div>';

            htmlContent += '<script>';
            htmlContent += 'async function sendMessage() {';
            htmlContent += '  var input = document.getElementById("user-input");';
            htmlContent += '  var box = document.getElementById("chat-box");';
            htmlContent += '  var btn = document.getElementById("send-btn");';
            htmlContent += '  var msg = input.value.trim();';
            htmlContent += '  if(!msg) return;';
            
            htmlContent += '  box.innerHTML += \'<div class="user-msg">\' + msg.replace(/</g, "&lt;") + \'</div>\';';
            htmlContent += '  input.value = "";';
            htmlContent += '  input.disabled = true; btn.disabled = true;';
            
            htmlContent += '  var loadId = "ld-" + Date.now();';
            htmlContent += '  box.innerHTML += \'<div id="\' + loadId + \'" class="loader">Gemini is thinking...</div>\';';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            
            htmlContent += '  try {';
            htmlContent += '    const response = await fetch(window.location.href, {';
            htmlContent += '      method: "POST",';
            htmlContent += '      headers: { "Content-Type": "application/json" },';
            htmlContent += '      body: JSON.stringify({ prompt: msg })';
            htmlContent += '    });';
            htmlContent += '    const data = await response.json();';
            htmlContent += '    document.getElementById(loadId).remove();';
            
            htmlContent += '    if(data.error) {';
            htmlContent += '      box.innerHTML += \'<div class="ai-msg" style="background:#fff1f0; border-color:#ffa39e; color:#cf1322;"><b>Error:</b> \' + data.error + \'</div>\';';
            htmlContent += '    } else {';
            htmlContent += '      box.innerHTML += \'<div class="ai-msg">\' + data.answer + \'</div>\';';
            htmlContent += '    }';
            htmlContent += '  } catch (e) {';
            htmlContent += '    document.getElementById(loadId).innerText = "Critical error communicating with Suitelet.";';
            htmlContent += '  }';
            
            htmlContent += '  input.disabled = false; btn.disabled = false;';
            htmlContent += '  input.focus();';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            htmlContent += '}';
            htmlContent += '</script>';

            htmlField.defaultValue = htmlContent;
            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            try {
                if (!apiKey) throw new Error("API Key parameter (custscript_gemini_api_key) is not configured.");

                const requestBody = JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                const SYSTEM_PROMPT = "You are a NetSuite Developer. Your task is to provide SuiteScript 2.1 code using the N/search module. " +
                                     "Provide the full code for search.create(). Do not explain common basics, just focus on the filters and columns. " +
                                     "If the user asks for something not possible via Saved Search, explain why.";
                
                const aiResponse = callGeminiAPI(SYSTEM_PROMPT + "\n\nUser Request: " + userPrompt, apiKey);
                
                context.response.write(JSON.stringify({ answer: aiResponse }));
            } catch (e) {
                log.error('POST_HANDLER_ERROR', e.message);
                context.response.write(JSON.stringify({ error: e.message }));
            }
        }
    }

    /**
     * Internal function to call Google Gemini API
     */
    function callGeminiAPI(promptText, key) {
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;
        
        const response = https.post({
            url: endpoint,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { 
                    temperature: 0.1,
                    maxOutputTokens: 2048
                }
            })
        });

        if (response.code !== 200) {
            log.error('GEMINI_HTTP_ERROR', 'Status: ' + response.code + ' Body: ' + response.body);
            throw new Error("Gemini API Error (Status " + response.code + ")");
        }

        const resBody = JSON.parse(response.body);
        if (resBody.candidates && resBody.candidates[0].content) {
            return resBody.candidates[0].content.parts[0].text;
        }
        
        return "The AI was unable to generate a response. Please try a different prompt.";
    }

    return { onRequest: onRequest };
});
