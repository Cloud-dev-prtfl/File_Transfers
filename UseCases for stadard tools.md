
Use Cases : ns_runSavedSearch

1. Daily Sales Performance Review
Scenario: A Sales Manager needs a quick summary of yesterday's performance compared to the daily target.

User Action: "How did we do yesterday compared to our daily sales goal?"

Agent Steps: 1. The agent identifies the intent for sales data. 2. It calls ns_runSavedSearch using the ID for the "Daily Sales vs. Target" search. 3. It parses the "Total Amount" column and compares it to the "Goal" column. 4. Response: "Yesterday we hit 105% of the goal ($52k vs $50k target)."

2. High-Priority Support Ticket Alert
Scenario: A Customer Success lead wants to know if any "Platinum" customers have open "Critical" cases.

User Action: "Are there any urgent issues for our top-tier clients right now?"

Agent Steps: 1. Agent triggers a saved search filtered for Case Status = "Critical" and Customer Category = "Platinum." 2. It retrieves the Case Number and Subject. 3. Response: "Yes, Case #10293 for 'Global Tech' is still open and was last updated 4 hours ago."

3. Inventory Stock-Out Prevention
Scenario: A Warehouse Manager checks for items that have fallen below their reorder point.

User Action: "Show me which items are low on stock in the East Coast warehouse."

Agent Steps:

Agent runs a search that calculates Location Quantity Available minus Reorder Point.

It filters for results where the value is negative.

Response: "There are 3 items below reorder point: Widget-A, Bolt-B, and Gear-C."

4. Project Profitability Tracking
Scenario: A Project Manager wants to see which active projects are currently over budget on labor.

User Action: "Which of my projects are currently exceeding their estimated labor hours?"

Agent Steps:

Agent runs a search linking Project records to Time Tracking records.

It compares "Actual Hours" vs. "Estimated Work."

Response: "The 'ERP Implementation' project is 15% over its labor budget."

5. Accounts Receivable (AR) Aging Summary
Scenario: A Controller needs to identify customers who are more than 60 days overdue.

User Action: "List the customers with invoices older than 60 days."

Agent Steps:

Agent executes the "AR Aging - 60+ Days" saved search.

It gathers the Customer Name and Balance due.

Response: "Three customers are significantly overdue: Acme Corp ($5k), Stark Ind ($12k), and Wayne Ent ($2k)."

6. Marketing Lead Conversion Analysis
Scenario: A Marketing Director wants to see which lead sources generated the most revenue this month.

User Action: "Which marketing campaigns are driving the most sales this month?"

Agent Steps:

Agent runs a Transaction search grouped by "Lead Source."

It sorts the results by the "Amount" sum.

Response: "The 'Google Ads 2026' campaign is leading with $120k in attributed sales."

7. Employee Certification Expiry Check
Scenario: An HR Manager needs to find employees whose safety certifications expire in the next 30 days.

User Action: "Who has certifications expiring in the next month?"

Agent Steps:

Agent triggers an Employee record search filtered by a custom "Cert Expiry Date" field.

It uses a dynamic date range (within next month).

Response: "John Doe and Jane Smith have certifications expiring on Feb 28th."

8. Unapproved Expense Report Monitoring
Scenario: A Finance clerk wants to find expense reports that have been pending approval for more than a week.

User Action: "Find any expense reports stuck in 'Pending Approval' for over 7 days."

Agent Steps:

Agent runs an Expense Report search filtered by Status and Date Created.

It identifies the "Next Approver" from the results.

Response: "There are 4 reports pending approval, all currently assigned to Michael Scott."

9. Top Product Trends (Quantity Sold)
Scenario: A Buyer needs to decide what to restock based on the most sold items this week.

User Action: "What were our top 5 best-selling products this week?"

Agent Steps:

Agent runs a Sales Order search, grouping by "Item" and summing "Quantity."

It limits the result to the top 5 rows.

Response: "Your top sellers are: 1. MacBook Pro, 2. USB-C Hub, 3. Monitor Stand..."

10. Vendor Performance / Late Deliveries
Scenario: A Procurement Officer checks if any Purchase Orders (POs) are past their "Expected Receipt Date."

User Action: "Which vendors are late with our deliveries?"

Agent Steps:

Agent executes a PO search where Status = "Pending Receipt" and "Expected Receipt Date" < Today.

It groups the results by Vendor.

Response: "Delivery from 'Office Depot' and 'Logitech' are currently 3 days past due."


---------------------------------------------------------------------------------------------------------------------------

Use Cases for ns_listSavedSearches


1. Initial Agent Onboarding
Scenario: A new user doesn't know what data is available in the chatbot.

User Action: "What kind of reports or searches can you access for me?"

Agent Steps:

The agent calls ns_listSavedSearches with no filter to see the full list of available tools.

It categorizes them (e.g., Sales, Inventory, Finance).

