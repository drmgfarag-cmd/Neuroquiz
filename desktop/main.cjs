// Electron shell: serves the built web app from a private app:// origin so
// IndexedDB storage (books, images, progress) persists between launches.
const { app, BrowserWindow, protocol, net, shell } = require("electron");
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

app.whenReady().then(() => {
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
