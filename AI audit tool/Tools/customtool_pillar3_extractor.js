/*
 * customtool_pillar3_extractor.js
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */

define(['N/query', 'N/https', 'N/url', 'N/log'], function (query, https, url, log) {
    return {
        getFormComplexity: async function (params) {
            try {
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
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((form) => {
                    return {
                        id: form.id,
                        formName: form.formname,
                        recordType: form.recordtype,
                        isInactive: form.isinactive
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getFormComplexity', error.toString());
                return {
                    error: `Error extracting form complexity: ${error.toString()}`,
                };
            }
        },
        
        getDormantFields: async function (params) {
            try {
                // Finds custom fields with ZERO modification events in System Notes over the last year
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
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((field) => {
                    return {
                        customFieldId: field.customfieldid,
                        fieldName: field.fieldname,
                        fieldType: field.fieldtype,
                        lastModificationDate: field.lastmodificationdate,
                        modificationCount: field.modificationcountlast12months
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in getDormantFields', error.toString());
                return {
                    error: `Error extracting dormant fields: ${error.toString()}`,
                };
            }
        },

        getUiLatency: async function (params) {
            try {
                // Invokes the internal APM endpoint to extract Client, Server, and Network latency
                const apmSuiteletUrl = url.resolveScript({
                    scriptId: 'customscript_apm_ptd_sl', 
                    deploymentId: 'customdeploy_apm_ptd_sl',
                    returnExternalUrl: false
                });

                const response = https.get({
                    url: apmSuiteletUrl + '&action=getAggregatedPageTimes&timeframe=LAST_7_DAYS'
                });

                if (response.code === 200) {
                    return response.body; // APM already returns JSON format
                } else {
                    return JSON.stringify({
                        error: `Failed to retrieve APM data. HTTP Status: ${response.code}`
                    });
                }
            } catch (error) {
                log.error('Error in getUiLatency', error.toString());
                return JSON.stringify({
                    warning: 'APM metrics unavailable. Ensure APM SuiteApp is installed.',
                    errorDetails: error.toString()
                });
            }
        }
    };
});
