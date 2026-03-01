/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/https', 'N/runtime', 'N/log', 'N/search'], (serverWidget, https, runtime, log, search) => {

    const GEMINI_MODEL = 'gemini-2.0-flash';

    function onRequest(context) {
        const scriptObj = runtime.getCurrentScript();
        const apiKey = scriptObj.getParameter({ name: 'custscript_gemini_api_key' });

        if (context.request.method === 'GET') {
            const form = serverWidget.createForm({ title: 'NetSuite Search Auto-Creator' });
            const htmlField = form.addField({ id: 'custpage_html', type: serverWidget.FieldType.INLINEHTML, label: 'HTML' });

            let htmlContent = '<style>';
            htmlContent += 'body { font-family: sans-serif; background-color: #f4f7f9; padding: 20px; }';
            htmlContent += '#chat-box { border: 1px solid #d1d7dd; height: 400px; overflow-y: auto; padding: 15px; background: #fff; border-radius: 8px; margin-bottom: 10px; flex-direction: column; display: flex; }';
            htmlContent += '.user-msg { background: #0070d2; color: #fff; align-self: flex-end; padding: 10px; border-radius: 10px; margin: 5px; max-width: 80%; }';
            htmlContent += '.ai-msg { background: #f0f2f5; color: #333; align-self: flex-start; padding: 10px; border-radius: 10px; margin: 5px; max-width: 80%; border: 1px solid #d8dde6; }';
            htmlContent += '.loader { font-style: italic; color: #706e6b; margin: 5px; }';
            htmlContent += '</style>';
            htmlContent += '<div id="chat-box"><div class="ai-msg">What search should I create and save for you?</div></div>';
            htmlContent += '<div style="display:flex; gap:5px;"><input type="text" id="user-input" style="flex-grow:1; padding:10px;" placeholder="e.g. Save a search for all customers in New York..."><button onclick="sendMessage()" style="padding:10px 20px; background:#0070d2; color:white; border:none; cursor:pointer;">Create & Save</button></div>';

            htmlContent += '<script>';
            htmlContent += 'async function sendMessage() {';
            htmlContent += '  var input = document.getElementById("user-input"); var box = document.getElementById("chat-box");';
            htmlContent += '  var msg = input.value; if(!msg) return;';
            htmlContent += '  box.innerHTML += \'<div class="user-msg">\' + msg + \'</div>\'; input.value = "";';
            htmlContent += '  var lid = "l-"+Date.now(); box.innerHTML += \'<div id="\' + lid + \'" class="loader">Creating search in NetSuite...</div>\';';
            htmlContent += '  try {';
            htmlContent += '    const res = await fetch(window.location.href, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({prompt: msg}) });';
            htmlContent += '    const data = await res.json();';
            htmlContent += '    document.getElementById(lid).remove();';
            htmlContent += '    box.innerHTML += \'<div class="ai-msg">\' + data.answer + \'</div>\';';
            htmlContent += '  } catch(e) { document.getElementById(lid).innerText = "Error."; }';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            htmlContent += '}';
            htmlContent += '</script>';

            htmlField.defaultValue = htmlContent;
            context.response.writePage(form);

        } else if (context.request.method === 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            try {
                const requestBody = JSON.parse(context.request.body);
                const userPrompt = requestBody.prompt;

                // We instruct Gemini to return a JSON configuration that we can safely pass to search.create()
                const systemPrompt = "You are a NetSuite bot. The user wants to create a saved search. " +
                                     "Return ONLY a JSON object that fits the 'search.create' options in SuiteScript 2.1. " +
                                     "Include 'type', 'filters', 'columns', and a 'title'. " +
                                     "Ensure the 'title' starts with 'AI: '. Do not return any markdown or text, only the JSON.";
                
                const aiResponseRaw = callGeminiAPI(systemPrompt + "\n\nUser Request: " + userPrompt, apiKey);
                
                // Clean the response (Gemini sometimes adds markdown blocks)
                const cleanJson = aiResponseRaw.replace(/```json/g, "").replace(/```/g, "").trim();
                const searchConfig = JSON.parse(cleanJson);

                // Execute the creation
                const newSearch = search.create(searchConfig);
                const searchId = newSearch.save();

                log.debug('Search Created', 'ID: ' + searchId + ' Config: ' + cleanJson);

                context.response.write(JSON.stringify({ 
                    answer: "Your saved search **" + searchConfig.title + "** is ready and saved. (Internal ID: " + searchId + ")" 
                }));

            } catch (e) {
                log.error('AUTO_SAVE_ERROR', e.message);
                context.response.write(JSON.stringify({ error: "I couldn't save that search. It might be due to invalid field names. Error: " + e.message }));
            }
        }
    }

    function callGeminiAPI(promptText, key) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key;
        const response = https.post({
            url: url,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        const resBody = JSON.parse(response.body);
        return resBody.candidates[0].content.parts[0].text;
    }

    return { onRequest: onRequest };
});
