// Electron shell: serves the built web app from a private app:// origin so
// IndexedDB storage (books, images, progress) persists between launches.
const { app, BrowserWindow, protocol, net, session, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

const ROOT = path.join(__dirname, "app");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    title: "NeuroQuiz",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  // open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL("app://neuroquiz/index.html");
}

// AI services called directly from the app with the user's key. Some don't
// send CORS headers for an app:// page, so allow them here – for these hosts only.
const AI_HOSTS = ["api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com", "api.x.ai"];

function allowAiCors() {
  const filter = { urls: AI_HOSTS.map((h) => `https://${h}/*`) };
  // "*" doesn't cover Authorization, so echo the headers each preflight asks for
  const asked = new Map();
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const h = Object.entries(details.requestHeaders).find(([k]) => k.toLowerCase() === "access-control-request-headers");
    if (h) asked.set(details.id, h[1]);
    callback({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).filter(([k]) => !/^access-control-allow-/i.test(k)));
    headers["Access-Control-Allow-Origin"] = ["app://neuroquiz"];
    headers["Access-Control-Allow-Headers"] = [asked.get(details.id) ?? "authorization, content-type, x-api-key, x-goog-api-key, anthropic-version"];
    asked.delete(details.id);
    headers["Access-Control-Allow-Methods"] = ["GET, POST, OPTIONS"];
    const preflight = details.method === "OPTIONS";
    callback({ responseHeaders: headers, ...(preflight ? { statusLine: "HTTP/1.1 204 No Content" } : {}) });
  });
}

app.whenReady().then(() => {
  allowAiCors();
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(ROOT)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
