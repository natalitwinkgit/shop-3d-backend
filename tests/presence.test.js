import assert from "node:assert/strict";
import test from "node:test";

import { getPresenceStatus } from "../services/userProfileService.js";

test("AI assistant presence stays online", () => {
  assert.equal(
    getPresenceStatus({
      isAiAssistant: true,
      isOnline: false,
      lastActivityAt: null,
      lastHeartbeatAt: null,
      lastSeen: null,
    }),
    "online"
  );
});

test("non-online human user still reports offline", () => {
  assert.equal(
    getPresenceStatus({
      isAiAssistant: false,
      isOnline: false,
      lastActivityAt: null,
      lastHeartbeatAt: null,
      lastSeen: null,
    }),
    "offline"
  );
});
