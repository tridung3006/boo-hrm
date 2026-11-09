import { cors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { admin, authUser } = await requireUser(req);
    const { applicationId } = await req.json();
    if (!applicationId) return json({ error: "Thiếu hồ sơ cần duyệt." }, 400);

    const { data: application, error: appError } = await admin
      .from("employee_applications")
      .select("id,organization_id,auth_user_id,full_name,employee_code,email,phone,requested_department_id,status")
      .eq("id", applicationId)
      .eq("status", "pending")
      .single();
    if (appError || !application) return json({ error: "Hồ sơ không còn ở trạng thái chờ duyệt." }, 404);

    const { data: reviewer } = await admin
      .from("organization_memberships")
      .select("employee_id,role")
      .eq("auth_user_id", authUser.id)
      .eq("organization_id", application.organization_id)
      .eq("status", "active")
      .in("role", ["admin", "hr"])
      .maybeSingle();
    if (!reviewer) return json({ error: "Bạn không có quyền duyệt nhân viên." }, 403);

    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", application.organization_id)
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .insert({
        organization_id: application.organization_id,
        branch_id: branch?.id ?? null,
        department_id: application.requested_department_id,
        employee_code: application.employee_code,
        full_name: application.full_name,
        email: application.email,
        phone: application.phone,
        joined_date: new Date().toISOString().slice(0, 10),
        employment_status: "active",
      })
      .select("id")
      .single();
    if (employeeError || !employee) throw employeeError ?? new Error("EMPLOYEE_CREATE_FAILED");

    const { error: membershipError } = await admin.from("organization_memberships").insert({
      auth_user_id: application.auth_user_id,
      organization_id: application.organization_id,
      employee_id: employee.id,
      role: "employee",
      status: "active",
    });
    if (membershipError) throw membershipError;

    await admin.from("user_identities").update({ employee_id: employee.id }).eq("auth_user_id", application.auth_user_id).eq("provider", "zalo");
    const { error: updateError } = await admin.from("employee_applications").update({
      status: "approved",
      reviewed_by: reviewer.employee_id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", application.id);
    if (updateError) throw updateError;

    return json({ employeeId: employee.id, status: "approved" });
  } catch (error) {
    console.error(error);
    return json({ error: "Không thể duyệt hồ sơ nhân viên." }, 500);
  }
});
