/**
"Lead Detective" Enricher tool.

This tool is designed to work in tandem with the AI's browsing capabilities. The AI acts as the "Researcher" (finding the data on the web), and this tool acts as the "Scribe," ensuring that valuable external data is permanently saved into your NetSuite Lead records.

1. SuiteScript 2.1 Logic File (LeadEnricherTool.js)
This script takes the data discovered by the AI and safely updates the Lead record.

Important: This script assumes you have created two custom fields on your Lead form:

custentity_ceo_name (Free-Form Text)

 */


/**
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    /**
     * Updates a Lead record with external intelligence (Revenue, CEO, Tech).
     * * @param {Object} params - Input parameters from the AI.
     * @param {string} params.companyName - The name of the company to enrich.
     * @param {number} params.annualRevenue - The estimated annual revenue found by AI.
     * @param {string} params.ceoName - The name of the CEO found by AI.
     * @param {string} params.techStack - A summary of the technologies they use (e.g., "AWS, Salesforce, React").
     * @returns {Object} Result object indicating success and updated fields.
     */
    const enrichLeadRecord = (params) => {
        try {
            log.audit({ title: 'Lead Detective', details: `Enriching: ${params.companyName}` });

            // Step 1: Find the Lead ID based on Company Name
            const leadId = getLeadId(params.companyName);
            
            if (!leadId) {
                return { 
                    success: false, 
                    message: `Lead with company name '${params.companyName}' not found in NetSuite.` 
                };
            }

            // Step 2: Load the Lead Record
            const leadRec = record.load({
                type: record.Type.LEAD,
                id: leadId,
                isDynamic: true
            });

            let updatesMade = [];

            // Step 3: Update Standard Fields (Revenue)
            if (params.annualRevenue) {
                leadRec.setValue({ fieldId: 'annualrevenue', value: params.annualRevenue });
                updatesMade.push('Annual Revenue');
            }

            // Step 4: Update Custom Fields (CEO & Tech Stack)
            // NOTE: Ensure these IDs match your actual Custom Fields
            if (params.ceoName) {
                leadRec.setValue({ fieldId: 'custentity_ceo_name', value: params.ceoName });
                updatesMade.push('CEO Name');
            }

            if (params.techStack) {
                leadRec.setValue({ fieldId: 'custentity_tech_stack', value: params.techStack });
                updatesMade.push('Tech Stack');
            }

            // Step 5: Save
            const id = leadRec.save();

            return {
                success: true,
                leadId: id,
                companyName: params.companyName,
                fieldsUpdated: updatesMade,
                message: `Successfully enriched ${params.companyName} with ${updatesMade.join(', ')}.`
            };

        } catch (e) {
            log.error({ title: 'Enrichment Failure', details: e });
            return { success: false, message: e.message };
        }
    };

    // Helper: Find Lead ID by Name
    const getLeadId = (name) => {
        const s = search.create({
            type: search.Type.LEAD,
            filters: [
                ['companyname', 'is', name],
                'AND',
                ['stage', 'anyof', ['LEAD', 'PROSPECT']] // Ensure we don't accidentally edit old Customers
            ],
            columns: ['internalid']
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        return res.length ? res[0].getValue('internalid') : null;
    };

    return {
        enrichLeadRecord: enrichLeadRecord
    };
});



/**
 2. Tool Definition Schema (LeadEnricherSchema.json)
This schema instructs the AI to browse/search for information first, and then pass that information into the tool parameters.
 */

/**
{
  "name": "enrichLeadRecord",
  "description": "Updates an existing Lead in NetSuite with external market data. Use this tool AFTER you have browsed the web to find the company's Revenue, CEO, and Technologies.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "companyName": {
        "type": "string",
        "description": "The exact company name of the Lead in NetSuite."
      },
      "annualRevenue": {
        "type": "number",
        "description": "The estimated annual revenue in integers (e.g. 5000000)."
      },
      "ceoName": {
        "type": "string",
        "description": "The full name of the company's CEO or key decision maker."
      },
      "techStack": {
        "type": "string",
        "description": "A comma-separated list or short summary of the software/technology the company uses."
      }
    },
    "required": ["companyName"],
    "nullable": ["annualRevenue", "ceoName", "techStack"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "fieldsUpdated": { 
          "type": "array",
          "items": { "type": "string" }
      },
      "message": { "type": "string" }
    }
  }
}
 */



/**
 3. SDF Object XML (customtool_lead_detective.xml)
This file grants the tool permission to search for Leads and edit them.
 */


/**
<tool scriptid="customtool_lead_detective">
    <name>Lead Detective Enricher</name>
    <description>Allows AI to populate Lead records with external web data.</description>
    <scriptfile>[/SuiteScripts/AI_Tools/LeadEnricherTool.js]</scriptfile>
    <schemafile>[/SuiteScripts/AI_Tools/LeadEnricherSchema.json]</schemafile>
    <exposeto3rdpartyagents>T</exposeto3rdpartyagents>
    <permissions>
        <permission>
            <permkey>LIST_CUSTJOB</permkey>
            <permlevel>EDIT</permlevel>
        </permission>
    </permissions>
</tool>
 */


/**
 * 
 How to Test This
Create a Dummy Lead: Create a lead named "Acme Corp Test" in NetSuite with empty fields.

Trigger the AI: Open the NetSuite AI chat.

Prompt:

"Find the CEO and estimated revenue for 'Acme Corp Test' (pretend it's a large anvil company) and update their lead record with this information." (Note: Since 'Acme Corp Test' isn't real, the AI might hallucinate data or ask for a real company. For a real test, use a well-known company like 'Spotify' as a Lead).

Verification: Refresh the Lead record in NetSuite and check if the annualrevenue and your custom CEO field have been populated.

 */