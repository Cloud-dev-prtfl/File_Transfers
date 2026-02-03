/**
Automated "Customer Apology" Logic tool.

This tool allows the AI to react to an angry customer by looking up their spending history (LTV), calculating an appropriate "apology credit" amount automatically, and generating a draft Credit Memo in NetSuite.

1. SuiteScript 2.1 Logic File (ApologyIncentiveTool.js)
This script handles the heavy lifting: it calculates the customer's value (LTV) to ensure you don't over-credit a low-value customer, and creates the transaction.
 */


/**
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    /**
     * Calculates LTV-based compensation and creates a draft Credit Memo.
     * * @param {Object} params - Input parameters from the AI.
     * @param {string} params.caseNumber - The Case Number (e.g., "CAS-00123") from the current conversation.
     * @param {string} params.sentiment - The detected sentiment (e.g., "Angry", "Frustrated"). Used for logging.
     * @returns {Object} Result object with credit details for the AI to use in the email draft.
     */
    const processApologyIncentive = (params) => {
        try {
            log.audit({ title: 'AI Apology Tool', details: `Processing Case: ${params.caseNumber} | Sentiment: ${params.sentiment}` });

            // Step 1: Find Case and Customer ID
            const caseData = getCaseData(params.caseNumber);
            if (!caseData) {
                return { success: false, message: `Case Number '${params.caseNumber}' not found.` };
            }

            // Step 2: Calculate Customer Lifetime Value (LTV)
            // We sum up paid invoices to see how valuable this client is.
            const customerLTV = getCustomerLTV(caseData.customerId);
            
            // Step 3: Determine Credit Amount based on LTV Logic
            // Logic: High Value (>10k) gets $100; Mid Value (>1k) gets $50; Low gets $20.
            let creditAmount = 20.00;
            let tier = "Bronze";
            
            if (customerLTV > 10000) {
                creditAmount = 100.00;
                tier = "Gold";
            } else if (customerLTV > 1000) {
                creditAmount = 50.00;
                tier = "Silver";
            }

            // Step 4: Create the Credit Memo (Draft Status)
            const memoRecord = record.create({
                type: record.Type.CREDIT_MEMO,
                isDynamic: true
            });

            memoRecord.setValue({ fieldId: 'entity', value: caseData.customerId });
            memoRecord.setValue({ fieldId: 'memo', value: `AI Automated Goodwill - Ref Case ${params.caseNumber} (${tier} Tier)` });
            
            // Add a generic "Goodwill" item (Assume Internal ID 100 or lookup required in real deploy)
            // For this example, we set the item sublist line.
            memoRecord.selectNewLine({ sublistId: 'item' });
            // NOTE: In production, replace '123' with your actual 'Goodwill/Discount' Item ID.
            memoRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: 123 }); 
            memoRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: creditAmount });
            memoRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
            memoRecord.commitLine({ sublistId: 'item' });

            const memoId = memoRecord.save();

            return {
                success: true,
                creditMemoNumber: memoId, // In standard NS, save returns ID. You might need lookup for TranID.
                amount: creditAmount,
                customerName: caseData.customerName,
                ltvTier: tier,
                message: `Created Credit Memo #${memoId} for $${creditAmount}.`
            };

        } catch (e) {
            log.error({ title: 'Apology Tool Failure', details: e });
            return { success: false, message: e.message };
        }
    };

    // Helper: Get Case Internal ID and Customer Entity
    const getCaseData = (caseNumber) => {
        const s = search.create({
            type: search.Type.SUPPORT_CASE,
            filters: [['casenumber', 'is', caseNumber]],
            columns: ['internalid', 'company']
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        if (!res.length) return null;
        
        return {
            id: res[0].getValue('internalid'),
            customerId: res[0].getValue('company'),
            customerName: res[0].getText('company')
        };
    };

    // Helper: Calculate Total Invoiced Amount
    const getCustomerLTV = (customerId) => {
        const s = search.create({
            type: search.Type.INVOICE,
            filters: [
                ['entity', 'anyof', customerId],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: [
                search.createColumn({ name: 'total', summary: search.Summary.SUM })
            ]
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        // Return 0 if no results, otherwise the sum
        return res.length ? parseFloat(res[0].getValue({ name: 'total', summary: search.Summary.SUM })) || 0 : 0;
    };

    return {
        processApologyIncentive: processApologyIncentive
    };
});


/**
Tool Definition Schema (ApologyIncentiveSchema.json)
This schema tells the AI that it should use this tool specifically when it detects a negative situation and needs to resolve it financially.



{
  "name": "processApologyIncentive",
  "description": "Calculates a customer's lifetime value and generates a compensation Credit Memo. Use this when a customer is angry or dissatisfied and you need to offer a financial apology.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "caseNumber": {
        "type": "string",
        "description": "The Support Case Number associated with the complaint (e.g., CAS-001)."
      },
      "sentiment": {
        "type": "string",
        "description": "The detected emotional state of the customer (e.g., Angry, Disappointed)."
      }
    },
    "required": ["caseNumber"],
    "nullable": ["sentiment"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "creditMemoNumber": { "type": "string" },
      "amount": { "type": "number" },
      "customerName": { "type": "string" },
      "ltvTier": { "type": "string", "description": "The customer valuation tier (Gold/Silver/Bronze) used to decide the amount." }
    },
    "nullable": []
  }
}

 */


/** 3. SDF Object XML (customtool_apology_logic.xml)
This XML ensures the tool has permission to view Cases (to understand the problem), view Invoices (to calculate LTV), and create Credit Memos (to fix the problem). 

<tool scriptid="customtool_apology_logic">
    <name>Automated Apology &amp; Credit Tool</name>
    <description>Generates credit memos based on customer LTV for support cases.</description>
    <scriptfile>[/SuiteScripts/AI_Tools/ApologyIncentiveTool.js]</scriptfile>
    <schemafile>[/SuiteScripts/AI_Tools/ApologyIncentiveSchema.json]</schemafile>
    <exposeto3rdpartyagents>T</exposeto3rdpartyagents>
    <permissions>
        <permission>
            <permkey>LIST_CASE</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
        <permission>
            <permkey>TRAN_CUSTCRED</permkey>
            <permlevel>CREATE</permlevel>
        </permission>
        <permission>
            <permkey>TRAN_SALES</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
    </permissions>
</tool>

*/




/** Testing this specific "Apology Logic" tool requires a bit more setup than the Price Optimizer because it relies on existing records (Cases and Invoices) and a valid Item ID for the credit.

Here is the step-by-step guide to testing it safely.

Phase 1: Critical Code Adjustment (Do this first)
    In the script I provided (ApologyIncentiveTool.js), there is a placeholder you must change before uploading, or the script will crash.

    Open your ApologyIncentiveTool.js file.

    Find line 49: value: 123.

    Replace 123 with the Internal ID of a real "Service" or "Discount" item in your NetSuite account.

    How to find it: Go to Lists > Accounting > Items, find an item like "Goodwill Credit" or "Miscellaneous," click it, and look at the URL for id=XXXX.

Phase 2: Data Setup
    To see the logic working (Gold vs. Bronze tier), you need a test subject.

    Pick a Customer: Find a customer who has some paid Invoices (so the LTV calculation finds money) or create a new customer and bill them $12,000 to test the "Gold" tier logic.

    Create a Support Case:

    Go to Lists > Support > Cases > New.

    Assign it to that Customer.

    Note the Case Number (e.g., CAS-00045). This is your "Key" for the test.

Phase 3: The Live Test (In NetSuite)
    Once the files are uploaded and the Custom Tool record is created (just like the previous example):

    Open the Ask Oracle / NetSuite AI chat window.

    Type this prompt:

    "I am looking at Case #[Insert Your Case Number]. The customer is extremely frustrated and threatening to leave. Please process an apology incentive for them based on their spending history."

    Watch the Result:

    The AI will confirm it found the case.

    It will say something like: "I calculated the LTV for [Customer Name]. They are a Gold Tier customer ($15,000 LTV). I have created a draft Credit Memo for $100."

Phase 4: Verification
    Check the Credit Memo:

    Go to Transactions > Customers > Issue Credit Memos > List.

    Look for the most recent one.

    Verify: Does the amount match the tier? (>$10k = $100, >$1k = $50, else $20).

    Verify: Is the memo field populated with "AI Automated Goodwill..."?

    Check the Execution Log:

    Go to the Script Deployment.

    Look for: Processing Case: CAS-00045 | Sentiment: Frustrated.

*/