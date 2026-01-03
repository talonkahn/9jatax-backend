export async function refreshUserRole() {
  try {
    const res = await fetch("http://localhost:4000/api/auth/me", {
      credentials: "include" // if using cookies/session
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("user_role", data.role);
      localStorage.setItem("user_id", data.id);
      localStorage.setItem("company_id", data.company_id);
      return data;
    } else {
      localStorage.removeItem("user_role");
      localStorage.removeItem("user_id");
      localStorage.removeItem("company_id");
      return null;
    }
  } catch (err) {
    console.error("Failed to refresh role", err);
    return null;
  }
}