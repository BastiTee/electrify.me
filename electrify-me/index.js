const exec = require('child_process');
const electron = require("electron");
const app = electron.app;
const ipc = electron.ipcMain;
var http = require('https');
var fs = require('fs');
const devMode = false;

const windowSettings = {
    fullscreen: false,
    fullscreenable: true,
    resizable: true,
    maximized: true,
    movable: true,
    frame: true,
    icon: __dirname + "/favicon.png",
    webPreferences: {
        nodeIntegration: false
    },
};

// SETTINGS ============================================================



app.on("window-all-closed", function() {
    if (process.platform != "darwin") {
        app.quit();
    }
});

app.on("ready", function() {
var bw = null;
    const targetUri = process.argv[2] != undefined ? process.argv[2] : "https://www.facebook.com/"
    pathArray = targetUri.split( '/' );
    protocol = pathArray[0];
    host = pathArray[2];
    url = protocol + "//" + host;
    favicon = url + "/favicon.ico";
    console.log("TARGET: " + targetUri);
    console.log("BASE-URL: " + url);
    console.log("FAVICON: " + favicon);

    var file = fs.createWriteStream(__dirname + "/favicon.ico");
    var request = http.get(favicon, function(response) {

        var stream = response.pipe(file);

     stream.on('finish', function () {

        opts = [__dirname + "/favicon.ico[0]", __dirname + "/favicon.png" ];
        exec.execFile(__dirname + "/ext/imagemagick-windows/convert.exe", opts,     function(
            err, data) {
            console.log(err);
            console.log("Done");
         bw = new electron.BrowserWindow(windowSettings);
            bw.setMenu(null);  // disable default menu
            bw.maximize();
            bw.loadURL(targetUri);

            bw.webContents.on("did-finish-load", function() {
                bw.webContents.insertCSS (
                    ".js-add-list.list-wrapper.mod-add.is-idle { display: none; }"
                    );
            });

            if (devMode)
                bw.openDevTools({ detach: true });

            bw.on("closed", function() {
                bw = null;
            });
        });

     });
    });



});
