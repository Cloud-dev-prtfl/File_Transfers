# Technical Implementation Guide: WhatsApp Consent Workflow via Zoho Creator

**Document Version:** 1.0
**Target Audience:** Zoho Creator Developers, System Administrators
**Objective:** To establish an automated, end-to-end workflow capturing user consent via WhatsApp Business API (Meta Cloud) directly from a Zoho Creator application.

---

## 1. System Requirements & Prerequisites

Before initiating the development within Zoho Creator, ensure the following administrative and infrastructural requirements are met:

*   **Zoho Creator:** Active account with permissions to create applications, forms, workflows, and expose REST APIs (Microservices).
*   **Meta Developer Account:** An active Meta developer account with a registered App and the "WhatsApp" product enabled.
*   **WhatsApp Business Account (WABA):** A configured WABA with a verified Phone Number ID and a Permanent System User Access Token.

---

## 2. Meta Cloud API Configuration

The foundation of this integration relies on Meta's Graph API.

### 2.1. Generate API Credentials
1. Navigate to the **Meta for Developers** console.
2. Select your App and navigate to **WhatsApp > API Setup**.
3. Securely document the following credentials:
   * **Phone Number ID**
   * **WhatsApp Business Account ID**
   * **Temporary/Permanent Access Token** *(Note: For production, ensure a System User permanent token is generated via Business Settings).*

### 2.2. Create the Message Template
1. Navigate to the **WhatsApp Manager > Message Templates**.
2. Create a new template with the following specifications:
   * **Name:** `consent_request`
   * **Category:** Utility
   * **Language:** English (US)
   * **Body:** `Hi {{1}}, we need your consent to proceed with your application. Please tap below to confirm.`
   * **Buttons:** Select "Quick Reply" and add two buttons: **"I Consent"** and **"Decline"**.
3. Submit the template for Meta's review process.

---

## 3. Zoho Creator Application Boilerplate

### 3.1. Database Schema (Form Creation)
Create a new application named **Consent Management** and build a form titled **Customer Consent** with the following fields:

| Field Name        | Field Type    | Notes / Configurations |
| :---              | :---          | :---                   |
| `Customer_Name`   | Single Line   | Mandatory              |
| `Phone_Number`    | Phone         | Ensure country code is included without '+' (e.g., 919876543210). |
| `Consent_Status`  | Drop Down     | Choices: `Pending`, `Consented`, `Declined`. Set default to `Pending`. |
| `Meta_Message_ID` | Single Line   | Hide this field from the user UI. Used for auditing message delivery. |

---

## 4. Outbound Messaging Logic (Deluge Script)

To dispatch the WhatsApp message automatically upon record creation, implement the following Deluge script. 

**Navigation:** Workflows > Form Workflows > Customer Consent > On Add > On Success

```deluge
// ==========================================
// 1. Setup API Credentials & Endpoints
// ==========================================
token = "YOUR_META_ACCESS_TOKEN";
phone_id = "YOUR_PHONE_NUMBER_ID";
endpoint = "https://graph.facebook.com/v18.0/" + phone_id + "/messages";

// ==========================================
// 2. Format Phone Number
// ==========================================
// Meta requires phone numbers without '+' or spaces.
targetPhone = input.Phone_Number.removeAll("+").removeAll(" ");

// ==========================================
// 3. Construct HTTP Headers
// ==========================================
headersMap = Map();
headersMap.put("Authorization", "Bearer " + token);
headersMap.put("Content-Type", "application/json");

// ==========================================
// 4. Construct Template Parameters
// ==========================================
// Maps the Customer_Name to the {{1}} variable in the WhatsApp template
param1 = Map();
param1.put("type", "text");
param1.put("text", input.Customer_Name);

bodyComponent = Map();
bodyComponent.put("type", "body");
bodyComponent.put("parameters", {param1});

templateMap = Map();
templateMap.put("name", "consent_request"); // Must match Meta template name exactly
templateMap.put("language", {"code":"en_US"});
templateMap.put("components", {bodyComponent});

// ==========================================
// 5. Construct Final JSON Payload
// ==========================================
payload = Map();
payload.put("messaging_product", "whatsapp");
payload.put("recipient_type", "individual");
payload.put("to", targetPhone);
payload.put("type", "template");
payload.put("template", templateMap);

// ==========================================
// 6. Execute POST Request via invokeurl
// ==========================================
response = invokeurl
[
    url : endpoint
    type : POST
    parameters : payload.toString()
    headers : headersMap
];

// ==========================================
// 7. Audit & Update Record
// ==========================================
info "Meta API Response: " + response;
if(response.get("messages") != null)
{
    messageId = response.get("messages").get(0).get("id");
    input.Meta_Message_ID = messageId;
}
```

