/*
 * customtool_pillar1_extractor.js
 * @NApiVersion 2.1
 * @NScriptType CustomTool
 */

define(['N/query', 'N/log'], function (query, log) {
    return {
        extractCustomFields: async function (params) {
            try {
                const sql = `
                    SELECT 
                        Name AS FieldName, 
                        ScriptId, 
                        FieldType AS DataType, 
                        Owner, 
                        LastModifiedDate 
                    FROM 
                        CustomField 
                    ORDER BY 
                        ScriptId ASC
                    FETCH FIRST 500 ROWS ONLY
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((field) => {
                    return {
                        fieldName: field.fieldname,
                        scriptId: field.scriptid,
                        dataType: field.datatype,
                        owner: field.owner,
                        lastModifiedDate: field.lastmodifieddate
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in extractCustomFields', error.toString());
                return {
                    error: `Error extracting custom fields: ${error.toString()}`,
                };
            }
        },
        
        extractInstalledBundles: async function (params) {
            try {
                const sql = `
                    SELECT 
                        BundleId, 
                        Name AS BundleName,
                        Version, 
                        Publisher, 
                        InstalledDate, 
                        Status 
                    FROM 
                        InstalledBundle 
                    ORDER BY 
                        InstalledDate DESC
                `;
                
                const queryResult = await query.runSuiteQL.promise({ query: sql });
                
                const results = queryResult.asMappedResults().map((bundle) => {
                    return {
                        bundleId: bundle.bundleid,
                        bundleName: bundle.bundlename,
                        version: bundle.version,
                        publisher: bundle.publisher,
                        installedDate: bundle.installeddate,
                        status: bundle.status
                    };
                });

                return JSON.stringify(results);
            } catch (error) {
                log.error('Error in extractInstalledBundles', error.toString());
                return {
                    error: `Error extracting installed bundles: ${error.toString()}`,
                };
            }
        }
    };
});