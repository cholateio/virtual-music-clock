// electron/main.js
const { app, BrowserWindow, session } = require('electron');
const WebSocket = require('ws');

// 解決背景 AudioContext 無法自動播放的問題 (繞過使用者互動限制)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow; // 視窗 A (主視覺)
let audioWorkerWindow; // 視窗 B (音訊引擎)
let wss; // WebSocket Server

function createWebSocketServer() {
    try {
        wss = new WebSocket.Server({ port: 8080 });
        wss.on('connection', (ws) => {
            ws.on('message', (message) => {
                // Pub/Sub 轉發邏輯：將收到來自 Worker 的音訊資料，廣播給所有連線的 Client (主視覺)
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message.toString());
                    }
                });
            });

            ws.on('error', (err) => {
                console.error('WebSocket Error:', err);
            });
        });
    } catch (error) {
        console.error('Failed to start WebSocket Server:', error);
    }
}

function createWindows() {
    // 視窗 A: 主視覺終端 (透明、無邊框、永遠置頂)
    mainWindow = new BrowserWindow({
        width: 250,
        height: 250,
        transparent: true, // 透明背景
        frame: false, // 無邊框
        alwaysOnTop: true, // 永遠置頂
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // 視窗 B: 音訊引擎 Worker (隱藏、不降速)
    audioWorkerWindow = new BrowserWindow({
        width: 400,
        height: 400,
        show: false, // 隱藏於背景
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // 關鍵防呆：防止 Chrome 在背景降速 setTimeout 或 setInterval
        },
    });

    // 關鍵防呆 1：自動允許麥克風/媒體權限，避免擾人彈窗
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true); // 強制允許
        } else {
            callback(false);
        }
    });

    mainWindow.loadURL('http://localhost:3000');
    audioWorkerWindow.loadURL('http://localhost:3000/audio-engine');
}

app.whenReady()
    .then(() => {
        createWebSocketServer();
        createWindows();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindows();
        });
    })
    .catch((err) => {
        console.error('App initialization failed:', err);
    });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
