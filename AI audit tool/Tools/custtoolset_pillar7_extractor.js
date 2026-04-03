/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 7: System Health Scoring & Benchmarking
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 7 system health data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload for algorithmic scoring
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("performance_stability", "architectural_cleanliness", or "security_posture").'
            });
        }

        try {
            switch (analysisType) {
                case 'performance_stability':
                    return await getPerformanceAndStability();
                case 'architectural_cleanliness':
                    return await getArchitecturalCleanliness();
                case 'security_posture':
                    return await getSecurityPosture();
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
     * Extracts top-level performance and stability metrics (55% of total score weight).
     */
    const getPerformanceAndStability = async () => {
        // Aggregates total script executions vs. failures/timeouts over 7 days
        const sql = `
            SELECT 
                COUNT(Id) AS TotalExecutions,
                AVG(Duration) AS InstanceAverageExecutionTime_ms,
                SUM(CASE WHEN Status = 'FAILED' OR UsageCount > 900 THEN 1 ELSE 0 END) AS TotalErrorsAndLimitBreaches
            FROM 
                ScriptExecutionLog 
            WHERE 
                Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'PerformanceAndStabilityAggregates',
            data: queryResults[0] || {}
        };
    };

    /**
     * Extracts the ratio of active to inactive customizations (20% of total score weight).
     */
    const getArchitecturalCleanliness = async () => {
        // Queries custom fields to assess the volume of deprecated/inactive assets
        const sql = `
            SELECT 
                COUNT(Id) AS TotalCustomFields,
                SUM(CASE WHEN IsInactive = 'T' THEN 1 ELSE 0 END) AS InactiveCustomFields
            FROM 
                CustomField
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ArchitecturalCleanlinessAggregates',
            data: queryResults[0] || {}
        };
    };

    /**
     * Extracts authentication behavior to evaluate adherence to security policies (25% of total score weight).
     */
    const getSecurityPosture = async () => {
        // Queries the Login Audit Trail to track failure rates and anomalies
        const sql = `
            SELECT 
                COUNT(Id) AS TotalLoginAttempts,
                SUM(CASE WHEN Status = 'FAILURE' THEN 1 ELSE 0 END) AS FailedLogins,
                SUM(CASE WHEN Detail LIKE '%InvalidSignature%' OR Detail LIKE '%NonceUsed%' THEN 1 ELSE 0 END) AS TokenAnomalies
            FROM 
                LoginAudit 
            WHERE 
                Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'SecurityPostureAggregates',
            data: queryResults[0] || {}
        };
    };

    return {
        execute: execute
    };
});