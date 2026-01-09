export async function seedDefaultAccounts(supabase, companyId) {
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

  const rows = DEFAULT_ACCOUNTS.map((acc) => ({
    company_id: companyId,
    code: acc.code,
    name: acc.name,
    type: acc.type,
  }));

  const { error } = await supabase
    .from("accounts")
    .insert(rows, { ignoreDuplicates: true });

  if (error) {
    console.error("SEED DEFAULT ACCOUNTS ERROR:", error);
    throw error;
  }
}