---

## 5. Inbound Webhook (Capturing the Response)

To update the `Consent_Status` when the customer clicks a button in WhatsApp, you must expose a REST endpoint in Zoho Creator to ingest Meta's webhook payload.

### 5.1. Expose Zoho Creator REST API
1. Navigate to **Microservices** (or Developer Zone > REST API).
2. Create a new function exposed as an API endpoint that accepts a `request` string parameter.

### 5.2. Webhook Handling Script (Deluge)
Deploy the following logic to parse the incoming Meta webhook:

```deluge
void meta_integration.Handle_WhatsApp_Webhook(string request)
{
    // 1. Parse the incoming JSON payload from Meta
    reqMap = request.toMap();
    
    // Ensure payload contains entry data
    if(reqMap.containKey("entry"))
    {
        entry = reqMap.get("entry").get(0);
        change = entry.get("changes").get(0).get("value");
        
        // 2. Filter for incoming user messages
        if(change.containKey("messages"))
        {
            message = change.get("messages").get(0);
            
            // 3. Verify it is an Interactive Button click
            if(message.get("type") == "button")
            {
                buttonText = message.get("button").get("text");
                fromPhone = message.get("from");
                
                // 4. Locate the corresponding record in Zoho Creator
                consentRecord = Customer_Consent[Phone_Number == fromPhone];
                
                if(consentRecord.count() > 0)
                {
                    // 5. Update Status based on button selection
                    if(buttonText == "I Consent") 
                    {
                        consentRecord.Consent_Status = "Consented";
                    } 
                    else if(buttonText == "Decline") 
                    {
                        consentRecord.Consent_Status = "Declined";
                    }
                }
            }
        }
    }
}
```

### 5.3. Register Webhook in Meta
1. Copy the URL of your exposed Zoho Creator function.
2. Navigate to your Meta App Dashboard > **WhatsApp > Configuration**.
3. Under **Webhooks**, click Edit, paste the Zoho URL, and verify.
4. Subscribe to the **`messages`** webhook field.

---

## 6. Testing & Validation Procedures

To ensure a resilient deployment, execute the following test plan:

### Phase A: Outbound Verification
1. Access the live **Customer Consent** form in Zoho Creator.
2. Submit a test record using a registered test phone number.
3. **Expected Result:** The form submits successfully, the `Meta_Message_ID` is populated in the backend, and a WhatsApp message arrives on the target device containing the structured template and buttons.
4. **Troubleshooting:** If the message fails to arrive, review the **Application Logs** in Zoho Creator's Developer Zone to inspect the `invokeurl` error response.

### Phase B: Inbound Verification
1. Open the WhatsApp message on the test device.
2. Tap the **"I Consent"** quick reply button.
3. Navigate to the **Customer Consent Report** in Zoho Creator.
4. **Expected Result:** The `Consent_Status` field transitions from *Pending* to *Consented* automatically.
5. **Troubleshooting:** If the status does not update, verify the Meta Webhook dashboard to ensure messages are successfully delivering to your Zoho API endpoint (HTTP 200 OK). 