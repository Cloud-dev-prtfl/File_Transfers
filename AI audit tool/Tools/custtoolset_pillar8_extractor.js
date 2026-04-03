/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 8: AI Context & Predictive Risk Extractor
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 8 data extraction for the AI engine.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of growth trends and operational scale
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("operational_scale" or "database_growth_trends").'
            });
        }

        try {
            switch (analysisType) {
                case 'operational_scale':
                    return await getOperationalScale();
                case 'database_growth_trends':
                    return await getDatabaseGrowthTrends();
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
     * Extracts the operational footprint of the account to provide the AI with context.
     * This fulfills the requirement to understand the specific scale of the target account.
     */
    const getOperationalScale = async () => {
        // Gathers high-level organizational scale metrics (Subsidiaries, Active Employees, Active Users)
        const sql = `
            SELECT 
                (SELECT COUNT(Id) FROM Subsidiary WHERE IsInactive = 'F') AS ActiveSubsidiaries,
                (SELECT COUNT(Id) FROM Employee WHERE IsInactive = 'F') AS ActiveEmployees,
                (SELECT COUNT(Id) FROM Employee WHERE IsLoginAllowed = 'T' AND IsInactive = 'F') AS LicensedUsers
            FROM 
                Dual
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'AccountOperationalScale',
            data: queryResults[0] || {}
        };
    };

    /**
     * Analyzes historical growth trends to allow the AI to predict future storage 
     * constraints and system failures.
     */
    const getDatabaseGrowthTrends = async () => {
        // Calculates the velocity at which Transactions and System Notes are generated, 
        // grouped month-over-month for the trailing 12 months.
        const transactionSql = `
            SELECT 
                TO_CHAR(TranDate, 'YYYY-MM') AS RecordMonth,
                COUNT(Id) AS TransactionVolume
            FROM 
                Transaction
            WHERE 
                TranDate >= BUILTIN.RELATIVE_RANGES('LAST_YEAR', 'DATETIME')
            GROUP BY 
                TO_CHAR(TranDate, 'YYYY-MM')
            ORDER BY 
                RecordMonth DESC
        `;

        const systemNoteSql = `
            SELECT 
                TO_CHAR(Date, 'YYYY-MM') AS RecordMonth,
                COUNT(Id) AS SystemNoteVolume
            FROM 
                SystemNote
            WHERE 
                Date >= BUILTIN.RELATIVE_RANGES('LAST_YEAR', 'DATETIME')
            GROUP BY 
                TO_CHAR(Date, 'YYYY-MM')
            ORDER BY 
                RecordMonth DESC
        `;

        const txResults = query.runSuiteQL({ query: transactionSql }).asMappedResults();
        const noteResults = query.runSuiteQL({ query: systemNoteSql }).asMappedResults();

        return {
            status: 'success',
            metric: 'HistoricalDataVelocity',
            data: {
                transactionGrowth: txResults,
                systemNoteGrowth: noteResults
            }
        };
    };

    return {
        execute: execute
    };
});