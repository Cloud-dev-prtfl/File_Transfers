/**
 * @NApiVersion 2.1
 * @NScriptType Portlet
 */
define([], () => {

    const render = (params) => {
        const portlet = params.portlet;
        
        // Title for the Dashboard Portlet Window
        portlet.title = 'Quick Actions';

        // ---------------------------------------------------------
        // TODO: REPLACE THIS URL WITH YOUR ACTUAL SUITELET OR RECORD URL
        // ---------------------------------------------------------
        const targetUrl = '/app/site/hosting/scriptlet.nl?script=customscript_my_suitelet&deploy=customdeploy_my_suitelet';

        // Define HTML & CSS for the Egg-Shaped Button
        const content = `
            <style>
                /* Container to center the button inside the portlet box */
                #egg-btn-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px 0;
                    width: 100%;
                }

                /* The Egg Shape Button */
                .egg-btn {
                    background-color: #2b3e50; /* Dark Blue */
                    color: white;
                    
                    /* Dimensions & Shape */
                    width: 60px;
                    height: 80px;
                    /* This creates the vertical egg shape (narrower top, wider bottom) */
                    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
                    
                    /* Centering the icon */
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    
                    /* Effects */
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    cursor: pointer;
                    transition: transform 0.2s ease, background-color 0.2s;
                    border: 2px solid #ffffff; /* Optional white border to make it pop */
                }

                /* Hover Effect */
                .egg-btn:hover {
                    background-color: #1a2632; /* Darker Blue */
                    transform: scale(1.05);    /* Slight grow */
                    box-shadow: 0 6px 8px rgba(0,0,0,0.4);
                }

                /* Icon / Text Style */
                .egg-icon {
                    font-size: 30px;
                    font-weight: bold;
                    margin-top: -5px; /* Slight adjustment to look visually centered in the egg */
                }
            </style>

            <div id="egg-btn-container">
                <div class="egg-btn" onclick="window.location.href='${targetUrl}'">
                    <span class="egg-icon">&#8505;</span> </div>
            </div>
        `;

        // Inject the content into the portlet
        portlet.html = content;
    }

    return { render }
});
