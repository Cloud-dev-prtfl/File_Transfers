/**
Intelligent Inventory Rebalancer.

This tool allows the AI to act on its analysis. For example, if the AI notices that "Warehouse A" is overstocked while "Warehouse B" is out of stock, it uses this tool to physically create the Transfer Order record in NetSuite to move the goods.

1. SuiteScript 2.1 Logic File (InventoryRebalancerTool.js)
This script verifies that the Source Location actually has enough stock before attempting the transfer, preventing "inventory allocation" errors.

 */



/**
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    /**
     * Creates a Transfer Order to move stock between locations.
     * * @param {Object} params - Input parameters from the AI.
     * @param {string} params.itemSKU - The SKU to transfer.
     * @param {string} params.sourceLocation - Name of the warehouse SENDING stock.
     * @param {string} params.destLocation - Name of the warehouse RECEIVING stock.
     * @param {number} params.quantity - Amount to transfer.
     * @param {string} params.memo - (Optional) Reason for transfer (e.g. "AI Rebalance").
     * @returns {Object} Result object indicating success or failure.
     */
    const createStockTransfer = (params) => {
        try {
            log.audit({ title: 'Inventory Rebalancer', details: `Moving ${params.quantity} of ${params.itemSKU} from ${params.sourceLocation} to ${params.destLocation}` });

            // Step 1: Resolve IDs
            const itemId = getId('item', params.itemSKU);
            const sourceId = getId('location', params.sourceLocation);
            const destId = getId('location', params.destLocation);

            if (!itemId || !sourceId || !destId) {
                return { success: false, message: 'Invalid Item or Location name provided.' };
            }

            // Step 2: Safety Check - Check Quantity Available at Source
            const qtyAvailable = getQtyAvailable(itemId, sourceId);
            if (qtyAvailable < params.quantity) {
                return { 
                    success: false, 
                    message: `Validation Failed: Source location '${params.sourceLocation}' only has ${qtyAvailable} available. Cannot transfer ${params.quantity}.` 
                };
            }

            // Step 3: Create Transfer Order
            const toRecord = record.create({
                type: record.Type.TRANSFER_ORDER,
                isDynamic: true
            });

            toRecord.setValue({ fieldId: 'location', value: sourceId }); // From
            toRecord.setValue({ fieldId: 'transferlocation', value: destId }); // To
            toRecord.setValue({ fieldId: 'memo', value: params.memo || "AI Generated Rebalance" });

            // If using OneWorld, you might need to set 'subsidiary' here based on the location.
            // toRecord.setValue({ fieldId: 'subsidiary', value: 1 }); 

            toRecord.selectNewLine({ sublistId: 'item' });
            toRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemId });
            toRecord.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: params.quantity });
            toRecord.commitLine({ sublistId: 'item' });

            const toId = toRecord.save();

            return {
                success: true,
                transferOrderId: toId,
                message: `Successfully created Transfer Order #${toId} for ${params.quantity} units.`
            };

        } catch (e) {
            log.error({ title: 'Rebalancer Failure', details: e });
            return { success: false, message: e.message };
        }
    };

    // Helper: Resolve Names to Internal IDs
    const getId = (type, name) => {
        const s = search.create({
            type: type, // 'item' or 'location'
            filters: [['name', 'is', name]], 
            columns: ['internalid']
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        return res.length ? res[0].getValue('internalid') : null;
    };

    // Helper: Check Stock
    const getQtyAvailable = (itemId, locationId) => {
        // Simple search on Item to find location quantity available
        const s = search.create({
            type: search.Type.ITEM,
            filters: [
                ['internalid', 'anyof', itemId],
                'AND',
                ['inventorylocation', 'anyof', locationId]
            ],
            columns: ['locationquantityavailable']
        });
        const res = s.run().getRange({ start: 0, end: 1 });
        return res.length ? parseFloat(res[0].getValue('locationquantityavailable')) || 0 : 0;
    };

    return {
        createStockTransfer: createStockTransfer
    };
});


/**
2. Tool Definition Schema (InventoryRebalancerSchema.json)
This schema instructs the AI to use this tool when it identifies a distribution imbalance.

{
  "name": "createStockTransfer",
  "description": "Creates an Inventory Transfer Order. Use this tool when you detect that one location has excess stock and another is running low.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "itemSKU": {
        "type": "string",
        "description": "The exact SKU of the product to move."
      },
      "sourceLocation": {
        "type": "string",
        "description": "The name of the warehouse/location to take stock FROM."
      },
      "destLocation": {
        "type": "string",
        "description": "The name of the warehouse/location to send stock TO."
      },
      "quantity": {
        "type": "number",
        "description": "The number of units to transfer."
      },
      "memo": {
        "type": "string",
        "description": "A short reason for the transfer (e.g. 'Balancing West Coast stock')."
      }
    },
    "required": ["itemSKU", "sourceLocation", "destLocation", "quantity"],
    "nullable": ["memo"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "transferOrderId": { "type": "string" },
      "message": { "type": "string" }
    }
  }
}
 */




/**
3. SDF Object XML (customtool_inventory_rebalancer.xml)
This XML ensures the tool has the specific permissions required to view Inventory levels (to check availability) and create Transfer Orders.

<tool scriptid="customtool_inventory_rebalancer">
    <name>Intelligent Inventory Rebalancer</name>
    <description>Allows AI to move stock between locations based on demand analysis.</description>
    <scriptfile>[/SuiteScripts/AI_Tools/InventoryRebalancerTool.js]</scriptfile>
    <schemafile>[/SuiteScripts/AI_Tools/InventoryRebalancerSchema.json]</schemafile>
    <exposeto3rdpartyagents>T</exposeto3rdpartyagents>
    <permissions>
        <permission>
            <permkey>TRAN_TRNFRORD</permkey>
            <permlevel>CREATE</permlevel>
        </permission>
        <permission>
            <permkey>LIST_ITEM</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
        <permission>
            <permkey>LIST_LOCATION</permkey>
            <permlevel>VIEW</permlevel>
        </permission>
    </permissions>
</tool>


 */


/**
 
How to Test This:

Check Stock: Ensure you have an Item (e.g., Widget A) that has at least 100 units in Location A (Source) and 0 units in Location B (Destination).

Prompt:

"I see that 'Widget A' is overstocked in 'Location A' but we are out in 'Location B'. Please transfer 50 units from A to B to balance it out."

Result:

The tool runs getQtyAvailable on Location A.

If 50 are available, it creates the Transfer Order.

The AI responds: "I've created Transfer Order #TO-1044 moving 50 units to Location B."

 */