import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { cors, json } from "../_shared/cors.ts";

type ZaloProfile = {
  id?: string;
  name?: string;
  picture?: { data?: { url?: string } };
  error?: number;
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { accessToken } = await req.json();
    if (!accessToken || typeof accessToken !== "string") {
      return json({ error: "Thiếu Zalo access token." }, 400);
    }

    const profileResponse = await fetch(
      "https://graph.zalo.me/v2.0/me?fields=id,name,picture",
      { headers: { access_token: accessToken } },
    );
    const profile = (await profileResponse.json()) as ZaloProfile;
    if (!profileResponse.ok || profile.error || !profile.id) {
      console.error("Zalo profile verification failed", profile);
      return json({ error: "Zalo không xác nhận được tài khoản." }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey =
      Deno.env.get("SUPABASE_SECRET_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const providerUserId = String(profile.id);

    const { data: identity, error: identityError } = await admin
      .from("user_identities")
      .select("auth_user_id")
      .eq("provider", "zalo")
      .eq("provider_user_id", providerUserId)
      .maybeSingle();
    if (identityError) throw identityError;

    const email = `zalo-${providerUserId}@auth.boo.internal`;
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          name: profile.name ?? "Zalo User",
          avatar_url: profile.picture?.data?.url ?? null,
          zalo_user_id: providerUserId,
        },
      },
    });
    if (link.error || !link.data.properties.hashed_token || !link.data.user?.id) {
      throw link.error ?? new Error("AUTH_LINK_FAILED");
    }

    const authUserId = identity?.auth_user_id ?? link.data.user.id;
    if (identity && identity.auth_user_id !== link.data.user.id) {
      return json({ error: "Danh tính Zalo đã được liên kết với tài khoản khác." }, 409);
    }
    if (!identity) {
      const { error: insertError } = await admin.from("user_identities").insert({
        auth_user_id: authUserId,
        provider: "zalo",
        provider_user_id: providerUserId,
      });
      if (insertError && insertError.code !== "23505") throw insertError;
    }

    return json({
      tokenHash: link.data.properties.hashed_token,
      profile: {
        id: providerUserId,
        name: profile.name ?? "Zalo User",
        avatar: profile.picture?.data?.url ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Không thể đăng nhập Mini App bằng Zalo." }, 500);
  }
});