Response: "I have access to 45 searches. I can help with Sales Trends, Overdue Invoices, or Inventory Levels. Which area would you like to explore?"

2. Matching Intent to Specific Searches
Scenario: The user asks for "unpaid bills," but the search is named "Outstanding Vendor Invoices."

User Action: "Show me my unpaid bills."

Agent Steps:

The agent calls ns_listSavedSearches with a filter for "Invoice" or "Vendor."

It uses semantic matching to identify "Outstanding Vendor Invoices" as the correct search.

Response: "I found a search called 'Outstanding Vendor Invoices.' Should I run that for you?"

3. Cleaning Up Redundant Searches
Scenario: An Admin wants to identify duplicate searches created by different users.

User Action: "List all saved searches created in the last month to check for duplicates."

Agent Steps:

Agent calls ns_listSavedSearches and retrieves metadata like dateCreated.

It groups searches with similar names (e.g., "Sales 2026" and "Sales 2026 - New").

Response: "I found 10 new searches. 'Sales 2026' and 'Sales 2026 - New' appear to be duplicates."

4. Verifying Search Permissions
Scenario: A user is frustrated they can't see a specific data point.

User Action: "Why can't I see the Payroll search results?"

Agent Steps:

Agent calls ns_listSavedSearches to see if the search even appears for that user's role.

It checks the results; if it's missing, the agent knows it's a permission issue.

Response: "The Payroll search isn't showing up in your available list. You may need to ask your Admin to share that search with your role."

5. Multi-Step Reporting (Dynamic Selection)
Scenario: A user wants to do a deep dive into "Marketing," and the agent needs to show options.

User Action: "I want to look at Marketing data. What searches do we have?"

Agent Steps:

Agent calls ns_listSavedSearches using a keyword filter for "Marketing."

It presents a list of options: Lead Source, Campaign ROI, and Web Lead Activity.

Response: "I found 3 Marketing searches: 1. Campaign ROI, 2. Lead Source... Which one should I run?"

6. Managing "Private" vs. "Public" Searches
Scenario: A manager wants to ensure no private searches are accidentally being used for team reporting.

User Action: "Which of our 'Sales' searches are currently marked as Private?"

Agent Steps:

Agent calls ns_listSavedSearches and filters by the isPublic attribute.

It cross-references names containing "Sales."

Response: "The search 'Q1 Private Sales Draft' is currently marked as private."

7. Identifying High-Usage Search Templates
Scenario: An Admin wants to find standard templates to use for a new department.

User Action: "List all the standard NetSuite search templates for 'Fixed Assets'."

Agent Steps:

Agent filters ns_listSavedSearches by the "Fixed Assets" category or keyword.

It identifies searches with "Template" in the title or standard prefixes.

Response: "There are 5 standard templates available for Fixed Assets, including 'Asset Depreciation' and 'Lease Summary'."

8. Preparing Data for a Dashboard
Scenario: A developer is setting up a custom UI and needs the IDs for all "Inventory" searches.

User Action: "Give me the Internal IDs for all searches related to Inventory."

Agent Steps:

Agent calls ns_listSavedSearches for the "Inventory" record type.

It extracts the title and internalId.

Response: "Inventory Valuation (ID: 45), Stock-on-Hand (ID: 112), and Pending Receipts (ID: 88)."

9. Finding Searches by "Record Type"
Scenario: A user wants to see everything they can do regarding "Employees."

User Action: "What kind of information can I pull about Employees?"

Agent Steps:

Agent calls ns_listSavedSearches and filters by recordType == "employee".

It lists the available searches.

Response: "You can pull: Employee Contact List, Certifications, and Emergency Contacts."

10. Assisting with SuiteQL Conversion
Scenario: A developer wants to convert a Saved Search to SuiteQL for your agentic project.

User Action: "Find the 'Monthly Revenue' search so I can get its ID for a SuiteQL conversion."

Agent Steps:

Agent searches the list for "Monthly Revenue."

It provides the ID and confirms the record type.

Response: "Found it. 'Monthly Revenue' is Search ID 202. I'm ready to help you write the SuiteQL query for this if you'd like."

How the AI Uses This Tool Internally
Unlike run, the list tool is often used by the AI without the user knowing. For example:

User: "Show me my sales."

AI (Internal): Calls ns_listSavedSearches(filter="sales").

AI (Internal): Sees "Total Sales by Customer" and "Daily Sales."

AI (to User): "Would you like to see the Daily Sales or Total Sales by Customer?"



--------------------------------------------------------------------------------------------------------------------------------------

Use Cases for ns_runCustomSuiteQL


1. Complex Multi-Table Joins
Scenario: A user needs to see sales performance grouped by the "Sales Territory" assigned to the Customer, which is two joins away from the Transaction.

User Action: "Break down our total revenue by sales territory."

Agent Steps:

The agent constructs a SuiteQL query joining Transaction, Customer, and Territory tables.

It sums the ForeignTotal where the transaction type is 'SalesOrd'.

