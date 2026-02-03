
/**
Market-Aware Price Optimizer custom tool for NetSuite.

This tool allows the AI to take a market price (which it might have found via browsing or user input), calculate the margin against your internal cost, and only update the price if the margin remains healthy.

1. SuiteScript 2.1 Logic File (PriceOptimizerTool.js)
This script performs the margin calculation and conditional update logic. It safeguards your data by checking profitability before writing any changes.
 */



/**
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    /**
     * Calculates margin impact and updates item base price if margin is safe.
     * * @param {Object} params - Input parameters from the AI.
     * @param {string} params.itemSKU - The SKU/Item Name of the product.
     * @param {number} params.competitorPrice - The external market price found by AI.
     * @param {number} params.targetMargin - Minimum required margin percentage (e.g., 20 for 20%).
     * @returns {Object} Result object indicating success, margin analysis, and update status.
     */
    const optimizePrice = (params) => {
        try {
            log.audit({ title: 'AI Price Optimizer', details: `Analyzing SKU: ${params.itemSKU} vs Market: ${params.competitorPrice}` });

            // Step 1: Resolve Item to Internal ID and get Cost
            // We need the 'averagecost' or 'lastpurchaseprice' to calculate margin.
            const itemData = getItemData(params.itemSKU);
            
            if (!itemData) {
                return { 
                    success: false, 
                    message: `Item SKU '${params.itemSKU}' not found in NetSuite.` 
                };
            }

            const cost = parseFloat(itemData.cost);
            const currentPrice = parseFloat(itemData.price);
            const proposedPrice = parseFloat(params.competitorPrice);

            // Step 2: Calculate Margins
            // Margin % = ((Price - Cost) / Price) * 100
            const currentMargin = ((currentPrice - cost) / currentPrice) * 100;
            const newMargin = ((proposedPrice - cost) / proposedPrice) * 100;

            let actionTaken = "Analysis Only";
            let updated = false;

            // Step 3: Logic - Only update if New Margin >= Target Margin
            if (newMargin >= params.targetMargin) {
                // Update the Base Price (Price Level 1)
                updateItemBasePrice(itemData.id, proposedPrice);
                actionTaken = "Price Updated";
                updated = true;
            } else {
                actionTaken = `Price NOT Updated. Proposed margin (${newMargin.toFixed(2)}%) is below target (${params.targetMargin}%).`;
            }

            return {
                success: true,
                itemSKU: params.itemSKU,
                cost: cost,
                oldPrice: currentPrice,
                proposedPrice: proposedPrice,
                oldMarginPercent: currentMargin.toFixed(2),
                newMarginPercent: newMargin.toFixed(2),
                thresholdMet: newMargin >= params.targetMargin,
                action: actionTaken
            };

        } catch (e) {
            log.error({ title: 'Optimizer Failure', details: e });
            return { success: false, message: e.message };
        }
    };

    // Helper: Get Internal ID, Cost, and Base Price
    const getItemData = (sku) => {
        const s = search.create({
            type: search.Type.ITEM,
            filters: [['itemid', 'is', sku]], 
            columns: ['internalid', 'averagecost', 'baseprice']
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        
        if (res.length === 0) return null;

        return {
            id: res[0].getValue('internalid'),
            cost: res[0].getValue('averagecost') || 0, // Fallback if no cost
            price: res[0].getValue('baseprice') || 0
        };
    };

    // Helper: Update the Item Record
    const updateItemBasePrice = (id, newPrice) => {
        const itemRec = record.load({
            type: record.Type.INVENTORY_ITEM, // Assuming Inventory Item
            id: id,
            isDynamic: true
        });

        // Loop through pricing matrix to find Base Price (Price Level 1)
        // We set the price for quantity 0 (base tier)
        itemRec.selectLine({ sublistId: 'price1', line: 0 });
        itemRec.setCurrentSublistValue({ sublistId: 'price1', fieldId: 'price_1_', value: newPrice });
        itemRec.commitLine({ sublistId: 'price1' });

        itemRec.save();
    };

    return {
        optimizePrice: optimizePrice
    };
});



