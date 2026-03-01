/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/https', 'N/runtime', 'N/log', 'N/search', 'N/url'], (serverWidget, https, runtime, log, search, url) => {

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
            htmlContent += '.user-msg { background: #0070d2; color: #fff; align-self: flex-end; padding: 12px; border-radius: 12px 12px 2px 12px; margin: 5px; max-width: 80%; }';
            htmlContent += '.ai-msg { background: #f0f2f5; color: #333; align-self: flex-start; padding: 12px; border-radius: 12px 12px 12px 2px; margin: 5px; max-width: 85%; border: 1px solid #d8dde6; line-height: 1.5; }';
            htmlContent += '.loader { font-style: italic; color: #706e6b; margin: 5px; }';
            htmlContent += '.search-link { display: inline-block; margin-top: 10px; color: #0070d2; font-weight: bold; text-decoration: underline; border: 1px solid #0070d2; padding: 5px 10px; border-radius: 4px; background: #fff; }';
            htmlContent += '</style>';
            
            htmlContent += '<div id="chat-box"><div class="ai-msg">Describe the search you want to save. I will create it directly in your account.</div></div>';
            htmlContent += '<div style="display:flex; gap:10px;"><input type="text" id="user-input" style="flex-grow:1; padding:12px; border-radius:4px; border:1px solid #ccc;" placeholder="e.g. Create a search for all Customers in New York...">';
            htmlContent += '<button onclick="sendMessage()" id="send-btn" style="padding:10px 20px; background:#0070d2; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Create & Save</button></div>';

            htmlContent += '<script>';
            htmlContent += 'async function sendMessage() {';
            htmlContent += '  var input = document.getElementById("user-input"); var box = document.getElementById("chat-box"); var btn = document.getElementById("send-btn");';
            htmlContent += '  var msg = input.value.trim(); if(!msg) return;';
            htmlContent += '  box.innerHTML += \'<div class="user-msg">\' + msg + \'</div>\'; input.value = ""; input.disabled = true; btn.disabled = true;';
            htmlContent += '  var lid = "l-"+Date.now(); box.innerHTML += \'<div id="\' + lid + \'" class="loader">Generating and Saving Search...</div>\';';
            htmlContent += '  box.scrollTop = box.scrollHeight;';
            htmlContent += '  try {';
            htmlContent += '    const res = await fetch(window.location.href, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({prompt: msg}) });';
            htmlContent += '    const data = await res.json();';
            htmlContent += '    document.getElementById(lid).remove();';
            htmlContent += '    if(data.error) { box.innerHTML += \'<div class="ai-msg" style="color:red"><b>Error:</b> \' + data.error + \'</div>\'; }';
            htmlContent += '    else { box.innerHTML += \'<div class="ai-msg">\' + data.answer + \'</div>\'; }';
            htmlContent += '  } catch(e) { document.getElementById(lid).innerText = "Communication error."; }';
            htmlContent += '  input.disabled = false; btn.disabled = false; box.scrollTop = box.scrollHeight; input.focus();';
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

                const systemPrompt = "Convert user request into a JSON object for NetSuite search.create(). " +
                                     "Return ONLY the raw JSON object. NO markdown, NO ```json blocks. " +
                                     "The title field must start with 'AI Generated: '.";
                
                let aiResponseRaw = callGeminiAPI(systemPrompt + "\n\nRequest: " + userPrompt, apiKey);
                
                // Clean the response
                let cleanJson = aiResponseRaw.replace(/```json/g, "").replace(/```/g, "").replace(/JSON/g, "").trim();
                
                let searchConfig = JSON.parse(cleanJson);

                // Execute creation
                const newSearch = search.create(searchConfig);
                const searchId = newSearch.save();

                // FIX: Generate a fully qualified URL
                const domain = url.resolveDomain({
                    hostType: url.HostType.APPLICATION
                });
                const relativePath = url.resolveRecord({
                    recordType: 'savedsearch',
                    recordId: searchId,
                    isEditMode: false
                });
                const fullUrl = 'https://' + domain + relativePath;

                context.response.write(JSON.stringify({ 
                    answer: "Your saved search <b>" + searchConfig.title + "</b> is ready and saved.<br>" + 
                            "<a href='" + fullUrl + "' target='_blank' class='search-link'>Click here to view results</a>"
                }));

            } catch (e) {
                log.error('POST_ERROR', e.message);
                context.response.write(JSON.stringify({ error: e.message }));
            }
        }
    }

    function callGeminiAPI(promptText, key) {
        const endpoint = '[https://generativelanguage.googleapis.com/v1beta/models/](https://generativelanguage.googleapis.com/v1beta/models/)' + GEMINI_MODEL + ':generateContent?key=' + key;
        const response = https.post({
            url: endpoint,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.1 }
            })
        });
        if (response.code !== 200) throw new Error("Gemini API Error: " + response.code);
        const resBody = JSON.parse(response.body);
        return resBody.candidates[0].content.parts[0].text;
    }

    return { onRequest: onRequest };
});