Response: "West Coast: $200k, East Coast: $150k, Central: $90k."

2. Identifying "Ghost" Inventory (Bin vs. Location)
Scenario: A warehouse manager notices discrepancies between total stock and what's actually in bins.

User Action: "Show me items where the total location quantity doesn't match the sum of all bin quantities."

Agent Steps:

Agent runs a query comparing itemLocation totals against a subquery of itemBinQuantity.

It filters for records where LocationQty != SUM(BinQty).

Response: "Item 'SKU-102' has a discrepancy of 5 units in the Main Warehouse."

3. Calculating Customer Lifetime Value (CLV)
Scenario: Marketing wants to identify the most valuable customers based on their entire purchase history.

User Action: "Who are my top 10 customers by lifetime spend?"

Agent Steps:

Agent runs a query: SELECT entity, SUM(foreignamount) FROM transaction WHERE type = 'CustInvc' GROUP BY entity ORDER BY SUM(foreignamount) DESC.

It retrieves the top 10 rows.

Response: "Your top customer is Acme Corp with a lifetime spend of $1.2M, followed by..."

4. Real-time Subscription Churn Analysis
Scenario: For companies using SuiteBilling, identifying subscriptions that expired without renewal.

User Action: "How many subscriptions expired last month that haven't been renewed yet?"

Agent Steps:

Agent queries the Subscription table where enddate was last month.

It performs a LEFT JOIN on newer subscriptions for the same customer to find "missing" renewals.

Response: "14 subscriptions expired in January without a renewal, totaling $4,500 in MRR."

5. Audit Trail for Specific Field Changes
Scenario: A controller needs to know who changed the "Credit Limit" on a high-value customer.

User Action: "Find out who changed the credit limit for 'Global Industries' recently."

Agent Steps:

Agent queries the systemnote table filtered by recordid, field, and date.

It joins with the Employee table to get the name of the person who made the change.

Response: "The credit limit was increased by John Smith on Feb 1st at 2:15 PM."

6. Resource Allocation vs. Capacity
Scenario: A project manager needs to see if any consultants are double-booked across different projects.

User Action: "Are any of my developers over-allocated this week?"

Agent Steps:

Agent queries ProjectTaskAssignment and joins it with Employee and ProjectTask.

It sums hours per employee per day across all active tasks.

Response: "Yes, Sarah Jenkins is booked for 12 hours this Thursday across 3 projects."

7. Global Search Across Multiple Record Types
Scenario: A user remembers a reference number but doesn't know if it's a PO, Invoice, or Sales Order.

User Action: "Find anything in the system with the reference number 'REF-9908'."

Agent Steps:

Agent uses a UNION ALL query to search the tranid and custbody_ref_num fields across Transaction, PurchaseOrder, and SupportCase tables.

Response: "I found 'REF-9908' associated with Sales Order #554 and Support Case #102."

8. Vendor Pricing Comparison
Scenario: Procurement wants to see the last price paid for a specific item across different vendors.

User Action: "Compare the last three prices we paid for 'Industrial Grade Steel' from different vendors."

Agent Steps:

Agent queries the TransactionLine table for 'Purchase Orders'.

It uses ROW_NUMBER() OVER(PARTITION BY entity ORDER BY trandate DESC) to get the most recent prices per vendor.

Response: "Vendor A: $50/unit (Jan 10), Vendor B: $52/unit (Dec 15), Vendor C: $49/unit (Nov 30)."

9. Unlinked Transaction Cleanup
Scenario: Finance needs to find Item Receipts that haven't been billed (Invoiced) yet.

User Action: "Show me all Item Receipts from last month that are missing a Vendor Bill."

Agent Steps:

Agent queries Transaction where type = 'ItemRcpt'.

It uses a NOT EXISTS clause against the nextTransaction link to find unbilled receipts.

Response: "There are 8 receipts totaling $12,000 that haven't been billed by vendors yet."

10. Automated "Market-Aware" Price Check
Scenario: (Linking to your project) Comparing internal prices against a custom "Market Price" table you've created.

User Action: "Which of our products are priced 10% higher than the current market average?"

Agent Steps:

Agent joins the standard Item table with your custom customrecord_market_prices table.

It calculates the percentage difference in the SELECT statement.

Response: "Product 'Alpha' is 12% above market, and Product 'Gamma' is 15% above."



---------------------------------------------------------------------------------------------------------------------------------

Use Cases for ns_runRep


1. Executive Monthly Financial Overview
Scenario: A CFO needs a high-level view of the company’s financial health at the end of the month.

User Action: "Run the Income Statement for this month compared to last month."

Agent Steps: 1. The agent calls ns_runReport with the ID for the "Income Statement." 2. It sets the dateRange parameter to "This Month" and enables the "Comparative" flag. 3. Response: "Net Income is up 12% ($140k vs $125k). Revenue increased by $30k, while COGS remained stable."

