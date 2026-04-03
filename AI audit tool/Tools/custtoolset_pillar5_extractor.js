/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 5: Integration Performance Assessment
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 5 integration performance data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of integration metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("api_throughput", "endpoint_latency", or "concurrency_thresholds").'
            });
        }

        try {
            switch (analysisType) {
                case 'api_throughput':
                    return await getApiThroughput();
                case 'endpoint_latency':
                    return await getEndpointLatency();
                case 'concurrency_thresholds':
                    return await getConcurrencyThresholds();
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
     * Extracts API throughput to identify middleware bottlenecks (e.g., HTTP 429 Too Many Requests).
     */
    const getApiThroughput = async () => {
        // Conceptual query parsing integration logs for rejection events over a 24-hour rolling window.
        // High 429 errors indicate middleware (like Celigo/Boomi) queues are stalling.
        const sql = `
            SELECT 
                Integration.Name AS IntegrationName,
                Integration.Id AS IntegrationId,
                COUNT(IntegrationExecutionLog.Id) AS TotalRequests,
                SUM(CASE WHEN IntegrationExecutionLog.Status = 'REJECTED' OR IntegrationExecutionLog.ErrorCode = '429' THEN 1 ELSE 0 END) AS RejectedRequests,
                MAX(IntegrationExecutionLog.Date) AS LastErrorDate
            FROM 
                Integration
            JOIN 
                IntegrationExecutionLog ON Integration.Id = IntegrationExecutionLog.Integration
            WHERE 
                IntegrationExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_24_HOURS', 'DATETIME')
            GROUP BY 
                Integration.Name, Integration.Id
            HAVING 
                SUM(CASE WHEN IntegrationExecutionLog.Status = 'REJECTED' OR IntegrationExecutionLog.ErrorCode = '429' THEN 1 ELSE 0 END) > 0
            ORDER BY 
                RejectedRequests DESC
            FETCH FIRST 50 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'ApiThroughputAndErrors',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Identifies slow endpoints (e.g., RESTlets taking > 3 seconds).
     */
    const getEndpointLatency = async () => {
        // Calculates the time delta between request initiation and response completion to catch poor internal SuiteQL optimization.
        const sql = `
            SELECT 
                Integration.Name AS IntegrationName,
                Script.ScriptId AS EndpointScript,
                AVG(IntegrationExecutionLog.Duration) AS AvgLatency_ms,
                MAX(IntegrationExecutionLog.Duration) AS PeakLatency_ms,
                COUNT(IntegrationExecutionLog.Id) AS ExecutionCount
            FROM 
                IntegrationExecutionLog
            JOIN 
                Integration ON IntegrationExecutionLog.Integration = Integration.Id
            JOIN 
                Script ON IntegrationExecutionLog.Script = Script.Id
            WHERE 
                IntegrationExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
            GROUP BY 
                Integration.Name, Script.ScriptId
            HAVING 
                AVG(IntegrationExecutionLog.Duration) > 3000 -- Flags endpoints averaging over 3 seconds
            ORDER BY 
                AvgLatency_ms DESC
            FETCH FIRST 100 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'EndpointLatency',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Analyzes parallel requests against the NetSuite thread pool limits.
     */
    const getConcurrencyThresholds = async () => {
        // Groups executions by strict time windows to identify peak thread consumption
        const sql = `
            SELECT 
                Integration.Name AS IntegrationName,
                TO_CHAR(IntegrationExecutionLog.Date, 'YYYY-MM-DD HH24:MI') AS ExecutionMinute,
                COUNT(IntegrationExecutionLog.Id) AS ConcurrentRequests
            FROM 
                IntegrationExecutionLog
            JOIN 
                Integration ON IntegrationExecutionLog.Integration = Integration.Id
            WHERE 
                IntegrationExecutionLog.Date >= BUILTIN.RELATIVE_RANGES('LAST_24_HOURS', 'DATETIME')
            GROUP BY 
                Integration.Name, TO_CHAR(IntegrationExecutionLog.Date, 'YYYY-MM-DD HH24:MI')
            ORDER BY 
                ConcurrentRequests DESC
            FETCH FIRST 50 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ConcurrencyThresholdBreaches',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});