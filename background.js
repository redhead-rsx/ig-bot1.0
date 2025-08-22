const AUTH = {
  SALT: "dias-ig-salt-v1",
  PEPPER: "pepperFixoNoCodigoV1",
  MAX_FAILS: 5,
  LOCK_MS: 10 * 60 * 1000,
  DEFAULT_EXP_MS: 7 * 24 * 60 * 60 * 1000,
  USERS: [
    {
      username: "dias",
      hash: "24fc4f96f03f7148e570b560903f75ed30a433b91e7ce098289fb0c18093c539",
    },
    {
      username: "milton",
      hash: "0c0bf1c79bc8b2a2d53f6e9d584103c2003032bc8986e0159de3dd802eff4096",
    },
  ],
};

async function sha256Hex(s) {
  const e = new TextEncoder();
  const b = await crypto.subtle.digest("SHA-256", e.encode(s));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

async function checkUserPass(user, pass) {
  const combo = AUTH.PEPPER + AUTH.SALT + user + ":" + pass;
  const h = await sha256Hex(combo);
  const found = AUTH.USERS.find((u) => u.username === user);
  return !!(found && h === found.hash);
}

const storeGet = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
const storeSet = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

function isAuthorized(auth, lockUntil, now) {
  return (
    auth.state === "AUTH" &&
    (!auth.exp || auth.exp > now) &&
    (!lockUntil || lockUntil <= now)
  );
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const now = Date.now();
    const data = await storeGet(["auth", "auth_failCount", "auth_lockUntil"]);
    const auth = data.auth || { state: "NONE" };
    const failCount = data.auth_failCount || 0;
    const lockUntil = data.auth_lockUntil || 0;

    if (msg.type === "AUTH_LOGIN") {
      if (lockUntil && lockUntil > now) {
        sendResponse({ ok: false, error: "LOCKED_UNTIL", lockUntil });
        return;
      }
      const ok = await checkUserPass(msg.user, msg.pass);
      if (ok) {
        const newAuth = {
          state: "AUTH",
          user: msg.user,
          since: now,
          exp: now + AUTH.DEFAULT_EXP_MS,
        };
        await storeSet({ auth: newAuth, auth_failCount: 0, auth_lockUntil: 0 });
        sendResponse({ ok: true, exp: newAuth.exp });
      } else {
        let fc = failCount + 1;
        let update = { auth_failCount: fc };
        let resp = { ok: false, error: "INVALID", failCount: fc };
        if (fc >= AUTH.MAX_FAILS) {
          const lu = now + AUTH.LOCK_MS;
          update = { auth_failCount: 0, auth_lockUntil: lu };
          resp.lockUntil = lu;
        }
        await storeSet(update);
        sendResponse(resp);
      }
      return;
    }

    if (msg.type === "AUTH_LOGOUT") {
      await storeSet({
        auth: { state: "NONE" },
        auth_failCount: 0,
        auth_lockUntil: 0,
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "AUTH_STATUS") {
      sendResponse({
        ok: true,
        auth,
        auth_failCount: failCount,
        auth_lockUntil: lockUntil,
        now,
      });
      return;
    }

    if (msg.type === "CAN_RUN") {
      const authorized = isAuthorized(auth, lockUntil, now);
      sendResponse({ ok: authorized });
      return;
    }

    // Gate remaining operations
    if (!isAuthorized(auth, lockUntil, now)) {
      sendResponse({ ok: false, error: "UNAUTHORIZED" });
      return;
    }

    if (msg.type === "AF_SET_ALARM") {
      chrome.alarms.create("autoFollowResume", { when: msg.pausedUntil });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "AF_CLEAR_ALARM") {
      chrome.alarms.clear("autoFollowResume");
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "autoFollowResume") {
    const now = Date.now();
    const data = await storeGet(["auth", "auth_lockUntil", "af_state"]);
    const auth = data.auth || { state: "NONE" };
    const lockUntil = data.auth_lockUntil || 0;
    if (!isAuthorized(auth, lockUntil, now)) return;
    const state = data.af_state || {};
    if (state.running) {
      state.pausedUntil = 0;
      await storeSet({ af_state: state });
      chrome.tabs.query({ url: "https://www.instagram.com/*" }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: "AF_RESUME" });
        }
      });
    }
  }
});

