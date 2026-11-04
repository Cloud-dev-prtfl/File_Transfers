# Demo Playbook: Revoking Zoho MCP Access

**Objective:** To demonstrate to the client a foolproof, step-by-step process for completely revoking an ex-employee's access to Zoho Books via a personal Claude Code MCP (Model Context Protocol) connection.
**Scenario:** An employee has left the company. They previously connected their personal Claude Code instance to the company's Zoho Books MCP server. The client needs to see how to permanently sever this connection to protect company data.

---

## Part 1: Sandbox Preparation (Pre-Demo Setup)
*Complete these steps before getting on the call with the client to ensure a seamless live demonstration.*

### 1. Account Prerequisites
*   **Admin Account:** Your primary login with full administrative rights to Zoho Books and the Zoho MCP Console.
*   **Employee/Demo Account:** A secondary login acting as the employee.
*   **Claude Environment:** A local instance of Claude Code.

### 2. Configure Zoho Books Access
1. Log in to Zoho Books using the **Admin Account**.
2. Navigate to **Settings (Gear Icon) > Users & Roles**.
3. Click **Invite User** and send an invitation to the **Employee Account** email.
4. Open the email for the Employee Account, accept the invitation, and set up the login credentials. 

### 3. Configure the Zoho MCP Server
1. Log in to the Zoho MCP Console (`mcp.zoho.com` or equivalent regional URL) using the **Admin Account**.
2. Create a new MCP Server specifically for this demo (e.g., "Finance_MCP_Demo").
3. Connect the server to the Zoho Books environment.
4. Navigate to the **Collaborators** section of the newly created MCP Server.
5. Add the **Employee Account** as a collaborator so they have permission to utilize the server endpoint.
6. Copy the MCP Server URL/Configuration details provided by the console.

### 4. Establish the Claude Code Connection
1. Open your terminal and initialize **Claude Code**.
2. Configure the MCP server using the URL/details copied in the previous step.
3. When Claude prompts for authorization/authentication to use the Zoho tools, log in using the **Employee Account** credentials. 
4. **Test the Connection:** Run a prompt in Claude, such as: 
   > *"List the 3 most recent invoices in Zoho Books."*
5. Verify that Claude successfully retrieves the data. **Leave this terminal window open for the live demo.**

---

## Part 2: Live Demo Execution & Speaking Script
*This section outlines the exact clicks and the accompanying narrative to use while screen-sharing with the client.*

### Phase 1: Proving the Active Connection
**Action:** Share your screen showing the Claude Code terminal.
**Script:** 
> "Hello everyone. Today, we are looking at how to securely offboard an employee and ensure their personal AI tools, specifically Claude Code, lose all access to your Zoho Books data immediately. 
> 
> Right now, you are looking at the ex-employee's personal Claude instance. As you can see, when I ask Claude to pull our recent invoices, it successfully connects to the Zoho MCP and fetches real-time financial data because the employee previously authorized it. Let's walk through exactly how to sever this connection permanently."

### Phase 2: Core System Revocation
**Action:** Switch your screen share to the Zoho Books Admin window.
1. Go to **Settings > Users & Roles**.
2. Locate the Demo/Employee user.
3. Click the **More** (three dots) icon and select **Delete** (or Mark as Inactive).

**Script:** 
> "The absolute most critical step is cutting off their core permissions. Because the Zoho MCP relies on the user's actual Zoho access tokens, cutting them off at the source is our primary defense. 
> 
> I am currently logged into Zoho Books as the Administrator. I'll navigate to Settings, then Users & Roles. I find the departing employee, click here, and delete their account. Instantly, this user's authorization token is invalidated. They no longer have permission to read or write any data in your organization, meaning Claude can no longer act on their behalf."

### Phase 3: MCP Console Cleanup
**Action:** Switch your screen share to the Zoho MCP Console.
1. Navigate to the specific MCP Server.
2. Go to **Collaborators** and remove the Demo/Employee user.
3. Go to the API/Configuration section and click **Regenerate API Key** (or Regenerate URL).

**Script:** 
> "To be absolutely thorough and maintain perfect security hygiene, we also want to remove their footprint from the MCP console itself. This ensures they can't even attempt to ping our server. 
> 
> I am now in the Zoho MCP Console as the Admin. First, I will remove the employee from the Collaborators list. Finally, and this is a crucial security step, I am going to regenerate the API key for this specific MCP server. When an employee connects Claude, it saves a specific endpoint URL. By regenerating this key, that URL becomes completely dead."

### Phase 4: Verification (The "Proof")
**Action:** Switch the screen share back to the Claude Code terminal.
1. Type the exact same prompt used in Phase 1: *"List the 3 most recent invoices in Zoho Books."*
2. Hit enter and let the client watch the request fail (it should return an authorization/authentication error).

**Script:** 
> "Now for the proof. Let's switch back to the ex-employee's personal Claude instance. Imagine they have gone home and are trying to prompt Claude to pull your company's financial data again. Watch what happens when I run the exact same prompt. 
> 
> *[Run prompt]* 
> 
> As you can see, the request immediately fails with an authorization error. The MCP URL is dead, and their Zoho token is tied to a deleted account. Their access is completely, permanently, and securely revoked at multiple levels."

---

## Part 3: Anticipated Client Q&A

*   **Client Question:** Do we *have* to regenerate the MCP URL every time someone leaves? Doesn't that break it for everyone else?
    *   **Answer:** If the MCP server is shared among multiple active employees, simply deleting the user from Zoho Books (Phase 2) is sufficient to block *their* specific Claude access, as their personal OAuth token is invalidated. Regenerating the URL is an optional "nuclear option" for maximum security, usually reserved for when a highly privileged admin leaves or if you suspect the endpoint URL has been leaked externally. 
*   **Client Question:** How quickly does the revocation take effect?
    *   **Answer:** Deleting the user in Zoho Books immediately invalidates their session and API tokens. The block in Claude is instantaneous the next time the tool attempts to fetch data.