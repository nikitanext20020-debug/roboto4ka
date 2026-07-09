// electron/main.cjs

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

// FIX CORS ДЛЯ RUNFLOW / CLOUDINARY
app.commandLine.appendSwitch("disable-web-security");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

let mainWindow = null;
let pendingFile = null;

// ---------------------------------------------------
// Получение файла из аргументов
// ---------------------------------------------------
function getFileArg(argv = process.argv) {
  const args = argv.slice(isDev ? 2 : 1);

  for (const a of args) {
    if (a.startsWith("--")) continue;

    try {
      if (fs.existsSync(a)) {
        return path.resolve(a);
      }
    } catch {}
  }

  return null;
}

pendingFile = getFileArg();

// ---------------------------------------------------
// Single instance
// ---------------------------------------------------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const file = getFileArg(argv);

    if (mainWindow) {
      if (file) {
        mainWindow.webContents.send("open-file", file);
      }

      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------
// Создание окна
// ---------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,

    minWidth: 1100,
    minHeight: 720,

    backgroundColor: "#040618",

    title: "Roboto4ka",

    autoHideMenuBar: true,

    icon: path.join(__dirname, "icon.png"),

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      devTools: false,
    },
  });

  // ---------------------------------------------------
  // Загрузка приложения
  // ---------------------------------------------------
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "..", "dist", "index.html")
    );
  }

  // ---------------------------------------------------
  // Передача файла после загрузки
  // ---------------------------------------------------
  mainWindow.webContents.on("did-finish-load", () => {
    if (pendingFile) {
      mainWindow.webContents.send("open-file", pendingFile);
      pendingFile = null;
    }
  });

  // ---------------------------------------------------
  // Внешние ссылки
  // ---------------------------------------------------
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);

    return {
      action: "deny",
    };
  });

  // ---------------------------------------------------
  // Блок F12 / Ctrl+Shift+I
  // ---------------------------------------------------
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12") {
      event.preventDefault();
    }

    if (
      input.control &&
      input.shift &&
      input.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
    }
  });
}

// ---------------------------------------------------
// IPC чтение файла
// ---------------------------------------------------
ipcMain.handle("read-file", async (_event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath);

    return {
      ok: true,
      name: path.basename(filePath),
      data: data.toString("base64"),
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
    };
  }
});

// ---------------------------------------------------
// READY
// ---------------------------------------------------
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ---------------------------------------------------
// macOS
// ---------------------------------------------------
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});