2. Subsidiary Consolidation Check
Scenario: A global Controller needs to see how different subsidiaries are performing in the base currency.

User Action: "Show me the Consolidated Balance Sheet across all subsidiaries."

Agent Steps:

Agent executes the "Consolidated Balance Sheet" report.

It ensures the "Subsidiary Context" is set to the root parent company.

Response: "Total Assets across all 4 subsidiaries are $5.2M, with $1.1M held in the EMEA branch."

3. Budget vs. Actual (BVA) Variance Analysis
Scenario: A Department Head wants to see if they are overspending their quarterly budget.

User Action: "How is the Marketing department's spending looking against the budget?"

Agent Steps:

Agent runs the "Budget vs. Actual" report.

It applies a filter for Department = "Marketing."

Response: "Marketing has spent $45k of its $50k quarterly budget (90%), with one month remaining."

4. Sales Tax Liability Audit
Scenario: An Accountant needs to prepare for a tax filing and verify collected taxes by state.

User Action: "What is our total Sales Tax liability by state for the last quarter?"

Agent Steps:

Agent runs the "Sales Tax Liability" report.

It groups the output by "Tax Agency" or "State."

Response: "Total liability is $12,450. California accounts for $8,200, followed by Texas at $2,100."

5. Inventory Valuation for Insurance
Scenario: An Operations Manager needs the total value of stock currently held in a specific warehouse.

User Action: "Give me the total inventory valuation for the Chicago warehouse."

Agent Steps:

Agent executes the "Inventory Valuation" report.

It filters by Location = "Chicago."

Response: "The total value of stock in Chicago is $892,400 as of today."

6. A/P Aging for Cash Flow Planning
Scenario: A Treasurer needs to know which vendors need to be paid this week to manage cash flow.

User Action: "Run an A/P Aging report. Who do we owe the most money to right now?"

Agent Steps:

Agent runs the "A/P Aging Summary."

It sorts the results by the "Total" column.

Response: "You owe a total of $65k. The largest balance is to 'Dell Technologies' ($22k), which is in the 1-30 days bracket."

7. Customer Profitability Detailed View
Scenario: A Sales VP wants to know which customers are actually profitable after considering discounts and returns.

User Action: "Which customers had the highest gross profit margin this year?"

Agent Steps:

Agent runs the "Customer Profitability" report.

It focuses on the "Gross Profit %" column.

Response: "Client 'BlueSky Inc' is your most profitable at a 65% margin, while 'MassRetail Co' is at 18%."

8. Project Billing Backlog
Scenario: A Project Manager needs to see what work has been completed but not yet invoiced.

User Action: "What is the current unbilled receivable amount for all active projects?"

Agent Steps:

Agent runs the "Project Profitability" or "Unbilled Receivable" report.

It filters for Project Status = "In Progress."

Response: "There is $115,000 in unbilled time and expenses across 12 active projects."

9. Employee Utilization (Billable vs. Non-Billable)
Scenario: A Professional Services lead needs to check if the team is meeting their billable targets.

User Action: "What was the average employee utilization rate last month?"

Agent Steps:

Agent triggers the "Utilization Report."

It calculates the average from the "Percent Billable" column.

Response: "Average utilization was 78%. Mark and Sarah were highest at 92%, while the rest averaged 65%."

10. Purchase Order Pool (Open Commitments)
Scenario: A Purchasing Agent needs to see the total financial commitment for pending orders.

User Action: "What is the total value of all open Purchase Orders that haven't been received?"

Agent Steps:

Agent runs the "Open Purchase Orders" report.

It sums the "Amount (Remaining)" column.

Response: "There are 24 open POs with a total remaining commitment of $310,500."


--------------------------------------------------------------------------------------------------------------------

Use Cases for ns_listAllRepor


1. Navigating Financial Folders
Scenario: A user wants to see their "Income Statement" but doesn't know the exact name of the custom version they use.

User Action: "Find all the 'Profit and Loss' reports I have access to."

Agent Steps:

The agent calls ns_listAllReports with a name filter for "Profit" or "Income."

It retrieves the report IDs and names.

Response: "I found 'Income Statement - Consolidated' and 'P&L by Department.' Which one should I open?"

2. Identifying Stale or Duplicate Reports
Scenario: An Admin is trying to clean up the system and wants to see which reports were created years ago.

User Action: "Show me all custom reports that haven't been modified since 2022."

Agent Steps:

Agent calls ns_listAllReports and extracts the dateCreated or lastModified metadata.

It filters for dates older than Jan 2023.

Response: "There are 15 reports that haven't been touched in over 3 years, including 'Old Sales Forecast' and 'Temp Inventory Report'."

3. Permission Discovery for Audits
Scenario: A user is trying to find a "Payroll" report they think they should have.

User Action: "List all 'Payroll' related reports available to my current role."

Agent Steps:

Agent calls ns_listAllReports filtering by the keyword "Payroll."

