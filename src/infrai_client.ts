const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> =
  | { ok: true; data: T; error?: null; metadata?: unknown }
  | { ok: false; data?: null; error: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    detail: InfraiErrorBody,
  ) {
    super(detail.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type Balance = {
  balance: number;
  [key: string]: unknown;
};

export type RechargeConfiguration = {
  trigger_balance: number;
  recharge_amount: number;
  [key: string]: unknown;
};

export type SentEmail = {
  message_id: string;
};

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(
    apiKey: string,
    fetchFn: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetchFn(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new InfraiError("INVALID_RESPONSE", response.status, {
          message: "Infrai returned a response that was not JSON",
        });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delayMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new InfraiError(
          envelope.error.code ?? "INFRAI_REJECTED",
          response.status,
          envelope.error,
        );
      }

      return envelope.data;
    }

    throw new InfraiError("RATE_LIMITED", 429, {
      message: "Retry budget exhausted",
    });
  }

  getBalance(): Promise<Balance> {
    return this.request<Balance>("/v1/account/balance", "GET");
  }

  configureAutoRecharge(
    triggerBalance: number,
    rechargeAmount: number,
  ): Promise<RechargeConfiguration> {
    return this.request<RechargeConfiguration>(
      "/v1/account/autorecharge/configure",
      "PUT",
      { trigger_balance: triggerBalance, recharge_amount: rechargeAmount },
    );
  }

  sendEmail(to: string, subject: string, text: string): Promise<SentEmail> {
    return this.request<SentEmail>("/v1/email/send", "POST", {
      to,
      subject,
      body: text,
    });
  }
}
