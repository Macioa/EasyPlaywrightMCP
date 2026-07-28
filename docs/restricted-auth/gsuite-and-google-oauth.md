# Google OAuth — restricted auth

Playwright cannot complete Google login. Do **not** use headed `login`. Sign in in your own browser, then inject with **`set_session_auth`**.

**Obtain:** the snippet JSON below (cookies + storage from the logged-in page). Paste it to the assistant unredacted.

1. Open the target URL and finish Google login until the **logged-in app or product** is visible (not `accounts.google.com`). For Sign in with Google, that is your app; for Workspace, e.g. https://mail.google.com/.
2. DevTools → **Network** → Preserve log → reload → open the main **document** request for that host → copy the full **Cookie** request header.
3. DevTools → **Console** (type `allow pasting` if needed). Run:

```js
(() => {
  const cookieHeader = prompt(
    "PASTE the full Cookie request header here (Network → document request → Request Headers → Cookie). Type allow pasting in the console first if needed."
  );
  if (!cookieHeader || !cookieHeader.trim()) throw new Error("No Cookie header pasted");

  const host = location.hostname;
  const googleAuth =
    /^(SID|HSID|SSID|APISID|SAPISID|SIDCC|NID|OSID|__Secure-.*PSID.*|__Secure-.*PAPISID.*|__Secure-OSID)$/i;

  const byKey = new Map();
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!name) continue;
    const domain = googleAuth.test(name) ? ".google.com" : host;
    byKey.set(name + "|" + domain, {
      name,
      value,
      domain,
      path: "/",
      httpOnly: googleAuth.test(name) || /^(SID|HSID|SSID|OSID|__Secure-|__Host-)/i.test(name),
      secure: location.protocol === "https:",
      sameSite: "Lax",
    });
  }

  const localStorageEntries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    localStorageEntries.push({ name, value: localStorage.getItem(name) });
  }
  const sessionStorageEntries = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const name = sessionStorage.key(i);
    sessionStorageEntries.push({ name, value: sessionStorage.getItem(name) });
  }

  const payload = {
    origin: location.origin,
    url: location.href,
    cookies: [...byKey.values()],
    localStorage: localStorageEntries,
    sessionStorage: sessionStorageEntries,
  };
  const text = JSON.stringify(payload, null, 2);
  copy(text);
  console.log(text);
  console.log("Copied " + payload.cookies.length + " cookies to clipboard — paste that JSON back to the assistant.");
  return payload;
})()
```

4. Paste the Cookie header when prompted. Paste the copied JSON to the assistant.

```ts
set_session_auth({ siteUrl: /* logged-in URL */, credentialsJson: /* pasted JSON */ })
start_session({ profileId, startUrl: /* same URL */ })
```

Re-export if the session expires or lands on `accounts.google.com`. Treat the JSON as a password.
