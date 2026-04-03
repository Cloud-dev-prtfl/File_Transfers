/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 12: Extensibility and Ecosystem Support
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 12 extensibility and ecosystem data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of ecosystem topology and deployment metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("external_topology" or "extensibility_framework").'
            });
        }

        try {
            switch (analysisType) {
                case 'external_topology':
                    return await getExternalTopology();
                case 'extensibility_framework':
                    return await getExtensibilityFramework();
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
     * Catalogs the complete topology of third-party integrations and middleware platforms.
     * Maps external systems authorized via TBA or OAuth 2.0.
     */
    const getExternalTopology = async () => {
        // Queries active integration records to map the external ecosystem authorized to communicate with the ERP.
        const sql = `
            SELECT 
                Id AS IntegrationId,
                Name AS IntegrationName,
                State,
                Description
            FROM 
                Integration
            WHERE 
                State = 'ENABLED'
            ORDER BY 
                Name ASC
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'ExternalIntegrationTopology',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Assesses the organization's utilization of the NetSuite extensibility framework.
     * Evaluates deployment methods (SDF vs. Manual UI Uploads).
     */
    const getExtensibilityFramework = async () => {
        // Conceptually groups scripts and custom objects to determine the ratio of formalized 
        // SDF project deployments versus manual UI creation. 
        const sql = `
            SELECT 
                ScriptType,
                COUNT(Id) AS TotalScripts,
                SUM(CASE WHEN FromSdf = 'T' THEN 1 ELSE 0 END) AS SdfDeployed,
                SUM(CASE WHEN FromSdf = 'F' OR FromSdf IS NULL THEN 1 ELSE 0 END) AS UiDeployed
            FROM 
                Script
            WHERE 
                IsInactive = 'F' AND Bundle IS NULL
            GROUP BY 
                ScriptType
            ORDER BY 
                TotalScripts DESC
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ExtensibilityDeploymentRatio',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});