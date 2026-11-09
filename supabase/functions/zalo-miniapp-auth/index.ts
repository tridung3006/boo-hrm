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
    const { accessToken, miniAppId, clientProfile } = await req.json();
    if (!accessToken || typeof accessToken !== "string") {
      return json({ error: "Thiếu access token Zalo Mini App." }, 400);
    }

    const configuredAppId = Deno.env.get("ZALO_APP_ID") ?? "";
    const allowedAppIds = new Set(["1909023073860102983", configuredAppId].filter(Boolean));
    const verifiedMiniAppId = String(miniAppId ?? "");
    if (!allowedAppIds.has(verifiedMiniAppId)) return json({ error: "Mini App ID không hợp lệ." }, 403);
    const profileUrl = new URL("https://graph.zalo.me/v2.0/me");
    profileUrl.searchParams.set("fields", "id,name,picture");
    profileUrl.searchParams.set("miniapp_id", verifiedMiniAppId);
    const profileResponse = await fetch(
      profileUrl,
      { headers: { access_token: accessToken } },
    );
    const profileText = await profileResponse.text();
    let profile: ZaloProfile;
    try {
      profile = JSON.parse(profileText) as ZaloProfile;
    } catch {
      console.error("Zalo returned a non-JSON profile response", profileResponse.status, profileText.slice(0, 300));
      return json({ error: "Zalo không trả về hồ sơ hợp lệ." }, 502);
    }
    if (!profileResponse.ok || profile.error || !profile.id) {
      console.error("Zalo profile verification failed", profile);
      // Zalo has returned several spellings for this restriction, including
      // "Vietnam", "Viet Nam", and messages with "IP address" in between.
      const regionalErrorText = `${String(profile.message ?? "")} ${profileText}`
        .replace(/\s+/g, " ")
        .trim();
      const blockedByRegion = /\bip\b.*\b(?:not|outside)\b.*(?:\bviet\s*nam\b|\bvn\b)/i
        .test(regionalErrorText);
      const allowClientFallback = Deno.env.get("ALLOW_ZALO_CLIENT_PROFILE_FALLBACK") === "true";
      const fallbackId = String(clientProfile?.id ?? "");
      const fallbackName = String(clientProfile?.name ?? "").trim();
      const fallbackAvatar = String(clientProfile?.avatar ?? "");
      const validFallback =
        /^\d{6,30}$/.test(fallbackId) &&
        fallbackName.length >= 1 &&
        fallbackName.length <= 120;
      if (!blockedByRegion || !allowClientFallback || !validFallback) {
        return json({ error: profile.message ?? "Zalo không xác nhận được tài khoản." }, 401);
      }
      profile = {
        id: fallbackId,
        name: fallbackName,
        picture: fallbackAvatar.startsWith("https://")
          ? { data: { url: fallbackAvatar } }
          : undefined,
      };
      console.warn("Using Zalo SDK profile fallback because Graph API rejected non-Vietnam egress IP");
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

    const { data: adminMembership } = await admin
      .from("organization_memberships")
      .select("organization_id")
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const organizationId = adminMembership?.organization_id;
    if (!organizationId) throw new Error("ORGANIZATION_NOT_CONFIGURED");
    const { error: metadataError } = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: { organization_id: organizationId, identity_provider: "zalo" },
    });
    if (metadataError) throw metadataError;

    return json({
      tokenHash: link.data.properties.hashed_token,
      organizationId,
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
