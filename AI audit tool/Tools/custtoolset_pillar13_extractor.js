/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 13: Deployment Model and Environment Topology
 */
define(['N/query', 'N/runtime', 'N/error'], (query, runtime, error) => {

    /**
     * Executes the requested Pillar 13 deployment and environment data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of environment topology
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("environment_context" or "multi_account_topology").'
            });
        }

        try {
            switch (analysisType) {
                case 'environment_context':
                    return getEnvironmentContext();
                case 'multi_account_topology':
                    return await getMultiAccountTopology();
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
     * Extracts the specific environment variables so the AI knows if it is auditing 
     * a Production environment, a Sandbox, or a Release Preview.
     */
    const getEnvironmentContext = () => {
        // Uses the N/runtime module to gather foundational account context
        return {
            status: 'success',
            metric: 'DeploymentEnvironmentContext',
            data: {
                accountId: runtime.accountId,
                environmentType: runtime.envType, // e.g., PRODUCTION, SANDBOX
                netsuiteVersion: runtime.version,
                isOneWorld: runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' })
            }
        };
    };

    /**
     * Maps the Hub-and-Spoke architecture for global enterprises running OneWorld.
     */
    const getMultiAccountTopology = async () => {
        // If it is a OneWorld account, query the Subsidiary table to map the global hierarchy.
        // This allows the AI to understand the scale of the global deployment.
        if (!runtime.isFeatureInEffect({ feature: 'SUBSIDIARIES' })) {
            return {
                status: 'success',
                metric: 'MultiAccountTopology',
                message: 'This is a single-instance account. No OneWorld subsidiaries present.',
                data: []
            };
        }

        const sql = `
            SELECT 
                Id AS SubsidiaryId,
                Name AS SubsidiaryName,
                Parent AS ParentSubsidiaryId,
                Country,
                Currency
            FROM 
                Subsidiary
            WHERE 
                IsInactive = 'F'
            ORDER BY 
                Parent ASC NULLS FIRST
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'MultiAccountTopology',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});