If none are found, it confirms the user may need a permissions update.

Response: "I don't see any Payroll reports in your list. This usually means your current role doesn't have the 'Payroll' permission enabled."

4. Cross-Module Report Discovery
Scenario: A user is working on "Fixed Assets" and wants to know what standard tools are available.

User Action: "What reports can I run for Fixed Assets?"

Agent Steps:

Agent calls ns_listAllReports filtering by the "Fixed Assets" category.

It lists titles like "Asset Depreciation" and "Lease Summary."

Response: "You have 4 Fixed Asset reports: 1. Depreciation Schedule, 2. Asset Register..."

5. Automated Report Scheduling Check
Scenario: A manager wants to know which reports are already set up to be emailed automatically.

User Action: "Which of my reports are currently on a scheduled email trigger?"

Agent Steps:

Agent calls ns_listAllReports and checks the isScheduled flag (if available via metadata).

It returns the names and frequency.

Response: "The 'Weekly Sales Summary' is scheduled to send every Monday at 8:00 AM."

6. Developer Integration Setup
Scenario: You are building your Next.js dashboard and need a list of all "Sales" reports to populate a dropdown.

User Action: "Give me the Internal IDs for every report in the 'Sales' folder."

Agent Steps:

Agent calls ns_listAllReports and filters by the category attribute = "Sales."

It returns a clean list of {name: ..., id: ...}.

Response: "Sales by Customer (ID: 12), Sales by Item (ID: 15), Open Sales Orders (ID: 88)."

7. Global Keyword Search
Scenario: A user remembers a report had the word "Waterfall" in it but can't find it.

User Action: "I'm looking for a report with 'Waterfall' in the name."

Agent Steps:

Agent performs a wild-card search using ns_listAllReports.

Response: "I found one: 'Revenue Recognition Waterfall Forecast' (ID: 504)."

8. Comparing "Standard" vs. "Custom" Reports
Scenario: An auditor wants to see which financial reports have been customized (and thus might have modified logic).

User Action: "List all of our customized Financial reports."

Agent Steps:

Agent calls ns_listAllReports and filters for isCustom == true within the "Financial" category.

Response: "You have 3 customized financial reports: 'Modified Balance Sheet,' 'Tax-Adjusted P&L,' and 'Executive CF'."

9. Mapping Reports to Record Types
Scenario: A user wants to know what reports exist for "Vendors."

User Action: "Show me all reports related to Vendor performance."

Agent Steps:

Agent filters the list for reports that reference the "Vendor" or "Supplier" record types.

Response: "I found 'Vendor Purchase History' and 'A/P Aging by Vendor'."

10. AI-Guided Report Recommendation
Scenario: A user asks a broad question, and the agent needs to suggest the best report.

User Action: "I need to analyze why our shipping costs are so high."

Agent Steps:

Agent calls ns_listAllReports searching for keywords like "Shipping," "Freight," or "Courier."

It identifies "Shipping Charge Profitability."

Response: "To analyze those costs, I recommend running the 'Shipping Charge Profitability' report. Should I run that for you now?"


-------------------------------------------------------------------------------------------------------------------

Use Cases for ns_getRecord

1. Customer 360 Quick View
Scenario: A Sales Rep is about to jump on a call and needs the latest details for a specific client.

User Action: "Give me the contact info and current balance for customer 'Acme Corp'."

Agent Steps:

Agent identifies the Internal ID for Acme Corp.

It calls ns_getRecord for the customer record type.

Response: "Acme Corp (ID: 456) has a balance of $12,500. The primary contact is Sarah Miller at sarah@acme.com."

2. Transaction Deep-Dive
Scenario: A user sees a suspicious charge on a report and wants to see the actual document.

User Action: "Show me the details for Invoice #INV-2024-99."

Agent Steps:

Agent calls ns_getRecord for the invoice type.

It parses the line items (sublists) to see what was sold.

Response: "Invoice #INV-2024-99 was for 10x 'Widget A' and 5x 'Service Hours', totaling $1,200, billed on Jan 15th."

3. Order Status Tracking
Scenario: A customer calls asking where their package is.

User Action: "What is the status of Sales Order #8877?"

Agent Steps:

Agent calls ns_getRecord for the salesorder.

It checks the orderstatus field and looks at the itemfulfillment sublist.

Response: "Order #8877 is currently 'Pending Fulfillment'. It was approved yesterday by John Doe."

4. Vendor Performance Drill-Down
Scenario: A buyer wants to see the specific terms agreed upon with a supplier.

User Action: "What are our payment terms and lead time for Vendor 'Logitech'?"

Agent Steps:

Agent calls ns_getRecord for the vendor.

It looks for fields like terms and custvendor_lead_time.

Response: "Logitech is on 'Net 30' terms with a standard lead time of 14 days."

5. Employee Detail Verification
Scenario: HR needs to verify an employee's supervisor or department.

