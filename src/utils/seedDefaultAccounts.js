export async function seedDefaultAccounts(client, companyId) {
  const DEFAULT_ACCOUNTS = [
    // ASSETS
    { code: 1000, name: "Cash", type: "asset" },
    { code: 1100, name: "Accounts Receivable", type: "asset" },

    // INCOME
    { code: 4000, name: "Revenue", type: "income" },

    // EXPENSES
    { code: 5100, name: "Rent Expense", type: "expense" },
    { code: 5200, name: "Operating Expenses", type: "expense" },
    { code: 5300, name: "Utilities Expense", type: "expense" },
    { code: 5400, name: "Maintenance Expense", type: "expense" },
    { code: 5500, name: "Staff Costs", type: "expense" },

    // LIABILITIES
    { code: 2100, name: "VAT Payable", type: "liability" },

    // EQUITY
    { code: 3000, name: "Owner's Equity", type: "equity" },
  ];

  await client.query(
    `
    INSERT INTO accounts (company_id, code, name, type)
    SELECT $1, a.code, a.name, a.type
    FROM jsonb_to_recordset($2::jsonb)
      AS a(code int, name text, type text)
    ON CONFLICT (company_id, code) DO NOTHING
    `,
    [companyId, JSON.stringify(DEFAULT_ACCOUNTS)]
  );
}