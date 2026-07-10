const { app, BrowserWindow, Menu, net, protocol } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ID = "io.hipflow.studio";
const APP_SCHEME = "hipflow";
const APP_ORIGIN = `${APP_SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const getWebRoot = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "../web-debug/dist");

const resolveAppAsset = (requestUrl) => {
  const url = new URL(requestUrl);

  if (url.host !== "app") {
    return undefined;
  }

  const webRoot = getWebRoot();
  const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(webRoot, requestPath);
  const relativePath = path.relative(webRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return filePath;
};

const registerAppProtocol = async () => {
  await protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveAppAsset(request.url);

    if (!filePath) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
};

const isTrustedNavigation = (url) => {
  const developmentUrl = process.env.HIPFLOW_DEV_URL;

  if (developmentUrl) {
    return new URL(url).origin === new URL(developmentUrl).origin;
  }

  return url.startsWith(`${APP_ORIGIN}/`);
};

const createMainWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#111416",
    title: "HipFlow Studio",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigation(url)) {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  const developmentUrl = process.env.HIPFLOW_DEV_URL;

  if (developmentUrl) {
    await mainWindow.loadURL(developmentUrl);
    return;
  }

  await mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
};

app.setAppUserModelId(APP_ID);

app
  .whenReady()
  .then(async () => {
    Menu.setApplicationMenu(null);
    await registerAppProtocol();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error("HipFlow Studio could not start.", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
