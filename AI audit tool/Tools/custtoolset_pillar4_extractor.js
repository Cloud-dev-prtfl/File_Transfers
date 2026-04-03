/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 4: Customization and Over-Customization Analysis
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 4 over-customization data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of customization metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("data_sparsity", "workflow_redundancy", or "logic_collisions").'
            });
        }

        try {
            switch (analysisType) {
                case 'data_sparsity':
                    return await getDataSparsity();
                case 'workflow_redundancy':
                    return await getWorkflowRedundancy();
                case 'logic_collisions':
                    return await getLogicCollisions();
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
     * Extracts custom entity and record fields specifically to allow the AI to perform data sparsity 
     * checks (looking for 99.9% null rates).
     */
    const getDataSparsity = async () => {
        // Extracts identifiers bearing custrecord_ and custentity_ prefixes
        const sql = `
            SELECT 
                ScriptId,
                Name,
                FieldType,
                RecordType
            FROM 
                CustomField
            WHERE 
                ScriptId LIKE 'custrecord_%' OR ScriptId LIKE 'custentity_%'
            ORDER BY 
                ScriptId ASC
            FETCH FIRST 200 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'DataSparsityCandidates',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Evaluates workflow history to find workflows that fire but yield no business value.
     */
    const getWorkflowRedundancy = async () => {
        // Queries workflow execution history to analyze state transitions and aborted actions.
        const sql = `
            SELECT 
                W.ScriptId AS WorkflowId,
                W.Name AS WorkflowName,
                W.RecordType,
                COUNT(WH.Id) AS TotalExecutions,
                SUM(CASE WHEN WH.Action = 'REJECTED' OR WH.State = 'ABORTED' THEN 1 ELSE 0 END) AS AbortedOrRejectedCount
            FROM 
                Workflow W
            JOIN 
                WorkflowInstance WI ON W.Id = WI.Workflow
            JOIN 
                WorkflowHistory WH ON WI.Id = WH.Instance
            WHERE 
                W.IsInactive = 'F' AND WH.Date >= BUILTIN.RELATIVE_RANGES('LAST_30_DAYS', 'DATETIME')
            GROUP BY 
                W.ScriptId, W.Name, W.RecordType
            HAVING 
                SUM(CASE WHEN WH.Action = 'REJECTED' OR WH.State = 'ABORTED' THEN 1 ELSE 0 END) > (COUNT(WH.Id) * 0.5) -- Flag if >50% abort
            ORDER BY 
                TotalExecutions DESC
            FETCH FIRST 100 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'WorkflowRedundancy',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Maps the deployment records of active SuiteScripts and SuiteFlows to find collisions.
     */
    const getLogicCollisions = async () => {
        // Cross-references deployments to flag instances where a User Event Script and a Workflow 
        // are deployed on the exact same record type.
        const sql = `
            SELECT 
                SD.RecordType AS TargetRecord,
                S.ScriptId AS UserEventScriptId,
                W.ScriptId AS WorkflowId,
                S.Name AS ScriptName,
                W.Name AS WorkflowName
            FROM 
                ScriptDeployment SD
            JOIN 
                Script S ON SD.Script = S.Id
            JOIN 
                Workflow W ON SD.RecordType = W.RecordType
            WHERE 
                S.ScriptType = 'USEREVENT' AND 
                SD.IsDeployed = 'T' AND 
                W.IsInactive = 'F'
            ORDER BY 
                SD.RecordType ASC
            FETCH FIRST 150 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ScriptWorkflowCollisions',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});