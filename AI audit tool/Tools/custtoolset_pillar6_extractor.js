/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 6: Bundles and Installed Apps Analysis
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 6 bundle analysis.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of bundle metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("bundle_inventory", "component_conflicts", or "performance_impact").'
            });
        }

        try {
            switch (analysisType) {
                case 'bundle_inventory':
                    return await getBundleInventory();
                case 'component_conflicts':
                    return await getComponentConflicts();
                case 'performance_impact':
                    return await getPerformanceImpact();
                default:
                    throw error.create({
                        name: 'INVALID_ANALYSIS_TYPE',
                        message: `Unsupported analysis type: ${analysisType}`
                    });
            }
        } catch (e) {
            return {
                status: 'error',
                message: e.message,
                details: e
            };
        }
    };

    /**
     * Inventories all external dependencies by querying the InstalledBundle table.
     */
    const getBundleInventory = async () => {
        const sql = `
            SELECT 
                BundleId, 
                Name AS BundleName,
                Version, 
                Publisher, 
                InstalledDate, 
                Status 
            FROM 
                InstalledBundle 
            WHERE
                Status != 'UNINSTALLED'
            ORDER BY 
                InstalledDate DESC
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'InstalledBundleInventory',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Detects potential code collisions by finding overlapping client scripts or user events 
     * from different bundles deployed to the same standard record type.
     */
    const getComponentConflicts = async () => {
        // Cross-references script deployments to find instances where multiple bundles 
        // deploy scripts to manipulate the same transaction records.
        const sql = `
            SELECT 
                SD.RecordType AS TargetRecord,
                S1.ScriptId AS Script1,
                S1.Bundle AS Bundle1,
                S2.ScriptId AS Script2,
                S2.Bundle AS Bundle2
            FROM 
                ScriptDeployment SD
            JOIN 
                Script S1 ON SD.Script = S1.Id
            JOIN 
                Script S2 ON SD.Script = S2.Id
            WHERE 
                SD.IsDeployed = 'T' AND 
                S1.Id != S2.Id AND 
                S1.Bundle IS NOT NULL AND 
                S2.Bundle IS NOT NULL AND 
                S1.Bundle != S2.Bundle
            ORDER BY 
                SD.RecordType ASC
            FETCH FIRST 150 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'BundleComponentCollisions',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Quantifies the performance cost of third-party applications by aggregating 
     * governance unit consumption by Bundle ID.
     */
    const getPerformanceImpact = async () => {
        // Filters execution data by script owner/bundle ID to see if a specific 
        // managed bundle consumes a disproportionate percentage of resources.
        const sql = `
            SELECT 
                S.Bundle AS BundleId,
                IB.Name AS BundleName,
                SUM(SEL.UsageCount) AS TotalGovernanceUnitsConsumed,
                AVG(SEL.Duration) AS AvgExecutionTime_ms,
                COUNT(SEL.Id) AS TotalExecutions
            FROM 
                ScriptExecutionLog SEL
            JOIN 
                ScriptDeployment SD ON SEL.ScriptDeployment = SD.Id
            JOIN 
                Script S ON SD.Script = S.Id
            JOIN 
                InstalledBundle IB ON S.Bundle = IB.BundleId
            WHERE 
                S.Bundle IS NOT NULL AND
                SEL.Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
            GROUP BY 
                S.Bundle, IB.Name
            ORDER BY 
                TotalGovernanceUnitsConsumed DESC
            FETCH FIRST 50 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'BundlePerformanceImpact',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});