User Action: "Who is Michael Scott's direct supervisor and what department is he in?"

Agent Steps:

Agent calls ns_getRecord for the employee record.

It retrieves the supervisor (joining for the name) and department fields.

Response: "Michael Scott is the Manager of the 'Scranton' department and reports to Jan Levinson."

6. Troubleshooting "Bounced" Emails
Scenario: A user wants to know why a customer didn't receive an invoice.

User Action: "Check the email address on file for 'Wayne Enterprises'."

Agent Steps:

Agent calls ns_getRecord for the customer.

It checks the email field and the addressbook sublist.

Response: "The email on file is bruce@wayne.ent. Note that there is no secondary email listed in the address book."

7. Support Case Resolution
Scenario: A support agent needs the full history of a case.

User Action: "Read me the last comment on Support Case #1029."

Agent Steps:

Agent calls ns_getRecord for the supportcase.

It parses the messagelog or user_notes sublist.

Response: "The last note from Feb 1st says: 'Waiting for customer to provide screenshots of the error'."

8. Project Milestone Check
Scenario: A Project Manager needs to see if a specific milestone has been marked complete.

User Action: "Has the 'Database Migration' milestone been completed for the NS_BOT project?"

Agent Steps:

Agent calls ns_getRecord for the job (Project) or projecttask.

It checks the percentcomplete and status fields.

Response: "Yes, 'Database Migration' is marked 100% complete as of Jan 20th."

9. Price List Validation
Scenario: A user wants to verify the price of a specific item across different price levels.

User Action: "What is the 'Wholesale' price for 'Item-X'?"

Agent Steps:

Agent calls ns_getRecord for the inventoryitem.

It navigates the price sublist to find the row where pricelevel = 'Wholesale'.

Response: "The Wholesale price for Item-X is $45.00 per unit."

10. Audit Preparation (Single Record)
Scenario: An auditor asks for the GL Impact or the specific creator of a transaction.

User Action: "Who created Journal Entry #552 and when?"

Agent Steps:

Agent calls ns_getRecord for the journalentry.

It looks at the createdby and datecreated system fields.

Response: "Journal Entry #552 was created by Admin 'Shubham' on Dec 10th, 2025."


--------------------------------------------------------------------------------------------------------------

Use Cases for ns_createRecord


1. Draft a "Customer Apology" Sales Order
Scenario: (Linking to your project) Based on a customer complaint, the agent offers a discount or a free replacement.

User Action: "The customer at Acme Corp is unhappy with their last order. Create a new Sales Order for 1x 'Replacement Widget' at $0 and add a memo about the apology."

Agent Steps: 1. Agent calls ns_createRecord for the salesorder type. 2. It maps entity to Acme Corp's ID and adds a line item for the widget with a price override. 3. Response: "I've created Sales Order #9921 for the replacement. It's currently pending approval."

2. Fast Lead Entry from Chat
Scenario: A sales rep is on the go and wants to quickly log a new lead they just met.

User Action: "Add a new lead: Shubhams at TechGenius, email shubham@techg.com, met at the Pune IT Expo."

Agent Steps: 1. Agent triggers ns_createRecord for the lead (or customer with status 'lead'). 2. It populates companyname, email, and comments. 3. Response: "Lead 'Shubhams' has been successfully created in NetSuite."

3. Log a Support Case from Customer Feedback
Scenario: The AI identifies a technical issue in a chat and needs to track it.

User Action: "Create a support case for Global Industries. They are reporting a 'System Timeout' error in their production environment."

Agent Steps: 1. Agent calls ns_createRecord for supportcase. 2. It sets the title, company, and incomingmessage fields. 3. Response: "Case #1045 has been created and assigned to the technical support queue."

4. Create Task Assignments for Projects
Scenario: A Project Manager wants to quickly assign work to a developer.

User Action: "Create a task for the NetSuite Bot project called 'Finalize SuiteQL Joins' and assign it to the developer team."

Agent Steps: 1. Agent calls ns_createRecord for projecttask. 2. It links the task to the specific project ID. 3. Response: "Task 'Finalize SuiteQL Joins' is now live in the project schedule."

5. Instant Expense Recording
Scenario: A user wants to log a small expense without navigating the full UI.

User Action: "Log an expense for $50 for 'Team Lunch' under the Marketing department."

Agent Steps: 1. Agent calls ns_createRecord for expensereport. 2. It adds an expense line with the amount, memo, and department. 3. Response: "Expense report drafted for $50. Please remember to upload the receipt later."

6. Journal Entry for Manual Adjustments
Scenario: An accountant needs to make a quick reclassification entry.

User Action: "Create a Journal Entry to move $500 from Travel Expenses to Office Supplies."

Agent Steps: 1. Agent calls ns_createRecord for journalentry. 2. It creates two lines: a Debit to 'Office Supplies' and a Credit to 'Travel Expenses'. 3. Response: "Journal Entry #4456 created. Total Debit/Credit: $500."

