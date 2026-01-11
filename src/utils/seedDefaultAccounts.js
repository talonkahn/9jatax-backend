export async function seedDefaultAccounts(supabase, companyId) {
  const DEFAULT_ACCOUNTS = [
    { code: 1000, name: "Cash", type: "asset" },
    { code: 1100, name: "Accounts Receivable", type: "asset" },

    { code: 4000, name: "Revenue", type: "income" },

    { code: 5100, name: "Rent Expense", type: "expense" },
    { code: 5200, name: "Operating Expenses", type: "expense" },
    { code: 5300, name: "Utilities Expense", type: "expense" },
    { code: 5400, name: "Maintenance Expense", type: "expense" },
    { code: 5500, name: "Staff Costs", type: "expense" },

    { code: 2100, name: "VAT Payable", type: "liability" },

    { code: 3000, name: "Owner's Equity", type: "equity" },
  ];

  const rows = DEFAULT_ACCOUNTS.map(acc => ({
    company_id: companyId,
    code: acc.code,
    name: acc.name,
    type: acc.type,
  }));

  const { error } = await supabase
    .from("accounts")
    .upsert(rows, {
      onConflict: "company_id,code",
    });

  if (error) {
    console.error("SEED DEFAULT ACCOUNTS ERROR:", error);
    throw error;
  }
}