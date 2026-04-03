/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 1: Data Collection & Architecture Mapping
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 1 data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of ERP metadata
     */
    const execute = async (context) => {
        const params = context.params || {};
        const extractionType = params.extractionType;

        if (!extractionType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The extractionType parameter is required (e.g., "custom_fields" or "bundles").'
            });
        }

        try {
            switch (extractionType) {
                case 'custom_fields':
                    return await extractCustomFields();
                case 'bundles':
                    return await extractInstalledBundles();
                default:
                    throw error.create({
                        name: 'INVALID_EXTRACTION_TYPE',
                        message: `Unsupported extraction type: ${extractionType}`
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
     * Extracts custom field metadata using SuiteQL.
     */
    const extractCustomFields = async () => {
        // Selects field name, script identifier, data type, owner, and modification date [cite: 34]
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

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            dataType: 'CustomFieldMetadata',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Extracts installed third-party bundle data using SuiteQL.
     */
    const extractInstalledBundles = async () => {
        // Retrieves installation dates, version numbers, publisher details, and statuses [cite: 36]
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

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            dataType: 'InstalledBundles',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});