7. Generate a Quote for a Customer
Scenario: A customer asks for pricing on a specific set of items.

User Action: "Prepare a quote for Stark Industries for 5 units of 'Cloud License A' and 2 units of 'Setup Service'."

Agent Steps: 1. Agent calls ns_createRecord for estimate (Quote). 2. It pulls current pricing and applies it to the new record. 3. Response: "Quote #QUO-88 has been generated for Stark Industries totaling $3,500."

8. Create Custom Record Entries
Scenario: (Linking to your project) You need to update your "Market Prices" table.

User Action: "Add a new market price entry for 'Item-Alpha' at $120 based on today's competitor research."

Agent Steps: 1. Agent calls ns_createRecord for your custom record type customrecord_market_prices. 2. It populates the item link and the price field. 3. Response: "Market price updated for Item-Alpha. The 'Price Optimizer' agent will now see this new data."

9. Automating "New Hire" Checklists
Scenario: HR wants to trigger a set of tasks whenever a new employee starts.

User Action: "Create a new 'Onboarding' task for our new hire, Jane Smith."

Agent Steps: 1. Agent calls ns_createRecord for task. 2. It sets the title and links it to the employee record. 3. Response: "Onboarding task created and linked to Jane Smith's profile."

10. Direct Purchase Order Creation
Scenario: A warehouse manager sees low stock and wants to order immediately.

User Action: "Create a Purchase Order for Vendor 'Logitech' for 20 units of 'MX Master Mouse' at our standard cost."

Agent Steps: 1. Agent calls ns_createRecord for purchaseorder. 2. It fetches the item’s standard cost via ns_getRecord first, then creates the PO. 3. Response: "PO #5567 created for Logitech. 20 units ordered."



-----------------------------------------------------------------------------------------------------------------------------

Use Cases for ns_updateRecord



1. Market-Driven Price Adjustment
Scenario: (Directly for your project) Your optimizer finds that an item is overpriced compared to the market.

User Action: "Adjust the 'Base Price' of Item-Alpha to $115 to match the new market average."

Agent Steps:

Agent identifies the internalId for Item-Alpha.

It calls ns_updateRecord for the inventoryitem record, targeting the price sublist.

Response: "Price updated for Item-Alpha. The new base price is now $115."

2. Update Customer Contact Information
Scenario: A customer calls to change their primary billing email.

User Action: "Change the email for Acme Corp to billing@acmecorp.com."

Agent Steps:

Agent calls ns_updateRecord for the customer record.

It sets the email field to the new value.

Response: "I've updated the email address for Acme Corp."

3. Approving a Sales Order or Invoice
Scenario: A manager reviews a draft order and wants to push it to the next stage.

User Action: "Approve Sales Order #9921."

Agent Steps:

Agent calls ns_updateRecord on the salesorder.

It changes the orderstatus (or custom approval field) to "B" (Pending Fulfillment) or "Approved."

Response: "Sales Order #9921 has been successfully approved."

4. Reassigning Support Cases
Scenario: A team lead needs to move a case to a more specialized agent.

User Action: "Assign Support Case #1045 to the Senior Engineering queue."

Agent Steps:

Agent calls ns_updateRecord for the supportcase.

It updates the assigned or owner field.

Response: "Case #1045 has been reassigned to Senior Engineering."

5. Managing Project Timelines
Scenario: A project is running ahead of schedule, and the end date needs to be moved up.

User Action: "The 'Bot Deployment' project will finish early. Move the end date to Feb 15th."

Agent Steps:

Agent calls ns_updateRecord for the job (Project) record.

It updates the calculatedenddate or a custom actual_end_date field.

Response: "Project timeline updated. The new end date is Feb 15th."

6. Updating Vendor Payment Terms
Scenario: Procurement has negotiated better terms with a supplier.

User Action: "Change our terms for 'Logitech' from Net 30 to Net 60."

Agent Steps:

Agent calls ns_updateRecord for the vendor record.

It updates the terms field ID to the one corresponding to Net 60.

Response: "Vendor terms for Logitech have been updated to Net 60."

7. Correcting a Transaction Memo
Scenario: A user forgot to add an important note for the audit trail.

User Action: "Add a note to Journal Entry #4456: 'Reclassification for Q1 audit'."

Agent Steps:

Agent calls ns_updateRecord for the journalentry.

It appends the text to the memo field.

Response: "Memo updated for Journal Entry #4456."

8. Changing Credit Limits
Scenario: A high-performing customer needs a higher credit limit for a big purchase.

User Action: "Increase the credit limit for 'Global Industries' to $50,000."

Agent Steps:

Agent calls ns_updateRecord for the customer.

It updates the creditlimit field.

Response: "Credit limit for Global Industries is now $50,000."

9. Flagging a Transaction for Follow-up
Scenario: A user wants to "bookmark" a specific invoice for a meeting.

User Action: "Flag Invoice #INV-882 for review in our Monday meeting."

