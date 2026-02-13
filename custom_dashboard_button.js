const content = `
            <style>
                /* Container to center the button inside the portlet */
                #dashboard-fab-container {
                    display: flex;
                    justify-content: center; /* Center horizontally */
                    align-items: center;     /* Center vertically */
                    padding: 20px;           /* Add some breathing room */
                }

                /* Egg-Shaped Button */
                .dashboard-fab-btn {
                    background-color: #2b3e50;
                    color: white;
                    
                    /* EGG SHAPE MAGIC */
                    width: 60px;             /* Width */
                    height: 80px;            /* Height (taller than width for egg) */
                    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; 
                    /* The radius values above create a slightly wider bottom "egg" look. 
                       For a simple oval, use: border-radius: 50%; */
                    
                    /* Centering the icon/text inside the egg */
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    cursor: pointer;
                    transition: transform 0.2s ease, background-color 0.2s;
                }

                .dashboard-fab-btn:hover {
                    background-color: #1a2632;
                    transform: scale(1.05); /* Slight grow effect on hover */
                }

                .fab-icon {
                    font-size: 24px;
                    font-weight: bold;
                }
            </style>

            <div id="dashboard-fab-container">
                <div class="dashboard-fab-btn" onclick="window.open('${targetUrl}', '_blank')">
                    <span class="fab-icon">&#8505;</span> </div>
            </div>
        `;

        portlet.html = content;
