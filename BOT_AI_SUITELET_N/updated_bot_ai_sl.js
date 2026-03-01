/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/https', 'N/runtime', 'N/log'], (serverWidget, https, runtime, log) => {

    const GEMINI_MODEL = 'gemini-2.0-flash';

    function onRequest(context) {
        // Fetch the API Key from Script Parameter: custscript_gemini_api_key
        const scriptObj = runtime.getCurrentScript();
        const apiKey = scriptObj.getParameter({ name: 'custscript_gemini_api_key' });

        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'NetSuite AI Assistant (Gemini 2.0)' });
            const htmlField = form.addField({ 
                id: 'custpage_html', 
                type: serverWidget.FieldType.INLINEHTML, 
                label: 'HTML' 
            });

            // Using concatenation for the HTML string to avoid backtick issues in some NS editors
            let htmlContent = '<style>';
            htmlContent += 'body { font-family: sans-serif; padding: 20px; background-color: #f8f9fa; }';
            htmlContent += '#chat-box { border: 1px solid #dee2e6; height: 450px; overflow-y: auto; padding: 15px; margin-bottom: 15px; background: #fff; border-radius: 10px; }';
            htmlContent += '.user-msg { color: #fff; background-color: #1a73e8; margin: 10px 0 10px auto; padding: 10px 15px; border-radius: 15px 15px 0 15px; max-width: 75%; clear: both; float: right; }';
            htmlContent += '.ai-msg { color: #333; margin: 10px auto 10px 0; background: #f1f3f4; padding: 10px 15px; border-radius: 15px 15px 15px 0; max-width: 80%; clear: both; float: left; border: 1px solid #e8eaed; line-height: 1.5; white-space: pre-wrap; }';
            htmlContent += '.loader { font-style: italic; color: #5f6368; margin: 10px 0; clear: both; }';
            htmlContent += '.input-area { display: flex; gap: 10px; clear: both; }';
            htmlContent += 'input { flex-grow: 1; padding: 12px; border: 1px solid #dadce0; border-radius: 24px; outline: none; }';
            htmlContent += 'button { padding: 12px 25px; background: #1a73e8; color: white; border: none; border-radius: 24px; cursor: pointer; font-weight: bold; }';
            htmlContent += '</style>';
            
            htmlContent += '<div id="chat-box"><div class="ai-msg">Hello! I am your NetSuite Assistant. How can I help you with your Saved Searches or Data today?</div></div>';
            htmlContent += '<div class="input-area">';
            htmlContent += '<input type="text" id="user-input" placeholder="Ask me anything..." onkeydown="if(event.key === \'Enter\') sendMessage()">';
            htmlContent += '<button id="send-btn" onclick="sendMessage()">Send</button>';
            htmlContent += '</div>';

            htmlContent += '<script>';
            htmlContent += 'async function sendMessage() {';
            htmlContent += '  var input = document.getElementById("user-input");';
            htmlContent += '  var box = document.getElementById("chat-box");';
            htmlContent += '  var msg = input.value.trim();';
            htmlContent += '  if(!msg) return;';
            htmlContent += '  box.innerHTML += \'<div class="user-msg">\' + msg + \'</div>\';';
            htmlContent += '  input.value = "";';
            htmlContent += '  var loadId = "ld-" + Date.now();';
            htmlContent += '  box.innerHTML += \'<div id="\' + loadId + \'" class="loader">Thinking...</div>\';';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            htmlContent += '  try {';
            htmlContent += '    const response = await fetch(window.location.href, {';
            htmlContent += '      method: "POST",';
            htmlContent += '      headers: { "Content-Type": "application/json" },';
            htmlContent += '      body: JSON.stringify({ prompt: msg })';
            htmlContent += '    });';
            htmlContent += '    const data = await response.json();';
            htmlContent += '    document.getElementById(loadId).remove();';
            htmlContent += '    if(data.error) { box.innerHTML += \'<div class="ai-msg" style="color:red">Error: \' + data.error + \'</div>\'; }';
            htmlContent += '    else { box.innerHTML += \'<div class="ai-msg">\' + data.answer + \'</div>\'; }';
            htmlContent += '  } catch (e) { document.getElementById(loadId).innerText = "Error contacting Suitelet."; }';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            htmlContent += '}';
            htmlContent += '</script>';

            htmlField.defaultValue = htmlContent;
            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            try {
                if (!apiKey) throw new Error("API Key (custscript_gemini_api_key) is missing.");

                const requestBody = JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                const systemPrompt = "You are a NetSuite expert. If the user asks for a search, provide SuiteScript 2.1 code using search.create. Keep explanations brief.";
                
                const aiResponse = callGeminiAPI(systemPrompt + "\n\nUser: " + userPrompt, apiKey);
                
                context.response.write(JSON.stringify({ answer: aiResponse }));
            } catch (e) {
                log.error('POST_ERROR', e.message);
                context.response.write(JSON.stringify({ error: e.message }));
            }
        }
    }

    function callGeminiAPI(promptText, key) {
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;
        
        const response = https.post({
            url: endpoint,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.1 }
            })
        });

        if (response.code !== 200) {
            throw new Error("Gemini API Fail: " + response.code);
        }

        const resBody = JSON.parse(response.body);
        if (resBody.candidates && resBody.candidates[0].content) {
            return resBody.candidates[0].content.parts[0].text;
        }
        return "No response from AI.";
    }

    return { onRequest: onRequest };
});
