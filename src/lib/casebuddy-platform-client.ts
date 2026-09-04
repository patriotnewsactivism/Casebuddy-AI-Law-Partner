export interface CaseBuddyPlatformClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null> | string | null;
}

export class CaseBuddyPlatformClient {
  constructor(
    private readonly options: CaseBuddyPlatformClientOptions,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const token = await this.options.getAccessToken();

    if (!token) {
      throw new Error("CaseBuddy authentication is required");
    }

    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);

    if (typeof init.body === "string" && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(
      new URL(path, this.options.baseUrl),
      {
        ...init,
        headers,
      },
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        body?.error ?? `CaseBuddy API returned ${response.status}`,
      );
    }

    return body as T;
  }

  listModules() {
    return this.request("/v1/modules");
  }

  getCasePlatform(caseId: string) {
    return this.request(
      `/v1/cases/${encodeURIComponent(caseId)}/platform`,
    );
  }

  publishEvent(
    caseId: string,
    input: {
      eventType: string;
      sourceModule: string;
      entityType?: string | null;
      entityId?: string | null;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.request(
      `/v1/cases/${encodeURIComponent(caseId)}/events`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  enqueueJob(
    caseId: string,
    input: {
      moduleId: string;
      jobType: string;
      documentId?: string | null;
      payload?: Record<string, unknown>;
      priority?: number;
      idempotencyKey?: string;
    },
  ) {
    return this.request(
      `/v1/cases/${encodeURIComponent(caseId)}/jobs`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }
}
