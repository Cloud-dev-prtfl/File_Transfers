/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 11: Reporting, Dashboards, and Export Payloads
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 11 reporting data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload configured for specific dashboard personas
     */
    const execute = async (context) => {
        const params = context.params || {};
        const reportType = params.reportType;

        if (!reportType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The reportType parameter is required ("cfo_executive_summary", "admin_technical_drilldown", or "audit_compliance_export").'
            });
        }

        try {
            switch (reportType) {
                case 'cfo_executive_summary':
                    return await getCfoSummary();
                case 'admin_technical_drilldown':
                    return await getAdminDrilldown();
                case 'audit_compliance_export':
                    return await getComplianceExport();
                default:
                    throw error.create({
                        name: 'INVALID_REPORT_TYPE',
                        message: `Unsupported report type: ${reportType}`
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
     * Aggregates a high-level executive overview highlighting SOX compliance risks 
     * and integration uptime metrics for the CFO dashboard.
     */
    const getCfoSummary = async () => {
        // Pulls a condensed view of critical system failures and security anomalies
        const sql = `
            SELECT 
                (SELECT COUNT(Id) FROM LoginAudit WHERE Status = 'FAILURE' AND Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')) AS WeeklyFailedLogins,
                (SELECT COUNT(Id) FROM IntegrationExecutionLog WHERE Status = 'REJECTED' AND Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')) AS WeeklyIntegrationFailures,
                (SELECT COUNT(Id) FROM ScriptExecutionLog WHERE Status = 'FAILED' AND Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME')) AS WeeklyScriptFailures
            FROM 
                Dual
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            persona: 'Chief Financial Officer (CFO)',
            metric: 'ExecutiveHealthSummary',
            data: queryResults[0] || {}
        };
    };

    /**
     * Pulls a deeply technical, granular dashboard payload highlighting script timeouts 
     * and specific lists of unused custom records for the Administrator.
     */
    const getAdminDrilldown = async () => {
        // Extracts the top 10 most critical script failures and latencies for immediate remediation
        const sql = `
            SELECT 
                S.ScriptId,
                S.Name AS ScriptName,
                MAX(SEL.Duration) AS PeakLatency_ms,
                COUNT(SEL.Id) AS ErrorCount
            FROM 
                ScriptExecutionLog SEL
            JOIN 
                ScriptDeployment SD ON SEL.ScriptDeployment = SD.Id
            JOIN 
                Script S ON SD.Script = S.Id
            WHERE 
                SEL.Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME') AND
                (SEL.Status = 'FAILED' OR SEL.Duration > 5000)
            GROUP BY 
                S.ScriptId, S.Name
            ORDER BY 
                ErrorCount DESC
            FETCH FIRST 20 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            persona: 'NetSuite Administrator',
            metric: 'TechnicalDrilldownList',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Facilitates the seamless extraction of the complete Role-Permission Matrix 
     * and customization logs to support external IT audits (CSV/PDF ready).
     */
    const getComplianceExport = async () => {
        // Gathers a flattened snapshot of all active elevated roles and their users
        const sql = `
            SELECT 
                E.EntityId AS EmployeeName,
                R.Name AS RoleName,
                R.IsInactive AS RoleInactiveStatus
            FROM 
                Employee E
            JOIN 
                EmployeeRole ER ON E.Id = ER.Employee
            JOIN 
                Role R ON ER.Role = R.Id
            WHERE 
                E.IsLoginAllowed = 'T' AND
                (R.Id = 3 OR R.Name LIKE '%Admin%')
            ORDER BY 
                R.Name ASC
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            action: 'Compliance Data Export',
            metric: 'ElevatedRoleMatrixFlattened',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});