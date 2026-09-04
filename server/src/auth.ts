import type { FastifyRequest } from "fastify";
import { supabase } from "./supabase.js";
import type { RequestContext } from "./types.js";

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? "";
  const [scheme, token] = authorization.split(" ", 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthenticationError("Missing bearer token");
  }

  return token;
}

export async function requireContext(
  request: FastifyRequest,
): Promise<RequestContext> {
  const token = bearerToken(request);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new AuthenticationError("Invalid or expired access token");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("firm_memberships")
    .select("firm_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (membershipError || !membership?.firm_id) {
    throw new AuthorizationError("No active firm membership");
  }

  return {
    userId: data.user.id,
    firmId: String(membership.firm_id),
  };
}

export async function requireCaseAccess(
  caseId: string,
  context: RequestContext,
): Promise<void> {
  const { data, error } = await supabase
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .eq("firm_id", context.firmId)
    .maybeSingle();

  if (error || !data) {
    throw new AuthorizationError("Case not found or access denied");
  }
}
