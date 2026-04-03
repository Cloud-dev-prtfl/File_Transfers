/*
 * customtool_pillar4_extractor.js
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */

define(['N/query', 'N/log'], function (query, log) {
    return {
        getDataSparsityCandidates: async function (params) {
            try {
                // Extracts identifiers bearing custrecord_ and custentity_ prefixes to allow the AI to perform null-rate checks
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
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((field) => {
                    return {
                        scriptId: field.scriptid,
                        name: field.name,
                        fieldType: field.fieldtype,
                        recordType: field.recordtype
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getDataSparsityCandidates', error.toString());
                return {
                    error: `Error extracting sparsity candidates: ${error.toString()}`,
                };
            }
        },
        
        getWorkflowRedundancy: async function (params) {
            try {
                // Queries workflow execution history to analyze state transitions and aborted actions over the last 30 days
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
                    ORDER BY 
                        TotalExecutions DESC
                    FETCH FIRST 100 ROWS ONLY
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((workflow) => {
                    return {
                        workflowId: workflow.workflowid,
                        workflowName: workflow.workflowname,
                        recordType: workflow.recordtype,
                        totalExecutions: workflow.totalexecutions,
                        abortedOrRejectedCount: workflow.abortedorrejectedcount
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getWorkflowRedundancy', error.toString());
                return {
                    error: `Error extracting workflow redundancy: ${error.toString()}`,
                };
            }
        },

        getLogicCollisions: async function (params) {
            try {
                // Cross-references deployments to flag instances where a User Event Script and a Workflow are deployed on the exact same record type
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
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((collision) => {
                    return {
                        targetRecord: collision.targetrecord,
                        userEventScriptId: collision.usereventscriptid,
                        workflowId: collision.workflowid,
                        scriptName: collision.scriptname,
                        workflowName: collision.workflowname
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getLogicCollisions', error.toString());
                return {
                    error: `Error extracting logic collisions: ${error.toString()}`,
                };
            }
        }
    };
});