Agent Steps:

Agent calls ns_updateRecord and sets a custom checkbox custbody_needs_review to true.

Response: "Invoice #INV-882 has been flagged for Monday's review."

10. Bulk Status Update (Iterative)
Scenario: A user wants to close all tasks for a specific milestone.

User Action: "Close all tasks related to the 'Phase 1' milestone."

Agent Steps:

Agent first searches for all task IDs linked to 'Phase 1'.

It iterates through each ID, calling ns_updateRecord to set status to 'Completed'.

Response: "I've closed all 5 tasks associated with Phase 1."

----------------------------------------------------------------------------------------------

Use Cases for ns_getRecordTypeMetadata


1. Field Discovery for Custom AI Tools
Scenario: (Linking to your project) You are building a "Market-Aware Price Optimizer" and need to know where the market price data is stored.

User Action: "What fields are available on our custom 'Market Price' record?"

Agent Steps: 1. Agent calls ns_getRecordTypeMetadata for customrecord_market_prices. 2. It identifies fields like custrecord_competitor_price and custrecord_target_item. 3. Response: "The Market Price record contains fields for Competitor Price, Item Link, and Last Research Date."

2. Identifying Mandatory Fields for Creation
Scenario: The agent is about to create a Sales Order but doesn't want the request to fail due to missing data.

User Action: "What information do I absolutely need to provide to create a Sales Order in this account?"

Agent Steps: 1. Agent calls the metadata tool for salesorder. 2. It filters for fields where isMandatory is true. 3. Response: "To create a Sales Order, you must provide: Customer, Date, Subsidiary, and at least one Item line."

3. Mapping Natural Language to Field IDs
Scenario: A user asks to update the "Shipping Method," but the internal NetSuite ID is shipmethod.

User Action: "Update the delivery way for this order."

Agent Steps: 1. Agent pulls metadata for salesorder. 2. It searches the label or description attributes for "delivery" or "shipping." 3. Response: "I found a field labeled 'Ship Method'. Should I update that for you?"

4. Validating Dropdown (Select) Options
Scenario: A user wants to set a case priority to "Urgent," but the system only accepts "High," "Medium," or "Low."

User Action: "Set this support case to 'Urgent' priority."

Agent Steps: 1. Agent checks metadata for the priority field on the supportcase record. 2. It sees the list of valid selectOptions. 3. Response: "'Urgent' isn't an option. The valid priorities are High, Medium, or Low. Which should I use?"

5. Determining Data Types (Integer vs. String)
Scenario: An agent needs to know if "Quantity" should be sent as a number or a text string.

User Action: "Add 10.5 units of 'Fabric' to the quote."

Agent Steps: 1. Agent checks metadata for the quantity field on the estimate record. 2. It verifies if the field type is float or decimal to ensure it can handle 10.5. 3. Response: "Added 10.5 units (Quantity field supports decimals)."

6. Sublist Structure Understanding
Scenario: Your agent needs to add a line item but doesn't know the internal name for the "Items" sublist.

User Action: "Add a new item to this invoice."

Agent Steps: 1. Agent pulls metadata for invoice. 2. It looks at the sublists section to find the item sublist schema. 3. Response: "I've identified the item sublist. Please tell me which SKU and quantity to add."

7. Verifying Read/Write Permissions
Scenario: A user is trying to update a field that might be "Read Only" for their role.

User Action: "Change the Total Amount on this Invoice manually."

Agent Steps: 1. Agent checks the isUpdateable attribute for the total field in the metadata. 2. It sees that total is a system-calculated read-only field. 3. Response: "I cannot change the 'Total' directly as it is a calculated field. I would need to adjust the line items instead."

8. Dynamic Form Generation for UI
Scenario: (For your Next.js project) You want to build a dynamic form that changes based on the record type.

User Action: "Open the 'New Lead' entry form."

Agent Steps: 1. Your Next.js app calls the agent, which calls ns_getRecordTypeMetadata. 2. It returns a JSON list of all fields, their labels, and their types. 3. Response: The UI renders the form fields dynamically based on the NetSuite schema.

9. Custom Segment Discovery
Scenario: Your company uses "Custom Segments" (like Profit Center or Brand) that aren't in standard NetSuite.

User Action: "Make sure this expense is tagged to the 'Gaming' brand."

Agent Steps: 1. Agent checks metadata for expensereport. 2. It finds a custom segment field with the label "Brand." 3. Response: "Tagging expense to the 'Gaming' brand segment as requested."

10. API Versioning & Feature Support
Scenario: You are trying to use a newer NetSuite feature that might not be enabled.

User Action: "Can I use the 'Subscription' fields on this record?"

Agent Steps: 1. Agent checks metadata to see if the subscription-related fields are exposed in the REST schema. 2. Response: "Subscription fields are available in this account's current metadata. I can proceed."



--------------------------------------------------------------------------------------------------------------------------------