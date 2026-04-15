export type AdminChatConversation = {
  userId: string;
  userName: string;
  name: string;
  lastMessage: string;
  lastDate: string;
  unreadCount: number;
  isGuest: boolean;
  answeredByAdminId: string | null;
  answeredByAdminName: string | null;
  adminIds: string[];
  adminNames: string[];
};

export type AdminChatMessage = {
  _id: string;
  sender: string;
  receiver: string;
  text: string;
  isGuest?: boolean;
  guestName?: string;
  isRead?: boolean;
  source?: "human" | "ai_admin";
  createdAt: string;
  updatedAt: string;
  senderIsAdmin?: boolean;
  receiverIsAdmin?: boolean;
  senderName?: string;
  receiverName?: string;
  repliedByAdminId?: string | null;
  repliedByAdminName?: string | null;
  meta?: {
    provider?: string;
    model?: string;
    runResponseId?: string;
    productCards?: AdminAiProductCard[];
    productSearch?: {
      query?: string;
      category?: string;
      minPrice?: number | null;
      maxPrice?: number | null;
      count?: number;
    } | null;
  } | null;
};

export type AdminAiProductCard = {
  id: string;
  slug: string;
  title: string;
  category: string;
  subCategory: string;
  price: number;
  finalPrice: number;
  currency: "UAH";
  image: string;
  storefrontUrl: string;
  apiUrl: string;
  inStock: boolean;
  stockQty: number;
};

export type AdminAiStatus = {
  enabled: boolean;
  provider?: "gemini" | "openai" | string;
  model: string;
  aiAdmin: null | {
    id: string;
    name: string;
    email: string;
  };
};

export type AdminAiReplyResult = {
  ok: boolean;
  provider?: string;
  model: string;
  draft: string;
  sent: boolean;
  responseId: string;
  aiAdmin: {
    id: string;
    name: string;
    email: string;
  };
  chatUser: {
    id: string;
    kind: "user" | "guest";
    isGuest: boolean;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
  message: AdminChatMessage | null;
  products: AdminAiProductCard[];
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  fallback?: boolean;
  fallbackReason?: string;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token: string;
  baseUrl?: string;
};

const normalizeBaseUrl = (baseUrl = "") => String(baseUrl).replace(/\/$/, "");

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const response = await fetch(`${normalizeBaseUrl(options.baseUrl)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;

    try {
      const errorJson = await response.json();
      errorMessage = errorJson?.message || errorMessage;
    } catch {
      // ignore json parse errors
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const adminChatApi = {
  getMe(token: string, baseUrl = "") {
    return request<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      isOnline: boolean;
    }>("/api/auth/me", { token, baseUrl });
  },

  getSupportAdmin(token: string, baseUrl = "") {
    return request<{
      adminId: string;
      adminName?: string;
      adminEmail?: string;
      presence?: "online" | "away" | "offline" | string;
      isOnline?: boolean;
    }>("/api/admin/chat/support-admin", {
      token,
      baseUrl,
    });
  },

  getConversations(token: string, baseUrl = "") {
    return request<AdminChatConversation[]>("/api/admin/chat/conversations", {
      token,
      baseUrl,
    });
  },

  getHistory(params: { token: string; adminId: string; userId: string; baseUrl?: string }) {
    return request<AdminChatMessage[]>(
      `/api/admin/chat/${params.adminId}/${params.userId}`,
      {
        token: params.token,
        baseUrl: params.baseUrl,
      }
    );
  },

  markRead(params: { token: string; senderId: string; receiverId: string; baseUrl?: string }) {
    return request<void>(
      `/api/admin/chat/read/${params.senderId}/${params.receiverId}`,
      {
        method: "PATCH",
        token: params.token,
        baseUrl: params.baseUrl,
      }
    );
  },

  getAiStatus(token: string, baseUrl = "") {
    return request<AdminAiStatus>("/api/admin/ai/status", {
      token,
      baseUrl,
    });
  },

  suggestAiReply(params: {
    token: string;
    chatUserId: string;
    instructions?: string;
    historyLimit?: number;
    baseUrl?: string;
  }) {
    return request<AdminAiReplyResult>("/api/admin/ai/suggest", {
      method: "POST",
      token: params.token,
      baseUrl: params.baseUrl,
      body: {
        chatUserId: params.chatUserId,
        instructions: params.instructions || "",
        historyLimit: params.historyLimit,
      },
    });
  },

  sendAiReply(params: {
    token: string;
    chatUserId: string;
    instructions?: string;
    historyLimit?: number;
    baseUrl?: string;
  }) {
    return request<AdminAiReplyResult>("/api/admin/ai/reply", {
      method: "POST",
      token: params.token,
      baseUrl: params.baseUrl,
      body: {
        chatUserId: params.chatUserId,
        instructions: params.instructions || "",
        historyLimit: params.historyLimit,
      },
    });
  },
};

export const adminChatSocketEvents = {
  join: "join_chat",
  send: "send_message",
  receive: "receive_message",
};

export const createAdminSocketPayload = (params: {
  sender: string;
  receiver: string;
  text: string;
}) => ({
  sender: params.sender,
  receiver: params.receiver,
  text: params.text,
});
