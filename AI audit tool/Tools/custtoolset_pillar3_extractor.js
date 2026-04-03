/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 3: User Interface and Forms Performance Assessment
 */
define(['N/query', 'N/error', 'N/https', 'N/url'], (query, error, https, url) => {

    /**
     * Executes the requested Pillar 3 UI/Forms data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of UI metrics and form bloat data
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("form_complexity", "dormant_fields", or "ui_latency").'
            });
        }

        try {
            switch (analysisType) {
                case 'form_complexity':
                    return await getFormComplexity();
                case 'dormant_fields':
                    return await getDormantFields();
                case 'ui_latency':
                    return await getUiLatency();
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
     * Maps custom forms to evaluate structural bloat.
     */
    const getFormComplexity = async () => {
        // Extracts standard and custom forms deployed across the instance
        const sql = `
            SELECT 
                Id,
                Name AS FormName,
                RecordType,
                IsInactive
            FROM 
                CustomForm
            WHERE 
                IsInactive = 'F'
            ORDER BY 
                RecordType ASC
            FETCH FIRST 100 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'FormComplexityMapping',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Identifies UI Bloat by correlating custom fields against the SystemNote table
     * over a trailing 12-month period.
     */
    const getDormantFields = async () => {
        // Finds custom fields that have ZERO modification events in the System Notes
        // over the last year, indicating they are candidates for deprecation.
        const sql = `
            SELECT 
                CF.ScriptId AS CustomFieldId,
                CF.Name AS FieldName,
                CF.FieldType,
                MAX(SN.Date) AS LastModificationDate,
                COUNT(SN.Id) AS ModificationCountLast12Months
            FROM 
                CustomField CF
            LEFT JOIN 
                SystemNote SN ON CF.ScriptId = SN.Field AND SN.Date >= BUILTIN.RELATIVE_RANGES('LAST_YEAR', 'DATETIME')
            GROUP BY 
                CF.ScriptId, CF.Name, CF.FieldType
            HAVING 
                COUNT(SN.Id) = 0
            ORDER BY 
                CF.ScriptId ASC
            FETCH FIRST 150 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'DormantFields_UIBloat',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Extracts UI page load times by replicating APM Suitelet network requests.
     */
    const getUiLatency = async () => {
        // Note: As per the architectural blueprint, APM data lacks a public REST API.
        // This function securely invokes internal APM metrics to extract Client, Server, and Network latency.
        // The endpoint URL corresponds to the hidden APM Page Time Details suitelet.
        
        try {
            const apmSuiteletUrl = url.resolveScript({
                scriptId: 'customscript_apm_ptd_sl', // Replace with exact APM Suitelet internal ID
                deploymentId: 'customdeploy_apm_ptd_sl',
                returnExternalUrl: false
            });

            // Replicate the network request to the internal APM endpoint
            const response = https.get({
                url: apmSuiteletUrl + '&action=getAggregatedPageTimes&timeframe=LAST_7_DAYS'
            });

            if (response.code === 200) {
                return {
                    status: 'success',
                    metric: 'UIPageTimeDetails',
                    data: JSON.parse(response.body)
                };
            } else {
                throw error.create({
                    name: 'APM_EXTRACTION_FAILED',
                    message: `Failed to retrieve APM data. HTTP Status: ${response.code}`
                });
            }
        } catch (e) {
            // Fallback if APM suitelet is inaccessible or uninstalled
            return {
                status: 'warning',
                message: 'APM metrics unavailable programmatically. Ensure APM SuiteApp is installed and accessible to the execution context.',
                errorContext: e.message
            };
        }
    };

    return {
        execute: execute
    };
});