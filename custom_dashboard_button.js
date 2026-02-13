/**
 * @NApiVersion 2.1
 * @NScriptType Portlet
 */
define([], () => {

    const render = (params) => {
        const portlet = params.portlet;
        
        // Title is required for the portlet box, but the button will float outside it
        portlet.title = 'Quick Actions';

        // TARGET URL: Replace with your Suitelet or Record URL
        const targetUrl = '/app/site/hosting/scriptlet.nl?script=customscript_my_suitelet&deploy=customdeploy_my_suitelet';

        const content = `
            <style>
                /* Floating Container */
                #dashboard-fab-container {
                    position: fixed;
                    top: 50%;
                    right: 0;
                    z-index: 99999; /* High z-index to sit on top of dashboard widgets */
                    transform: translateY(-50%);
                    cursor: pointer;
                    transition: right 0.3s ease;
                }
                
                /* Button Styling */
                .dashboard-fab-btn {
                    background-color: #2b3e50;
                    color: white;
                    padding: 15px 10px;
                    border-radius: 8px 0 0 8px;
                    box-shadow: -2px 2px 5px rgba(0,0,0,0.2);
                    text-align: center;
                    font-family: Arial, sans-serif;
                    font-size: 20px;
                }

                .dashboard-fab-btn:hover {
                    background-color: #1a2632;
                    padding-right: 15px;
                }
            </style>

            <div id="dashboard-fab-container" onclick="window.open('${targetUrl}', '_blank')">
                <div class="dashboard-fab-btn">
                    <span>&#8505;</span>
                </div>
            </div>
        `;

        portlet.html = content;
    }

    return { render }
});