/**
2. Tool Definition Schema (PriceOptimizerSchema.json)
This JSON file acts as the "manual" for the AI, explaining what the tool does and what inputs are mandatory.



{
  "name": "optimizePrice",
  "description": "Analyzes an item's profitability against a competitor's price. If the profit margin remains above a specified target, it automatically updates the NetSuite item base price. Use this when you have found external market data and need to adjust internal pricing.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "itemSKU": {
        "type": "string",
        "description": "The exact SKU or Item Name as it appears in NetSuite."
      },
      "competitorPrice": {
        "type": "number",
        "description": "The external market price found via browsing or analysis."
      },
      "targetMargin": {
        "type": "number",
        "description": "The minimum acceptable profit margin percentage (e.g., enter 20 for 20%)."
      }
    },
    "required": ["itemSKU", "competitorPrice", "targetMargin"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "oldMarginPercent": { "type": "string" },
      "newMarginPercent": { "type": "string" },
      "thresholdMet": { "type": "boolean" },
      "action": { "type": "string", "description": "Describes if the price was updated or rejected." }
    }
  }
}

 */


/**
3. SDF Object XML (customtool_price_optimizer.xml)
This XML file registers the tool with NetSuite, points to the script and schema in your file cabinet, and grants the tool permission to edit Items.


<tool scriptid="customtool_price_optimizer">
    <name>Market-Aware Price Optimizer</name>
    <description>Allows AI to analyze margins and update item pricing based on external market data.</description>
    <scriptfile>[/SuiteScripts/AI_Tools/PriceOptimizerTool.js]</scriptfile>
    <schemafile>[/SuiteScripts/AI_Tools/PriceOptimizerSchema.json]</schemafile>
    <exposeto3rdpartyagents>T</exposeto3rdpartyagents>
    <permissions>
        <permission>
            <permkey>LIST_ITEM</permkey>
            <permlevel>FULL</permlevel>
        </permission>
        <permission>
            <permkey>LIST_FIND</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
    </permissions>
</tool>

 */





/**
 
Deployment (Getting it into NetSuite):
Before you can test, the tool must be active in your environment.

Upload Files:

Upload PriceOptimizerTool.js and PriceOptimizerSchema.json to a specific folder in your File Cabinet (e.g., /SuiteScripts/AI_Tools/).

Create the Custom Tool Record:

Since CustomTool is a specific SDF object, you can deploy the XML file using the SuiteCloud CLI or SDF.

Manual Alternative: Go to Customization > Plug-ins > Manage Custom Tools (or Setup > Company > AI Tools depending on your version). Click New Tool.

Link the Script File and Schema File you uploaded.

Crucial: Check the box "Enabled" or "Available for Chat".


The Test (Triggering it via Prompt) :

Once deployed, open the NetSuite AI / Ask Oracle chat window (usually the sparkle icon in the top right).

The Prompt Strategy: You must provide the AI with the three inputs defined in your JSON schema: itemSKU, competitorPrice, and targetMargin.

Type this specific prompt:

"I found that the competitor is selling the 'Solar Panel 500W' for $450. Please analyze if we can match this price while keeping a 20% margin. If the margin is safe, update the price."

What happens behind the scenes:

Intent Recognition: The AI reads your prompt and recognizes it matches the optimizePrice tool description.

Parameter Extraction: It extracts:

itemSKU: 'Solar Panel 500W'

competitorPrice: 450

targetMargin: 20

Execution: It runs your PriceOptimizerTool.js.

Response: The AI reads the JSON output from your script and writes a natural language summary (e.g., "I've analyzed the margin. At $450, your margin would be 18.5%, which is below your 20% target. Therefore, I did not update the price.").




Validation (Did it work?) :

Since AI can sometimes "hallucinate" success, you must verify the data.

Check the Execution Log:

Go to your Script Deployment for the PriceOptimizerTool.js.

Click the Execution Log tab.

Look for the audit trail: AI Price Optimizer -> Analyzing SKU....

If you see Tool Failure, check the details (usually permissions or incorrect Item ID).

Check the Item Record:

Go to the Item record for 'Solar Panel 500W'.

Check the System Notes. You should see a price change made by your user (or the generic AI user) at the exact time of the test if the margin target was met.

 */