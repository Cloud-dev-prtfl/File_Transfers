/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 2: SuiteScript Performance Analysis
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 2 performance data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of execution metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("usage_consumption", "execution_time", or "concurrency").'
            });
        }

        try {
            switch (analysisType) {
                case 'usage_consumption':
                    return await getUsageConsumption();
                case 'execution_time':
                    return await getExecutionTimes();
                case 'concurrency':
                    return await getConcurrencyBottlenecks();
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
     * Extracts scripts that are consuming dangerously high governance units.
     */
    const getUsageConsumption = async () => {
        // Aggregates execution logs to find scripts pushing governance limits
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

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'UsageUnitConsumption',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Calculates execution times (Total Time) to identify latency.
     */
    const getExecutionTimes = async () => {
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

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ExecutionTimeLatency',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Identifies concurrency thresholds by looking at overlapping execution windows.
     */
    const getConcurrencyBottlenecks = async () => {
        // Targets Scheduled and RESTlet scripts specifically as requested by the architectural blueprint
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

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ConcurrencyBottlenecks',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});