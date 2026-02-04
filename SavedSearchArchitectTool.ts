/**
Saved Search" Architect tool.

This tool enables the AI to translate natural language requests (e.g., "Find me all customers in California who owe more than $1,000") into a permanent Saved Search record in NetSuite.

1. SuiteScript 2.1 Logic File (SavedSearchArchitectTool.js)
This script uses the N/search module to dynamically build filters and columns based on the AI's input and then saves the search.

Key Feature: It handles the complexity of "joining" tables (e.g., searching Transactions but filtering by Customer fields) and maps the JSON instructions to the NetSuite search object.
*/

/**
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */
define(['N/search', 'N/log'], (search, log) => {

    /**
     * Creates and saves a new Saved Search in NetSuite.
     * @param {Object} params - Input parameters from the AI.
     * @param {string} params.searchName - The title for the new Saved Search.
     * @param {string} params.recordType - The ID of the record type (e.g., 'customer', 'transaction', 'supportcase').
     * @param {Array} params.filters - An array of filter objects.
     * @param {Array} params.columns - An array of column (result) objects.
     * @param {boolean} params.isPublic - Whether the search should be public.
     * @returns {Object} Result object with the new Search ID.
     */
    const createSavedSearch = (params) => {
        try {
            log.audit({ title: 'Search Architect', details: `Building search: ${params.searchName} on ${params.recordType}` });

            // 1. Build Filters
            // AI sends simple objects; we need to convert them to search.createFilter()
            // Expected format from AI: { name: 'entity', operator: 'anyof', values: ['123'] }
            const searchFilters = [];
            
            if (params.filters && params.filters.length > 0) {
                params.filters.forEach(f => {
                    // Handle "Special" filters (like Mainline for transactions)
                    if (f.name === 'mainline' && params.recordType === 'transaction') {
                        searchFilters.push(search.createFilter({
                            name: 'mainline',
                            operator: search.Operator.IS,
                            values: f.value === true || f.value === 'T' ? 'T' : 'F'
                        }));
                    } else {
                        // Standard Filter
                        let operator = search.Operator.IS; // Default
                        if (f.operator === 'contains') operator = search.Operator.CONTAINS;
                        if (f.operator === 'anyof') operator = search.Operator.ANYOF;
                        if (f.operator === 'greaterthan') operator = search.Operator.GREATERTHAN;
                        if (f.operator === 'within') operator = search.Operator.WITHIN; // useful for dates

                        searchFilters.push(search.createFilter({
                            name: f.name,
                            join: f.join || null, // Handles joins like 'customer.salesrep'
                            operator: operator,
                            values: f.values
                        }));
                    }
                });
            }

            // 2. Build Columns
            // Expected format from AI: { name: 'email' } or { name: 'amount', summary: 'SUM' }
            const searchColumns = [];
            if (params.columns && params.columns.length > 0) {
                params.columns.forEach(c => {
                    searchColumns.push(search.createColumn({
                        name: c.name,
                        join: c.join || null,
                        summary: c.summary ? search.Summary[c.summary] : null,
                        sort: c.sort ? search.Sort[c.sort] : null
                    }));
                });
            }

            // 3. Create the Search Object
            const newSearch = search.create({
                type: params.recordType,
                title: params.searchName,
                id: null, // Let NetSuite assign ID
                filters: searchFilters,
                columns: searchColumns
            });

            // 4. Set Public? (Optional)
            if (params.isPublic) {
                newSearch.isPublic = true;
            }

            // 5. Save
            const searchId = newSearch.save();

            return {
                success: true,
                searchId: searchId,
                searchName: params.searchName,
                link: `/app/common/search/searchresults.nl?searchid=${searchId}`,
                message: `Successfully created Saved Search '${params.searchName}' (ID: ${searchId}).`
            };

        } catch (e) {
            log.error({ title: 'Search Architect Failure', details: e });
            return { success: false, message: e.message };
        }
    };

    return {
        createSavedSearch: createSavedSearch
    };
});


/**
2. Tool Definition Schema (SavedSearchArchitectSchema.json)
This schema teaches the AI how to structure the filters and columns. It's crucial because NetSuite is strict about filter syntax (e.g., using is vs anyof).
 */


{
  "name": "createSavedSearch",
  "description": "Builds and saves a permanent NetSuite Saved Search based on user criteria. Use this when the user asks to 'create a report' or 'save a list'.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "searchName": {
        "type": "string",
        "description": "A descriptive title for the search (e.g. 'Overdue Invoices > 90 Days')."
      },
      "recordType": {
        "type": "string",
        "description": "The internal ID of the record type (e.g. 'customer', 'transaction', 'invoice', 'supportcase')."
      },
      "isPublic": {
        "type": "boolean",
        "description": "Set to true if the search should be visible to everyone."
      },
      "filters": {
        "type": "array",
        "description": "List of criteria to filter the results.",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Internal ID of the field (e.g. 'entity', 'trandate', 'amount')." },
            "operator": { "type": "string", "description": "NetSuite operator: 'is', 'contains', 'anyof', 'greaterthan', 'within'." },
            "values": { "type": "array", "items": { "type": "string" }, "description": "Values to filter by (e.g. ['T'] or ['2023-01-01']). For dates, use string format." },
            "join": { "type": "string", "description": "(Optional) Join id if filtering on a related record." }
          },
          "required": ["name", "operator", "values"]
        }
      },
      "columns": {
        "type": "array",
        "description": "List of columns to display in the results.",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "Internal ID of the field." },
            "join": { "type": "string", "description": "(Optional) Join id." },
            "summary": { "type": "string", "description": "(Optional) 'SUM', 'COUNT', 'AVG', etc." },
            "sort": { "type": "string", "description": "(Optional) 'ASC' or 'DESC'." }
          },
          "required": ["name"]
        }
      }
    },
    "required": ["searchName", "recordType", "filters", "columns"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "searchId": { "type": "number" },
      "searchName": { "type": "string" },
      "link": { "type": "string" },
      "message": { "type": "string" }
    }
  }
}






/**
 3. SDF Object XML (customtool_search_architect.xml)
This XML grants the tool the extremely powerful permission to Publish Search, which is required to save searches that other people can see. 
*/


<tool scriptid="customtool_search_architect">
    <name>Saved Search Architect</name>
    <description>Allows AI to create and save new search records.</description>
    <scriptfile>[/SuiteScripts/AI_Tools/SavedSearchArchitectTool.js]</scriptfile>
    <schemafile>[/SuiteScripts/AI_Tools/SavedSearchArchitectSchema.json]</schemafile>
    <exposeto3rdpartyagents>T</exposeto3rdpartyagents>
    <permissions>
        <permission>
            <permkey>LIST_PUBLISHSEARCH</permkey>
            <permlevel>FULL</permlevel>
        </permission>
        <permission>
            <permkey>LIST_FIND</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
    </permissions>
</tool>



/**

How to Test This :

Once deployed, you can give the AI complex instructions, and it will handle the mapping.

Prompt Example:

"Create a saved search called 'Big Spenders California'. I want to see a list of Customers where the billing address state is 'CA' and their balance is greater than 1000. Show me columns for their Name, Email, and Balance."

What happens:

AI Parsing: The AI converts your sentence into JSON structure:

Record: customer

Filters: billstate IS CA, balance GREATERTHAN 1000

Columns: entityid, email, balance

Execution: The tool runs search.create and .save().

Result: The AI responds: "I have created the saved search 'Big Spenders California' (ID: 504). You can view it here: [Link]"
 */