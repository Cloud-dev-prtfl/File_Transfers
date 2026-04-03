/*
 * customtool_pillar2_extractor.js
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */

define(['N/query', 'N/log'], function (query, log) {
    return {
        getUsageConsumption: async function (params) {
            try {
                const sql = `
                    SELECT 
                        Script.ScriptId,
                        ScriptDeployment.ScriptId AS DeploymentId,
                        MAX(ScriptExecutionLog.UsageCount) AS MaxUsageUnits,
                        AVG(ScriptExecutionLog.UsageCount) AS AvgUsageUnits,
                        COUNT(ScriptExecutionLog.Id) AS TotalExecutions
                    FROM 
                        ScriptExecutionLog
                    JOIN 
                        ScriptDeployment ON ScriptExecutionLog.ScriptDeployment = ScriptDeployment.Id
                    JOIN 
                        Script ON ScriptDeployment.Script = Script.Id
                    WHERE 
                        ScriptExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
                    GROUP BY 
                        Script.ScriptId, ScriptDeployment.ScriptId
                    HAVING 
                        MAX(ScriptExecutionLog.UsageCount) > 500
                    ORDER BY 
                        MaxUsageUnits DESC
                    FETCH FIRST 100 ROWS ONLY
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((logRow) => {
                    return {
                        scriptId: logRow.scriptid,
                        deploymentId: logRow.deploymentid,
                        maxUsageUnits: logRow.maxusageunits,
                        avgUsageUnits: logRow.avgusageunits,
                        totalExecutions: logRow.totalexecutions
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getUsageConsumption', error.toString());
                return {
                    error: `Error extracting usage consumption: ${error.toString()}`,
                };
            }
        },
        
        getExecutionTimes: async function (params) {
            try {
                const sql = `
                    SELECT 
                        Script.ScriptId,
                        ScriptDeployment.ScriptId AS DeploymentId,
                        MAX(ScriptExecutionLog.Duration) AS PeakExecutionTime_ms,
                        AVG(ScriptExecutionLog.Duration) AS AvgExecutionTime_ms
                    FROM 
                        ScriptExecutionLog
                    JOIN 
                        ScriptDeployment ON ScriptExecutionLog.ScriptDeployment = ScriptDeployment.Id
                    JOIN 
                        Script ON ScriptDeployment.Script = Script.Id
                    WHERE 
                        ScriptExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
                    GROUP BY 
                        Script.ScriptId, ScriptDeployment.ScriptId
                    ORDER BY 
                        AvgExecutionTime_ms DESC
                    FETCH FIRST 100 ROWS ONLY
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((logRow) => {
                    return {
                        scriptId: logRow.scriptid,
                        deploymentId: logRow.deploymentid,
                        peakExecutionTimeMs: logRow.peakexecutiontime_ms,
                        avgExecutionTimeMs: logRow.avgexecutiontime_ms
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getExecutionTimes', error.toString());
                return {
                    error: `Error extracting execution times: ${error.toString()}`,
                };
            }
        },

        getConcurrencyBottlenecks: async function (params) {
            try {
                const sql = `
                    SELECT 
                        Script.ScriptId,
                        Script.ScriptType,
                        COUNT(ScriptExecutionLog.Id) AS ExecutionVolume,
                        TO_CHAR(ScriptExecutionLog.Date, 'YYYY-MM-DD HH24') AS ExecutionHour
                    FROM 
                        ScriptExecutionLog
                    JOIN 
                        ScriptDeployment ON ScriptExecutionLog.ScriptDeployment = ScriptDeployment.Id
                    JOIN 
                        Script ON ScriptDeployment.Script = Script.Id
                    WHERE 
                        Script.ScriptType IN ('SCHEDULED', 'RESTLET') AND
                        ScriptExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_24_HOURS', 'DATETIME')
                    GROUP BY 
                        Script.ScriptId, Script.ScriptType, TO_CHAR(ScriptExecutionLog.Date, 'YYYY-MM-DD HH24')
                    ORDER BY 
                        ExecutionVolume DESC
                    FETCH FIRST 100 ROWS ONLY
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((logRow) => {
                    return {
                        scriptId: logRow.scriptid,
                        scriptType: logRow.scripttype,
                        executionVolume: logRow.executionvolume,
                        executionHour: logRow.executionhour
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getConcurrencyBottlenecks', error.toString());
                return {
                    error: `Error extracting concurrency bottlenecks: ${error.toString()}`,
                };
            }
        }
    };
});
