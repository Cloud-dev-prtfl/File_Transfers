/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 10: Alerts and Proactive Monitoring Extractor
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 10 proactive alert extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of real-time alerts and stalls
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("threshold_breaches" or "stalled_integrations").'
            });
        }

        try {
            switch (analysisType) {
                case 'threshold_breaches':
                    return await getThresholdBreaches();
                case 'stalled_integrations':
                    return await getStalledIntegrations();
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
     * Pulls immediate threshold breaches from the last hour (e.g., >3000ms latency or Limit Exceeded).
     */
    const getThresholdBreaches = async () => {
        // Queries script logs for severe errors and latencies in real-time (last 1-2 hours)
        const sql = `
            SELECT 
                S.ScriptId,
                S.Name AS ScriptName,
                SEL.Date AS IncidentTime,
                SEL.Duration AS ExecutionLatency_ms,
                SEL.Status,
                SEL.UsageCount
            FROM 
                ScriptExecutionLog SEL
            JOIN 
                ScriptDeployment SD ON SEL.ScriptDeployment = SD.Id
            JOIN 
                Script S ON SD.Script = S.Id
            WHERE 
                SEL.Date >= BUILTIN.RELATIVE_RANGES('LAST_2_HOURS', 'DATETIME') AND
                (SEL.Duration > 3000 OR SEL.UsageCount > 900 OR SEL.Status = 'FAILED')
            ORDER BY 
                SEL.Date DESC
            FETCH FIRST 100 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'RealTimeThresholdBreaches',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Identifies critical data queues that have stalled or massive batch exports that have failed.
     */
    const getStalledIntegrations = async () => {
        // Queries integration logs for recent rejections or extreme delays
        const sql = `
            SELECT 
                I.Name AS IntegrationName,
                IEL.Date AS IncidentTime,
                IEL.Status,
                IEL.ErrorCode,
                IEL.Duration
            FROM 
                IntegrationExecutionLog IEL
            JOIN 
                Integration I ON IEL.Integration = I.Id
            WHERE 
                IEL.Date >= BUILTIN.RELATIVE_RANGES('LAST_2_HOURS', 'DATETIME') AND
                (IEL.Status = 'REJECTED' OR IEL.Status = 'FAILED' OR IEL.ErrorCode IS NOT NULL)
            ORDER BY 
                IEL.Date DESC
            FETCH FIRST 50 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'StalledIntegrationQueues',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});