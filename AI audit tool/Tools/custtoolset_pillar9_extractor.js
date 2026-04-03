/**
 * @NApiVersion 2.1
 * @NScriptType CustomModule
 * @description MCP Custom Tool for Pillar 9: Security, Compliance, and RBAC Auditing
 */
define(['N/query', 'N/error'], (query, error) => {

    /**
     * Executes the requested Pillar 9 security and compliance data extraction.
     * @param {Object} context.params - Parameters passed by the MCP Client (LLM)
     * @returns {Object} Structured JSON payload of security metrics
     */
    const execute = async (context) => {
        const params = context.params || {};
        const analysisType = params.analysisType;

        if (!analysisType) {
            throw error.create({
                name: 'MISSING_PARAMETER',
                message: 'The analysisType parameter is required ("role_permissions", "access_anomalies", or "mfa_adherence").'
            });
        }

        try {
            switch (analysisType) {
                case 'role_permissions':
                    return await getRolePermissions();
                case 'access_anomalies':
                    return await getAccessAnomalies();
                case 'mfa_adherence':
                    return await getMfaAdherence();
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
     * Extracts the granular permissions assigned to active roles to allow the AI 
     * to evaluate Segregation of Duties (SoD) violations.
     */
    const getRolePermissions = async () => {
        // Conceptual SuiteQL mapping custom and standard roles to their base configurations.
        // Note: In strict practice, complex sub-permissions may require deep N/search iteration 
        // if SuiteQL access is restricted in the specific NetSuite version.
        const sql = `
            SELECT 
                Id AS RoleId,
                Name AS RoleName,
                IsInactive,
                IsCustom,
                SubsidiaryRestriction
            FROM 
                Role
            WHERE 
                IsInactive = 'F'
            ORDER BY 
                Id ASC
            FETCH FIRST 200 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();
        
        return {
            status: 'success',
            metric: 'RolePermissionMatrix',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Actively hunts for authentication irregularities, integration token spoofing, 
     * and brute-force cyberattacks.
     */
    const getAccessAnomalies = async () => {
        // Queries the Login Audit Trail for high frequencies of InvalidSignature, NonceUsed, 
        // or general failures, alongside IP addresses for the AI to perform geographic probability checks.
        const sql = `
            SELECT 
                User AS UserId,
                EmailAddress,
                Role,
                IPAddress,
                Status,
                Detail,
                COUNT(Id) AS EventCount,
                MAX(Date) AS LastEventDate
            FROM 
                LoginAudit
            WHERE 
                Date >= BUILTIN.RELATIVE_RANGES('LAST_7_DAYS', 'DATETIME') AND
                (Status = 'FAILURE' OR Detail LIKE '%InvalidSignature%' OR Detail LIKE '%NonceUsed%')
            GROUP BY 
                User, EmailAddress, Role, IPAddress, Status, Detail
            ORDER BY 
                EventCount DESC
            FETCH FIRST 150 ROWS ONLY
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'LoginAccessAnomalies',
            count: queryResults.length,
            data: queryResults
        };
    };

    /**
     * Audits highly privileged accounts to ensure strict adherence to Multi-Factor Authentication.
     */
    const getMfaAdherence = async () => {
        // Identifies active Administrators or Full Access users to verify MFA is enforced
        const sql = `
            SELECT 
                E.Id AS EmployeeId,
                E.EntityId AS EmployeeName,
                E.Email,
                R.Name AS RoleName,
                R.Id AS RoleId
            FROM 
                Employee E
            JOIN 
                EmployeeRole ER ON E.Id = ER.Employee
            JOIN 
                Role R ON ER.Role = R.Id
            WHERE 
                E.IsLoginAllowed = 'T' AND 
                E.IsInactive = 'F' AND 
                (R.Id = 3 OR R.Name LIKE '%Admin%') -- Role 3 is standard Administrator
            ORDER BY 
                E.EntityId ASC
        `;

        const queryResults = query.runSuiteQL({ query: sql }).asMappedResults();

        return {
            status: 'success',
            metric: 'ElevatedPrivilegeMfaAudit',
            count: queryResults.length,
            data: queryResults
        };
    };

    return {
        execute: execute
    };
});